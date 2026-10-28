// Sourcing board checks with a mocked Firebase REST/EventSource endpoint and synthetic records only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
let failNextWrite=false;let remoteCart=null; // 다른 기기에서 담은 줄(실시간 patch로 들어옴)
const rawFixture=()=>({
 items:{'111':{pid:'D01',cat:'친구들',name:'멍한 오리',url:'https://detail.1688.com/offer/111.html',img:'https://cbu01.alicdn.com/img/ibank/a.jpg',priceMin:3.5,priceMax:4,moq:20,unit:'个',weightG:40,freight:4,options:[{spec:'黄色>20cm',ko:'노랑 20cm',price:3.5,img:'https://cbu01.alicdn.com/img/ibank/b.jpg',weightG:40},{spec:'白色>30cm',ko:'흰색 30cm',price:4},{spec:'黄色>平口圆形【9*9*邦高10把高23】',ko:'노랑 원형',price:4,img:'https://cbu01.alicdn.com/img/ibank/b.jpg'}],sizeImgs:[{url:'https://cbu01.alicdn.com/img/ibank/size.jpg',cap:'크기 안내 시험'}],rounds:{r9:true},shop:{company:'시험 공장',years:'7',repeat:'40%'}},
        '222':{pid:'B01',cat:'바구니',name:'리본 바구니',url:'https://detail.1688.com/offer/222.html',img:'https://cbu01.alicdn.com/img/ibank/c.jpg',options:[{spec:'圆形',ko:'원형',price:5.8}],rounds:{r9:true},warn:'확인 필요'}},
 marks:{'222':{design:true,note:'무늬가 별로'}},
 rounds:{r9:{title:'9차 시험',date:'2026-10-07',note:'시험 회차',items:{'111':true,'222':true}}},
 sets:{r9_S1:{name:'시험 세트',round:'r9',parts:[{offerId:'111',spec:'黄色>20cm',qty:2},{offerId:'222',spec:'圆形',qty:1}]}},
 taste:{t1:{kind:'avoid',text:'얼굴 붙인 음식',active:true,source:'시험'}},
 meta:{rate:200,fee:0.05}
});
let testPolicy,scenarioTree=null;
function mockApprove(id,it){return {...it,review:{status:'approved',by:'SYNTHETIC TEST ONLY',at:'2026-10-08T10:00:00Z',snapshot:testPolicy.snapshot(id,it),reviewedImages:[it.img,...Object.values(it.options||{}).map(o=>o.img)].filter(Boolean),reviewedOptions:Object.values(it.options||{}).map(o=>o.spec),classification:{category:'synthetic basket',use:'test display',age:'adult test fixture',materials:'test fabric',regime:'fixture only',rationale:'not a real product review'},checks:Object.fromEntries(['product','supplier','ip','regulatory'].map(k=>[k,{status:'supported',note:'synthetic evidence only',evidence:['https://example.test/evidence']}])) ,riskResolution:'synthetic legacy warning resolved for regression fixture'}};}

function mockSku(id,it,spec){const o=Object.values(it.options).find(o=>o.spec===spec);return {status:'consider',policyVersion:testPolicy.POLICY_VERSION,fingerprint:testPolicy.skuSnapshot(id,it,spec),by:'SYNTHETIC TEST ONLY',requestId:'synthetic-request-'+id+'-'+spec,resultId:'synthetic-result-'+id+'-'+spec,at:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),imagesObserved:true,reviewedImages:[o.img].filter(Boolean),classification:{category:'fixture',use:'fixture display',age:'adult fixture',materials:'fixture fabric',regime:'synthetic only',rationale:'not real product evidence'},checks:Object.fromEntries(['product','supplier','ip','regulatory'].map(k=>[k,{status:'supported',note:'synthetic only',evidence:['https://example.test/evidence']}])) ,riskResolution:'synthetic only'};}
function withSku(id,it){it.skuReviews=Object.fromEntries(Object.values(it.options||{}).map(o=>[testPolicy.keyOfSpec(o.spec),mockSku(id,it,o.spec)]));return it;}

