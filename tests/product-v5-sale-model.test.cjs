'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=import('../preview-v5/sale-model.js');
const storeModule=import('../preview-v5/store.js');
const fresh=Promise.all([import('../preview-v5/fresh-adapter.js'),import('../preview-v5/fresh-schema.js')]);
function response(data,status=200,etag='"v1"'){
 return {status,ok:status>=200&&status<300,headers:{get:()=>etag},json:async()=>structuredClone(data)};
}
function db(){
 let raw={schema:'product-v5-fresh-v1',products:[{id:'p1',name:'가상',imageData:'가상사진',receipts:[{batch:2,date:'',status:'배송 중',quantity:0}],custom:'보존'}],materials:[],sets:[]};
 let uid='owner', etag='"v1"', gets=0, puts=0, readbackWrong=false, conflict=false, watchers=[];
 const auth={current:()=>uid?{uid}:null,onAuth:fn=>{watchers.push(fn);fn(uid?{uid}:null);return()=>{}},dbUrl:async()=> 'https://example.invalid/private'};
 const fetchImpl=async(_url,opts)=>{
  if(opts.method==='GET'){gets++;const b=structuredClone(raw);if(readbackWrong&&puts)b.products[0].sale.decision='보류';return response(b,200,etag)}
  puts++;if(conflict||opts.headers['If-Match']!==etag)return response(null,412);
  raw=JSON.parse(opts.body);etag='"v2"';return response(null);
 };
 return {auth,fetchImpl,value:()=>raw,gets:()=>gets,puts:()=>puts,conflict:()=>{conflict=true},badReadback:()=>{readbackWrong=true},change:()=>{etag='"other"'},signout:()=>{uid='';watchers.forEach(x=>x(null))}};
}
test('missing sale is unknown; blank channel prices inherit own while explicit zero survives',async()=>{
 const {normalizeSale,saleStatus,saleMargin}=await model;
 const initial=normalizeSale(null); assert.equal(initial.decision,'미정');assert.equal(initial.prices.own,null);
 assert.equal(saleStatus(initial),'미정');
 const s=normalizeSale({decision:'판매',prices:{own:1000,smart:0},listings:{own:{registered:true}}});
 assert.equal(saleStatus(s),'등록 완료');assert.deepEqual(saleMargin(s,'smart',200,true),{price:0,margin:-200,marginRate:null,visible:true});
 assert.deepEqual(saleMargin(s,'coupang',200,true),{price:1000,margin:800,marginRate:80,visible:true});
 assert.equal(saleMargin(s,'coupang',1200,true).marginRate,-20);
 assert.equal(saleMargin(s,'own',200).margin,null);
 assert.equal(saleMargin(s,'own',null,true).margin,null);
});
test('statuses reflect decision and registrations without inferring unregistered channels',async()=>{
 const {saleStatus}=await model;
 assert.equal(saleStatus({decision:'판매'}),'판매 확정 미등록');
 assert.equal(saleStatus({decision:'보류',listings:{own:{registered:true}}}),'보류/안 팜');
 assert.equal(saleStatus({decision:'안 팜'}),'보류/안 팜');
});
test('partial changes preserve other channels, unknown extra fields, and reject unsafe URL and values',async()=>{
 const {mergeSalePatch}=await model;
 const previous={decision:'판매',prices:{own:1000,smart:50},listings:{own:{registered:true,url:'https://mumutori.com/item',detail:'완료',extra:'keep'}},future:'keep'};
 const s=mergeSalePatch(previous,{prices:{coupang:0},listings:{own:{detail:'만드는 중'}}});
 assert.equal(s.prices.smart,50);assert.equal(s.prices.coupang,0);assert.equal(s.listings.own.registered,true);assert.equal(s.listings.own.extra,'keep');assert.equal(s.future,'keep');
 for(const bad of ['javascript:alert(1)','http://example.com','https://user:pw@example.com','https://example.com:444/']) assert.throws(()=>mergeSalePatch(s,{listings:{own:{url:bad}}}));
 assert.throws(()=>mergeSalePatch(s,{prices:{own:-1}}));assert.throws(()=>mergeSalePatch(s,{updatedAt:'forged'}));
});
test('margin visibility defaults allowed and can be explicitly hidden in fake memory store',async()=>{
 const {createMemoryStore}=await storeModule;
 const initial={products:[{id:'p1',sale:{prices:{own:1000}}}],materials:[],sets:[]};
 const staff=createMemoryStore(initial,{marginVisibleTo:'none'}), owner=createMemoryStore(initial);
 assert.equal(staff.canViewMargin(),false);assert.equal(owner.canViewMargin(),true);
 await owner.saveSale('p1',{prices:{smart:0}});
 const s=(await owner.load()).products[0].sale; assert.equal(s.prices.smart,0);assert.equal(s.prices.own,1000);assert.equal(s.by,'preview');
});
test('real adapter without loaded revision cannot touch network',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await fresh;const m=db();
 const store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
 assert.equal(store.canViewMargin(),true);
 await assert.rejects(store.saveSale('p1',{decision:'판매'}),/불러온/);assert.equal(m.gets(),0);assert.equal(m.puts(),0);store.stop();
});
test('same conditional PUT stores sale history and complete readback preserves unrelated values',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await fresh;const m=db();
 const store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
 await store.load();const revision=store.revision();
 await store.saveSale('p1',{decision:'판매',prices:{own:1200}},revision);
 assert.equal(m.puts(),1);assert.equal(m.gets(),3);
 const v=m.value().products[0];assert.equal(v.sale.decision,'판매');assert.equal(v.sale.prices.own,1200);assert.equal(v.sale.by,'owner');
 assert.equal(v.sale.history.length,2);assert.deepEqual(v.sale.history.map(x=>x.field).sort(),['decision','prices.own']);
 assert.equal(v.custom,'보존');assert.equal(v.receipts[0].date,'');assert.equal(v.imageData,'가상사진');store.stop();
});
test('an unchanged sale causes no write and a stale revision prevents write',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await fresh;
 const m=db(),store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true});
 await store.load();await store.saveSale('p1',{decision:'미정'});assert.equal(m.puts(),0);store.stop();
 const n=db(),other=createAuthenticatedStore({auth:n.auth,fetchImpl:n.fetchImpl,schema:freshSchema,allowWrites:true});
 await other.load();const old=other.revision();n.change();await assert.rejects(other.saveSale('p1',{decision:'판매'},old),/바뀌었어요/);assert.equal(n.puts(),0);other.stop();
});
test('auth switch during read and server conflict never write an unauthorized update',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await fresh;const m=db();
 const switchingFetch=async(url,opts)=>{const result=await m.fetchImpl(url,opts);if(opts.method==='GET'&&m.gets()===2)m.signout();return result};
 const store=createAuthenticatedStore({auth:m.auth,fetchImpl:switchingFetch,schema:freshSchema,allowWrites:true});
 await store.load();await assert.rejects(store.saveSale('p1',{decision:'판매'}),/로그인/);assert.equal(m.puts(),0);store.stop();
 const n=db(),other=createAuthenticatedStore({auth:n.auth,fetchImpl:n.fetchImpl,schema:freshSchema,allowWrites:true});
 await other.load();n.conflict();await assert.rejects(other.saveSale('p1',{decision:'판매'}),/바뀌었어요/);assert.equal(n.puts(),1);other.stop();
});
test('readback mismatch after successful PUT stops without retry',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await fresh;const m=db();m.badReadback();
 const store=createAuthenticatedStore({auth:m.auth,fetchImpl:m.fetchImpl,schema:freshSchema,allowWrites:true,backupSale:async x=>({verified:true,rootEtag:x.rootEtag})});
 await store.load();await assert.rejects(store.saveSale('p1',{decision:'판매'}),/저장 후 자료/);assert.equal(m.puts(),1);store.stop();
});
