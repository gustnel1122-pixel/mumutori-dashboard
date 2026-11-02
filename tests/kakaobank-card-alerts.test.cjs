// 카카오뱅크 사업자 체크카드 결제 알림 — 가짜 값만 쓴다(카드 끝자리 · 금액 · 잔액 모두 가짜). 운영 장부에 연결하지 않는다.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../src/fin-core.js'),NOW=new Date('2026-11-02T03:10:00Z'),TS=NOW.getTime();
const card=(text,over={})=>({id:'kb_'+(over.ts??TS),src:'kakaobank',ts:TS,rawInbox:true,card:true,text,...over});
const PAY='카드 결제 12,300원\n체크카드(1234) | 가짜마트(가짜페이)\n잔액 50,000원';
const CANCEL='결제 취소 12,300원\n체크카드(1234) | 가짜마트(가짜페이)\n잔액 62,300원';
const secretsGone=e=>{const s=JSON.stringify(e);for(const x of ['1234','50,000','50000','62,300','62300','잔액','체크카드','text','big','card'])assert(!s.includes(x),'row must not keep '+x);};

test('check-card payment becomes a 카뱅체크 expense row from the received time; no bank fields',()=>{
 const e=F.draftFromAlert(card(PAY),[],NOW);
 assert.deepEqual([e.id,e.kind,e.amount,e.date,e.time,e.method,e.vendor,e.category,e.status,e.evidence,e.source,e.inboxId,e.memo],
  ['al_kb_'+TS,'out',12300,'2026-11-02','12:10','카뱅체크','가짜마트(가짜페이)','',F.NEEDS,'카드','alert','kb_'+TS,'']);
 assert.equal(F.accountOf(e),'카카오뱅크 체크카드');F.validateEntry(e);
 for(const k of ['bankSource','bankDirection','alertAt','card','text','big'])assert(!(k in e),k);
 secretsGone(e);
 assert.equal(F.bankOriginal(e),false);
});
test('rules classify the merchant, but never 사장님 인출 automatically',()=>{
 assert.equal(F.draftFromAlert(card(PAY),[{match:'가짜마트',category:'매입'}],NOW).category,'매입');
 assert.equal(F.draftFromAlert(card(PAY),[{match:'가짜마트',category:'매입'}],NOW).status,'ok');
 assert.equal(F.draftFromAlert(card(PAY),[{match:'가짜마트',category:F.OWNER_OUT}],NOW).category,'');
});
test('cancel becomes money in with the cancel memo and no automatic category',()=>{
 for(const text of [CANCEL,'카드 결제 취소 12,300원\n체크카드(1234) | 가짜마트(가짜페이)\n잔액 62,300원']){
  const e=F.draftFromAlert(card(text),[{match:'가짜마트',category:'매입'}],NOW);
  assert.deepEqual([e.kind,e.amount,e.method,e.category,e.vendor],['in',12300,'카뱅체크','','가짜마트(가짜페이)']);
  assert.match(e.memo,/결제 취소 알림/);F.validateEntry(e);secretsGone(e);
 }
});
test('single-line text, missing merchant and the flagless raw item are handled; nothing leaks',()=>{
 const one=F.draftFromAlert(card('카드 결제 12,300원 체크카드(1234) | 가짜마트 잔액 50,000원',{card:undefined}),[],NOW);
 assert.deepEqual([one.amount,one.vendor,one.kind],[12300,'가짜마트','out']);secretsGone(one);
 const bare=F.draftFromAlert(card('카드 결제 1,000원\n체크카드(1234)\n잔액 50,000원'),[],NOW);
 assert.deepEqual([bare.amount,bare.vendor],[1000,'']);assert.match(bare.memo,/가맹점 확인 필요/);secretsGone(bare);
});
test('KakaoBank texts that are not card payments still produce nothing',()=>{
 for(const text of ['출금 5,321원 개인통장 잔액 50,000원','체크카드(1234) 잔액 50,000원','카드 결제 체크카드(1234) | 가짜마트 잔액 50,000원','카드 결제 12,300원 | 가짜마트 잔액 50,000원'])
  assert.equal(F.draftFromAlert(card(text),[],NOW),null,text);
 assert.equal(F.draftFromAlert({...card(PAY),src:'tossbank',id:'tb_'+TS},[],NOW),null);   // 토스뱅크는 그대로(개인사업자 필요)
});
test('개인사업자 bank alerts keep the bank path exactly (even if they mention a card)',()=>{
 const raw={id:'kb_'+TS,src:'kakaobank',ts:TS,rawInbox:true,text:'출금 5,321원 / 개인사업자통장(1111) → 가상상대 잔액 999,999원'};
 const e=F.draftFromAlert(raw,[],NOW);
 assert.deepEqual([e.id,e.kind,e.amount,e.method,e.bankSource,e.bankDirection,e.alertAt,e.memo,e.evidence],['al_kb_'+TS,'out',5321,'카뱅이체','kakaobank','출금',TS,'개인사업자 통장 알림','없음']);
 assert.equal(F.bankOriginal(e),true);
 const mixed=F.draftFromAlert({...raw,text:'개인사업자 체크카드(1234) 결제 출금 5,321원 잔액 999,999원'},[],NOW);
 assert.equal(mixed.method,'카뱅이체');assert.equal(mixed.bankSource,'kakaobank');
 assert.equal(F.draftFromAlert({...raw,text:'개인사업자 체크카드(1234) 결제 5,321원 잔액 999,999원'},[],NOW),null);   // 은행 규칙 그대로: 입금/출금 없으면 없음
});
test('현대카드 alerts are unchanged',()=>{
 const NOW2=new Date('2026-10-19T15:00:00Z');
 const text='현대카드 홍길동 님, 현대 MY BUSINESS 승인 12,300원 일시불, 10/19 23:58';
 const big='홍길동 님, 현대 MY BUSINESS 승인\n12,300원 일시불, 10/19 23:58\n가짜편의점가짜점\n누적111,111원';
 const a=F.draftFromAlert({id:'-H1',src:'현대카드',ts:Date.parse('2026-10-19T14:58:30Z'),text,big},[],NOW2);
 assert.deepEqual([a.date,a.time,a.amount,a.method,a.vendor,a.status,a.evidence,a.source,a.kind],['2026-10-19','23:58',12300,'현대카드','가짜편의점가짜점',F.NEEDS,'카드','alert','out']);
 const c=F.draftFromAlert({id:'-Nx3',text:'[현대카드] 10/18 09:00 12,300원 취소 가짜배송센터'},[{match:'가짜배송',category:'배송비'}],NOW);
 assert.deepEqual([c.kind,c.category,c.method],['in','','현대카드']);
 const k=F.draftFromAlert({id:'-K1',src:'카카오뱅크',text:'[카카오뱅크] 체크카드 승인 4,500원 가짜편의점'},[],NOW);assert.equal(k.method,'카뱅체크');   // src가 kakaobank가 아닌 옛 글은 일반 판정
});
test('a card row never pairs with a bank transfer and never merges with a bank row',()=>{
 const c=F.draftFromAlert(card(PAY),[],NOW);
 const t=F.draftFromAlert({id:'tb_'+(TS+1000),src:'tossbank',ts:TS+1000,text:'12,300원 입금 / 가상상대 → 내 토스뱅크 개인사업자 통장'},[],NOW);
 assert.equal(t.bankSource,'tossbank');assert.equal(F.bankTransferPairs({[c.id]:c,[t.id]:t},NOW).length,0);
 const b=F.draftFromAlert({id:'kb_'+TS,src:'kakaobank',ts:TS,text:'출금 12,300원 개인사업자 잔액 50,000원'},[],NOW);
 assert.equal(F.sameMoment(c,b),false);assert.equal(F.sameMoment(c,{...c,id:'copy'}),true);
});

