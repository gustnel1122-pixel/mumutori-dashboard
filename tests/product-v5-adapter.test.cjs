'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const adapter = import('../preview-v5/private-adapter.js');

function fakeAuth(initial = 'owner') {
  let user = initial ? {uid: initial} : null; const listeners = new Set();
  return {
    current: () => user,
    dbUrl: async path => `https://mock.invalid/${path}`,
    onAuth(cb) { listeners.add(cb); cb(user); return () => listeners.delete(cb); },
    set(uid) { user = uid ? {uid} : null; for (const cb of [...listeners]) cb(user); }
  };
}
function response(value, status = 200, etag = '"one"') {
  return {ok: status >= 200 && status < 300, status, headers:{get: n=>n.toLowerCase()==='etag'?etag:null}, json:async()=>value};
}
function fixture() {
  return {products:{p:{id:'p',name:'가상 상품',cost:999,price:999,v5:{stock:3,links:[]}}, q:{id:'q',name:'가상 둘'}},
    reviewCandidates:{keep:{extra:'keep'}}, unrelated:{keep:true},
    v5:{materials:{m:{id:'m',name:'가상 포장',kind:'pack',unitCost:10,stock:8,minStock:2}},sets:{}}};
}
// This mapping exists only in tests; the operational schema is unconfirmed.
function fakeSchema() {
  return {
    project(raw) {
      raw ||= {}; const privateV5=raw.v5||{};
      return {
        products:Object.values(raw.products||{}).map(row=>({...structuredClone(row.v5||{}),id:row.id,name:row.name})),
        materials:Object.values(privateV5.materials||{}), sets:Object.values(privateV5.sets||{})
      };
    },
    apply(raw, operation) {
      if (operation.type==='saveProductLinks') {
        raw.products[operation.id].v5 ||= {}; raw.products[operation.id].v5.links=operation.links;
      } else if (operation.type==='createMaterial') {
        raw.v5 ||= {}; raw.v5.materials ||= {}; raw.v5.materials[operation.material.id]=operation.material;
      } else if (operation.type==='saveMaterial') {
        raw.v5.materials[operation.material.id]=operation.material;
      } else if (operation.type==='createSet') {
        raw.v5 ||= {}; raw.v5.sets ||= {}; raw.v5.sets[operation.set.id]=operation.set;
      } else if (operation.type==='saveReceipt') {
        const v5=raw.products[operation.id].v5 ||= {}; v5.receipts ||= [];
        if (operation.index===null) v5.receipts.push(operation.receipt); else v5.receipts[operation.index]=operation.receipt;
      } else if (operation.type==='saveImage') {
        const v5=raw.products[operation.id].v5 ||= {}; v5.imageData=operation.dataUrl;
      } else throw Error('unknown mock operation');
    }
  };
}
function mockDb(initial = fixture()) {
  let raw = structuredClone(initial), etag = '"one"', puts = 0, conflict = false, forced = null;
  return {
    async fetch(_url, options) {
      if (forced) return response(null, forced);
      if (options.method === 'GET') return response(structuredClone(raw), 200, etag);
      puts++;
      if (conflict || options.headers['If-Match'] !== etag) return response(null, 412);
      raw = JSON.parse(options.body); etag = '"next"'; return response(null);
    },
    value:()=>structuredClone(raw), puts:()=>puts, conflict(){conflict=true;}, force(code){forced=code;}
  };
}

test('메모리 미리보기에서 자동 연결하지 않으며 쓰기는 기본 차단', async () => {
  const {createAuthenticatedStore} = await adapter;
  let calls = 0;
  const store = createAuthenticatedStore({auth:fakeAuth(),fetchImpl:async()=>{calls++;}});
  assert.equal(calls, 0);
  await assert.rejects(store.createMaterial({}), /부자재|미리보기/);
  assert.equal(calls, 0); store.stop();
});

