'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../preview-v5/fresh-adapter.js'),
  import('../preview-v5/fresh-schema.js'),
  import('../preview-v5/model.js')
]);
function response(data, status = 200, etag = '"v1"') {
  return {status, ok: status >= 200 && status < 300, headers:{get:()=>etag}, json:async()=>structuredClone(data)};
}
function fixture() {
  return {schema:'product-v5-fresh-v1',products:[{id:'new-p1',name:'가상',receipts:[
    {batch:1,date:'2026-10-24',status:'입고 완료',quantity:10,saleQuantity:10,eventQuantity:0,unitCost:1,currency:'KRW'},
    {batch:2,date:'',orderDate:'2026-10-29',status:'배송 중',orderedQuantity:7,quantity:0,saleQuantity:0,eventQuantity:0,unitCost:1,currency:'CNY'}
  ],links:[]}],materials:[],sets:[]};
}
function mock() {
  let data=fixture(), uid='first', etag='"v1"', conflict=false, writes=0; const paths=[]; const watchers=[];
  const auth={current:()=>uid?{uid}:null,onAuth:fn=>{watchers.push(fn);fn(uid?{uid}:null);return()=>{}},dbUrl:async path=>{paths.push(path);return 'https://example.invalid/'+path}};
  const fetchImpl=async (_url, opt)=>{
    if (opt.method === 'GET') return response(data,200,etag);
    writes++; if (conflict || opt.headers['If-Match']!==etag) return response(null,412);
    data=JSON.parse(opt.body); etag='"v2"'; return response(null);
  };
  return {auth,fetchImpl,paths,value:()=>data,writes:()=>writes,conflict:()=>{conflict=true}, serverChange:fn=>{fn(data);etag='"other"'}, signout:()=>{uid='';watchers.forEach(fn=>fn(null))}};
}
test('only new root is read and written, pending status and blank date survive save', async()=>{
  const [{createAuthenticatedStore},{freshSchema},{calcProduct}]=await modules;
  const m=mock(), store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
  const before=await store.load(); assert.equal(calcProduct(before.products[0],[]).saleReceived,10);
  const row=before.products[0].receipts[1]; await store.saveReceipt('new-p1',1,{...row,memo:'가상 메모'});
  const stored=m.value().products[0].receipts[1];
  assert.equal(stored.status,'배송 중'); assert.equal(stored.date,''); assert.equal(stored.orderedQuantity,7);
  assert.equal(stored.quantity,0); assert.equal(calcProduct((await store.load()).products[0],[]).saleReceived,10);
  assert.ok(m.paths.length>=2); assert.ok(m.paths.every(x=>x==='productCatalogPrivate/products_v5'));
  store.stop();
});
test('conflicts and signed out sessions do not overwrite another change', async()=>{
  const [{createAuthenticatedStore},{freshSchema}]=await modules;
  const m=mock(), store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
  await store.load();
  m.conflict(); await assert.rejects(store.saveProductLinks('new-p1',[]),/바뀌었어요/);
  assert.equal(m.value().products[0].receipts[1].status,'배송 중');
  m.signout(); await assert.rejects(store.load(),/로그인/); assert.equal(m.writes(),1); store.stop();
});
test('편집을 연 뒤 다른 계정이 행을 추가해 인덱스가 바뀌면 저장하지 않는다', async()=>{
  const [{createAuthenticatedStore},{freshSchema}]=await modules;
  const m=mock(), store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
  const first=await store.load(), opened=store.revision(), original=first.products[0].receipts[1];
  m.serverChange(data=>data.products[0].receipts.unshift({batch:1,date:'2026-10-24',status:'입고 완료',quantity:1,saleQuantity:1,eventQuantity:0,currency:'KRW',unitCost:1}));
  await store.load(); // even a separate refresh must not change the editor baseline
  await assert.rejects(store.saveReceipt('new-p1',1,{...original,memo:'stale'},opened),/바뀌었어요/);
  assert.equal(m.writes(),0); assert.equal(m.value().products[0].receipts.length,3);
  assert.equal(m.value().products[0].receipts[1].memo,undefined); store.stop();
});
test('unreceived quantities cannot be mistaken for received inventory',async()=>{
  const [,,{receiptAllocation,calcProduct}]=await modules;
  const row=fixture().products[0].receipts[1];
  assert.deepEqual(receiptAllocation(row),{quantity:0,saleQuantity:0,eventQuantity:0});
  assert.equal(receiptAllocation({...row,quantity:7,saleQuantity:7}),null);
  assert.equal(calcProduct(fixture().products[0],[]).received,10);
});
test('확인 필요 입고는 0개 미입고로 보존하며 상태·메모 수정도 안전하게 저장한다', async()=>{
  const [{createAuthenticatedStore},{freshSchema},{receiptAllocation,calcProduct}]=await modules;
  const m=mock(); m.serverChange(data=>Object.assign(data.products[0].receipts[1],{status:'확인 필요',memo:'가상 오류입고 — 확인 필요'}));
  const store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
  const before=await store.load(), row=before.products[0].receipts[1];
  assert.equal(row.date,''); assert.equal(row.status,'확인 필요'); assert.equal(row.orderedQuantity,7);
  assert.equal(calcProduct(before.products[0],[]).received,10);
  assert.equal(receiptAllocation({...row,quantity:7,saleQuantity:7}),null);
  await assert.rejects(store.saveReceipt('new-p1',1,{...row,quantity:7,saleQuantity:7}),/합/);
  assert.equal(m.writes(),0);
  await store.saveReceipt('new-p1',1,{...row,memo:row.memo});
  const after=m.value().products[0].receipts[1];
  assert.equal(after.status,'확인 필요'); assert.equal(after.date,''); assert.equal(after.memo,row.memo);
  assert.equal(after.quantity,0); assert.equal(after.orderedQuantity,7); store.stop();
});
test('an uninitialized root is never accepted as a catalog',async()=>{
  const [{createAuthenticatedStore},{freshSchema}]=await modules;
  const m=mock(), store=createAuthenticatedStore({auth:m.auth,fetchImpl:async()=>response(null),schema:freshSchema});
  await assert.rejects(store.load(),/준비되지 않았어요/); store.stop();
});
test('RTDB가 null과 빈 배열을 생략해도 비공개 미확인 값과 빈 목록을 복원한다',async()=>{
  const [,{freshSchema},{calcProduct}]=await modules;
  const server={schema:'product-v5-fresh-v1',products:{0:{id:'fake',name:'가상',receipts:{0:{batch:2,status:'배송 중',quantity:0,saleQuantity:0,eventQuantity:0,currency:'CNY'}}}},materials:{0:{id:'fake-m',name:'가상 부자재',kind:'unknown'}}};
  const out=freshSchema.project(server);
  assert.deepEqual(out.sets,[]); assert.deepEqual(out.products[0].channels,[]); assert.deepEqual(out.products[0].links,[]);
  assert.equal(out.products[0].stock,null); assert.equal(out.products[0].receipts[0].settlementKrw,null);
  assert.equal(out.products[0].receipts[0].date,''); assert.equal(out.products[0].receipts[0].unitCost,null);
  assert.equal(out.materials[0].stock,null); assert.deepEqual(out.materials[0].receipts,[]);
  assert.equal(calcProduct(out.products[0],[]).stock,null);
});
