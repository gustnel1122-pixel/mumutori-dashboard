'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=Promise.all([import('../preview-v5/fresh-adapter.js'),import('../preview-v5/fresh-schema.js'),import('../preview-v5/store.js'),import('../preview-v5/model.js')]);

function fixture(initialUid) {
 let uid=initialUid, etag='"v1"';
 const fake={schema:'product-v5-fresh-v1',products:[],materials:[],sets:[]};
 const auth={current:()=>uid?{uid}:null,onAuth:fn=>{fn(uid?{uid}:null);return()=>{}},dbUrl:async()=> 'https://preview.invalid/data'};
 const fetchImpl=async(_url,opts)=>{
  if(!opts||opts.method==='GET')return {status:200,ok:true,headers:{get:()=>etag},json:async()=>structuredClone(fake)};
  if(opts.headers['If-Match']!==etag)return {status:412,ok:false,headers:{get:()=>etag},json:async()=>null};
  Object.assign(fake, JSON.parse(opts.body)); etag='"v2"';
  return {status:200,ok:true,headers:{get:()=>etag},json:async()=>null};
 };
 return {auth,fetchImpl,raw:()=>fake};
}

test('20261114_1823: fresh-adapter saveSettings persists only the changed fields and keeps the rest at default', async () => {
 const [{createAuthenticatedStore},{freshSchema}]=await modules;
 const f=fixture('owner');
 const store=createAuthenticatedStore({auth:f.auth,fetchImpl:f.fetchImpl,schema:freshSchema,allowWrites:true});
 const first=await store.load();
 assert.equal(first.settings.coupangLogistics, 2250);
 await store.saveSettings({coupangLogistics: 2500});
 const second=await store.load();
 assert.equal(second.settings.coupangLogistics, 2500);
 assert.equal(second.settings.targetRoas, 300); // 안 고친 칸은 기본값 유지
 store.stop();
});

test('20261114_1823: fresh-adapter saveSettings rejects unknown fields', async () => {
 const [{createAuthenticatedStore},{freshSchema}]=await modules;
 const f=fixture('owner');
 const store=createAuthenticatedStore({auth:f.auth,fetchImpl:f.fetchImpl,schema:freshSchema,allowWrites:true});
 await store.load();
 await assert.rejects(store.saveSettings({notAField: 1}));
 store.stop();
});

test('20261114_1823: memory store saveSettings works the same way for the preview demo', async () => {
 const [,,{createMemoryStore}]=await modules;
 const store=createMemoryStore({products:[],materials:[],sets:[]});
 const before=await store.load();
 assert.equal(before.settings.storeCardFee, null);
 await store.saveSettings({storeCardFee: 0.025});
 const after=await store.load();
 assert.equal(after.settings.storeCardFee, 0.025);
 await assert.rejects(store.saveSettings({}));
});