test('승인된 스키마 주입 전에는 읽기와 쓰기를 모두 차단', async () => {
  const {createAuthenticatedStore} = await adapter;
  let calls=0; const store=createAuthenticatedStore({auth:fakeAuth(),allowWrites:true,fetchImpl:async()=>{calls++;}});
  await assert.rejects(store.load(),/저장 위치/);
  await assert.rejects(store.saveProductLinks('p',[]),/저장 위치/);
  assert.equal(calls,0); store.stop();
});

test('인증한 읽기에서 v5 명시 값만 사용하고 이전 비용·가격을 추정하지 않음', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db = mockDb(), states=[];
  const store = createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(), fetchImpl:db.fetch,onChange:x=>states.push(x)});
  const data = await store.load();
  assert.equal(data.products[0].name,'가상 상품');
  assert.equal(data.products[0].stock,3);
  assert.equal(data.products[0].unitCost,undefined);
  assert.equal(data.products[0].salePrice,undefined);
  assert.equal(data.materials.length,1);
  assert.deepEqual(states.at(-1),data); store.stop(); assert.equal(states.at(-1),null);
});

test('기존 자료를 보존하고 상품·부자재를 같은 ETag로 조건부 연결', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db = mockDb();
  const store = createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  await store.saveProductLinks('p',[{materialId:'m',quantity:2,always:true}]);
  const saved=db.value();
  assert.equal(saved.products.p.cost,999);
  assert.equal(saved.products.p.v5.stock,3);
  assert.deepEqual(saved.unrelated,{keep:true});
  assert.deepEqual(saved.reviewCandidates,{keep:{extra:'keep'}});
  assert.equal(saved.products.p.v5.links[0].quantity,2);
  assert.equal(db.puts(),1); store.stop();
});

test('없는 부자재·상품, 중복 구성과 박스는 조건부 쓰기 전에 거부', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db=mockDb(), store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  await assert.rejects(store.saveProductLinks('p',[{materialId:'unknown',quantity:1,always:true}]));
  await assert.rejects(store.createMaterial({id:'b',name:'박스',kind:'pack',unitCost:1,stock:1,minStock:1}));
  await assert.rejects(store.createSet({id:'s',name:'가상',salePrice:20,components:[{id:'missing',quantity:1}],materials:[]}));
  await assert.rejects(store.createSet({id:'s',name:'가상',salePrice:20,components:[{id:'p',quantity:1},{id:'p',quantity:1}],materials:[]}));
  assert.equal(db.puts(),0); store.stop();
});

test('부자재·세트 생성이 각각 유효한 참조를 원자적으로 검증하고 중복을 막음', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db=mockDb(), store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  await store.createMaterial({id:'n',name:'가상 택',kind:'item',unitCost:3,stock:2,minStock:1});
  await store.createSet({id:'s',name:'가상 묶음',salePrice:30,components:[{id:'p',quantity:2}],materials:[{materialId:'m',quantity:1}]});
  assert.equal(db.value().v5.sets.s.components[0].quantity,2);
  await assert.rejects(store.createMaterial({id:'n',name:'가상 택',kind:'item',unitCost:3,stock:2,minStock:1}),/이미 등록/);
  assert.equal(db.puts(),2); store.stop();
});

test('부자재 통화를 보존하고 지원하지 않거나 모순된 통화는 저장 전에 차단', async () => {
  const {createAuthenticatedStore} = await adapter;
  const {createMemoryStore} = await import('../preview-v5/store.js');
  const db=mockDb(), store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  const cny={id:'c',name:'가상 리본',kind:'item',unitCost:3.5,currency:'CNY',stock:2,minStock:1};
  await store.createMaterial(cny);
  assert.equal(db.value().v5.materials.c.currency,'CNY');
  await store.saveMaterial('c',{name:'가상 리본 수정',currency:'CNY',unitCost:4.2});
  assert.equal(db.value().v5.materials.c.currency,'CNY');
  assert.equal(db.value().v5.materials.c.unitCost,4.2);
  await assert.rejects(store.createMaterial({...cny,id:'usd',currency:'USD'}),/부자재/);
  await assert.rejects(store.createMaterial({...cny,id:'conflict',currency:'KRW',unitCostCurrency:'CNY'}),/부자재/);
  await assert.rejects(store.saveMaterial('c',{currency:'USD'}),/부자재/);
  assert.equal(db.puts(),2); store.stop();
  const memory=createMemoryStore({products:[],materials:[],sets:[]});
  await memory.createMaterial({...cny,sourceRecord:'가상 원본'});
  assert.equal((await memory.load()).materials[0].currency,'CNY');
  await memory.saveMaterial('c',{unitCost:4.2,currency:'CNY'});
  assert.equal((await memory.load()).materials[0].sourceRecord,'가상 원본');
  assert.equal((await memory.load()).materials[0].unitCost,4.2);
  await assert.rejects(memory.saveMaterial('c',{currency:'USD'}),/통화/);
  await assert.rejects(memory.createMaterial({...cny,id:'usd',currency:'USD'}),/통화/);
  await assert.rejects(memory.createMaterial({...cny,id:'conflict',currency:'KRW',unitCostCurrency:'CNY'}),/통화/);
});

