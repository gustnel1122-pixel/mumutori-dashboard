// 운영 Firebase에 접속하지 않고 실제 수집 모듈을 메모리 장부로 시험한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../src/fin-core.js');
const source=fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace("import { dbUrl } from './fbauth.js';","const dbUrl=()=>{throw Error('Network forbidden in test')};");
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const item=(vendor='시험상점',card='사업구매전용')=>({text:`현대 ${card} 승인 12500원 일시불, 10/26 22:34 ${vendor}`,card,src:'현대카드',ts:new Date('2026-10-26T13:35:00Z').getTime()});
test('연결 시험 합계 제외 · 동시 수집/재처리 멱등 · 다른 상품/가맹점 유지 · 열려 있는 화면 수집',async()=>{
 const data={entries:{},meta:{},sales:{},__inbox:{fake:{md_trial_20261026:item(),one:item(),copy:item(),two:item('다른상점'),three:item('시험상점','MY BUSINESS')}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};
 const {openFinStore}=await modulePromise;const store=openFinStore();
 try{
  await store.load();await Promise.all([store.processInbox(),store.processInbox()]);
  assert.equal(Object.keys(data.entries).length,3);assert.equal(store.book().inboxTestCount,1);assert(!data.inboxSeen.md_trial_20261026);assert(data.inboxSeen.copy.dup);
  assert.equal(await store.processInbox(),0);assert.equal(Object.keys(data.entries).length,3);
  const saved=data.entries.al_one; saved.memo='사용자가 고친 내용';
  await store.processInbox();assert.equal(data.entries.al_one.memo,'사용자가 고친 내용');
  store.watch(10);data.__inbox.fake.later=item('새상점');
  for(let i=0;i<30&&!data.entries.al_later;i++)await new Promise(r=>setTimeout(r,10));
  assert(data.entries.al_later);assert.equal(Object.keys(data.entries).length,4);assert.equal(store.book().inboxTestCount,1);
 }finally{store.close();delete global.window;}
});
test('원문 입구와 기존 입구 함께 수집 · 이름/누적 미보존 · 취소 상품명',async()=>{
 const ts=Date.parse('2026-10-26T14:40:00Z');
 const raw={text:'긴 가상 이름 님, 현대 사업구매전용 승인\n12,500원 일시불, 10/26 23:40\n시험"상점\\지점 & +\n누적999,999원',ts};
 const data={entries:{},meta:{},sales:{},__inbox:{same:{old:item('기존상점')}},__rawInbox:{same:{hd_1:raw,hd_2:{...raw,text:raw.text.replace('승인','취소')},md_trial_raw:raw,hd_bad:{text:'현대 안내 승인 없는 글',ts}}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};const {openFinStore}=await modulePromise;const store=openFinStore();
 try {await store.load();await store.processInbox();assert.equal(Object.keys(data.entries).length,3);assert.equal(store.book().inboxTestCount,1);const e=data.entries.al_hd_1;assert.equal(e.amount,12500);assert.equal(e.card,'사업구매전용');assert.equal(e.vendor,'시험"상점\\지점 & +');assert.equal(data.entries.al_hd_2.kind,'in');assert.equal(data.entries.al_hd_2.card,'사업구매전용');assert(!JSON.stringify(data.entries).includes('가상 이름'));assert(!JSON.stringify(data.entries).includes('999,999'));assert(!('text' in e));assert(!data.entries.al_hd_bad);}finally{store.close();delete global.window;}
});