const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64');
const moduleSource=db=>fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,db).replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));
const loadModule=s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
test('real inbox import: card alert is a normal draft (not a bank REVIEW), keeps no digits/balance, is not paired',async()=>{
 const c=card(PAY),t={src:'tossbank',ts:TS+1000,text:'12,300원 입금 / 가상상대 → 내 토스뱅크 개인사업자 통장'},other=card('카드 결제 4,500원\n체크카드(1234) | 가짜카페\n잔액 45,500원',{ts:TS+5000});
 const data={entries:{},meta:{},sales:{},__inbox:{},__rawInbox:{private:{[c.id]:c,['tb_'+(TS+1000)]:t,[other.id]:other}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};const {openFinStore}=await loadModule(moduleSource("const dbUrl=()=>{throw Error('Network forbidden')};"));const store=openFinStore();
 try{
  await store.load();assert.equal(await store.processInbox(),3);assert.equal(await store.processInbox(),0);
  const row=data.entries['al_'+c.id];assert.equal(row.method,'카뱅체크');assert.equal(row.kind,'out');assert.equal(row.amount,12300);
  assert.equal(data.entries['al_'+other.id].amount,4500);
  assert.equal(Object.keys(data.bankReviews||{}).length,0);assert.equal(Object.keys(data.alertReviews||{}).length,0);
  assert(Object.values(data.entries).every(e=>e.kind!=='move'));assert.equal(Object.keys(data.transferReviews||{}).length,0);
  const stored=JSON.stringify({entries:data.entries,inboxSeen:data.inboxSeen});for(const x of ['1234','50,000','45,500','잔액','체크카드'])assert(!stored.includes(x),x);
 }finally{store.close();delete global.window;}
});
test('the same payment also arriving as a 개인사업자 출금 alert is held for review, not counted twice',async()=>{
 const c=card(PAY),b={src:'kakaobank',ts:TS+1000,text:'출금 12,300원 / 개인사업자통장(1111) → 가상상대 잔액 50,000원'};
 const data={entries:{},meta:{},sales:{},__inbox:{},__rawInbox:{private:{[c.id]:c,['kb_'+(TS+1000)]:b}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};const {openFinStore}=await loadModule(moduleSource("const dbUrl=()=>{throw Error('Network forbidden')};"));const store=openFinStore();
 try{
  await store.load();assert.equal(await store.processInbox(),1);
  assert.equal(Object.keys(data.entries).length,1);assert.equal(data.alertReviews['kb_'+(TS+1000)].reason,'POSSIBLE_DUPLICATE');
 }finally{store.close();delete global.window;}
});
