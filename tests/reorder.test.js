// '재발주 준비' 탭(소싱 화면) — 가짜 Firebase 응답과 합성 자료만 쓴다. 화면은 읽기만 하는지(쓰기 0건)도 확인한다.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const prep=()=>({asOf:'2026-10-12T08:59',updatedAt:'2026-10-12T10:30:00+09:00',by:'SYNTHETIC TEST ONLY',
 windows:{d30:'9/12~10/11',d60:'8/13~10/11',d90:'7/14~10/11'},rule:'필요량 = 하루 판매량 × 63일 − 쿠팡 창고 재고.',
 limits:['시험용 한계 한 줄'],sources:['시험용 출처 한 줄'],
 rows:[{id:'a',name:'시험 감자 지갑',offer:'111',unit:'개',coupang:{d7:14,d30:30,d60:null,d90:null,stock:20,returnStock:2,soldout:false,hist:'그 전 4주 10개'},
   smartstore:{d30:0,d60:1,d90:2,regStock:'5'},own:{d30:0,d60:0,d90:1,regStock:'3'},rec:[{ko:'기본',qty:40}],recTotal:40,weak:false,urgent:true,
   urgentText:'최근 7일 속도면 10/23쯤 품절 — 오늘 발주해도 도착은 11/2쯤',runout:'10/23~11/3',recHigh:100,basis:'하루 1.0개 × 63일 = 63개 − 쿠팡 재고 22개 → 41개'},
  {id:'b',name:'시험 말랑이',offer:'999',unit:'세트',coupang:{d7:0,d30:0,d60:0,d90:4,stock:0,returnStock:1,soldout:true,hist:'품절 전 닷새 3세트'},
   smartstore:{d30:0,d60:3,d90:33,regStock:'—'},own:{d30:0,d60:0,d90:0,regStock:'—'},rec:[{ko:'기본색',qty:20},{ko:'진한색',qty:20}],recTotal:40,weak:true,urgent:false,runout:'품절 중',basis:'품절 전 속도로 계산',
   note:'반품 재판매분(위 쿠팡 수량과 따로): 60일 1세트 · 90일 1세트'},
  {id:'c',name:'시험 품절 키링',offer:'998',unit:'세트',coupang:{d7:0,d30:0,d60:null,d90:null,stock:0,returnStock:0,soldout:true,hist:'자료 없음'},
   smartstore:{d30:0,d60:0,d90:0,regStock:'—'},own:{d30:0,d60:0,d90:0,regStock:'—'},rec:[{ko:'기본',qty:10}],recTotal:10,weak:true,urgent:false,runout:'품절 중',basis:'품절 전 속도로 계산'}],
 excluded:[{group:'최근 판매가 없음',items:[{name:'시험 연필꽂이',why:'30일 판매 0'},{name:'시험 손수건',why:'판매중지'}]}]});
