// Synthetic-only PC collector review and cross-language fingerprint tests.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const F=require('../src/fin-core.js');
const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64');
const source=actor=>fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,`const dbUrl=async()=> 'https://test.invalid/${actor}';`).replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));
const load=async actor=>import('data:text/javascript;base64,'+Buffer.from(source(actor)).toString('base64'));
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const key='sale_smartstore_20261029',date='2026-10-29';
async function makeReview(current,proposal){const {pcCollectorFingerprint:fp}=await load('owner');const p={...proposal};delete p.updatedAt;return {status:'REVIEW',reason:'UNVERIFIED_EXISTING',currentExists:current!=null,currentSnapshot:clone(current),currentFingerprint:await fp(current),proposal:clone(proposal),proposalFingerprint:await fp(p),valueFingerprint:await fp(proposal),createdAt:'2026-10-29T00:00:00Z'};}
function server(initial,{lost=false,badAck=''}={}){let data=clone(initial),rev=0,puts=0;async function fetch(url,opts={}){
 assert.match(String(url),/^https:\/\/test\.invalid\/(owner|partner)$/);
 if((opts.method||'GET')==='GET')return new Response(JSON.stringify(data),{headers:{ETag:'"'+rev+'"'}});
 assert.equal(opts.method,'PUT');puts++;if(opts.headers['if-match']!=='"'+rev+'"')return new Response('',{status:412});
 data=JSON.parse(opts.body);rev++;if(badAck)delete data.meta.pcCollectorProvenance?.[key];if(lost||badAck==='lost'){lost=false;throw Error('synthetic lost response');}if(badAck==='error')return new Response('',{status:503});return new Response(JSON.stringify(data));
 }return {fetch,get data(){return data},get puts(){return puts},mutate(fn){fn(data);rev++;}};}
