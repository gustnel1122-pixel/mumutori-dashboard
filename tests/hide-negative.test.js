// 소싱 보드: 👎 디자인 별로·💸 가격 별로 표시한 상품은 후보(추천) 목록에서 숨긴다 — 화면만(장부에는 새로 쓰지 않음).
// 지우는 것이 아니라 가리는 것: '숨긴 상품 n개 보기'로 다시 보고, 표시를 풀면 돌아온다. 장바구니에 담긴 상품은 숨기지 않고 경고만.
// 가짜 Firebase 응답과 합성 자료만 쓴다(검수 통과 표시는 sourcing.test.js와 같은 합성 방식).
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
let P;
const approve=(id,it)=>({...it,review:{status:'approved',by:'SYNTHETIC TEST ONLY',at:'2026-10-08T10:00:00Z',snapshot:P.snapshot(id,it),reviewedImages:[it.img,...it.options.map(o=>o.img)].filter(Boolean),reviewedOptions:it.options.map(o=>o.spec),
 classification:{category:'synthetic',use:'test display',age:'adult test fixture',materials:'test fabric',regime:'fixture only',rationale:'not a real product review'},
 checks:Object.fromEntries(['product','supplier','ip','regulatory'].map(k=>[k,{status:'supported',note:'synthetic evidence only',evidence:['https://example.test/evidence']}])),riskResolution:'synthetic fixture'}});
const item=(pid,name,n)=>({pid,cat:'친구들',name,url:`https://detail.1688.com/offer/${n}.html`,img:`https://cbu01.alicdn.com/img/ibank/${n}.jpg`,priceMin:3,priceMax:3,moq:1,unit:'개',options:[{spec:'基本',ko:'기본',price:3,img:`https://cbu01.alicdn.com/img/ibank/${n}o.jpg`}],rounds:{r9:true}});
let state;
const build=()=>{const items={'101':item('A01','괜찮은 오리',101),'102':item('A02','별로인 토끼',102),'103':item('A03','비싼 곰',103),'104':item('A04','담아 둔 고양이',104)};
 for(const [id,it] of Object.entries(items))items[id]=approve(id,it);
 return {items,marks:{'102':{design:true,note:'표정이 별로'},'103':{price:true},'104':{design:true}},
  cart:{['104~'+P.keyOfSpec('基本')]:{offerId:'104',spec:'基本',ko:'기본',price:3,qty:5,at:'2026-10-12T00:00:00Z'}},
  rounds:{r9:{title:'시험 회차',date:'2026-10-12',items:{'101':true,'102':true,'103':true,'104':true}}},
  sets:{s1:{name:'토끼 세트',round:'r9',parts:[{offerId:'101',spec:'基本',qty:1},{offerId:'102',spec:'基本',qty:1}]}},meta:{rate:200,fee:0.05,watcher:{version:P.POLICY_VERSION,at:new Date().toISOString()}}};};