const tree=withPrep=>({items:{'111':{pid:'R09',cat:'재발주',name:'시험 감자 지갑',url:'https://detail.1688.com/offer/111.html',img:'https://cbu01.alicdn.com/img/ibank/a.jpg',priceMin:2.9,priceMax:2.9,moq:1,unit:'개',options:[{spec:'基本',ko:'기본',price:2.9}],rounds:{r9:true}}},
 rounds:{r9:{title:'시험 회차',date:'2026-10-12',items:{'111':true}}},meta:{rate:200,fee:0.05,...(withPrep?{reorderPrep:prep()}:{})}});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[],writes=[];let withPrep=true;
 await context.addInitScript(()=>{window.__MMT_TEST_AUTH__={};});
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 await context.route('https://cbu01.alicdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
 await context.route('https://apis.google.com/**',route=>route.abort());
 await context.route(DB+'**',route=>{const r=route.request();
  if(r.method()==='GET'){
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:tree(withPrep)})}\n\n`});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(tree(withPrep))});
  }
  writes.push({method:r.method(),url:r.url()});return route.fulfill({status:200,contentType:'application/json',body:r.postData()||'null'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(ORIGIN+'sourcing.html?tab=reorder');await page.locator('.rp-table').waitFor();
 assert.equal(await page.locator('.chip.active[data-id="reorder"]').count(),1,'?tab=reorder opens the tab');
 assert.match(await page.locator('.chip[data-id="reorder"]').textContent(),/재발주 준비 3/);
 assert.equal(await page.locator('.rp-row').count(),3);assert.equal(await page.locator('.rp-row.rp-urgent').count(),1);
 const first=page.locator('.rp-row').first();
 assert.match(await first.textContent(),/시험 감자 지갑/);assert.match(await first.textContent(),/R09 · ¥2\.9 · 최소 1개/,'ledger price and minimum quantity are joined by offer id');
 assert.match(await first.locator('.rp-rec').textContent(),/40\s*기본/);assert.match(await first.textContent(),/급함/);
 assert.equal(await first.locator('.rp-na').count(),2,'Coupang 60/90-day cells show a dash until that data is read');
 assert.match(await page.locator('.rp-basis').first().textContent(),/10\/23쯤 품절/);assert.match(await page.locator('.rp-basis').first().textContent(),/최근 속도가 이어지면 100개/);
 const second=page.locator('.rp-row').nth(1);assert.match(await second.textContent(),/품절/);assert.match(await second.textContent(),/근거 약함/);
 assert.equal(await page.locator('.rp-table .rp-na').count(),4);   // 60·90일을 아직 못 읽은 두 상품(첫째·셋째)만 '—'
 // 품절 상품의 쿠팡 수량에는 '재고 있던 기간 기준' 표시. 판매 중인 상품과, 60·90일 자료가 아직 없는 품절 상품에는 붙지 않는다.
 assert.equal(await first.locator('.rp-stocked').count(),0);assert.match(await second.locator('.rp-stocked').textContent(),/재고 있던 기간 기준/);assert.match(await second.locator('td.num').first().textContent(),/0 · 0 · 0 · 4/);
 assert.equal(await page.locator('.rp-row').nth(2).locator('.rp-stocked').count(),0);assert.equal(await page.locator('.rp-stocked').count(),1);
 // 반품 재판매분은 쿠팡 수량에 섞이지 않고 근거 줄에 따로 나온다. 표 아래에 기준을 적어 둔다.
 assert.match(await page.locator('.rp-basis').nth(1).textContent(),/반품 재판매분\(위 쿠팡 수량과 따로\): 60일 1세트 · 90일 1세트/);assert.match(await second.textContent(),/\+반품 재판매 1/);
 assert.match(await page.locator('.rp-foot').textContent(),/쿠팡 수량은 새상품 기준/);assert.match(await page.locator('.rp-foot').textContent(),/재고가 있던 기간에만 팔린 값/);
 assert.match(await page.locator('.rp-top').textContent(),/판매 중인 상품 3개 재발주 준비/);assert.match(await page.locator('.rp-top').textContent(),/급한 것 1개/);
 await page.locator('.rp-excluded summary').first().click();assert.match(await page.locator('.rp-excluded').first().textContent(),/시험 연필꽂이/);
 assert.equal(await page.locator('.sx-noimg.rp-img').count(),2,'products missing from the ledger still render');
 console.log('PASS reorder tab renders channel sales, Coupang stock, recommended quantities, urgency and the excluded list from the ledger');

 await page.locator('.rp-top [data-sx="tab"][data-id="items"]').click();assert.equal(await page.locator('.chip.active[data-id="items"]').count(),1);
 assert.equal(writes.length,0,'viewing the reorder tab writes nothing to the ledger');
 console.log('PASS the tab is read-only and its button returns to the candidates tab');

 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html?tab=reorder');await page.locator('.rp-table').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 withPrep=false;await page.setViewportSize({width:1440,height:1000});await page.goto(ORIGIN+'sourcing.html?tab=reorder');await page.locator('.empty').waitFor();
 assert.match(await page.locator('.empty').first().textContent(),/재발주 준비 자료가 아직 없습니다/);assert.match(await page.locator('.chip[data-id="reorder"]').textContent(),/재발주 준비 0/);
 const purchases=await context.newPage();purchases.on('pageerror',e=>errors.push(e.message));await purchases.goto(ORIGIN+'purchases.html');await purchases.locator('.pagehead').waitFor();
 assert.equal(await purchases.locator('a[href="sourcing.html?tab=reorder"]').count(),1,'purchases page links to the reorder tab');
 assert.doesNotMatch(await purchases.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/firebase/,'purchases page CSP is unchanged');
 assert.deepEqual(errors,[]);
 console.log('PASS mobile widths, empty state, purchases link, unchanged CSP, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
