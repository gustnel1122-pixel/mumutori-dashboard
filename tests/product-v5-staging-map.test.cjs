'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mapper = import('../preview-v5/staging-map.js');
const model = import('../preview-v5/model.js');

function source() {
  const productRow = {
    cardKey:'P01', cardName:'가상 상품', batch:'1차', sourceCode:'S01',
    sourceProduct:'가상 상품', option:'예시', purpose:'판매', received:10,
    forSale:7, forEvent:3, unitCostCny:2.5, unitCostCurrency:'CNY',
    receivedDate:null, orderDate:'2026-11-06', url:'https://example.1688.com/item',
    supplier:'가상 판매처', sourceRecord:{'카드':'P01','코드':'S01','메모':'가상 기록'},
  };
  const materialRow = {
    ...productRow, cardKey:'M01', cardName:'가상 부자재', sourceCode:'M01',
    purpose:'부자재', received:5, forSale:null, forEvent:null,
    sourceRecord:{'카드':'M01','코드':'M01','메모':'가상 기록'},
  };
  return {schema:'product-v5-batch-staging-v1', created:'2026-11-08', purpose:'가상 시험',
    actualProductIdMapping:'미확인', exchangeRate:null, expectedProductCards:1, expectedMaterials:1,
    cards:[{cardKey:'P01',catalogLinkStatus:'미연결',priceStatus:'제안',receipts:[productRow]}],
    materials:[{cardKey:'M01',catalogLinkStatus:'미연결',receipts:[materialRow]}]};
}

test('자료를 추정 ID 없이 CNY와 원본 근거를 보존하며 계획으로 변환', async () => {
  const {planStagingImport} = await mapper, input = source(), before = structuredClone(input), out = planStagingImport(input);
  assert.deepEqual(input,before);
  assert.equal(out.schema,'product-v5-batch-plan-v1');
  assert.equal(out.cards[0].id,undefined);
  assert.equal(out.cards[0].priceStatus,'제안');
  assert.equal(out.source.exchangeRate,null);
  const row=out.cards[0].receipts[0];
  assert.equal(row.quantity,10); assert.equal(row.saleQuantity,7); assert.equal(row.eventQuantity,3);
  assert.equal(row.unitCost,2.5); assert.equal(row.currency,'CNY');
  assert.equal(row.batch,1); assert.equal(row.date,''); assert.equal(row.orderDate,'2026-11-06');
  assert.deepEqual(row.stagingOriginal,input.cards[0].receipts[0]);
  assert.deepEqual(row.sourceRecord,input.cards[0].receipts[0].sourceRecord);
  row.sourceRecord['메모']='수정';
  assert.equal(input.cards[0].receipts[0].sourceRecord['메모'],'가상 기록');
  assert.equal(out.materials[0].receipts[0].saleQuantity,null);
  assert.equal(out.materials[0].receipts[0].eventQuantity,null);
});

test('위안화 단가는 원화 원가 또는 ROAS로 환산하지 않음', async () => {
  const {planStagingImport}=await mapper, {calcProduct}=await model;
  const row=planStagingImport(source()).cards[0].receipts[0];
  const result=calcProduct({id:'p',salePrice:1000,stock:5,receipts:[row],links:[]},[]);
  assert.equal(result.cost,null); assert.equal(result.roas.smart,null); assert.equal(result.earned,null);
});

test('불일치하는 들어온 수 배분과 미분류는 거부', async () => {
  const {planStagingImport}=await mapper;
  for(const patch of [{forSale:8},{forEvent:null},{received:0},{received:2.2},{forSale:-1}]) {
    const input=source(); Object.assign(input.cards[0].receipts[0],patch);
    assert.throws(()=>planStagingImport(input));
  }
});

test('부자재의 판매/이벤트 수를 추정하거나 덧씌우지 않음', async () => {
  const {planStagingImport}=await mapper, input=source();
  input.materials[0].receipts[0].forSale=5;
  assert.throws(()=>planStagingImport(input));
});

test('카드 및 출처 행의 상호 참조가 다르면 거부', async () => {
  const {planStagingImport}=await mapper;
  for(const patch of [{cardKey:'P02'},{sourceCode:''}]) {
    const input=source(); Object.assign(input.cards[0].receipts[0],patch);
    assert.throws(()=>planStagingImport(input));
  }
  const input=source(); input.cards[0].receipts[0].sourceRecord['코드']='다른코드';
  assert.throws(()=>planStagingImport(input));
});

test('중복 카드와 중복 출처 행, 선언된 갯수 불일치는 거부', async () => {
  const {planStagingImport}=await mapper;
  let input=source(); input.cards.push(structuredClone(input.cards[0])); input.expectedProductCards=2;
  assert.throws(()=>planStagingImport(input));
  input=source(); input.cards[0].receipts.push(structuredClone(input.cards[0].receipts[0]));
  assert.throws(()=>planStagingImport(input));
  input=source(); input.expectedMaterials=3;
  assert.throws(()=>planStagingImport(input));
});

test('통화 누락/오류 및 단가 오류를 원화로 추정하지 않음', async () => {
  const {planStagingImport}=await mapper;
  for(const patch of [{unitCostCurrency:''},{unitCostCurrency:'KRW'},{unitCostCny:-1},{unitCostCny:null},{unitCostCny:Infinity}]) {
    const input=source(); Object.assign(input.cards[0].receipts[0],patch);
    assert.throws(()=>planStagingImport(input));
  }
});

test('애매한 날짜와 안전하지 않은 판매처 링크는 거부', async () => {
  const {planStagingImport}=await mapper;
  for(const patch of [{orderDate:'2026-02-30'},{receivedDate:'2026/11/06'},{url:'https://1688.com.example.com/x'},{url:'https://user:pass@1688.com/x'}]) {
    const input=source(); Object.assign(input.cards[0].receipts[0],patch);
    assert.throws(()=>planStagingImport(input));
  }
});

test('다른 스키마 또는 뜻밖의 구조는 거부', async () => {
  const {planStagingImport}=await mapper;
  for(const input of [null,{}, {...source(),schema:'other'}, {...source(),cards:{}}, {...source(),materials:null}]) {
    assert.throws(()=>planStagingImport(input));
  }
  const unexpectedId=source(); unexpectedId.cards[0].id='guessed-id';
  assert.throws(()=>planStagingImport(unexpectedId));
});
