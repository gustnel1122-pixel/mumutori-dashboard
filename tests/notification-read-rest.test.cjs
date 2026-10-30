'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/notification-state.js'),'utf8');
function fixture(options={}){
  const calls=[],user={uid:'owner_one',getIdToken:async()=>{if(options.tokenWait)await options.tokenWait;return 'synthetic-token';}};
  let active=user,sdkUpdates=0;
  const db={ref:p=>({once:async()=>({val:()=>null}),update:async()=>{sdkUpdates++}})};
  const firebase={auth:()=>({currentUser:active}),database:{ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}},app:()=>({database:()=>db})};
  const fetch=async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body});if(options.onFetch)await options.onFetch(opts);if(options.fail)throw Error('offline');if(opts.method==='GET')return{ok:true,json:async()=>options.batch??null};return{ok:true};};
  const ctx={firebase,fetch,URL,AbortController,setTimeout,clearTimeout};vm.runInNewContext(source,ctx);
  return{state:ctx.MumutoriNoticeState,calls,setUser:u=>active=u,get sdkUpdates(){return sdkUpdates;}};
}
test('read acknowledges one event with an atomic bounded HTTPS write',async()=>{const f=fixture();const ids=await f.state.write('owner_one','notice_1','read');assert.deepEqual(Array.from(ids),['notice_1']);assert.deepEqual(f.calls.map(c=>c.method),['GET','PATCH']);assert.deepEqual(JSON.parse(f.calls[1].body),{notice_1:{at:{'.sv':'timestamp'}}});});
test('grouped notifications preserve all member IDs in one patch',async()=>{const f=fixture({batch:{members:{notice_1:true,notice_2:true}}});const ids=await f.state.write('owner_one','notice_1','read');assert.deepEqual(Array.from(ids),['notice_1','notice_2']);assert.deepEqual(Object.keys(JSON.parse(f.calls[1].body)),['notice_1','notice_2']);assert.equal(f.sdkUpdates,0);});
test('invalid group is rejected without any read write or SDK fallback',async()=>{const f=fixture({batch:{members:{bad:false}}});await assert.rejects(f.state.write('owner_one','notice_1','read'),/invalid-batch/);assert.equal(f.calls.length,1);assert.equal(f.sdkUpdates,0);});
test('account switch during token refresh cannot write either account',async()=>{let release;const tokenWait=new Promise(r=>release=r),f=fixture({tokenWait});const p=f.state.write('owner_one','notice_1','read');f.setUser({uid:'owner_two'});release();await assert.rejects(p,/account-changed/);assert.equal(f.calls.length,0);assert.equal(f.sdkUpdates,0);});
test('network failure falls back to existing SDK path without exposing data',async()=>{const f=fixture({fail:true});const ids=await f.state.write('owner_one','notice_1','read');assert.deepEqual(Array.from(ids),['notice_1']);assert.equal(f.sdkUpdates,1);});
