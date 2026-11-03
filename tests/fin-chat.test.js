// 재무 위 채팅창(사장님 11/3) 시험 — 가짜 거래만. 실행: node --test tests/fin-chat.test.js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const F=require('../src/fin-core.js');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const classify=fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8');
const C=import(url(classify));
const hubSrc=fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8')
 .replace("import { dbUrl } from './fbauth.js?v=access20261028';","const dbUrl=async p=>'https://isolated.test/'+p;")
 .replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(url(classify)));
const hub=import(url(hubSrc));
async function form(){
  const K=await C,src=fs.readFileSync(require.resolve('../src/fin-form.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+(?=(const|function)\b)/g,'');
  const ctx={window:{FinCore:F},document:{activeElement:null},localStorage:{getItem:()=>null,setItem:()=>{}},location:{search:''},URLSearchParams,AI_LABEL:K.AI_LABEL,VAT_LABEL:K.VAT_LABEL,console};
  vm.createContext(ctx);vm.runInContext(src+'\nthis.api={chatLog,chatOn,chatBusy,renderLists};',ctx);return ctx.api;
}
const row=(id,extra={})=>({id,kind:'out',date:'2026-11-02',amount:12000,method:'현대카드',vendor:'시험가게',category:'',status:'needs-category',...extra});

test('보낸 말: meta/aiChat/msgs/<id> 한 줄 · 카드번호 지움 · 상태 new',async()=>{
  const mem={entries:{},meta:{}};global.window={__MMT_TEST_FIN__:mem};
  try{
    const {openFinStore}=await hub,store=openFinStore();await store.load();
    const id=await store.chatSend('카드 1234-5678-9012-3456 으로 산 건 포장 상자야');
    const m=mem.meta.aiChat.msgs[id];
    assert.match(id,/^[A-Za-z0-9_-]{1,60}$/);
    assert.equal(m.by,'owner');assert.equal(m.state,'new');
    assert.ok(!/1234/.test(m.text)&&m.text.includes('[번호 제외]'));
    await assert.rejects(()=>store.chatSend('   '),/한 줄/);
    const chat=await store.chatRefresh();assert.ok(chat.msgs[id]);
  }finally{delete global.window;}
});

test('채팅이 꺼져 있으면 아무것도 안 보이고 줄마다 물어보기는 그대로',async()=>{
  const A=await form(),book={entries:{a:row('a')},sales:{},meta:{}};
  assert.equal(A.chatLog(book),'');assert.equal(A.chatOn(book),false);
  const root={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],dataset:{}};
  A.renderLists({book,recentRoot:root});
  assert.ok(root.innerHTML.includes('AI에게 물어보기'));
});

test('채팅이 켜지면: 대화 줄 · 바꾼 줄(되돌리기) · 안 바꾼 이유 · 줄마다 물어보기 숨김',async()=>{
  const A=await form();
  const a=row('a',{category:'소모품',status:'ok',vatTreatment:'review',ai:{status:'applied',source:'chat',chatId:'m1'}}),b=row('b',{amount:5000});
  const msgs={m1:{id:'m1',by:'owner',at:'2026-11-03T04:00:00Z',text:'다이소 12,000원 포장 상자야',state:'done'},
    ai_m1:{id:'ai_m1',by:'ai',at:'2026-11-03T04:00:30Z',text:'포장 상자로 넣었어요.',changes:[{id:'a',category:'소모품',action:'applied'},{id:'b',category:'배송비',action:'skipped',why:'unsure'}]}};
  const book={entries:{a,b},sales:{},meta:{aiChat:{on:true,msgs}}};
  const html=A.chatLog(book);
  assert.ok(html.indexOf('다이소 12,000원')<html.indexOf('포장 상자로 넣었어요'));
  assert.ok(html.includes('data-ai-undo="a"')&&html.includes('<b>소모품</b>'));
  assert.ok(html.includes('확실하지 않아 그대로 뒀어요')&&!html.includes('data-ai-undo="b"'));
  assert.ok(!html.includes('AI가 보는 중'));
  const busy={...book,meta:{aiChat:{on:true,msgs:{...msgs,m2:{id:'m2',by:'owner',at:'2026-11-03T04:01:00Z',text:'x',state:'new'}}}}};
  assert.ok(A.chatBusy(busy)&&A.chatLog(busy).includes('AI가 보는 중'));
  const root={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],dataset:{}};
  A.renderLists({book:{...book,entries:{b}},recentRoot:root,chatBox:true});
  assert.ok(root.innerHTML.includes('시험가게')&&!root.innerHTML.includes('AI에게 물어보기'));
  const phone={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],dataset:{}};
  A.renderLists({book:{...book,entries:{b}},recentRoot:phone});   // 폰 빠른 장부(채팅창 없음)는 줄마다 물어보기 그대로
  assert.ok(phone.innerHTML.includes('AI에게 물어보기'));
  // 이미 다른 분류로 바뀐 줄에는 되돌리기를 안 보임
  assert.ok(!A.chatLog({...book,entries:{a:{...a,category:'매입'},b}}).includes('data-ai-undo="a"'));
});

test('확인 필요: 채팅으로 분류한 줄은 다시 묻지 않음 · AI가 혼자 분류한 줄은 그대로 물음',()=>{
  const base={id:'x',kind:'out',date:'2026-11-02',amount:1000,method:'현대카드',category:'소모품',status:'ok',vatTreatment:'review'};
  assert.ok(!F.checkReasons({...base,ai:{status:'applied',source:'chat'}}).includes('AI 확인'));
  assert.ok(F.checkReasons({...base,ai:{status:'applied'}}).includes('AI 확인'));
  assert.ok(F.checkReasons({...base,ai:{status:'review',source:'chat'}}).includes('AI 확인'));
});

test('바로 답하기: 주소가 있으면 보낸 줄 id + 로그인 토큰을 웹앱으로 한 번 · 주소가 이상하면 안 보냄',async()=>{
  const EP='https://script.google.com/macros/s/TEST_id-1/exec';
  const src=hubSrc.replace("const dbUrl=async p=>'https://isolated.test/'+p;","const dbUrl=async p=>'https://isolated.test/'+p+'.json?auth=test.token-123';");
  const {openFinStore}=await import(url(src+'\n//ping'));
  const oldFetch=global.fetch,posts=[];let ep=EP;
  global.fetch=async(u,o={})=>{
    if(o.method==='POST'){posts.push({u,body:String(o.body)});return {json:async()=>({ok:true,code:'DONE'})};}
    return {ok:true,status:200,headers:{get:()=>'"e1"'},json:async()=>({entries:{},meta:{aiChat:{on:true,endpoint:ep,msgs:{}}}})};
  };
  try{
    const store=openFinStore();await store.load();
    assert.deepEqual(await store.chatPing('m1'),{ok:true,code:'DONE'});
    assert.equal(posts.length,1);assert.equal(posts[0].u,EP);
    const q=new URLSearchParams(posts[0].body);assert.equal(q.get('type'),'ledgerChat');assert.equal(q.get('id'),'m1');assert.equal(q.get('token'),'test.token-123');
    assert.equal(await store.chatPing('../x'),null);
    ep='https://evil.example/exec';await store.load();assert.equal(await store.chatPing('m2'),null);assert.equal(posts.length,1);
  }finally{global.fetch=oldFetch;}
});
