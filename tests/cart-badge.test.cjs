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

 const parse=(await import(require('node:url').pathToFileURL(path.join(ROOT,'src/sourcing-badges.js')).href)).sourcingBadges;
 assert.equal(parse('미검수 일반 옵션'),null);assert.equal(parse('【다른 표시】 원문'),null);
 assert.equal(parse('【안전】【꼭 확인】 근거').risk,'check');assert.equal(parse('【최저가로 변경】【안전】 근거 | 긴 설명').price,'lowest');
 scenarioTree=fixture();const reason='옵션 사진의 체인과 뒷면을 확인해주세요.',long='LONG_REVIEW_SYNTHETIC_ONLY '+'아주 긴 옵션 검수 설명 '.repeat(20);
 const desc=(safe,cheap)=>`【${cheap?'최저가로 변경':'원래 링크 그대로'}】【${safe?'안전':'꼭 확인'}】 ${reason} | ${long} | 최저가 ¥2: https://detail.1688.com/offer/333.html | 원래 링크: https://detail.1688.com/offer/111.html`;
 scenarioTree.cart=Object.fromEntries(Array.from({length:46},(_,i)=>['row-'+i,{offerId:'111',spec:'黄色>20cm',koBase:desc(i>=40,i<14),ko:desc(i>=40,i<14),price:3.5,qty:2,at:'2026-10-28T00:00:00Z'}]));
 scenarioTree.cart.sent={...scenarioTree.cart['row-0'],orderStage:'접수'};
 const it=scenarioTree.items['111'];it.desc=desc(false,true);it.options[0].ko=desc(true,false);scenarioTree.items['111']=withSku('111',mockApprove('111',it));
 const unchanged=JSON.stringify(scenarioTree);await page.setViewportSize({width:390,height:900});await page.goto(ORIGIN+'sourcing.html?tab=cart');await page.locator('.sx-cart-filters').waitFor();
 const filters=page.locator('.sx-cart-filters');assert.equal(await filters.locator('button').count(),3);
 for(const [id,label,count]of [['all','전체',46],['check','꼭 확인만',40],['safe','안전만',6]]){const button=filters.locator('[data-id="'+id+'"]');assert.equal((await button.innerText()).trim(),label+' '+count);const box=await button.boundingBox();assert(box.width>=44&&box.height>=44);await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.table tbody tr').count(),count);assert.match(await page.locator('.sx-total').textContent(),/상품 46줄 · 92개/);assert.equal(await page.locator('.sx-total b').first().textContent(),'¥322');assert.equal(await page.locator('.sx-quote .sx-q-head').count(),1);}
 assert.equal(await page.locator('.maincell .sx-risk-badge.safe').count(),6);assert.equal(await page.locator('.maincell .sx-risk-badge.check').count(),0);
 const cell=page.locator('.maincell').first();assert.equal(await cell.locator('.sx-badge-reason').textContent(),reason);assert.equal(await cell.locator('.sx-badge-row + .sx-badge-reason').count(),1);assert.equal(await cell.locator('.sx-review-fold[open]').count(),0);
 const optionFold=cell.locator('.sx-review-fold').filter({has:page.locator('summary',{hasText:'옵션 설명 더 보기'})});await optionFold.locator('summary').click();assert.match(await optionFold.innerText(),/LONG_REVIEW_SYNTHETIC_ONLY/);await optionFold.locator('summary').click();
 const reviewFold=cell.locator('.sx-review-fold').filter({has:page.locator('summary',{hasText:'검수 상세 보기'})});await reviewFold.locator('summary').click();assert(await reviewFold.locator('[data-sx="sku-review"]').isVisible());await reviewFold.locator('summary').click();
 await filters.locator('[data-id="all"]').click();assert.equal(await page.locator('.sx-price-badge').filter({hasText:'최저가 변경'}).count(),14);assert.equal(await page.locator('.sx-price-badge').filter({hasText:'원래 링크 그대로'}).count(),32);
 for(const tab of ['cart','orders','items']){await page.locator('.chip[data-sx="tab"][data-id="'+tab+'"]').click();await page.evaluate(()=>window.scrollTo(0,0));assert(await page.locator('.sx-badge-reason').first().isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'fits390 '+tab);if(process.env.ERP_PROOF_DIR){await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-badge-'+tab+'-390.png'),fullPage:false});await page.locator('.sx-badge-reason').first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-badge-'+tab+'-reason-390.png'),fullPage:false});}}
 assert.equal(JSON.stringify(scenarioTree),unchanged);assert.equal(writes.length,0);assert.deepEqual(errors,[]);
 console.log('PASS 46/40/6 filters,14/32 price badges; no invented safe state; evidence visible/details collapsed; all-cart totals and request scope preserved; three tabs390px/44px; zero writes');
 for(const l of Object.values(scenarioTree.cart)){l.koBase='미표시 일반 옵션';l.ko='미표시 일반 옵션';}await page.goto(ORIGIN+'sourcing.html?tab=cart');await page.locator('.sx-cart-filters [data-id="safe"]').click();assert.match(await page.locator('tbody .empty').textContent(),/이 표시의 상품이 없습니다/);assert.equal(await page.locator('.sx-risk-badge').count(),0);assert.equal(writes.length,0);
 if(process.env.SOURCING_PRIVATE_SNAPSHOT){scenarioTree=JSON.parse(fs.readFileSync(process.env.SOURCING_PRIVATE_SNAPSHOT,'utf8'));await page.goto(ORIGIN+'sourcing.html?tab=cart');await page.locator('.sx-cart-filters').waitFor();for(const [id,count]of [['all',46],['check',40],['safe',6]]){await page.locator('.sx-cart-filters [data-id="'+id+'"]').click();assert.equal(await page.locator('.table tbody tr').count(),count);}if(process.env.ERP_PROOF_DIR){await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-badge-actual-safe-filter-390.png')});await page.locator('.sx-badge-reason').first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-badge-actual-safe-reason-390.png')});await page.locator('.sx-cart-filters [data-id="check"]').click();await page.locator('.sx-badge-reason').first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(process.env.ERP_PROOF_DIR,'cart-badge-actual-check-reason-390.png')});}assert.equal(writes.length,0);assert.deepEqual(errors,[]);console.log('PASS private snapshot matches46/40/6; source remains read-only');}
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
