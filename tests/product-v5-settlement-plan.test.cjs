'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const planModule = import('../preview-v5/settlement-plan.js');
const modelModule = import('../preview-v5/model.js');

function source() {
  const row = {cardKey:'demo-p1',cardName:'가상 상품',batch:'1차',sourceCode:'demo-1',
    sourceProduct:'가상 상품',option:'A',purpose:'판매',received:10,forSale:8,forEvent:2,
    unitCostCny:2,unitCostCurrency:'CNY',receivedDate:null,orderDate:'2026-10-01',
    url:'https://example.1688.com/item',supplier:'예시',sourceRecord:{'카드':'demo-p1','코드':'demo-1'}};
  return {schema:'product-v5-batch-staging-v1',exchangeRate:null,expectedProductCards:1,expectedMaterials:0,
    cards:[{cardKey:'demo-p1',catalogLinkStatus:'미연결',priceStatus:'제안',receipts:[row]}],materials:[]};
}

async function prepared() {
  const {planSettledReceipts,receiptReference}=await planModule;
  const input=source(), preliminary=planSettledReceipts(input);
  const ref=receiptReference(preliminary.cards[0].receipts[0]);
  const binding={receiptRef:ref,orderId:'test-order',verified:true};
  const evidence={orderId:'test-order',paidDate:'2026-10-03',chargeKrw:4000,totalCny:20,
    sourceRef:'가상 명세',verified:true,scope:'complete-order',receiptRefs:[ref]};
  return {planSettledReceipts,receiptReference,input,ref,binding,evidence};
}

test('1차 입고일을 승인한 날짜로 기록하고 원본을 보존, 청구액 없으면 환산하지 않음', async()=>{
  const {planSettledReceipts}=await planModule, input=source(), original=structuredClone(input);
  const out=planSettledReceipts(input), row=out.cards[0].receipts[0];
  assert.deepEqual(input,original); assert.equal(row.date,'2026-10-24'); assert.equal(row.receivedDate,'2026-10-24');
  assert.equal(row.stagingOriginal.receivedDate,null); assert.equal(row.orderDate,'2026-10-01');
  assert.equal(row.currency,'CNY'); assert.equal(row.unitCost,2); assert.equal(row.settlementStatus,'청구액 없음');
  assert.deepEqual(out.summary,{receiptCount:1,converted:0,missing:1,review:0});
  assert.equal(out.unresolved[0].status,'청구액 없음');
});

test('2차 입고일은 발주일 및 이전 준비 날짜에 관계없이 비워 둠', async()=>{
  const {planSettledReceipts}=await planModule, input=source();
  input.cards[0].receipts[0].batch='2차';
  input.cards[0].receipts[0].receivedDate='2026-10-24';
  const row=planSettledReceipts(input).cards[0].receipts[0];
  assert.equal(row.date,''); assert.equal(row.receivedDate,'');
  assert.equal(row.stagingOriginal.receivedDate,'2026-10-24');
});

test('확정된 전체 주문 청구액과 위안 총액이 맞으면 결제일 환산만 적용', async()=>{
  const {planSettledReceipts,input,binding,evidence}=await prepared();
  const {calcProduct,receiptCurrency}=await modelModule;
  const out=planSettledReceipts(input,[binding],[evidence]), row=out.cards[0].receipts[0];
  assert.equal(row.currency,'KRW'); assert.equal(row.unitCostCurrency,'KRW'); assert.equal(receiptCurrency(row),'KRW');
  assert.equal(row.unitCost,400); assert.equal(row.unitCostCny,2); assert.equal(row.sourceUnitCostCurrency,'CNY');
  assert.equal(row.settlementEvidence.rateKrwPerCny,200); assert.equal(row.settlementEvidence.paidDate,'2026-10-03');
  assert.equal(row.stagingOriginal.unitCostCny,2); assert.equal(out.summary.converted,1); assert.equal(out.unresolved.length,0);
  assert.equal(calcProduct({id:'p',salePrice:1000,stock:3,receipts:[row],links:[]},[]).unitCost,400);
});

test('한 주문의 여러 상품과 부자재는 동일 환율로 적용하며 전체 위안 금액을 대조', async()=>{
  const {planSettledReceipts,receiptReference}=await planModule, input=source();
  const next=structuredClone(input.cards[0].receipts[0]);
  next.sourceCode='demo-2';next.sourceRecord['코드']='demo-2';next.received=5;next.forSale=5;next.forEvent=0;next.unitCostCny=3;
  input.cards[0].receipts.push(next);
  const material={...structuredClone(next),cardKey:'demo-m',cardName:'가상 포장',sourceCode:'demo-m1',purpose:'부자재',
    received:2,forSale:null,forEvent:null,unitCostCny:1,sourceRecord:{'카드':'demo-m','코드':'demo-m1'}};
  input.materials.push({cardKey:'demo-m',catalogLinkStatus:'미연결',receipts:[material]});input.expectedMaterials=1;
  const base=planSettledReceipts(input), rows=[...base.cards[0].receipts,...base.materials[0].receipts];
  const refs=rows.map(receiptReference), bindings=refs.map(receiptRef=>({receiptRef,orderId:'demo-order',verified:true}));
  const payment={orderId:'demo-order',paidDate:'2026-10-05',chargeKrw:7400,totalCny:37,
    sourceRef:'가상 명세',verified:true,scope:'complete-order',receiptRefs:refs};
  const out=planSettledReceipts(input,bindings,[payment]);
  assert.equal(out.summary.converted,3);assert.equal(out.cards[0].receipts[0].unitCost,400);
  assert.equal(out.cards[0].receipts[1].unitCost,600);assert.equal(out.materials[0].receipts[0].unitCost,200);
});

test('청구 근거가 불완전하거나 총액이 다르면 환산하지 않고 확인 필요',async()=>{
  const {planSettledReceipts,input,binding,evidence}=await prepared();
  for(const patch of [{verified:false},{scope:'partial'},{chargeKrw:0},{totalCny:21},
    {paidDate:'2026-02-30'},{sourceRef:''},{receiptRefs:[]},{receiptRefs:[binding.receiptRef,'unmatched']}]) {
    const out=planSettledReceipts(input,[binding],[{...evidence,...patch}]);
    assert.equal(out.cards[0].receipts[0].currency,'CNY');assert.equal(out.summary.review,1);
  }
});

test('중복 증거 또는 중복/미확정 연결은 원가를 추정하지 않음',async()=>{
  const {planSettledReceipts,input,binding,evidence}=await prepared();
  for(const [bindings,evidences] of [[[binding],[evidence,evidence]], [[binding,binding],[evidence]],
    [[{...binding,verified:false}],[evidence]]]) {
    const out=planSettledReceipts(input,bindings,evidences);
    assert.equal(out.summary.converted,0);assert.equal(out.summary.review,1);
  }
});

test('연결은 있으나 카드 청구액이 없으면 청구액 없음으로 보존',async()=>{
  const {planSettledReceipts,input,binding}=await prepared();
  const out=planSettledReceipts(input,[binding],[]);
  assert.equal(out.summary.missing,1);assert.equal(out.cards[0].receipts[0].currency,'CNY');
});

test('알 수 없는 입고 참조는 조용히 무시하지 않고 거부',async()=>{
  const {planSettledReceipts,input}=await prepared();
  assert.throws(()=>planSettledReceipts(input,[{receiptRef:'unknown',orderId:'x',verified:true}],[]));
});