async function run(s,fn){const f=global.fetch,w=global.window;global.fetch=s.fetch;global.window={FinCore:F};const a=(await load('owner')).openFinStore(),b=(await load('partner')).openFinStore();try{await fn(a,b);}finally{a.close();b.close();global.fetch=f;global.window=w;}}
test('fingerprints match the actual staged Python implementation for safe supported values',async()=>{
 const samples=[null,{},[],{a:null,b:[],c:{},keep:0,negative:-3,bool:false,text:'가상 값'},[null,{},[],{x:2}],{next:{date:'2026-10-29',amount:3},weeks:[{start:'2026-10-26',pay70:{date:null,amount:null}},{start:'2026-11-02',sales:42}]}];
 const staged=path.resolve(__dirname,'../../invariant-check-20261029/fin_hub_staged.py');
 const reference=fs.existsSync(staged)?staged:path.resolve(__dirname,'pc-fingerprint-reference.py');
 const code="import importlib.util,json,sys; p=sys.argv[1]; s=importlib.util.spec_from_file_location('pc_synthetic',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m); vals=json.load(sys.stdin); print(json.dumps([m._fingerprint(v) for v in vals]))";
 const bundled='C:\\Users\\ilc57\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
 const python=process.env.PYTHON||(fs.existsSync(bundled)?bundled:'python3');
 const py=spawnSync(python,['-c',code,reference],{input:JSON.stringify(samples),encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});assert.equal(py.status,0,'Python synthetic fingerprint check failed');
 const expected=JSON.parse(py.stdout),{pcCollectorFingerprint}=await load('owner');for(let i=0;i<samples.length;i++)assert.equal(await pcCollectorFingerprint(samples[i]),expected[i]);
 for(const unsafe of [{x:0.1},{x:Number.MAX_SAFE_INTEGER+1},{'2':'numeric key'},{'가':'unicode key'},'\ud800'])await assert.rejects(pcCollectorFingerprint(unsafe));
});
test('sales keep preserves the current value and the shown fingerprints, including an absent target',async()=>{
 for(const current of [{gross:7,orders:1,cancel:0},null]){
  const proposal={gross:9,orders:2,cancel:0,updatedAt:'2026-10-29T03:00:00Z'},review=await makeReview(current,proposal);
  const s=server({sales:{smartstore:current?{[date]:current}:{}},meta:{pcCollectorReviews:{[key]:review},unrelated:'keep'},entries:{}});
  await run(s,async(a,b)=>{const view=await a.listPcCollectorReview(key);assert.equal(view.target,'daily-sales');assert.equal(view.current?.gross??null,current?.gross??null);assert.equal(view.proposal.gross,9);
   assert.equal((await a.resolvePcCollectorReview(key,{action:'keep'})).action,'keep');assert.equal((await b.resolvePcCollectorReview(key,{action:'keep'})).action,'keep');});
  assert.deepEqual(s.data.sales.smartstore[date]??null,current);assert.equal(s.data.meta.pcCollectorReviews[key].currentFingerprint,review.currentFingerprint);assert.equal(s.data.meta.unrelated,'keep');
 }
});
test('apply records provenance atomically and recovers from a lost response',async()=>{
 const current={gross:7,orders:1},proposal={gross:9,orders:2,updatedAt:'2026-10-29T03:00:00Z'},review=await makeReview(current,proposal);
 const s=server({sales:{smartstore:{[date]:current}},meta:{pcCollectorReviews:{[key]:review}},entries:{other:{id:'other'}}},{lost:true});
 await run(s,async(a,b)=>{await a.listPcCollectorReview(key);assert.equal((await a.resolvePcCollectorReview(key,{action:'apply'})).action,'apply');assert.equal((await b.resolvePcCollectorReview(key,{action:'apply'})).action,'apply');});
 assert.deepEqual(s.data.sales.smartstore[date],proposal);assert.deepEqual(s.data.meta.pcCollectorProvenance[key],{version:1,fingerprint:review.valueFingerprint});assert.equal(s.data.meta.pcCollectorReviews[key].status,'RESOLVED');assert.equal(s.puts,1);
});
test('verification failure is awaited and cannot report success for normal, lost, or error responses',async()=>{
 for(const badAck of ['normal','lost','error']){
  const current={gross:7,orders:1},proposal={gross:9,orders:2},review=await makeReview(current,proposal);
  const s=server({sales:{smartstore:{[date]:current}},meta:{pcCollectorReviews:{[key]:review}}},{badAck});
  await run(s,async a=>{await a.listPcCollectorReview(key);await assert.rejects(a.resolvePcCollectorReview(key,{action:'apply'}));});
 }
});
test('changed target, review, proposal or conflicting decision cannot silently overwrite',async()=>{
 for(const mutate of [d=>{d.sales.smartstore[date].gross=8;},d=>{d.meta.pcCollectorReviews[key].proposal.orders=3;},d=>{d.meta.pcCollectorReviews[key].currentExists=false;}]){
  const current={gross:7,orders:1},proposal={gross:9,orders:2},review=await makeReview(current,proposal),s=server({sales:{smartstore:{[date]:current}},meta:{pcCollectorReviews:{[key]:review}}});
  await run(s,async a=>{await a.listPcCollectorReview(key);s.mutate(mutate);await assert.rejects(a.resolvePcCollectorReview(key,{action:'apply'}));});
  assert.equal(s.data.meta.pcCollectorReviews[key].status,'REVIEW');assert.equal(s.puts,0);
 }
 const current={gross:7,orders:1},proposal={gross:9,orders:2},review=await makeReview(current,proposal),s=server({sales:{smartstore:{[date]:current}},meta:{pcCollectorReviews:{[key]:review}}});
 await run(s,async(a,b)=>{await Promise.all([a.listPcCollectorReview(key),b.listPcCollectorReview(key)]);const r=await Promise.allSettled([a.resolvePcCollectorReview(key,{action:'keep'}),b.resolvePcCollectorReview(key,{action:'apply'})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected').length,1);});
});
test('account change before conditional write prevents the pending action',async()=>{
 const current={gross:7,orders:1},proposal={gross:9,orders:2},review=await makeReview(current,proposal),s=server({sales:{smartstore:{[date]:current}},meta:{pcCollectorReviews:{[key]:review}}});
 const original=s.fetch;let paused=false,start,release;const started=new Promise(r=>{start=r;}),gate=new Promise(r=>{release=r;});
 s.fetch=async(...args)=>{if(paused&&(args[1]?.method||'GET')==='GET'){start();await gate;}return original(...args);};
 await run(s,async a=>{await a.listPcCollectorReview(key);paused=true;const pending=a.resolvePcCollectorReview(key,{action:'apply'});await started;a.close();release();await assert.rejects(pending);});
 assert.equal(s.puts,0);assert.deepEqual(s.data.sales.smartstore[date],current);assert.equal(s.data.meta.pcCollectorReviews[key].status,'REVIEW');
});
test('summaries omit arbitrary strings and preserve nulls; bad keys and unsupported numbers stop',async()=>{
 const {pcCollectorFingerprint:fp}=await load('owner');const cur={nextDate:'2026-10-30',nextAmount:3,source:'PRIVATE_SYNTHETIC'},proposal={nextDate:'2026-11-01',nextAmount:5,source:'PRIVATE_PROPOSAL'},slot='meta_coupangSettle';
 const review={status:'REVIEW',reason:'UNVERIFIED_EXISTING',currentExists:true,currentSnapshot:cur,currentFingerprint:await fp(cur),proposal,proposalFingerprint:await fp(proposal),valueFingerprint:await fp(proposal)};
 const s=server({meta:{coupangSettle:cur,pcCollectorReviews:{[slot]:review}}});await run(s,async a=>{const view=await a.listPcCollectorReview(slot);assert.equal(view.target,'settlement');assert.equal(view.current.nextAmount,3);assert.equal(view.current.fee,null);assert(!JSON.stringify(view).includes('PRIVATE_'));await assert.rejects(a.listPcCollectorReview('meta_other'));});
});
test('calendar and settlement apply use private proposal and compatible provenance with safe summaries',async()=>{
 const {pcCollectorFingerprint:fp}=await load('owner');
 for(const [slot,target,current,proposal] of [
  ['meta_coupangSettle','settlement',{period:'2026. 10. 12 ~ 2026. 10. 18',nextAmount:3},{period:'2026. 10. 19 ~ 2026. 10. 25',nextAmount:5}],
  ['meta_coupangCal','calendar',{weeks:[{start:'2026-10-19',end:'2026-10-25',sales:3,pay70:{date:null,amount:null}}],next:null},{weeks:[{start:'2026-10-26',end:'2026-11-01',sales:5,pay70:{date:'2026-11-15',amount:2}}],next:{date:'2026-11-15',amount:2}}]
 ]){
  const name=target==='settlement'?'coupangSettle':'coupangCal';
  const review={status:'REVIEW',reason:'UNVERIFIED_EXISTING',currentExists:true,currentSnapshot:current,currentFingerprint:await fp(current),proposal,proposalFingerprint:await fp(proposal),valueFingerprint:await fp(proposal)};
  const s=server({meta:{[name]:current,pcCollectorReviews:{[slot]:review},untouched:{other:1}},sales:{}});
  await run(s,async a=>{const summary=await a.listPcCollectorReview(slot);assert.equal(summary.target,target);if(target==='settlement')assert.equal(summary.current.periodStart,'2026-10-12');else assert.equal(summary.current.weeks[0].pay70.amount,null);await a.resolvePcCollectorReview(slot,{action:'apply'});});
  assert.deepEqual(s.data.meta[name],proposal);assert.equal(s.data.meta.pcCollectorProvenance[slot].fingerprint,review.valueFingerprint);assert.deepEqual(s.data.meta.untouched,{other:1});
 }
});
