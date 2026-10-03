const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/erp-core.js');
function fixture(){return C.migrate({products:[{id:'A',name:'상품 A',salesStatus:'판매 중'},{id:'B',name:'상품 B',salesStatus:'판매 중'}],purchaseLines:[],bankTransactions:[],finance:{},erp:{accounts:[{id:'main',name:'사업 통장'}],warehouses:['기본 창고','보조 창고']}});}
const bank=(over={})=>({id:'b',date:'2026-10-03',direction:'입금',amount:10000,description:'판매처',accountLabel:'main',category:'매출 수금',...over});
const move=(id,type,qty,over={})=>({id,type,qty,sku:'A',warehouse:'기본 창고',date:'2026-10-03',createdAt:id,...over});
const sale=(over={})=>({id:'s',date:'2026-10-03',orderId:'S1',channel:'직접 판매',productName:'상품 A',sku:'A',quantity:2,salesGross:10000,feeNet:0,feeVAT:0,settlementBase:10000,linkedBankIds:[],...over});
test('personal funding and loan collection never become sales; paired transfers stay internal',()=>{
  let d=fixture();d.bankTransactions=[bank({description:'김현수',category:'사업주 투입'}),bank({id:'b2',description:'백다희',category:'매출 수금'}),bank({id:'b3',description:'김현수',category:'대여금 회수'}),bank({id:'b4',description:'김현수',category:'계좌이체',transferId:'t'})];
  d=C.migrate(d);assert.deepEqual(d.bankTransactions.map(x=>x.category),['자금 충전','자금입금·용도 확인','대여금 회수','계좌이체']);
  assert.equal(C.financeSummary(d).salesGross,0);assert.equal(C.financeSummary(d).inflow,30000);assert.equal(C.eligibleBank(d,sale()).length,0);
  assert.throws(()=>C.record(d,'bank',bank({id:'bad',description:'백다희'}),{isNew:true}),/매출/);
});
test('migration preserves prior user edits and unrecognized source data',()=>{const d=fixture();d.products[0].name='수정한 상품';d.other={source:42};assert.equal(C.migrate(d).products[0].name,'수정한 상품');assert.equal(C.migrate(d).other.source,42);});
test('unknown costs stay unknown; known cost allocates once across units',()=>{const p={purchase:10000,shipping:2000,customs:null};assert.equal(C.purchaseCost(p).net,null);p.customs=1000;p.vatCredit=1000;p.lines=[{qty:2,amountCNY:20},{qty:2,amountCNY:20}];assert.equal(C.allocation(p,p.lines[0]),3000);});
test('allocation never mixes KRW with CNY weights',()=>{const p={purchase:10000,shipping:0,customs:0,lines:[{qty:1,amountCNY:10,amountKRW:2000},{qty:1,amountCNY:10}]};assert.equal(C.allocation(p,p.lines[0]),null);});
test('stock needs a count; chronological negative balances and invalid transfers are rejected',()=>{
  let d=fixture();d=C.record(d,'movement',move('1','입고',4),{isNew:true});assert.equal(C.stock(d,'A').qty,null);
  d=C.record(d,'movement',move('2','실사',5),{isNew:true});d=C.record(d,'movement',move('3','출고',2),{isNew:true});assert.equal(C.stock(d,'A').qty,3);
  assert.throws(()=>C.record(d,'movement',move('4','출고',4),{isNew:true}),/음수/);
  assert.throws(()=>C.record(d,'movement',move('4','창고이동',1,{toWarehouse:'기본 창고'}),{isNew:true}),/다른/);
  d=C.record(d,'movement',move('4','실사',0,{warehouse:'보조 창고'}),{isNew:true});d=C.record(d,'movement',move('5','창고이동',2,{toWarehouse:'보조 창고'}),{isNew:true});
  assert.equal(C.stock(d,'A').qty,1);assert.equal(C.stock(d,'A','보조 창고').qty,2);
});
test('changing or cancelling a receipt cannot hide an earlier negative balance behind a later count',()=>{
  let d=fixture();for(const m of [move('1','실사',0),move('2','입고',5),move('3','출고',5),move('4','실사',3)])d=C.record(d,'movement',m,{isNew:true});
  assert.throws(()=>C.toggleVoid(d,'movement','2','중복'),/음수/);
  assert.throws(()=>C.record(d,'movement',move('2','입고',5,{sku:'B'})),/음수/);
});
test('purchase receipts and sales shipments cannot exceed document quantities',()=>{
  let d=fixture();d=C.record(d,'purchase',{orderNo:'P1',date:'2026-10-03',vendor:'구매처',purchase:10000,shipping:0,customs:0,lines:[{id:'l',sku:'A',qty:3}]},{isNew:true});
  d=C.record(d,'movement',move('1','입고',3,{sourceType:'purchase',sourceId:'P1'}),{isNew:true});
  assert.throws(()=>C.record(d,'movement',move('2','입고',1,{sourceType:'purchase',sourceId:'P1'}),{isNew:true}),/중복 입고/);
  assert.throws(()=>C.toggleVoid(d,'purchase','P1','취소'),/입출고/);
  d=C.record(d,'sale',sale(),{isNew:true});d=C.record(d,'movement',move('3','출고',2,{sourceType:'sale',sourceId:'s'}),{isNew:true});
  assert.throws(()=>C.record(d,'movement',move('4','출고',1,{sourceType:'sale',sourceId:'s'}),{isNew:true}),/중복 출고/);
});
test('cash receipts are exclusive, and changing linked cash to personal funding is blocked',()=>{
  let d=C.record(fixture(),'bank',bank(),{isNew:true});d=C.record(d,'sale',sale({linkedBankIds:['b']}),{isNew:true});assert.equal(C.saleTotals(d,d.finance.channelTransactions[0]).due,0);
  assert.throws(()=>C.record(d,'sale',sale({id:'s2',linkedBankIds:['b']}),{isNew:true}),/연결/);
  assert.throws(()=>C.record(d,'bank',bank({description:'김현수',category:'자금 충전'})),/연결/);
  assert.throws(()=>C.toggleVoid(d,'bank','b','오류'),/해제/);
});
test('CSV accepts display names, quoted amounts and deduplicates; owner names stay funding',()=>{
  const text='날짜,계좌,구분,금액,내용,분류,메모\r\n2026-10-03,사업 통장,입금,"10,000",김현수,매출 수금,"충전, 확인"\r\n2026-10-03,사업 통장,입금,10000,김현수,매출 수금,반복';
  const r=C.csvImport(text,fixture());assert.equal(r.rows.length,1);assert.equal(r.duplicates,1);assert.equal(r.rows[0].category,'자금입금·용도 확인');assert.equal(r.rows[0].accountLabel,'main');
  assert.throws(()=>C.csvImport('날짜,계좌,구분,금액,내용\n2026-99-99,사업 통장,입금,1000,판매',fixture()),/날짜/);
});
test('backup merge keeps current edits unless explicit overwrite is selected',()=>{const d=fixture(),other=C.clone(d);other.products[0].name='다른 이름';assert.equal(C.mergeBackup(d,other).data.products[0].name,'상품 A');assert.equal(C.mergeBackup(d,other,true).data.products[0].name,'다른 이름');assert.equal(C.validateBackup(d).products.length,2);});