test('ETag 충돌과 거부 시 자동 재시도 없이 화면 자료를 비움', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db=mockDb(), states=[], statuses=[];
  const store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true,onChange:x=>states.push(x),onStatus:x=>statuses.push(x)});
  await store.load(); db.conflict();
  await assert.rejects(store.saveProductLinks('p',[{materialId:'m',quantity:1,always:true}]),/다른 곳/);
  assert.equal(db.puts(),1);
  db.force(403); await assert.rejects(store.load(),/볼 수 없어요/);
  assert.equal(states.at(-1),null); assert.equal(statuses.at(-1),'denied'); store.stop();
});

test('계정 전환 후 늦은 응답은 새 사용자에게 보여주지 않음', async () => {
  const {createAuthenticatedStore} = await adapter;
  const a=fakeAuth('one'), states=[]; let resolve;
  const store=createAuthenticatedStore({auth:a,schema:fakeSchema(),fetchImpl:()=>new Promise(r=>{resolve=r;}),onChange:x=>states.push(x)});
  const loading=store.load(); await new Promise(r=>setImmediate(r));
  a.set('two'); assert.equal(states.at(-1),null);
  resolve(response(fixture())); await assert.rejects(loading,/로그인이 바뀌어/);
  assert.equal(states.at(-1),null); store.stop();
});

test('쓰기 응답 유실은 비밀 오류 원문을 노출하지 않고 재시도하지 않음', async () => {
  const {createAuthenticatedStore} = await adapter;
  const states=[]; let puts=0;
  const store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),allowWrites:true,onChange:x=>states.push(x),fetchImpl:async (_url, options)=>{
    if (options.method === 'GET') return response(fixture());
    puts++; throw Error('sensitive internal error');
  }});
  await store.load();
  await assert.rejects(store.saveProductLinks('p',[{materialId:'m',quantity:1,always:true}]),error=>{
    assert.match(error.message,/저장 결과/);
    assert.doesNotMatch(error.message,/sensitive/);
    return true;
  });
  assert.equal(puts,1); assert.equal(states.at(-1),null); store.stop();
});

test('같은 계정의 늦은 이전 읽기가 새 화면을 덮어쓰지 않음', async () => {
  const {createAuthenticatedStore} = await adapter;
  const pending=[], states=[];
  const store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),onChange:x=>states.push(x),fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});
  const oldLoad=store.load(), newLoad=store.load();
  await new Promise(resolve=>setImmediate(resolve));
  const newer=fixture(); newer.products.p.name='새 예시';
  pending[1](response(newer)); await newLoad;
  pending[0](response(fixture())); await assert.rejects(oldLoad,/새 자료/);
  assert.equal(states.at(-1).products[0].name,'새 예시'); store.stop();
});