const fixture=()=>{if(scenarioTree)return structuredClone(scenarioTree);const t=rawFixture();for(const [id,it] of Object.entries(t.items))t.items[id]=withSku(id,mockApprove(id,it));t.meta.watcher={version:testPolicy.POLICY_VERSION,at:new Date().toISOString()};return t;};
(async()=>{testPolicy=await import(require('node:url').pathToFileURL(path.join(ROOT,'src/sourcing-policy.js')).href);
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1080}});
 /* 숨긴(👎·💸) 상품도 보이는 상태로 기존 시험 진행 — 기본 숨김 동작은 hide-negative.test.js가 검증 */
 await context.addInitScript(()=>{try{sessionStorage.setItem('mmt-sx-show-hidden','1');}catch(e){}});
 const errors=[],writes=[];
 const authUrls=[];await context.addInitScript(a=>{window.__MMT_TEST_AUTH__=a;},{email:'operator@example.invalid',token:'test-operator-token'});   // 시험용 가짜 로그인(실제 권한은 Firebase 규칙이 막는다)
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 await context.route('https://cbu01.alicdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
 await context.route(DB+'**',route=>{const r=route.request(),u=new URL(r.url());
  if(r.method()==='GET'){
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:fixture()})}\n\n`+(remoteCart?`event: patch\ndata: ${JSON.stringify({path:'/cart',data:remoteCart})}\n\n`:'')});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture())});
  }
  writes.push({method:r.method(),path:u.pathname.replace('/sourcing/','').replace(/\.json$/,''),body:r.postData()?JSON.parse(r.postData()):null});
  if(failNextWrite){failNextWrite=false;return route.fulfill({status:500,contentType:'application/json',body:'null'}); }
  return route.fulfill({status:200,contentType:'application/json',body:r.postData()||'null'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 // Display-only comparison links: synthetic option descriptions, no production writes.
 {const links=await import(require('node:url').pathToFileURL(path.join(ROOT,'src/sourcing-links.js')).href);
  for(const bad of ['javascript:alert(1)','https://1688.com.evil.test/x','https://evil1688.com/x','https://user@detail.1688.com/x','https://detail.1688.com:8443/x'])assert.equal(links.sourcingUrl(bad),'');
  assert.equal(links.sourcingUrl('http://detail.1688.com/offer/333.html'),'https://detail.1688.com/offer/333.html');
  scenarioTree=fixture();const desc='노랑 옵션 · 최저가 ¥2: https://detail.1688.com/offer/333.html | 원래 링크: https://detail.1688.com/offer/111.html';
  scenarioTree.items['111'].desc=desc;scenarioTree.items['111']=withSku('111',mockApprove('111',scenarioTree.items['111']));
  scenarioTree.cart={open:{offerId:'111',spec:'黄色>20cm',ko:desc,price:3.5,qty:20},sent:{offerId:'111',spec:'黄色>20cm',ko:desc,price:3.5,qty:2,orderStage:'접수'}};
  const before=writes.length;await page.setViewportSize({width:390,height:900});await page.goto(ORIGIN+'sourcing.html?tab=cart');await page.locator('tbody .sx-source-links a').first().waitFor();
  for(const tab of ['cart','orders','items']){await page.locator('.chip[data-sx="tab"][data-id="'+tab+'"]').click();const root=tab==='items'?page.locator('.sx-card').filter({has:page.locator('h3', {hasText:'멍한 오리'})}):page.locator('tbody').first();
   const actions=root.locator('.sx-source-links').first();assert.equal(await actions.locator('a').count(),2);
   assert.match(await actions.locator('a').nth(0).textContent(),/최저가 열기/);assert.match(await actions.locator('a').nth(1).textContent(),/원래 링크 열기/);
   assert.equal(await root.locator('.sx-source-photo').first().getAttribute('href'),'https://detail.1688.com/offer/333.html');
   for(const a of await actions.locator('a').all()){const box=await a.boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.equal(await a.getAttribute('target'),'_blank');assert.match(await a.getAttribute('rel'),/noopener/);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(process.env.ERP_PROOF_DIR)await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-links-'+tab+'-390.png'),fullPage:true});
  }
  assert.equal(writes.length,before);scenarioTree=null;assert.deepEqual(errors,[]);console.log('PASS cart/order/candidate 1688 photo and comparison links, 44px at390px, unsafe destinations rejected, zero writes');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

