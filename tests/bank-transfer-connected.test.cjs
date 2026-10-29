'use strict';
// Real dashboard storage and matching code, with synthetic REST only: no production network or data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const root='C:/Users/ilc57/github/mumutori-dashboard',F=require(root+'/src/fin-core.js');
const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(root+'/src/fin-classify.js')).toString('base64');
const source=actor=>fs.readFileSync(root+'/src/fin-hub.js','utf8').replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,`const dbUrl=async p=>'https://test.invalid/${actor}/'+p;`).replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),when=Date.parse('2026-10-29T03:00:00Z');
const alert=(src,dir,ms)=>({src,ts:ms,text:`${dir} 1234원 개인사업자`});
const ak='kb_'+when,bk='tb_'+(when+1000),ck='kb_'+(when+2000);
const a=alert('kakaobank','출금',when),b=alert('tossbank','입금',when+1000),c=alert('kakaobank','출금',when+2000);
const draft=(id,item)=>F.draftFromAlert({...item,id},[],new Date(when));
function fixture(raw={}){return {hub:{financeV1:{entries:{},sales:{},meta:{},bankReviews:{},alertReviews:{},importReviews:{},inboxSeen:{}},financeInbox:{}},financeRawInbox:{synthetic:raw}};}
function server(initial,options={}){
 const state=clone(initial),writes=[];let revision=0,entryReads=0,rootReads=0,release,releaseRoot;const barrier=new Promise(r=>release=r),rootBarrier=new Promise(r=>releaseRoot=r);
 const get=keys=>keys.reduce((v,k)=>v?.[k],state),set=(keys,val)=>{let o=state;for(const k of keys.slice(0,-1))o=o[k]||(o[k]={});o[keys.at(-1)]=val;};
 async function fetch(url,opt={}){const u=new URL(url);assert.equal(u.hostname,'test.invalid');const keys=u.pathname.split('/').filter(Boolean).slice(1),name=keys.join('/'),method=opt.method||'GET',etag='"'+revision+'"';
  if(method==='GET'){const snapshot=clone(get(keys)??null);if(options.entryBarrier&&name==='hub/financeV1'&&opt.headers?.['X-Firebase-ETag']&&++entryReads<=2){if(entryReads===2)release();await barrier;}if(options.rootBarrier&&name==='hub/financeV1'&&opt.headers?.['X-Firebase-ETag']&&++rootReads<=2){if(rootReads===2)releaseRoot();await rootBarrier;}return new Response(JSON.stringify(snapshot),{headers:{ETag:etag}});}
  assert.equal(method,'PUT');const match=opt.headers?.['if-match'];writes.push({name,conditional:!!match});
  if(name==='hub/financeV1'&&options.beforePut){const f=options.beforePut;options.beforePut=null;f(state);revision++;}
  if(match!==('"'+revision+'"'))return new Response('',{status:412});set(keys,JSON.parse(opt.body));revision++;
  if(name==='hub/financeV1'&&options.lost){options.lost=false;throw new TypeError('synthetic connection lost');}
  return new Response('{}',{status:200});
 }
 return {state,writes,fetch};
}
async function stores(s,fn){const oldFetch=global.fetch,oldWindow=global.window;global.fetch=s.fetch;global.window={FinCore:F};const make=async actor=>(await import('data:text/javascript;base64,'+Buffer.from(source(actor)).toString('base64'))).openFinStore();const one=await make('one'),two=await make('two');try{return await fn(one,two);}finally{one.close();two.close();global.fetch=oldFetch;global.window=oldWindow;}}