test('입고·사진 계약은 가상 매핑에서 검증 후 조건부 저장하며 다른 칸을 보존', async () => {
  const {createAuthenticatedStore} = await adapter;
  const db=mockDb(), store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  const receipt={batch:1,date:'2026-11-07',supplier:'가상',url:'https://detail.1688.com/example',unitCost:10,quantity:3,saleQuantity:2,eventQuantity:1,memo:''};
  await store.saveReceipt('p',null,receipt);
  await store.saveImage('p','data:image/png;base64,AA==');
  const value=db.value();
  assert.equal(value.products.p.v5.receipts[0].quantity,3);
  assert.equal(value.products.p.v5.receipts[0].saleQuantity,2);
  assert.equal(value.products.p.v5.receipts[0].eventQuantity,1);
  assert.equal(value.products.p.v5.imageData,'data:image/png;base64,AA==');
  assert.equal(value.products.p.cost,999);
  assert.deepEqual(value.unrelated,{keep:true});
  const writes=db.puts();
  await assert.rejects(store.saveReceipt('p',null,{...receipt,date:'2026-02-31'}),/날짜/);
  await assert.rejects(store.saveReceipt('p',null,{...receipt,url:'https://example.com/'}),/1688/);
  await assert.rejects(store.saveReceipt('p',null,{...receipt,saleQuantity:3}),/합/);
  await assert.rejects(store.saveImage('p','data:text/html;base64,AA=='),/사진/);
  assert.equal(db.puts(),writes); store.stop();
});

test('입고일 미상과 위안 단가를 보존하며 수정 시 원본 식별자·발주일을 지우지 않음', async () => {
  const {createAuthenticatedStore}=await adapter;
  const initial=fixture();
  initial.products.p.v5.receipts=[{batch:1,date:'',orderDate:'2026-10-01',currency:'CNY',sourceRecord:'source-safe',unitCost:12.5,quantity:10,saleQuantity:8,eventQuantity:2,memo:'이전',supplier:'가상',url:''}];
  const db=mockDb(initial), store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:db.fetch,allowWrites:true});
  const edit={batch:1,date:'',supplier:'가상',url:'',unitCost:12.5,quantity:10,saleQuantity:8,eventQuantity:2,memo:'수정'};
  await store.saveReceipt('p',0,edit);
  const saved=db.value().products.p.v5.receipts[0];
  assert.equal(saved.date,''); assert.equal(saved.orderDate,'2026-10-01');
  assert.equal(saved.currency,'CNY'); assert.equal(saved.sourceRecord,'source-safe');
  await assert.rejects(store.saveReceipt('p',0,{...edit,orderDate:'2026-02-31'}),/발주 날짜/);
  await assert.rejects(store.saveReceipt('p',0,{...edit,currency:'USD'}),/통화/);
  store.stop();
});

test('가상 편집도 원본 식별자·통화·발주일을 보존하고 잘못된 수량은 거부', async () => {
  const {createMemoryStore}=await import('../preview-v5/store.js');
  const original={batch:1,date:'',orderDate:'2026-10-01',currency:'CNY',sourceRecord:'mock-source',unitCost:3.5,quantity:10,saleQuantity:8,eventQuantity:2,supplier:'가상',url:'',memo:''};
  const store=createMemoryStore({products:[{id:'p',receipts:[original]}],materials:[],sets:[]});
  const edit={batch:1,date:'',supplier:'가상',url:'',unitCost:3.5,quantity:10,saleQuantity:8,eventQuantity:2,memo:'수정'};
  await store.saveReceipt('p',0,edit);
  const row=(await store.load()).products[0].receipts[0];
  assert.equal(row.currency,'CNY'); assert.equal(row.orderDate,'2026-10-01'); assert.equal(row.sourceRecord,'mock-source');
  await assert.rejects(store.saveReceipt('p',0,{...edit,saleQuantity:9}),/합/);
});

test('읽기 연결 오류에 포함된 내부 값은 사용자에게 전달하지 않음', async () => {
  const {createAuthenticatedStore}=await adapter;
  const store=createAuthenticatedStore({auth:fakeAuth(),schema:fakeSchema(),fetchImpl:async()=>{throw Error('sensitive internal detail');}});
  await assert.rejects(store.load(), error=>{
    assert.match(error.message,/자료를 읽지 못했어요/);
    assert.doesNotMatch(error.message,/sensitive/);
    return true;
  });
  store.stop();
});
