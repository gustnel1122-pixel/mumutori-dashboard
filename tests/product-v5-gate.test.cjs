'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const gateModule = import('../preview-v5/private-gate.js');

function fakeAuth(initial = null) {
  let user = initial ? {uid:initial} : null; const listeners = new Set();
  return {
    current:()=>user,
    dbUrl:async path=>'https://mock.invalid/'+path,
    onAuth(cb){listeners.add(cb);cb(user);return ()=>listeners.delete(cb);},
    set(uid){user=uid?{uid}:null; for(const cb of [...listeners]) cb(user);}
  };
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function response(status=200, onCancel=()=>{}) {
  return {status,ok:status>=200&&status<300,body:{cancel:async()=>onCancel()}};
}
function recorder() {
  let mounted=false, mounts=0, removes=0, status='';
  return {mountFrame(){mounted=true;mounts++;},removeFrame(){mounted=false;removes++;},showStatus(s){status=s;},get mounted(){return mounted;},get mounts(){return mounts;},get removes(){return removes;},get status(){return status;}};
}

test('시작 전에는 연결하지 않고 로그인 전에도 요청 또는 프레임이 없음', async()=>{
  const {createPrivateGate}=await gateModule, a=fakeAuth(), ui=recorder(); let calls=0;
  const gate=createPrivateGate({auth:a,fetchImpl:async()=>{calls++;return response();},...ui});
  assert.equal(calls,0); gate.start(); await tick();
  assert.equal(calls,0);assert.equal(ui.mounted,false);assert.equal(ui.status,'login');gate.stop();
});

test('서버 접근 확인이 끝나야 프레임 생성하며 응답 본문은 버림', async()=>{
  const {createPrivateGate}=await gateModule, a=fakeAuth('a'), ui=recorder(); let resolve,cancelled=0;
  const gate=createPrivateGate({auth:a,fetchImpl:()=>new Promise(r=>{resolve=r;}),...ui});
  gate.start();await tick();assert.equal(ui.mounted,false);assert.equal(ui.status,'checking');
  resolve(response(200,()=>cancelled++));await tick();
  assert.equal(cancelled,1);assert.equal(ui.mounted,true);assert.equal(ui.status,'ready');gate.stop();assert.equal(ui.mounted,false);
});

test('권한 거부 또는 오류에는 프레임을 생성하지 않음', async()=>{
  const {createPrivateGate}=await gateModule, a=fakeAuth('a'), ui=recorder(); let status=403;
  const gate=createPrivateGate({auth:a,fetchImpl:async()=>response(status),...ui});gate.start();await tick();
  assert.equal(ui.mounted,false);assert.equal(ui.status,'denied');
  status=500;await gate.retry();assert.equal(ui.mounted,false);assert.equal(ui.status,'unavailable');gate.stop();
});

test('로그아웃 및 계정 전환 즉시 프레임을 지우고 이전 응답 무시', async()=>{
  const {createPrivateGate}=await gateModule, a=fakeAuth('a'), ui=recorder(), pending=[];
  const gate=createPrivateGate({auth:a,fetchImpl:(_url,opts)=>new Promise(resolve=>pending.push({resolve,opts})),...ui});
  gate.start();await tick();a.set('b');assert.equal(ui.mounted,false);await tick();
  assert.equal(pending[0].opts.signal.aborted,true);
  pending[0].resolve(response());await tick();assert.equal(ui.mounted,false);
  pending[1].resolve(response());await tick();assert.equal(ui.mounted,true);
  a.set(null);assert.equal(ui.mounted,false);assert.equal(ui.status,'login');gate.stop();
});

test('child 권한 거부는 현재 프레임을 즉시 제거', async()=>{
  const {createPrivateGate}=await gateModule,a=fakeAuth('a'),ui=recorder();
  const gate=createPrivateGate({auth:a,fetchImpl:async()=>response(),...ui});gate.start();await tick();
  assert.equal(ui.mounted,true);gate.deny();assert.equal(ui.mounted,false);assert.equal(ui.status,'denied');gate.stop();
});