test('late third matching alert invalidates a previously automatic pair',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.load();await one.processInbox();
  assert.equal(Object.values(s.state.hub.financeV1.entries).filter(e=>e.kind==='move').length,2);const before=clone(s.state.hub.financeV1.entries);
  s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  assert.equal(s.state.hub.financeV1.alertReviews[ck]?.status,'REVIEW','late ambiguous event remains visible');
  const fin=s.state.hub.financeV1,held=Object.values(fin.transferReviews||{}).find(r=>r.status==='REVIEW');assert(held,'pair is visibly held');assert.deepEqual(fin.entries,before,'automatic pair rows are not rewritten');
  assert.equal(F.pendingTransferIds(fin).size,2);const totals=F.accountTotals(fin);assert(totals.every(v=>v.moveIn===0&&v.moveOut===0),'ambiguous pair is excluded from confirmed movement totals');
 });
});
test('a third candidate concurrent with the pair write forces retry and no pairing',async()=>{
 const data=fixture();for(const [id,item] of [[ak,a],[bk,b]]){const row=draft(id,item);data.hub.financeV1.entries[row.id]=row;}
 const late=draft(ck,c),s=server(data,{beforePut:state=>{state.hub.financeV1.entries[late.id]=late;}});
 await stores(s,async one=>assert.equal(await one.reconcileBankTransfers(),0));
 assert.equal(Object.values(s.state.hub.financeV1.entries).filter(e=>e.transferId).length,0);assert(s.writes.every(w=>w.conditional));
});
test('a concurrent user cancellation survives retry and prevents the pair',async()=>{
 const data=fixture(),first=draft(ak,a),second=draft(bk,b);data.hub.financeV1.entries={[first.id]:first,[second.id]:second};
 const manual={...first,status:'void',memo:'합성 사용자 취소',updatedAt:'2026-10-29T03:00:02.000Z'};
 const s=server(data,{beforePut:state=>{state.hub.financeV1.entries[first.id]=manual;}});
 await stores(s,async one=>assert.equal(await one.reconcileBankTransfers(),0));
 assert.deepEqual(s.state.hub.financeV1.entries[first.id],manual);assert.equal(s.state.hub.financeV1.entries[second.id].kind,'in');
});
test('two devices reconciling together cannot create two pairs',async()=>{
 const data=fixture();for(const [id,item] of [[ak,a],[bk,b]]){const row=draft(id,item);data.hub.financeV1.entries[row.id]=row;}
 const s=server(data,{entryBarrier:true});await stores(s,async(one,two)=>{await Promise.all([one.reconcileBankTransfers(),two.reconcileBankTransfers()]);});
 const rows=Object.values(s.state.hub.financeV1.entries);assert.equal(rows.length,2);assert.equal(new Set(rows.map(e=>e.transferId)).size,1);assert(rows.every(e=>e.kind==='move'));assert(s.writes.every(w=>w.conditional));
});
test('two devices importing the same two events keep exactly one pair',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}),{rootBarrier:true});await stores(s,async(one,two)=>{await Promise.all([one.processInbox(),two.processInbox()]);});
 const finance=s.state.hub.financeV1,rows=Object.values(finance.entries);assert.equal(rows.length,2);assert.equal(Object.keys(finance.inboxSeen).length,2);assert(rows.every(e=>e.kind==='move'));assert.equal(new Set(rows.map(e=>e.transferId)).size,1);assert(s.writes.every(w=>w.conditional));
});
test('manually sourced bank row without updatedAt is never changed into an automatic transfer',async()=>{
 const data=fixture(),manual={...draft(ak,a),source:'phone',memo:'합성 수기 메모'},other=draft(bk,b);data.hub.financeV1.entries={[manual.id]:manual,[other.id]:other};
 const s=server(data);await stores(s,async one=>assert.equal(await one.reconcileBankTransfers(),0));
 assert.deepEqual(s.state.hub.financeV1.entries[manual.id],manual);
});
test('lost write response is identified as uncertain and later retry does not duplicate a pair',async()=>{
 const data=fixture();for(const [id,item] of [[ak,a],[bk,b]]){const row=draft(id,item);data.hub.financeV1.entries[row.id]=row;}
 const s=server(data,{lost:true});await stores(s,async one=>{let error,first;try{first=await one.reconcileBankTransfers();}catch(e){error=e;}
  assert.equal(await one.reconcileBankTransfers(),0);const rows=Object.values(s.state.hub.financeV1.entries);assert.equal(rows.length,2);assert.equal(new Set(rows.map(e=>e.transferId)).size,1);
  if(error)assert.match(error.message,/저장 결과.*확인|결과.*미확인/,'uncertain write must be clearly identified, rather than reported as an ordinary network failure');
  else assert.equal(first,1,'a successful re-read may confirm the already completed pair');
 });
});
test('late pending alert is considered before pairing, not only after entries are written',async()=>{
 const data=fixture(),first=draft(ak,a),second=draft(bk,b);data.hub.financeV1.entries={[first.id]:first,[second.id]:second};
 data.hub.financeV1.alertReviews[ck]={status:'REVIEW',source:'alert',bankSource:'kakaobank',kind:'out',amount:1234,date:'2026-10-29',time:'12:00',method:'카뱅이체',alertAt:when+2000};
 const s=server(data);await stores(s,async one=>assert.equal(await one.reconcileBankTransfers(),0));assert(Object.values(s.state.hub.financeV1.entries).every(e=>!e.transferId));
});
test('manual edit, cancellation or changed transfer ID holds both original rows out of account totals',async()=>{
 for(const change of [{memo:'합성 사용자 수정',updatedAt:'2026-10-29T04:00:00Z'},{status:'void',updatedAt:'2026-10-29T04:00:00Z'},{transferId:'manual-other',updatedAt:'2026-10-29T04:00:00Z'}]){
  const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.processInbox();s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
   const fin=s.state.hub.financeV1,id=Object.keys(fin.transferReviews)[0],ids=fin.transferReviews[id].entryIds;Object.assign(fin.entries[ids[0]],change);const before=clone(fin.entries);
   assert.equal(F.pendingTransferIds(fin).has(ids[0]),true);assert.equal(F.pendingTransferIds(fin).has(ids[1]),true);assert(F.accountTotals(fin).every(v=>v.moveIn===0&&v.moveOut===0));
   const list=await one.listBankTransferReview(id);assert.equal(list.reassignAllowed,false);assert.equal(list.existing.length,2);assert.equal((await one.resolveBankTransferReview(id,{action:'keep'})).action,'keep');assert.deepEqual(s.state.hub.financeV1.entries,before);
   await one.reconcileBankTransfers();assert.equal(s.state.hub.financeV1.transferReviews[id].status,'RESOLVED','acknowledged current edits must not immediately reopen');
  });
 }
});
test('late candidate after either original row was edited, cancelled, or relinked still creates a privacy-safe review',async()=>{
 for(const legacy of [false,true])for(const changed of [ak,bk])for(const change of [
  {memo:'SYNTHETIC_PRIVATE_NAME',updatedAt:'2026-10-29T04:00:00Z'},
  {status:'void',updatedAt:'2026-10-29T04:00:00Z'},
  {transferId:'manual-other',updatedAt:'2026-10-29T04:00:00Z'}
 ]){
  const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{
   await one.processInbox();if(legacy)delete s.state.hub.financeV1.transferPairProofs;
   Object.assign(s.state.hub.financeV1.entries['al_'+changed],change);const before=clone(s.state.hub.financeV1.entries);
   s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();const fin=s.state.hub.financeV1,review=Object.values(fin.transferReviews||{}).find(r=>r.status==='REVIEW');
   assert(review,'a late candidate must not disappear after one side was edited');assert.deepEqual(fin.entries,before);assert.equal(F.pendingTransferIds(fin).size,2);
   assert(!JSON.stringify(fin.transferReviews).includes('SYNTHETIC_PRIVATE_NAME'));assert(F.accountTotals(fin).every(v=>v.moveIn===0&&v.moveOut===0));
   const list=await one.listBankTransferReview(Object.keys(fin.transferReviews)[0]);assert.equal(list.reassignAllowed,false);
  });
 }
});
test('a missing original side remains visible and cannot be guessed back into the ledger',async()=>{
 for(const legacy of [false,true])for(const missing of [ak,bk]){
  const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.processInbox();if(legacy)delete s.state.hub.financeV1.transferPairProofs;delete s.state.hub.financeV1.entries['al_'+missing];
   s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();const fin=s.state.hub.financeV1,reviewId=Object.keys(fin.transferReviews||{})[0];assert(reviewId);assert.equal(fin.entries['al_'+missing],undefined);
   const list=await one.listBankTransferReview(reviewId);assert.equal(list.reassignAllowed,false);assert(list.existing.some(e=>e.status==='missing'));assert.equal(F.pendingTransferIds(fin).size,2);
  });
 }
});
test('late candidate can be explicitly paired while original history and other row are preserved',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.processInbox();s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const fin=s.state.hub.financeV1,id=Object.keys(fin.transferReviews)[0],list=await one.listBankTransferReview(id);assert.equal(list.reassignAllowed,true);assert.equal(list.existing.length,2);assert.equal(list.originalHistory.length,2);assert.deepEqual(new Set(list.originalHistory.map(e=>e.direction)),new Set(['in','out']));assert.equal(list.candidates.length,1);
  const anchor=list.existing.find(e=>e.direction==='in');assert.equal(anchor.account,'토스뱅크(정산 통장)');assert.equal(list.candidates[0].account,'카카오뱅크(사업자 통장)');assert.equal(list.candidates[0].eligible,true);
  const selection={action:'reassign',anchorId:anchor.id,candidateType:'alert',candidateId:ck};assert.equal((await one.resolveBankTransferReview(id,selection)).action,'reassign');assert.equal((await one.resolveBankTransferReview(id,selection)).action,'reassign');
  const after=s.state.hub.financeV1;assert.equal(after.entries['al_'+ak].kind,'out');assert.equal(after.entries['al_'+ak].memo,'개인사업자 통장 알림');assert.equal(after.entries['al_'+bk].kind,'move');assert.equal(after.entries['al_'+ck].kind,'move');
  assert.equal(after.entries['al_'+bk].from,'카카오뱅크(사업자 통장)');assert.equal(after.entries['al_'+bk].to,'토스뱅크(정산 통장)');assert.equal(after.entries['al_'+ck].inboxId,ck);assert.equal(after.alertReviews[ck].status,'RESOLVED');
 });
});
test('legacy pairs without original proof cannot be reassigned and can explicitly be kept',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.processInbox();delete s.state.hub.financeV1.transferPairProofs;s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const fin=s.state.hub.financeV1,id=Object.keys(fin.transferReviews)[0],before=clone(fin.entries),list=await one.listBankTransferReview(id);assert.equal(list.reassignAllowed,false);assert.equal(list.originalHistory.length,0);
  await assert.rejects(one.resolveBankTransferReview(id,{action:'reassign',anchorId:list.existing.find(e=>e.direction==='in').id,candidateType:'alert',candidateId:ck}));
  assert.equal((await one.resolveBankTransferReview(id,{action:'keep'})).action,'keep');assert.deepEqual(s.state.hub.financeV1.entries,before);assert.equal(s.state.hub.financeV1.alertReviews[ck].status,'REVIEW');
 });
});
test('original proof altered independently from the paired rows cannot authorize rewriting history',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async one=>{await one.processInbox();const id=Object.keys(s.state.hub.financeV1.transferPairProofs)[0];
  s.state.hub.financeV1.transferPairProofs[id].originals['al_'+ak].amount=1235;s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const list=await one.listBankTransferReview(id),before=clone(s.state.hub.financeV1.entries);assert.equal(list.reassignAllowed,false);
  await assert.rejects(one.resolveBankTransferReview(id,{action:'reassign',anchorId:'al_'+bk,candidateType:'alert',candidateId:ck}));assert.deepEqual(s.state.hub.financeV1.entries,before);
 });
});
test('reassign response loss is re-read and retry never duplicates the selected transfer',async()=>{
 const options={},s=server(fixture({[ak]:a,[bk]:b}),options);await stores(s,async one=>{await one.processInbox();s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const id=Object.keys(s.state.hub.financeV1.transferReviews)[0],list=await one.listBankTransferReview(id),choice={action:'reassign',anchorId:list.existing.find(e=>e.direction==='in').id,candidateType:'alert',candidateId:ck};
  options.lost=true;assert.equal((await one.resolveBankTransferReview(id,choice)).action,'reassign');assert.equal((await one.resolveBankTransferReview(id,choice)).action,'reassign');
  assert.equal(Object.keys(s.state.hub.financeV1.entries).length,3);assert.equal(s.state.hub.financeV1.alertReviews[ck].status,'RESOLVED');
 });
});
test('a manual change during reassign ETag retry is preserved and prevents the automatic rewrite',async()=>{
 const options={},s=server(fixture({[ak]:a,[bk]:b}),options);await stores(s,async one=>{await one.processInbox();s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const id=Object.keys(s.state.hub.financeV1.transferReviews)[0],list=await one.listBankTransferReview(id),anchorId=list.existing.find(e=>e.direction==='in').id;
  options.beforePut=state=>{state.hub.financeV1.entries[anchorId].memo='SYNTHETIC_MANUAL_EDIT';state.hub.financeV1.entries[anchorId].updatedAt='2026-10-29T04:00:00Z';};
  await assert.rejects(one.resolveBankTransferReview(id,{action:'reassign',anchorId,candidateType:'alert',candidateId:ck}));
  assert.equal(s.state.hub.financeV1.entries[anchorId].memo,'SYNTHETIC_MANUAL_EDIT');assert.equal(s.state.hub.financeV1.alertReviews[ck].status,'REVIEW');assert.equal(s.state.hub.financeV1.transferReviews[id].status,'REVIEW');
 });
});
test('simultaneous keep and reassign cannot both succeed',async()=>{
 const s=server(fixture({[ak]:a,[bk]:b}));await stores(s,async(one,two)=>{await one.processInbox();s.state.financeRawInbox.synthetic[ck]=c;await one.processInbox();
  const id=Object.keys(s.state.hub.financeV1.transferReviews)[0],[first]=await Promise.all([one.listBankTransferReview(id),two.listBankTransferReview(id)]),anchorId=first.existing.find(e=>e.direction==='in').id;
  const results=await Promise.allSettled([one.resolveBankTransferReview(id,{action:'keep'}),two.resolveBankTransferReview(id,{action:'reassign',anchorId,candidateType:'alert',candidateId:ck})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 });
});
