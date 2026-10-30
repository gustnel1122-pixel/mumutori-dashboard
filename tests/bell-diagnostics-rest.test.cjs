'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/bell-diagnostics.js'),'utf8');
function fixture(){
  let user={uid:'synthetic_owner',getIdToken:async()=> 'synthetic-token'},fail=false;
  const calls=[],auth={get currentUser(){return user;}};
  const ctx={firebase:{auth:()=>auth},document:{body:{dataset:{build:'abcdef012345'}}},fetch:async(url,options)=>{calls.push({url,options});if(fail)throw Error('synthetic error');return {ok:true};}};
  vm.runInNewContext(source,ctx);
  return {ctx,calls,setUser:u=>user=u,setFail:v=>fail=v};
}
test('writes only fixed code, version and server time without database SDK',async()=>{
  const f=fixture();assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_TIMEOUT'),true);
  assert.equal(f.calls.length,1);const body=JSON.parse(f.calls[0].options.body);
  assert.deepEqual(Object.keys(body).sort(),['code','createdAt','version']);
  assert.equal(body.code,'EVENTS_TIMEOUT');assert.equal(body.version,'abcdef012345');assert.equal(body.createdAt['.sv'],'timestamp');
  assert.equal(JSON.stringify(body).includes('synthetic_owner'),false);assert.equal(JSON.stringify(body).includes('synthetic-token'),false);
  assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.referrerPolicy,'no-referrer');
});
test('unknown code, missing login and invalid build never transmit',async()=>{
  const f=fixture();assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('untrusted'),false);
  f.setUser(null);assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_FAILED'),false);
  f.setUser({uid:'synthetic_owner',getIdToken:async()=> 'synthetic-token'});f.ctx.document.body.dataset.build='untrusted';
  assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_FAILED'),false);assert.equal(f.calls.length,0);
});
test('an account change while waiting for the token prevents transmission',async()=>{
  const f=fixture();let done;f.setUser({uid:'old_owner',getIdToken:()=>new Promise(resolve=>{done=resolve;})});
  const pending=f.ctx.MumutoriNoticeDiagnostics.record('READ_STATE_FAILED');
  f.setUser({uid:'new_owner',getIdToken:async()=> 'new-token'});done('old-token');
  assert.equal(await pending,false);assert.equal(f.calls.length,0);
  assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('READ_STATE_FAILED'),true);
});
test('failed transmission can retry and successful duplicate is suppressed',async()=>{
  const f=fixture();f.setFail(true);assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_FAILED'),false);
  f.setFail(false);assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_FAILED'),true);
  assert.equal(await f.ctx.MumutoriNoticeDiagnostics.record('EVENTS_FAILED'),false);assert.equal(f.calls.length,2);
});
