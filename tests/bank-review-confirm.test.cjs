// Synthetic data and mocked network only; no production access.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../src/fin-core.js');
const ts=Date.parse('2026-10-29T07:00:00Z'),id='kb_'+ts;
const input={direction:'out',amount:4321};
const fixture=()=>({entries:{},sales:{salesFixture:{amount:99}},meta:{fixture:'keep'},inboxSeen:{[id]:{review:true}},bankReviews:{[id]:{status:'REVIEW',src:'kakaobank',ts}}});
const classify='data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64');
const source=actor=>fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8').replace(/import \{ dbUrl \} from '\.\/fbauth\.js(?:\?[^']*)?';/,`const dbUrl=async()=> 'https://test.invalid/${actor}';`).replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(classify));
const load=async actor=>import('data:text/javascript;base64,'+Buffer.from(source(actor)).toString('base64'));
const clone=x=>JSON.parse(JSON.stringify(x));
function mock(initial,options={}){
 let data=clone(initial),revision=0,puts=0,reads=0;const actors=new Set();
 async function fetch(url,opts={}){
  assert.match(String(url),/^https:\/\/test\.invalid\/(owner|partner)$/);actors.add(String(url).split('/').pop());
  if((opts.method||'GET')==='GET'){
   reads++;if(options.denyRead)return new Response('',{status:403});
   return new Response(JSON.stringify(data),{status:200,headers:options.noTag?{}:{ETag:'"'+revision+'"'}});
  }
  assert.equal(opts.method,'PUT');puts++;
  if(options.denyWrite)return new Response('',{status:403});
  if(opts.headers['if-match']!=='"'+revision+'"')return new Response('',{status:412});
  data=JSON.parse(opts.body);revision++;
  if(options.lostResponse)throw Error('synthetic connection failure');
  if(options.errorResponse)return new Response('',{status:503});
  return new Response(JSON.stringify(data),{status:200});
 }
 return {fetch,get data(){return data},get puts(){return puts},get reads(){return reads},actors};
}
async function runWith(server,fn){
 const oldFetch=global.fetch,oldWindow=global.window;global.fetch=server.fetch;global.window={FinCore:F};
 const owner=(await load('owner')).openFinStore(),partner=(await load('partner')).openFinStore();
 try{return await fn(owner,partner);}finally{owner.close();partner.close();global.fetch=oldFetch;global.window=oldWindow;}
}
test('confirmation validates explicit inputs and excludes private fields',()=>{
 const review={...fixture().bankReviews[id],raw:'PRIVATE_RAW',balance:'PRIVATE_BALANCE',name:'PRIVATE_NAME'};
 for(const bad of [{amount:4321},{direction:'out',amount:0},{direction:'out',amount:1.2},{direction:'out',amount:100000001}])assert.throws(()=>F.confirmedBankReview(id,review,bad));
 const e=F.confirmedBankReview(id,review,input,new Date(ts));F.validateEntry(e);
 assert.equal(e.inboxId,id);assert.equal(e.kind,'out');assert.equal(e.amount,4321);assert.equal(e.updatedAt,new Date(ts).toISOString());
 for(const s of ['PRIVATE_RAW','PRIVATE_BALANCE','PRIVATE_NAME'])assert(!JSON.stringify(e).includes(s));
});
test('same and uncertain date candidates, including void and transfers, block without writing',async()=>{
 for(const candidate of [
  {id:'manual',kind:'out',amount:4321,date:'2026-10-29',method:'카뱅이체'},
  {id:'manual',kind:'out',amount:4321,date:'',method:'카뱅이체'},
  {id:'manual',kind:'out',amount:4321,date:'2026-10-29',method:'카뱅이체',status:'void'},
  {id:'manual',kind:'out',amount:4321,date:'2026-10-29',method:'카뱅체크'},
  {id:'manual',kind:'out',amount:4321,date:'2026-10-29',account:'unknown'},
  {id:'manual',kind:'move',amount:4321,date:'2026-10-29'},
  {id:'manual',kind:'move',amount:4321,date:'2026-10-29',from:'카카오뱅크(사업자 통장)',to:'토스뱅크(정산 통장)'}
 ]){
  const data=fixture();data.entries.manual=candidate;const server=mock(data);
  await runWith(server,async owner=>assert.rejects(owner.confirmBankReview(id,input),e=>e.code==='REVIEW_CANDIDATE'));
  assert.equal(server.puts,0);assert.deepEqual(server.data,data);
 }
});
test('two permission holders racing create one row and preserve unrelated data',async()=>{
 const data=fixture();data.entries.other={id:'other',kind:'out',amount:13,date:'2026-10-29',method:'카뱅이체'};
 const server=mock(data);
 await runWith(server,async(owner,partner)=>{
  const [a,b]=await Promise.all([owner.confirmBankReview(id,input),partner.confirmBankReview(id,input)]);
  assert.deepEqual(a,b);assert.equal(a.status,'confirmed');
  assert.deepEqual(await partner.confirmBankReview(id,input),a);
 });
 assert.equal(server.actors.size,2);assert.equal(Object.keys(server.data.entries).length,2);assert.deepEqual(server.data.entries.other,data.entries.other);
 assert.deepEqual(server.data.sales,data.sales);assert.deepEqual(server.data.meta,data.meta);assert.deepEqual(server.data.inboxSeen,data.inboxSeen);
 assert.equal(server.data.bankReviews[id].status,'CONFIRMED');assert.equal(server.data.entries['al_'+id].amount,4321);
});
test('response loss or server error after commit is resolved by rereading; retry is idempotent',async()=>{
 for(const options of [{lostResponse:true},{errorResponse:true}]){
  const server=mock(fixture(),options);
  await runWith(server,async(owner,partner)=>{
   assert.equal((await owner.confirmBankReview(id,input)).status,'confirmed');
   assert.equal((await partner.confirmBankReview(id,input)).status,'confirmed');
  });
  assert.equal(server.puts,1);assert.equal(Object.keys(server.data.entries).length,1);
 }
});
test('different concurrent choices never overwrite the winning confirmation',async()=>{
 const server=mock(fixture());
 await runWith(server,async(owner,partner)=>{
  const results=await Promise.allSettled([owner.confirmBankReview(id,input),partner.confirmBankReview(id,{direction:'in',amount:4321})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='REVIEW_RESOLVED').length,1);
 });
 assert.equal(Object.keys(server.data.entries).length,1);
});
test('without permission or ETag there is no confirmed write',async()=>{
 for(const options of [{denyRead:true},{noTag:true},{denyWrite:true}]){
  const data=fixture();
  // Make the permission failure or absent tag visible to the store.
  const denied=mock(data,options);
  await runWith(denied,async owner=>assert.rejects(owner.confirmBankReview(id,input)));
  assert.deepEqual(denied.data,data);if(!options.denyWrite)assert.equal(denied.puts,0);
 }
});
