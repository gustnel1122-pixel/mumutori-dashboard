'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=import('../preview-v5/sale-model.js');
const modules=Promise.all([import('../preview-v5/fresh-adapter.js'),import('../preview-v5/fresh-schema.js'),import('../preview-v5/store.js')]);
const when='2026-11-09T06:00:00.000Z';
function rtdb(value){
 if(value===null||value===undefined)return undefined;
 if(Array.isArray(value)){if(!value.length)return undefined;return value.map(rtdb);}
 if(value&&typeof value==='object'){const o={};for(const [k,v] of Object.entries(value)){const n=rtdb(v);if(n!==undefined)o[k]=n;}return Object.keys(o).length?o:undefined;}
 return value;
}
function fakeDb(){
 let raw={schema:'product-v5-fresh-v1',products:[{id:'p1',name:'예시',unitCost:987654,imageData:'사진',receipts:[{batch:2,date:'',settlementKrw:null,quantity:0}]}],materials:{a:{id:'m1'}},sets:{z:{id:'s1'}}};
 raw=rtdb(raw); let uid='owner',ver=1,puts=0,gets=0,mode='',watchers=[];
 const auth={current:()=>uid?{uid}:null,onAuth:f=>{watchers.push(f);f(uid?{uid}:null);return()=>{}},dbUrl:async()=> 'https://example.invalid/v5'};
 const response=(body,status=200)=>({status,ok:status>=200&&status<300,headers:{get:()=>`"v${ver}"`},json:async()=>structuredClone(body)});
 const fetchImpl=async(_url,o)=>{
  if(o.method==='GET'){gets++;let body=structuredClone(raw);if(mode==='mismatch'&&puts)body.products[0].sale.history[0].field='decision';return response(body);}
  puts++;if(mode==='conflict'||o.headers['If-Match']!==`"v${ver}"`)return response(null,412);
  if(mode==='lost')throw new Error('sensitive error is not surfaced');
  raw=rtdb(JSON.parse(o.body));ver++;
  if(mode==='lostAfter')throw new Error('sensitive error is not surfaced');
  return response(null);
 };
 return {auth,fetchImpl,value:()=>structuredClone(raw),puts:()=>puts,gets:()=>gets,setMode:x=>mode=x,signout:()=>{uid='';watchers.forEach(f=>f(null));}};
}
test('history records only sale leaves with missing, zero, false, null and actor kept distinct',async()=>{
 const {prepareSaleChange,normalizeSale}=await model;
 let a=prepareSaleChange(null,{prices:{own:0}},'uid_01',when).sale;
 assert.deepEqual(a.history[0],{field:'prices.own',old:{present:false},new:{present:true,type:'number',value:0},at:when,by:'uid_01'});
 a=prepareSaleChange(a,{prices:{own:null},listings:{own:{registered:true}}},'uid_01',when).sale;
 assert.deepEqual(a.history[1].old,{present:true,type:'number',value:0});assert.deepEqual(a.history[1].new,{present:true,type:'null'});
 assert.deepEqual(a.history[2].old,{present:true,type:'boolean',value:false});assert.deepEqual(a.history[2].new,{present:true,type:'boolean',value:true});
 assert.deepEqual(normalizeSale(rtdb(a)).history,a.history);
 assert.throws(()=>prepareSaleChange(a,{unitCost:2},'uid_01',when));
 assert.throws(()=>prepareSaleChange(a,{decision:'판매'},'owner@example.com',when));
 assert.throws(()=>normalizeSale({...a,history:[{field:'unitCost',old:{present:false},new:{present:true,type:'number',value:987654},at:when,by:'uid_01'}]}));
});
test('history prunes only oldest beyond 30, leaves unrelated extras and ignores identical values',async()=>{
 const {prepareSaleChange}=await model;let a={future:{preserve:true}};
 for(let i=0;i<31;i++)a=prepareSaleChange(a,{prices:{own:i+1}},'uid_01',new Date(Date.parse(when)+i*1000).toISOString()).sale;
 assert.equal(a.history.length,30);assert.equal(a.history[0].new.value,2);assert.equal(a.history[29].new.value,31);assert.equal(a.future.preserve,true);
 const same=prepareSaleChange(a,{prices:{own:31}},'uid_01',when);assert.equal(same.changed,false);assert.equal(same.sale.history.length,30);
});
test('save writes history and change in same conditional PUT then reads back without reshaping other data',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;const d=fakeDb(),before=d.value();
 const s=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true});
 await s.load();await s.saveSale('p1',{prices:{own:10}},s.revision());
 const after=d.value();assert.equal(d.puts(),1);assert.equal(d.gets(),3);assert.equal(after.products[0].sale.prices.own,10);
 assert.equal(after.products[0].sale.history[0].field,'prices.own');assert.equal(after.products[0].sale.history[0].new.value,10);
 assert.equal(JSON.stringify(after.products[0].sale.history).includes('987654'),false);
 const afterWithoutSale=structuredClone(after);delete afterWithoutSale.products[0].sale;assert.deepEqual(afterWithoutSale,before);
 s.stop();
});
test('conflict and uncertain response never retry; conflict leaves field and history unchanged',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;
 for(const mode of ['conflict','lost']){
  const d=fakeDb(),before=d.value(),s=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true});
  await s.load();d.setMode(mode);await assert.rejects(s.saveSale('p1',{decision:'판매'},s.revision()));
  assert.equal(d.puts(),1);assert.deepEqual(d.value(),before);s.stop();
 }
});
test('readback mismatch reports unknown without retrying a successful PUT',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;const d=fakeDb(),s=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true});
 await s.load();d.setMode('mismatch');await assert.rejects(s.saveSale('p1',{prices:{own:10}},s.revision()),/저장 후 자료/);assert.equal(d.puts(),1);s.stop();
});
test('response lost after committed PUT remains unknown and is never retried',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;const d=fakeDb(),s=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true});
 await s.load();d.setMode('lostAfter');await assert.rejects(s.saveSale('p1',{prices:{own:10}},s.revision()),/저장 결과를 확인하지 못했어요/);
 assert.equal(d.puts(),1);assert.equal(d.value().products[0].sale.history.length,1);assert.equal(d.value().products[0].sale.prices.own,10);s.stop();
});
test('account switch during the pre-write read stops without writing value or history',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;const d=fakeDb(),before=d.value();let reads=0;
 const fetchImpl=async(url,opts)=>{const result=await d.fetchImpl(url,opts);if(opts.method==='GET'&&++reads===2)d.signout();return result;};
 const s=createAuthenticatedStore({auth:d.auth,fetchImpl,schema:freshSchema,allowWrites:true});
 await s.load();await assert.rejects(s.saveSale('p1',{decision:'판매'},s.revision()));assert.equal(d.puts(),0);assert.deepEqual(d.value(),before);s.stop();
});
test('same value never writes; margin setting defaults to allowed and can explicitly hide',async()=>{
 const [{createAuthenticatedStore},{freshSchema},{createMemoryStore}]=await modules;const d=fakeDb();
 const s=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true});
 await s.load();await s.saveSale('p1',{decision:'미정'},s.revision());assert.equal(d.puts(),0);assert.equal(s.canViewMargin(),true);s.stop();
 const a=createAuthenticatedStore({auth:d.auth,fetchImpl:d.fetchImpl,schema:freshSchema,allowWrites:true,marginVisibleTo:'allowed'});assert.equal(a.canViewMargin(),true);d.signout();assert.equal(a.canViewMargin(),false);a.stop();
 assert.equal(createMemoryStore({products:[],materials:[],sets:[]},{marginVisibleTo:'none'}).canViewMargin(),false);
 assert.equal(createMemoryStore({products:[],materials:[],sets:[]},{marginVisibleTo:'allowed'}).canViewMargin(),true);
});
