const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=fs.readFileSync(require.resolve('../src/fin-hub.js'),'utf8')
 .replace("import { dbUrl } from './fbauth.js?v=access20261028';","const dbUrl=async p=>'https://isolated.test/'+p;")
 .replace("'./fin-classify.js?v=undo-20261027'",JSON.stringify(url(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8'))));
const mod=import(url(source));
test('분류 저장은 최신 거래/ETag 사용 · 충돌/누락 ETag에는 쓰지 않음',async()=>{
 const oldFetch=global.fetch; const {openFinStore}=await mod;
 let e={id:'test_1',kind:'out',amount:1234,method:'현대카드',vendor:'시험 서비스',category:'',status:'needs',memo:'유지'},calls=[],conflict=false,noTag=false;
 global.fetch=async(u,o={})=>{calls.push(o);if(o.method==='PUT'){assert.equal(o.headers['if-match'],'"v1"');if(conflict)return {status:412,ok:false};e=JSON.parse(o.body);}return {ok:true,status:200,headers:{get:()=>noTag?null:'"v1"'},json:async()=>structuredClone(e)};};
 try{
  const store=openFinStore(); await store.requestAi('test_1','포장 업무에 쓰는 서비스');
  assert.equal(e.ai.status,'pending');assert.equal(e.memo,'유지');assert.equal(e.amount,1234);assert.equal(calls[0].headers['X-Firebase-ETag'],'true');
  conflict=true;const before=structuredClone(e);await assert.rejects(()=>store.setCategory('test_1','구독료'),/다른 곳/);assert.deepEqual(e,before);
  noTag=true;calls=[];await assert.rejects(()=>store.setCategory('test_1','구독료'),/충돌 확인/);assert.equal(calls.length,1);
 }finally{global.fetch=oldFetch;}
});
