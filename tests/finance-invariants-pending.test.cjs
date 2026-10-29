// Safety specifications: synthetic in-memory Firebase only, never real financial data.
// This suite is deliberately expected to fail until the storage path enforces the invariants.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../src/fin-core.js');
const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64');
function source(actor){return fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8')
 .replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,`const dbUrl=async p=>'https://test.invalid/${actor}/'+p;`)
 .replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));}
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const ts=Date.parse('2026-10-29T03:00:00Z'),id='kb_'+ts;
const raw={src:'kakaobank',ts,text:'출금 1,234원 개인사업자'};
function fixture(){return {hub:{financeV1:{entries:{},sales:{},meta:{},bankReviews:{},inboxSeen:{}},financeInbox:{}},financeRawInbox:{fixture:{[id]:raw}}};}
function server(initial,{barrierRoot=false,loseFirstWrite=false,firebaseNormalize=false}={}){
 const state=clone(initial),writes=[];let revision=0,rootReads=0,release;
 function normalize(v){if(v==null)return undefined;if(typeof v!=='object')return v;const o={};for(const k of Object.keys(v).sort().reverse()){const n=normalize(v[k]);if(n!==undefined)o[k]=n;}return Object.keys(o).length?o:undefined;}
 const wait=new Promise(resolve=>{release=resolve;});
 const read=path=>path.reduce((v,k)=>v?.[k],state);
 const assign=(path,value)=>{let node=state;for(const k of path.slice(0,-1))node=node[k]||(node[k]={});node[path.at(-1)]=value;};
 async function fetch(url,opts={}){
  const u=new URL(url);assert.equal(u.hostname,'test.invalid');const path=u.pathname.split('/').filter(Boolean).slice(1);
  const method=opts.method||'GET',tag='"'+revision+'"';
  if(method==='GET'){
   const snapshot=clone(read(path)??null);
   if(barrierRoot&&path.join('/')==='hub/financeV1'&&++rootReads<=2){if(rootReads===2)release();await wait;}
   return new Response(JSON.stringify(snapshot),{headers:{ETag:tag}});
  }
  assert(['PUT','PATCH'].includes(method));const match=opts.headers?.['if-match']||opts.headers?.['If-Match'];
  writes.push({path:path.join('/'),method,conditional:!!match});
  if(match&&match!==tag)return new Response('',{status:412});
  let body=JSON.parse(opts.body);if(method==='PATCH')body={...(read(path)||{}),...body};if(firebaseNormalize)body=normalize(body)||null;assign(path,body);revision++;
  if(loseFirstWrite){loseFirstWrite=false;throw Error('synthetic lost response');}
  return new Response(JSON.stringify(body));
 }
 return {state,writes,fetch};
}
async function withStores(s,fn){
 const oldFetch=global.fetch,oldWindow=global.window;global.fetch=s.fetch;global.window={FinCore:F};
 const make=async actor=>(await import('data:text/javascript;base64,'+Buffer.from(source(actor)).toString('base64'))).openFinStore();
 const a=await make('owner'),b=await make('partner');
 try{return await fn(a,b);}finally{a.close();b.close();global.fetch=oldFetch;global.window=oldWindow;}
}
test('reprocessing the same event never overwrites a void or human-edited ledger row',async()=>{
 for(const status of ['void','needs-category']){
  const data=fixture(),key='al_'+id;
  const old={id:key,kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체',status,memo:'synthetic human edit'};
  data.hub.financeV1.entries[key]=old;const s=server(data);
  await withStores(s,async a=>{await a.load();await a.processInbox();});
  assert.deepEqual(s.state.hub.financeV1.entries[key],old);
 }
});
test('two independent collectors use conditional atomic storage, not unconditional ledger overwrites',async()=>{
 const s=server(fixture(),{barrierRoot:true});
 await withStores(s,async(a,b)=>{await Promise.all([a.load(),b.load()]);await Promise.all([a.processInbox(),b.processInbox()]);});
 assert.equal(Object.keys(s.state.hub.financeV1.entries).length,1);
 const ledgerWrites=s.writes.filter(w=>w.path==='hub/financeV1'||w.path==='hub/financeV1/entries'||w.path.startsWith('hub/financeV1/entries/'));
 assert(ledgerWrites.length>=2);assert(ledgerWrites.every(w=>w.conditional),'ledger writes must use compare-and-set');
});
test('different source IDs with similar fields are not silently discarded as the same transaction',async()=>{
 const data=fixture(),id2='hd_beta',card={ts,text:'현대 사업구매전용 승인 1,234원 일시불, 10/29 12:00 가상상점'};
 data.financeRawInbox.fixture={hd_alpha:card,[id2]:card};const s=server(data);
 await withStores(s,async a=>{await a.load();await a.processInbox();});
 const fin=s.state.hub.financeV1,seen=fin.inboxSeen?.[id2];
 assert.notEqual(seen?.dup,true,'unproven matching fields must remain a review candidate');
 assert(seen?.pending===true||fin.bankReviews?.[id2]?.status==='REVIEW'||fin.inboxReview?.[id2], 'ambiguous alert must stay available for review');
});
test('two devices receiving similar different alerts atomically keep one and hold the other',async()=>{
 const data=fixture(),card={ts,text:'현대 사업구매전용 승인 1,234원 일시불, 10/29 12:00 가상상점'};
 data.financeRawInbox.fixture={hd_alpha:card,hd_beta:card};const s=server(data,{barrierRoot:true});
 await withStores(s,async(a,b)=>{await Promise.all([a.load(),b.load()]);await Promise.all([a.processInbox(),b.processInbox()]);});
 const fin=s.state.hub.financeV1;assert.equal(Object.keys(fin.entries).length,1);assert.equal(Object.values(fin.alertReviews||{}).filter(r=>r.status==='REVIEW').length,1);
});
test('a bank alert similar to an existing manual account transfer stays pending',async()=>{
 const data=fixture();data.hub.financeV1.entries.manual={id:'manual',kind:'move',amount:1234,date:'2026-10-29',from:'카카오뱅크(사업자 통장)',to:'토스뱅크(정산 통장)'};
 const s=server(data);await withStores(s,async a=>{await a.load();await a.processInbox();});
 assert.equal(Object.keys(s.state.hub.financeV1.entries).length,1);assert.equal(s.state.hub.financeV1.alertReviews[id].status,'REVIEW');
});
test('an unknown legacy direction remains a candidate but cannot be linked automatically or manually',async()=>{
 const data=fixture();data.hub.financeV1.entries.legacy={id:'legacy',kind:'unknown',amount:1234,date:'2026-10-29',method:'카뱅이체'};
 const s=server(data);await withStores(s,async a=>{await a.load();await a.processInbox();const listed=await a.listAlertReviewCandidates(id);
  assert.equal(listed.candidates.length,1);assert.equal(listed.candidates[0].kind,'');
  await assert.rejects(a.resolveAlertReview(id,{action:'same',candidateId:'legacy'}));
 });
 assert.equal(s.state.hub.financeV1.alertReviews[id].status,'REVIEW');assert.equal(Object.keys(s.state.hub.financeV1.entries).length,1);
});
test('an incomplete or invalid existing transfer cannot be linked as the same transaction',async()=>{
 const from='카카오뱅크(사업자 통장)';
 for(const to of ['',from,'unknown']){
  const data=fixture();data.hub.financeV1.entries.legacy={id:'legacy',kind:'move',amount:1234,date:'2026-10-29',from,to};
  const s=server(data);await withStores(s,async a=>{await a.load();await a.processInbox();const listed=await a.listAlertReviewCandidates(id);
   assert.equal(listed.candidates.length,1);await assert.rejects(a.resolveAlertReview(id,{action:'same',candidateId:'legacy'}));
  });
  assert.equal(s.state.hub.financeV1.alertReviews[id].status,'REVIEW');
 }
});
test('reused alert ID with different safe fields is held without replacing the original',async()=>{
 const s=server(fixture());await withStores(s,async a=>{
  await a.load();await a.processInbox();const old=clone(s.state.hub.financeV1.entries['al_'+id]);
  s.state.financeRawInbox.fixture[id]={...raw,text:'출금 4,321원 개인사업자'};
  await a.processInbox();assert.deepEqual(s.state.hub.financeV1.entries['al_'+id],old);
  assert.equal(s.state.hub.financeV1.alertReviews[id].reason,'ID_CONFLICT');
  await a.listAlertReviewCandidates(id);await a.resolveAlertReview(id,{action:'add'});assert.deepEqual(s.state.hub.financeV1.entries['al_'+id],old);
  assert.equal(s.state.hub.financeV1.inboxSeen[id].originalEntryId,'al_'+id);
 });
});
test('same card alert ID with a different merchant is held without saving merchant text in its identity',async()=>{
 const data=fixture(),card={ts,text:'현대 사업구매전용 승인 1,234원 일시불, 10/29 12:00 가상상점A'};data.financeRawInbox.fixture={hd_one:card};
 const s=server(data);await withStores(s,async a=>{
  await a.load();await a.processInbox();const original=clone(s.state.hub.financeV1.entries.al_hd_one);
  const marker=s.state.hub.financeV1.inboxSeen.hd_one.event;assert(!JSON.stringify(marker).includes('가상상점A'));assert(!JSON.stringify(marker).includes('사업구매전용'));
  await a.processInbox();assert(!s.state.hub.financeV1.alertReviews?.hd_one);
  s.state.financeRawInbox.fixture.hd_one={...card,text:card.text.replace('가상상점A','가상상점B')};await a.processInbox();
  assert.equal(s.state.hub.financeV1.alertReviews.hd_one.reason,'ID_CONFLICT');assert.deepEqual(s.state.hub.financeV1.entries.al_hd_one,original);
  assert(!JSON.stringify(s.state.hub.financeV1.alertReviews.hd_one).includes('가상상점B'));
 });
});
test('CSV reorder cannot turn a different transaction into an existing import ID',()=>{
 const head='날짜,구분,분류,거래처,내용,금액(원),결제수단,증빙\n';
 const x='2026-10-29,출금,기타,가상상점A,물품,1,카뱅이체,없음',y='2026-10-29,출금,기타,가상상점B,물품,2,카뱅이체,없음';
 const first=F.fromLedgerCSV(head+x+'\n'+y,new Date(ts)),reordered=F.fromLedgerCSV(head+y+'\n'+x,new Date(ts));
 const firstById=new Map(first.map(e=>[e.id,e]));
 for(const e of reordered){const old=firstById.get(e.id);if(old)assert.deepEqual([e.vendor,e.amount],[old.vendor,old.amount],'same ID must not refer to another row after reorder');}
});
test('identical rows inside one CSV remain separate',()=>{
 const csv='날짜,구분,분류,거래처,내용,금액(원),결제수단,증빙\n2026-10-29,출금,기타,가상상점,물품,1,카뱅이체,없음\n2026-10-29,출금,기타,가상상점,물품,1,카뱅이체,없음';
 const rows=F.fromLedgerCSV(csv,new Date(ts));assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
});
test('a repeated identical CSV row with no stable source identity requires review instead of automatic overwrite',async()=>{
 const csv='날짜,구분,분류,거래처,내용,금액(원),결제수단,증빙\n2026-10-29,출금,기타,가상상점,물품,1,카뱅이체,없음';
 const existing=F.fromLedgerCSV(csv,new Date(ts))[0],next=F.fromLedgerCSV(csv,new Date(ts))[0];
 const data=fixture();data.hub.financeV1.entries[existing.id]=existing;const s=server(data);
 await withStores(s,async a=>{
  await a.load();let held=false;
  try{const r=await a.add(next);held=r?.status==='REVIEW'||r?.pending===true;}catch(e){held=e?.code==='IMPORT_REVIEW';}
  assert(held,'the app must hold an indistinguishable imported row for human review');
 });
 assert.deepEqual(s.state.hub.financeV1.entries[existing.id],existing);
});
test('human can resolve an alert against a fresh candidate without changing that row',async()=>{
 const data=fixture(),old={id:'manual',kind:'out',amount:1234,date:'2026-10-29',time:'12:00',method:'카뱅이체',status:'needs-category',vendor:'PRIVATE_NAME',memo:'PRIVATE_MEMO'};
 data.hub.financeV1.entries.manual=old;const s=server(data,{loseFirstWrite:true});
 await withStores(s,async(a,b)=>{
  await a.load();await a.processInbox();
  const {review,candidates:choices}=await b.listAlertReviewCandidates(id);assert.equal(review.amount,1234);assert.equal(choices.length,1);assert.equal(choices[0].id,'manual');
  assert(!JSON.stringify(choices).includes('PRIVATE_'));
  assert.equal((await b.resolveAlertReview(id,{action:'same',candidateId:'manual'})).status,'RESOLVED');
  assert.equal((await b.resolveAlertReview(id,{action:'same',candidateId:'manual'})).status,'RESOLVED');
  await assert.rejects(b.resolveAlertReview(id,{action:'add'}));
 });
 assert.deepEqual(s.state.hub.financeV1.entries.manual,old);assert.equal(Object.keys(s.state.hub.financeV1.entries).length,1);
 assert(!JSON.stringify(s.state.hub.financeV1.alertReviews).includes('PRIVATE_'));
});
test('cancelled candidate cannot be linked; explicit add makes one sanitized row',async()=>{
 const data=fixture(),old={id:'manual',kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체',status:'void',vendor:'PRIVATE_NAME'};
 data.hub.financeV1.entries.manual=old;const s=server(data);
 await withStores(s,async(a,b)=>{
  await a.load();await a.processInbox();await Promise.all([a.listAlertReviewCandidates(id),b.listAlertReviewCandidates(id)]);await assert.rejects(b.resolveAlertReview(id,{action:'same',candidateId:'manual'}));
  const [x,y]=await Promise.all([a.resolveAlertReview(id,{action:'add'}),b.resolveAlertReview(id,{action:'add'})]);assert.deepEqual(x,y);
 });
 assert.deepEqual(s.state.hub.financeV1.entries.manual,old);const all=s.state.hub.financeV1.entries;assert.equal(Object.keys(all).length,2);
 const added=all['al_review_'+id];assert(added);assert(!JSON.stringify(added).includes('PRIVATE_NAME'));assert(!('text' in added));
});
test('conflicting same-vs-add decisions do not both take effect',async()=>{
 const data=fixture();data.hub.financeV1.entries.manual={id:'manual',kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체'};
 const s=server(data);await withStores(s,async(a,b)=>{
  await a.load();await a.processInbox();await Promise.all([a.listAlertReviewCandidates(id),b.listAlertReviewCandidates(id)]);
  const outcomes=await Promise.allSettled([a.resolveAlertReview(id,{action:'same',candidateId:'manual'}),b.resolveAlertReview(id,{action:'add'})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 });
 const fin=s.state.hub.financeV1,action=fin.alertReviews[id].action;
 assert.equal(Object.keys(fin.entries).length,action==='same'?1:2);
});
test('CSV pending row is resolved atomically by explicit confirmation only',async()=>{
 const csv='날짜,구분,분류,거래처,내용,금액(원),결제수단,증빙\n2026-10-29,출금,기타,가상상점,물품,1,카뱅이체,없음';
 const entry=F.fromLedgerCSV(csv,new Date(ts))[0],s=server(fixture());
 await withStores(s,async(a,b)=>{
  assert.equal((await a.add(entry)).status,'REVIEW');assert.equal(Object.keys(s.state.hub.financeV1.entries).length,0);await b.listImportReviewCandidates(entry.id);
  assert.equal((await b.resolveImportReview(entry.id,{action:'add'})).status,'RESOLVED');
  assert.equal((await b.resolveImportReview(entry.id,{action:'add'})).status,'RESOLVED');
 });
 assert.equal(Object.keys(s.state.hub.financeV1.entries).length,1);
 const row=Object.values(s.state.hub.financeV1.entries)[0];assert.equal(row.vendor,entry.vendor);assert.equal(row.memo,entry.memo);assert.equal(row.category,entry.category);
});
test('a changed candidate list requires the person to inspect it again',async()=>{
 const data=fixture();data.hub.financeV1.entries.manual={id:'manual',kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체',memo:'first'};
 const s=server(data);await withStores(s,async(a,b)=>{
  await a.load();await a.processInbox();await a.listAlertReviewCandidates(id);
  await b.patch('manual',{memo:'changed'});
  await assert.rejects(a.resolveAlertReview(id,{action:'same',candidateId:'manual'}));
  await assert.rejects(a.resolveAlertReview(id,{action:'add'}));
  await a.listAlertReviewCandidates(id);assert.equal((await a.resolveAlertReview(id,{action:'same',candidateId:'manual'})).status,'RESOLVED');
 });
});
test('CSV review lacking normalized source blocks resolution and preserves existing records',async()=>{
 const data=fixture(),id='csv_fixture';data.hub.financeV1.importReviews={[id]:{status:'REVIEW',source:'import',kind:'out',amount:1,date:'2026-10-29',method:'카뱅이체'}};
 const s=server(data);await withStores(s,async a=>{
  await assert.rejects(a.resolveImportReview(id,{action:'add'}),e=>e.code==='IMPORT_SOURCE_REQUIRED');
  await assert.rejects(a.resolveImportReview(id,{action:'same',candidateId:'manual'}),e=>e.code==='IMPORT_SOURCE_REQUIRED');
 });
 assert.deepEqual(s.state,data);
});
test('Firebase reordered keys and omitted nulls do not report a successful add or patch as failed',async()=>{
 const data=fixture();data.hub.financeV1.entries.manual={id:'manual',kind:'out',date:'2026-10-29',amount:1,method:'카뱅이체',status:'needs-category',check:'clear me'};
 const s=server(data,{firebaseNormalize:true});await withStores(s,async a=>{
  await a.load();await a.patch('manual',{check:null});assert.equal(s.state.hub.financeV1.entries.manual.check,undefined);
  const e={id:'new_manual',kind:'out',date:'2026-10-29',amount:2,method:'카뱅이체',evidence:'없음',source:'manual',memo:'',check:null};
  await a.add(e);await a.add(e);assert.equal(Object.keys(s.state.hub.financeV1.entries).length,2);
 });
});
test('the review itself must still match the displayed alert summary and import draft',async()=>{
 const data=fixture(),old={id:'manual',kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체'};data.hub.financeV1.entries.manual=old;
 const entry=F.fromLedgerCSV('날짜,구분,분류,거래처,내용,금액(원),결제수단,증빙\n2026-10-29,출금,기타,가상상점,물품,1,카뱅이체,없음',new Date(ts))[0];
 const s=server(data);await withStores(s,async a=>{
  await a.load();await a.processInbox();const before=await a.listAlertReviewCandidates(id);assert.equal(before.review.amount,1234);
  s.state.hub.financeV1.alertReviews[id].amount=4321;
  await assert.rejects(a.resolveAlertReview(id,{action:'add'}));assert.equal(s.state.hub.financeV1.alertReviews[id].status,'REVIEW');
  await a.add(entry);const importBefore=await a.listImportReviewCandidates(entry.id);assert.equal(importBefore.review.amount,1);
  s.state.hub.financeV1.importReviews[entry.id].draft.memo='changed';
  await assert.rejects(a.resolveImportReview(entry.id,{action:'add'}));assert.equal(s.state.hub.financeV1.importReviews[entry.id].status,'REVIEW');
 });
});
test('two visually identical active candidates cannot be linked without further identification',async()=>{
 const data=fixture(),old={kind:'out',amount:1234,date:'2026-10-29',method:'카뱅이체',status:'needs-category'};
 data.hub.financeV1.entries={one:{...old,id:'one'},two:{...old,id:'two'}};const s=server(data);
 await withStores(s,async a=>{await a.load();await a.processInbox();const choices=await a.listAlertReviewCandidates(id);assert.equal(choices.candidates.length,2);
  await assert.rejects(a.resolveAlertReview(id,{action:'same',candidateId:'one'}));
  assert.equal((await a.resolveAlertReview(id,{action:'add'})).status,'RESOLVED');
 });
});
test('PC ai-* normalized draft preserves approved fields and original source after explicit confirmation',async()=>{
 const data=fixture(),key='pc_fixture',draft=F.normEntry({id:key,kind:'out',amount:5,date:'2026-10-29',method:'카뱅이체',category:'배송비',vendor:'synthetic merchant',memo:'synthetic note',origin:'가상 주문번호 / 123',source:'ai-sourcing',evidence:'없음'},new Date(ts));
 data.hub.financeV1.importReviews={[key]:{status:'REVIEW',source:'import',kind:draft.kind,amount:draft.amount,date:draft.date,method:draft.method,reason:'NEEDS_IDENTITY',draft}};
 const s=server(data);await withStores(s,async a=>{const listed=await a.listImportReviewCandidates(key);assert.equal(listed.review.source,'import');assert(!JSON.stringify(listed).includes('synthetic merchant'));await a.resolveImportReview(key,{action:'add'});});
 const e=s.state.hub.financeV1.entries['csv_review_'+key];for(const k of ['source','origin','vendor','memo','category','method','amount','date','createdAt'])assert.equal(e[k],draft[k]);
});
test('long PC IDs use bounded distinct entry keys and never overwrite an existing collision',async()=>{
 const crypto=require('node:crypto');
 for(const n of [89,90,100]){
  const key='p'.repeat(n),draft=F.normEntry({id:key,kind:'out',amount:5,date:'2026-10-29',method:'카뱅이체',origin:'synthetic-origin',source:'ai-sourcing',evidence:'없음'},new Date(ts));
  const data=fixture();data.hub.financeV1.importReviews={[key]:{status:'REVIEW',source:'import',kind:draft.kind,amount:draft.amount,date:draft.date,method:draft.method,reason:'NEEDS_IDENTITY',draft}};
  const expected=n<=89?'csv_review_'+key:'ci_'+crypto.createHash('sha256').update(key).digest('hex');assert(expected.length<=100);
  const s=server(data);await withStores(s,async a=>{await a.listImportReviewCandidates(key);const result=await a.resolveImportReview(key,{action:'add'});assert.equal(result.entryId,expected);});
  assert.equal(s.state.hub.financeV1.entries[expected].source,'ai-sourcing');
  const colliding=fixture(),existing={id:expected,memo:'preserve existing'};colliding.hub.financeV1.entries[expected]=existing;colliding.hub.financeV1.importReviews=data.hub.financeV1.importReviews;
  const blocked=server(colliding);await withStores(blocked,async a=>{await a.listImportReviewCandidates(key);await assert.rejects(a.resolveImportReview(key,{action:'add'}));});
  assert.deepEqual(blocked.state.hub.financeV1.entries[expected],existing);
 }
});
test('PC origin preserves Unicode and integral IDs; invalid or oversized origin blocks resolution',async()=>{
 for(const [value,expected] of [['가상 주문 / 123','가상 주문 / 123'],[42,'42'],['가'.repeat(300),'가'.repeat(300)]]){
  const key='pc_origin',draft=F.normEntry({id:key,kind:'out',amount:5,date:'2026-10-29',method:'카뱅이체',origin:value,source:'ai-sourcing',evidence:'없음'},new Date(ts));
  const data=fixture();data.hub.financeV1.importReviews={[key]:{status:'REVIEW',source:'import',kind:draft.kind,amount:draft.amount,date:draft.date,method:draft.method,draft}};
  const s=server(data);await withStores(s,async a=>{await a.listImportReviewCandidates(key);await a.resolveImportReview(key,{action:'add'});});
  assert.equal(s.state.hub.financeV1.entries['csv_review_'+key].origin,expected);
 }
 for(const value of [undefined,'','   ','가'.repeat(301),'bad\norigin',1.5,{},Number.MAX_SAFE_INTEGER+1]){
  const key='pc_origin',draft=F.normEntry({id:key,kind:'out',amount:5,date:'2026-10-29',method:'카뱅이체',origin:value,source:'ai-sourcing',evidence:'없음'},new Date(ts));
  const data=fixture();data.hub.financeV1.importReviews={[key]:{status:'REVIEW',source:'import',kind:draft.kind,amount:draft.amount,date:draft.date,method:draft.method,draft}};
  const s=server(data);await withStores(s,async a=>{await a.listImportReviewCandidates(key);await assert.rejects(a.resolveImportReview(key,{action:'add'}),e=>e.code==='IMPORT_SOURCE_REQUIRED');});
  assert.equal(Object.keys(s.state.hub.financeV1.entries).length,0);assert.equal(s.state.hub.financeV1.importReviews[key].status,'REVIEW');
 }
});
test('PC transfer preserves both validated accounts and rejects incomplete or unknown routes',async()=>{
 const from='카카오뱅크(사업자 통장)',to='토스뱅크(정산 통장)';
 for(const [left,right,valid] of [[from,to,true],[from,'',false],[from,from,false],[from,'unknown',false]]){
  const key='pc_move',draft=F.normEntry({id:key,kind:'move',amount:5,date:'2026-10-29',method:'카뱅이체',origin:'move-1',from:left,to:right,source:'ai-sourcing',evidence:'없음'},new Date(ts));
  const data=fixture();data.hub.financeV1.importReviews={[key]:{status:'REVIEW',source:'import',kind:draft.kind,amount:draft.amount,date:draft.date,method:draft.method,draft}};
  const s=server(data);await withStores(s,async a=>{const listed=await a.listImportReviewCandidates(key);if(valid){assert.equal(listed.review.from,from);assert.equal(listed.review.to,to);await a.resolveImportReview(key,{action:'add'});}else await assert.rejects(a.resolveImportReview(key,{action:'add'}),e=>e.code==='IMPORT_ACCOUNT_REVIEW');});
  if(valid){const e=s.state.hub.financeV1.entries['csv_review_'+key];assert.equal(e.from,from);assert.equal(e.to,to);assert.equal(e.origin,'move-1');}
  else assert.equal(Object.keys(s.state.hub.financeV1.entries).length,0);
 }
});