const setAt=(tree,p,v)=>{const keys=p.split('/').filter(Boolean);let o=tree;for(const k of keys.slice(0,-1)){o[k]=o[k]&&typeof o[k]==='object'?o[k]:{};o=o[k];}if(v===null)delete o[keys.at(-1)];else o[keys.at(-1)]=v;};
(async()=>{
 P=await import(require('node:url').pathToFileURL(path.join(ROOT,'src/sourcing-policy.js')).href);state=build();
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[],writes=[];
 await context.addInitScript(()=>{window.__MMT_TEST_AUTH__={};});
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 await context.route('https://cbu01.alicdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
 await context.route('https://apis.google.com/**',route=>route.abort());
 await context.route(DB+'**',route=>{const r=route.request(),u=new URL(r.url());
  if(r.method()==='GET'){
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:state})}\n\n`});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
  }
  const p=u.pathname.replace('/sourcing/','').replace(/\.json$/,''),body=r.postData()?JSON.parse(r.postData()):null;writes.push({method:r.method(),path:p,body});
  if(r.method()==='PATCH')for(const [k,v] of Object.entries(body||{}))setAt(state,p+'/'+k,v);else setAt(state,p,r.method()==='DELETE'?null:body);
  return route.fulfill({status:200,contentType:'application/json',body:r.postData()||'null'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const names=async()=>(await page.locator('.sx-card h3').allTextContents()).map(s=>s.trim());
 await page.goto(ORIGIN+'sourcing.html');await page.locator('.sx-card').first().waitFor();
 // 기본: 별로 표시한 상품 2개는 숨김, 장바구니에 담긴 별로 상품은 보이고 경고
 assert.deepEqual(await names(),['괜찮은 오리','담아 둔 고양이']);
 assert.match(await page.locator('.chip[data-id="items"]').textContent(),/후보 2/);
 assert.match(await page.locator('.sx-hiddenbar').textContent(),/2개는 추천에서 숨겼어요/);assert.match(await page.locator('[data-sx="toggle-hidden"]').textContent(),/숨긴 상품 2개 보기/);
 assert.match(await page.locator('.sx-card',{hasText:'담아 둔 고양이'}).locator('.sx-cartwarn').textContent(),/장바구니에 1줄 담겨 있어 숨기지 않았어요/);
 assert.equal(await page.locator('.sx-set').count(),0,'숨긴 상품이 들어간 세트 제안도 가린다');
 assert.equal(writes.length,0,'가리는 것은 화면에서만 — 장부에 쓰지 않는다');
 console.log('PASS 👎/💸-marked candidates are hidden by default; carted ones stay with a warning; nothing is written');

 // 보기 토글: 숨긴 상품이 아래 '숨긴 상품' 칸에 나오고, 다시 숨길 수 있다(새로고침해도 이 탭에서는 유지)
 await page.locator('[data-sx="toggle-hidden"]').click();
 assert.deepEqual((await page.locator('.sx-hidden-grid .sx-card h3').allTextContents()).map(s=>s.trim()),['별로인 토끼','비싼 곰']);
 assert.equal(await page.locator('.sx-card').count(),4);assert.match(await page.locator('.chip[data-id="items"]').textContent(),/후보 4/);assert.equal(await page.locator('.sx-set').count(),1);
 assert.equal(await page.locator('[data-sx="toggle-hidden"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('.sx-hiddenbar').textContent(),/2개를 아래 '숨긴 상품'에 펼쳐 놓았어요/);
 await page.reload();await page.locator('.sx-card').first().waitFor();assert.equal(await page.locator('.sx-card').count(),4,'보기 상태는 이 탭에서 유지');
 // 표시를 풀면 추천으로 돌아온다
 await page.locator('.sx-hidden-grid .sx-card',{hasText:'별로인 토끼'}).locator('[data-k="design"]').click();
 await page.waitForFunction(()=>!document.querySelector('.sx-hidden-grid')||!document.querySelector('.sx-hidden-grid').textContent.includes('별로인 토끼'));
 let w=writes.at(-1);assert.equal(w.path,'marks/102');assert.equal(w.body.design,false);assert.equal(writes.length,1,'표시 버튼의 기존 저장 1건뿐');
 await page.locator('[data-sx="toggle-hidden"]').click();
 assert.deepEqual(await names(),['괜찮은 오리','별로인 토끼','담아 둔 고양이']);assert.match(await page.locator('[data-sx="toggle-hidden"]').textContent(),/숨긴 상품 1개 보기/);
 console.log('PASS toggle shows hidden items in their own section and persists for the tab; unmarking brings an item back');

 // 새로 별로 표시하면 바로 사라지고 안내가 뜬다 / 표시 필터를 고르면 숨긴 것도 보인다 / 장바구니 탭 경고
 await page.locator('.sx-card',{hasText:'괜찮은 오리'}).locator('[data-k="price"]').click();
 await page.waitForFunction(()=>![...document.querySelectorAll('.sx-card h3')].some(h=>h.textContent.includes('괜찮은 오리')));
 assert.match(await page.locator('#toast').textContent(),/추천에서 숨겼습니다/);assert.match(await page.locator('[data-sx="toggle-hidden"]').textContent(),/숨긴 상품 2개 보기/);
 await page.locator('select[data-sx-filter="filter"]').selectOption('💸 가격 별로');assert.deepEqual(await names(),['괜찮은 오리','비싼 곰']);
 await page.locator('select[data-sx-filter="filter"]').selectOption('전체');
 await page.locator('.chip[data-id="cart"]').click();assert.match(await page.locator('.sx-badcart').textContent(),/담아 둔 고양이/);assert.equal(await page.locator('.sx-qty').count(),1,'장바구니 줄은 그대로');
 assert.equal(await page.locator('[data-sx="tab"][data-id="excluded"]').textContent().then(t=>/삭제 내역 0/.test(t)),true,'삭제 내역(추천 제외)은 건드리지 않는다');
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html');await page.locator('.sx-hiddenbar').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 assert.deepEqual(errors,[]);
 console.log('PASS marking hides at once with a notice; the mark filters still list hidden items; cart tab warns and keeps lines; mobile widths; no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
