'use strict';
// Synthetic, in-memory HTTP only. No real ledger data or network is used.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../src/fin-core.js'),data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const c=data(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8'));
const source=fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace("import { dbUrl } from './fbauth.js?v=access20261028';","const dbUrl=async p=>'https://synthetic.invalid/'+p;").replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(c));
const hub=import(data(source));
test('late manual edit cannot modify a canceled row',async()=>{
 const {openFinStore}=await hub,oldFetch=global.fetch,oldWindow=global.window;let row={id:'synthetic',date:'2026-10-29',kind:'out',amount:12,method:'현대카드',evidence:'없음',status:'needs',memo:'기존'},rev=0,release,signal;
 const ready=new Promise(r=>signal=r),wait=new Promise(r=>release=r);
 global.window={FinCore:F};global.fetch=async(url,opt={})=>{assert.equal(new URL(url).hostname,'synthetic.invalid');const method=opt.method||'GET';if(method==='GET')return new Response(JSON.stringify(row),{headers:{ETag:'"'+rev+'"'}});const body=JSON.parse(opt.body);if(body.method==='카뱅이체'&&body.status!=='void'){signal();await wait;}const match=opt.headers?.['if-match'];if(match&&match!=='"'+rev+'"')return new Response('',{status:412});row=method==='PATCH'?{...row,...body}:body;rev++;return new Response(JSON.stringify(row));};
 const s=openFinStore();try{const pending=s.patch('synthetic',{method:'카뱅이체',evidence:'없음'});await ready;await s.patch('synthetic',{status:'void'});release();await Promise.allSettled([pending]);assert.equal(row.status,'void');assert.equal(row.method,'현대카드','late manual change must not modify a canceled row');assert.equal(row.memo,'기존');}finally{s.close();global.fetch=oldFetch;global.window=oldWindow;}
});
