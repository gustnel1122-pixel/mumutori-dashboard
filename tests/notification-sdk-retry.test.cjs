'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function fixture(source,{firstWriteFails=false}={}){
  let loads=0,writes=0;
  const user={uid:'test_owner'};
  const db={ref:()=>({orderByChild(){return this;},limitToLast(){return this;},once:async()=>({val:()=>({synthetic:{createdAt:1}})}),set:async()=>{writes++;if(firstWriteFails&&writes===1)throw Error('synthetic offline');}})};
  const firebase={auth:()=>({currentUser:user}),app:()=>({database:()=>db})};
  const document={baseURI:'https://example.test/app/',body:{dataset:{build:'abcdef012345'}},createElement:()=>({}),head:{append(script){loads++;queueMicrotask(()=>{if(loads===1){script.onerror();return;}firebase.database=Object.assign(()=>db,{ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}});script.onload();});}}};
  const ctx={firebase,document,URL,queueMicrotask};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src',source),'utf8'),ctx);
  return {ctx,get loads(){return loads;},get writes(){return writes;}};
}

test('SDK operation retries loading after a script error',async()=>{
  const f=fixture('notification-state.js');
  await assert.rejects(f.ctx.MumutoriNoticeState.pushRequest('test_owner','GET','tokens/test'),/database-unavailable/);
  assert.ok((await f.ctx.MumutoriNoticeState.pushRequest('test_owner','GET','tokens/test')).synthetic);
  assert.equal(f.loads,2);
});
