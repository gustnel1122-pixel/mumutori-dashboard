// Synthetic notifications only; never connect to the production ledger.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../src/fin-core.js'),NOW=new Date('2026-10-28T03:10:00Z');
const bank=(src,direction,over={})=>({id:(src==='kakaobank'?'kb_':'tb_')+NOW.getTime(),src,ts:NOW.getTime(),rawInbox:true,
 text:src==='kakaobank'?`${direction} 5,321원 / 개인사업자통장(1111) → 가상상대 잔액 999,999원`:`5,321원 ${direction} / 가상상대 → 내 토스뱅크 개인사업자 통장`,...over});
test('autopay without date, instalment or app name uses received time; preserves no names/card/balance',()=>{
 const e=F.draftFromAlert({id:'hd_fixture',rawInbox:true,ts:NOW.getTime(),text:'자동납부 승인 가*상님 LG유플러스통신요 -**11-1111 12,345원'},[],NOW);
 assert.deepEqual([e.amount,e.date,e.time,e.vendor,e.method,e.suggestedCategory],[12345,'2026-10-28','12:10','LG유플러스 통신요금','현대카드','통신비']);
 assert.equal(e.status,F.NEEDS);assert(F.OUT_CATEGORIES.includes('통신비'));F.validateEntry(e);
 const stored=JSON.stringify(e);for(const s of ['가*상','1111','자동납부 승인','text','big'])assert(!stored.includes(s));
});
test('bank requires explicit business marker and reads the transaction, never balance or counterparty',()=>{
 for(const src of ['kakaobank','tossbank'])for(const dir of ['입금','출금']){
  const e=F.draftFromAlert(bank(src,dir),[],NOW);assert.equal(e.amount,5321);assert.equal(e.kind,dir==='입금'?'in':'out');
  assert.equal(F.accountOf(e),src==='kakaobank'?'카카오뱅크(사업자 통장)':'토스뱅크(정산 통장)');F.validateEntry(e);
  const s=JSON.stringify(e);assert(!s.includes('가상상대'));assert(!s.includes('999,999'));assert(!s.includes('1111'));
  assert.equal(F.draftFromAlert(bank(src,dir,{text:dir+' 5,321원 개인통장 잔액 999,999원'}),[],NOW),null);
 }
});
test('only mutual unique opposite bank entries within two minutes pair; moves do not become sales or costs',()=>{
 const a=F.draftFromAlert(bank('kakaobank','출금'),[],NOW),b=F.draftFromAlert(bank('tossbank','입금',{ts:NOW.getTime()+1000}),[],NOW);
 const pairs=F.bankTransferPairs({[a.id]:a,[b.id]:b},NOW);assert.equal(pairs.length,1);
 const book={entries:Object.fromEntries(pairs[0].rows.map(e=>[e.id,e]))};for(const e of pairs[0].rows){assert.equal(e.kind,'move');assert.equal(e.category,'내 계좌 이동');F.validateEntry(e);}
 const sums=F.summarize(book,'month',NOW);assert.equal(sums.sales,0);assert.equal(sums.spend,0);assert.equal(sums.cashFlow,0);
 assert.equal(F.bankTransferPairs({a,b:{...b,alertAt:a.alertAt+120001}},NOW).length,0);
 assert.equal(F.bankTransferPairs({a,b,c:{...a,id:'extra'}},NOW).length,0);
 assert.equal(F.bankTransferPairs({a:{...a,updatedAt:NOW.toISOString()},b},NOW).length,0);
 assert.equal(F.bankTransferPairs({a,b:{...b,amount:1}},NOW).length,0);
 assert.equal(F.sameMoment(a,{...a,id:'other-copy'}),true);assert.equal(F.sameMoment(a,{...a,alertAt:a.alertAt+1}),false);
});
const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64');
function moduleSource(db){return fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,db).replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));}
const loadModule=s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
test('real inbox import deduplicates original notification and persists an internal pair without sensitive text',async()=>{
 const rawA=bank('kakaobank','출금'),rawB=bank('tossbank','입금',{ts:NOW.getTime()+1000});
 const data={entries:{},meta:{},sales:{},__inbox:{},__rawInbox:{private:{a:rawA,aCopy:rawA,b:rawB,personal:bank('kakaobank','출금',{text:'출금 5,321원 개인통장'})}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};const {openFinStore}=await loadModule(moduleSource("const dbUrl=()=>{throw Error('Network forbidden')};"));const store=openFinStore();
 try{await store.load();assert.equal(await store.processInbox(),2);assert.equal(await store.processInbox(),0);assert.equal(Object.keys(data.entries).length,2);assert(data.inboxSeen.aCopy.dup);assert(data.inboxSeen.personal.skipped);
  for(const e of Object.values(data.entries))assert.equal(e.kind,'move');assert(!JSON.stringify(data.entries).includes('가상상대'));
 }finally{store.close();delete global.window;}
});
test('atomic transfer reconciliation retries ETag conflict and preserves concurrent unrelated entries',async()=>{
 const a=F.draftFromAlert(bank('kakaobank','출금'),[],NOW),b=F.draftFromAlert(bank('tossbank','입금'),[],NOW);let saved={[a.id]:a,[b.id]:b},puts=0;
 global.window={FinCore:F};const oldFetch=global.fetch;
 global.fetch=async(url,opts={})=>{assert(String(url).startsWith('https://test.invalid/'));if((opts.method||'GET')==='GET')return new Response(JSON.stringify(saved),{headers:{ETag:'"'+puts+'"'}});
  assert.equal(opts.method,'PUT');puts++;if(puts===1){saved.concurrent={id:'concurrent',memo:'preserve collaborator edit'};return new Response('',{status:412});}
  const next=JSON.parse(opts.body);assert.equal(next.concurrent.memo,'preserve collaborator edit');saved=next;return new Response(JSON.stringify(saved));};
 const {openFinStore}=await loadModule(moduleSource("const dbUrl=async p=>'https://test.invalid/'+p;"));const store=openFinStore();
 try{assert.equal(await store.reconcileBankTransfers(),1);assert.equal(puts,2);assert.equal(saved.concurrent.memo,'preserve collaborator edit');assert.equal(saved[a.id].kind,'move');assert.equal(saved[b.id].kind,'move');}
 finally{store.close();global.fetch=oldFetch;delete global.window;}
});

test('REVIEW preserves privacy and never becomes income or expense, including man-won and ambiguous transfer',async()=>{
 const id='kb_1760000000000',base={id,src:'kakaobank',ts:NOW.getTime(),review:true};
 for(const [text,amount,direction] of [['개인사업자 100만원 받았어요\n잔액 8,888,888원',1000000,'in'],['개인사업자 100만 원 보냈어요',1000000,'out'],['개인사업자 이체 5,321원',5321,null],['개인사업자 잔액 8,888원',null,null],['개인사업자 입금 50원 출금 60원',null,null]]){
  const r=F.bankReview({...base,text:'가상상대 1111 '+text},NOW);assert.equal(r.amount,amount);assert.equal(r.direction,direction);const j=JSON.stringify(r);for(const secret of ['가상상대','1111','8,888','text','개인사업자'])assert(!j.includes(secret));
 }
 assert.equal(F.bankReview({...base,text:'개인 통장 입금 50원'},NOW),null);
 const raw={...base,text:'개인사업자 받았어요 100만원 잔액 9,999원'},data={entries:{},meta:{},sales:{},__inbox:{},__rawInbox:{private:{[id]:raw}}};
 global.window={FinCore:F,__MMT_TEST_FIN__:data};const {openFinStore}=await loadModule(moduleSource("const dbUrl=()=>{throw Error('Network forbidden')};"));const store=openFinStore();
 try{await store.load();assert.equal(await store.processInbox(),1);assert.equal(await store.processInbox(),0);assert.equal(Object.keys(data.entries).length,0);assert.equal(data.bankReviews[id].amount,1000000);assert.equal(data.bankReviews[id].status,'REVIEW');assert.equal(F.summarize(data,'month',NOW).sales,0);assert.equal(F.summarize(data,'month',NOW).spend,0);assert(!JSON.stringify(data.bankReviews).includes('9,999'));}
 finally{store.close();delete global.window;}
});
