'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=Promise.all([import('../preview-v5/fresh-adapter.js'),import('../preview-v5/fresh-schema.js'),import('../preview-v5/store.js'),import('../preview-v5/sale-model.js'),import('../preview-v5/model.js')]);

function fixture(initialUid) {
 let uid=initialUid, denied=false, listeners=[];
 const fake={schema:'product-v5-fresh-v1',products:[{id:'fake',name:'가상 상품',stock:null,receipts:[],channels:[],links:[]}],materials:[],sets:[]};
 const auth={current:()=>uid?{uid}:null,onAuth:fn=>{listeners.push(fn);fn(uid?{uid}:null);return()=>{}},dbUrl:async()=> 'https://preview.invalid/data'};
 const fetchImpl=async()=>({status:denied?403:200,ok:!denied,headers:{get:()=> '"fake"'},json:async()=>structuredClone(fake)});
 return {auth,fetchImpl,deny:()=>{denied=true},signOut:()=>{uid='';listeners.forEach(fn=>fn(null))}};
}

test('default allowed shows margins for both already-authorized synthetic accounts and clears on sign out',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;
 for(const fakeUid of ['fake_account_a','fake_account_b']){
  const f=fixture(fakeUid);let last='untouched';
  const s=createAuthenticatedStore({auth:f.auth,fetchImpl:f.fetchImpl,schema:freshSchema,onChange:value=>last=value});
  await s.load();assert.equal(s.canViewMargin(),true);
  f.signOut();assert.equal(s.canViewMargin(),false);assert.equal(last,null);s.stop();
 }
});

test('unauthenticated and denied fake users cannot obtain product data; denied clears the display',async()=>{
 const [{createAuthenticatedStore},{freshSchema}]=await modules;
 const noUser=fixture('');let requests=0;
 const s=createAuthenticatedStore({auth:noUser.auth,fetchImpl:async(...args)=>{requests++;return noUser.fetchImpl(...args)},schema:freshSchema});
 await assert.rejects(s.load());assert.equal(requests,0);s.stop();
 const denied=fixture('fake_denied');denied.deny();let last='untouched',status='';
 const d=createAuthenticatedStore({auth:denied.auth,fetchImpl:denied.fetchImpl,schema:freshSchema,onChange:value=>last=value,onStatus:value=>status=value});
 await assert.rejects(d.load());assert.equal(last,null);assert.equal(status,'denied');d.stop();
});

test('default preview shows allowed margin; explicit none still hides it',async()=>{
 const [,,{createMemoryStore}]=await modules;const fixture={products:[],materials:[],sets:[]};
 assert.equal(createMemoryStore(fixture).canViewMargin(),true);
 assert.equal(createMemoryStore(fixture,{marginVisibleTo:'none'}).canViewMargin(),false);
});

test('unknown CNY cost is not treated as KRW; zero price has no margin rate',async()=>{
 const [,,,{saleMargin},{calcProduct}]=await modules;
 const p={receipts:[{quantity:10,saleQuantity:10,eventQuantity:0,currency:'CNY',unitCost:10}],links:[]};
 const cost=calcProduct(p,[],{includeMaterials:false}).cost;
 assert.equal(cost,null);
 assert.equal(saleMargin({prices:{own:1000}},'own',cost,true).margin,null);
 const zero=saleMargin({prices:{own:0}},'own',100,true);
 assert.equal(zero.margin,-100);assert.equal(zero.marginRate,null);
 assert.equal(saleMargin({prices:{own:1000}},'own',100,false).margin,null);
});
