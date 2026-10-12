// 소싱 장바구니: 줄마다 발주 단계 배지, 위쪽에 발주별 단계 요약 — 화면만(장부 orders/<발주일>·cart/<줄>/orderStage 는 읽기만).
// 원가·신청 번호처럼 공개하면 안 되는 값이 장부에 섞여 있어도 화면에 나오지 않는지 표식으로 확인한다.
// 가짜 Firebase 응답과 합성 자료만 쓴다.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const url=f=>require('node:url').pathToFileURL(path.join(ROOT,f)).href;
const MARK='TEST_PRIVATE_';
(async()=>{
 // 1) 읽기 규칙만(브라우저 없이)
 const O=await import(url('src/sourcing-orders.js')),P=await import(url('src/sourcing-policy.js'));
 assert.deepEqual(O.ORDER_STAGES,['접수','결제','창고 입고','출고','국내 도착','검수','상품 등록']);
 assert.equal(O.md('2026-10-12'),'10/12');assert.equal(O.md('2026-10-05T09:00:00+09:00'),'10/5');assert.equal(O.md('곧'),'');assert.equal(O.batchLabel('20261012'),'10/12 발주');assert.equal(O.batchLabel('x'),'발주');
 assert.deepEqual(O.stageOrder({stageOrder:['가','나','다']}),['가','나','다']);assert.deepEqual(O.stageOrder({stageOrder:['가','가']}),O.ORDER_STAGES,'겹치는 순서는 믿지 않는다');assert.deepEqual(O.stageOrder(null),O.ORDER_STAGES);
 assert.equal(O.lineStage({id:'a'},{}),null);assert.equal(O.lineStage({id:'a',orderBatch:'20261012'},{'20261012':{items:{}}}),null);
 let s=O.lineStage({id:'a',orderBatch:'20261012',orderStage:'결제',orderStages:{'접수':'2026-10-12','결제':'2026-10-14'}},{});
 assert.deepEqual(s,{batch:'20261012',label:'10/12 발주',stage:'결제',date:'10/14',index:1,next:'창고 입고',done:false,history:[['접수','10/12'],['결제','10/14']]});
 s=O.lineStage({id:'f',orderBatch:'20261012'},{'20261012':{items:{f:{stage:'출고',stages:{'출고':'2026-10-17'}}}}});assert.equal(s.stage,'출고');assert.equal(s.next,'국내 도착','줄에 없으면 발주 묶음의 값을 읽는다');
 s=O.lineStage({id:'z',orderStage:'상품 등록',orderStages:{'상품 등록':'2026-11-01'}},{});assert.equal(s.done,true);assert.equal(s.next,'');
 s=O.lineStage({id:'z',orderStage:'보류',orderStages:{}},{});assert.equal(s.index,-1);assert.equal(s.next,'');assert.equal(s.date,'');
 const sum=O.orderSummaries({'20260920':{items:{e:{stage:'상품 등록',qty:3}}},'20261012':{items:{a:{stage:'접수',qty:10,stages:{'접수':'2026-10-12'}},c:{stage:'결제',qty:'5',stages:{'접수':'2026-10-11','결제':'2026-10-14'}},x:{qty:1},bad:'x'}},broken:'x',empty:{stage:'접수'}});
 assert.deepEqual(sum.map(o=>o.key),['20261012','20260920'],'최근 발주가 앞, 줄 묶음이 없는 것은 뺀다');assert.equal(sum[0].lines,3);assert.equal(sum[0].qty,16);assert.equal(sum[0].done,false);assert.equal(sum[1].done,true);
 assert.deepEqual(sum[0].steps.filter(x=>x.count||x.date),[{stage:'접수',count:1,date:'10/12',known:true},{stage:'결제',count:1,date:'10/14',known:true},{stage:'단계 미기록',count:1,date:'',known:false}]);
 assert.deepEqual(O.orderSummaries(null),[]);assert.deepEqual(O.orderSummaries('x'),[]);
 console.log('PASS order-stage reading: labels, order, per-line stage with fallback, per-order counts and dates, malformed data ignored');

 // 2) 화면
 const K=P.keyOfSpec,ALL={'접수':'2026-09-20','결제':'2026-09-21','창고 입고':'2026-09-24','출고':'2026-09-25','국내 도착':'2026-09-30','검수':'2026-10-02','상품 등록':'2026-10-05'};
 const item=(pid,name,specs)=>({pid,cat:'시험',name,url:'https://detail.1688.com/offer/'+pid+'.html',img:'https://cbu01.alicdn.com/img/ibank/'+pid+'.jpg',priceMin:1,priceMax:1,moq:1,unit:'个',options:specs.map(x=>({spec:x,ko:x,price:1}))});
 const id=(offer,spec)=>offer+'~'+K(spec),A=id('301','甲'),B=id('301','乙'),C=id('302','丙'),D=id('303','丁'),E=id('303','戊'),F=id('302','己'),G=id('302','庚');
 const line=(lid,n,over)=>[lid,{offerId:lid.split('~')[0],img:'https://cbu01.alicdn.com/img/ibank/x.jpg',price:1,at:'2026-10-12T00:0'+n+':00Z',updatedAt:'2026-10-12T00:00:00Z',...over}];
 const state={items:{'301':item('A01','시험 인형',['甲','乙']),'302':item('B01','시험 지갑',['丙','己','庚']),'303':item('C01','시험 키링',['丁','戊'])},
  cart:Object.fromEntries([line(A,1,{spec:'甲',qty:10,koBase:'✅ 10/12 발주 접수 · 빨강',ko:'✅ 10/12 발주 접수 · 빨강 ｜ 💰 옛 글',orderBatch:'20261012',orderStage:'접수',orderStages:{'접수':'2026-10-12'},orderedAt:'2026-10-12',unitCostKrw:MARK+'CART_COST',applyNo:MARK+'CART_APPLY'}),
   line(B,2,{spec:'乙',qty:20,koBase:'✅ 10/12 발주 접수 · 파랑',orderBatch:'20261012',orderStage:'접수',orderStages:{'접수':'2026-10-12'}}),
   line(C,3,{spec:'丙',qty:5,koBase:'✅ 10/12 발주 접수 · 노랑',orderBatch:'20261012',orderStage:'결제',orderStages:{'접수':'2026-10-12','결제':'2026-10-14'}}),
   line(D,4,{spec:'丁',qty:2,koBase:'✅ 10/12 발주 접수 · 초록'}),
   line(E,5,{spec:'戊',qty:3,koBase:'보라',orderBatch:'20260920',orderStage:'상품 등록',orderStages:ALL}),
   line(F,6,{spec:'己',qty:7,koBase:'하양',orderBatch:'20261012'}),
   line(G,7,{spec:'庚',qty:1,koBase:'검정',orderBatch:'20261012',orderStage:'보류(판매자 문의)',orderStages:{'접수':'2026-10-12'}})]),
  orders:{'20261012':{title:'10/12 발주 '+MARK+'TITLE',note:MARK+'NOTE',applyNo:MARK+'APPLY_NO',cost:{total:MARK+'COST_TOTAL'},by:MARK+'BY',stage:'접수',stages:{'접수':'2026-10-12'},lines:5,qty:43,
    stageOrder:['접수','결제','창고 입고','출고','국내 도착','검수','상품 등록'],
    items:{[A]:{name:MARK+'ITEM_NAME',offerId:'301',spec:'甲',qty:10,stage:'접수',stages:{'접수':'2026-10-12'},unitCostKrw:MARK+'UNIT_COST'},[B]:{qty:20,stage:'접수',stages:{'접수':'2026-10-12'}},
     [C]:{qty:5,stage:'결제',stages:{'접수':'2026-10-12','결제':'2026-10-14'}},[F]:{qty:7,stage:'출고',stages:{'접수':'2026-10-12','결제':'2026-10-14','창고 입고':'2026-10-16','출고':'2026-10-17'}},
     [G]:{qty:1,stage:'보류(판매자 문의)',stages:{'접수':'2026-10-12'}}}},
   '20260920':{applyNo:MARK+'OLD_APPLY',items:{[E]:{qty:3,stage:'상품 등록',stages:ALL,paidKrw:MARK+'OLD_PAID'}}},broken:MARK+'BROKEN',empty:{stage:'접수',note:MARK+'EMPTY'}},
  marks:{},meta:{rate:200,fee:0.05,watcher:{version:P.POLICY_VERSION,at:new Date().toISOString()}}};
 assert.equal((JSON.stringify(state).match(/TEST_PRIVATE_/g)||[]).length,13,'표식 13개가 가짜 장부에 들어갔는지');
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[],writes=[];
 await context.addInitScript(()=>{window.__MMT_TEST_AUTH__={};});
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 await context.route('https://cbu01.alicdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
 await context.route('https://apis.google.com/**',route=>route.abort());
 await context.route(DB+'**',route=>{const r=route.request();
  if(r.method()==='GET'){
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:state})}\n\n`});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
  }
  writes.push({method:r.method(),url:r.url()});return route.fulfill({status:200,contentType:'application/json',body:r.postData()||'null'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const clean=x=>x.replace(/\s+/g,' ').trim(),row=lid=>page.locator('tr',{has:page.locator(`input.sx-qty[data-sx-qty="${lid}"]`)});
 await page.goto(ORIGIN+'sourcing.html');await page.locator('.chip[data-id="cart"]').click();await page.locator('.sx-orderbar').first().waitFor();
 // 위쪽 요약: 발주별(최근이 앞) 단계마다 지금 그 단계에 있는 줄 수와 날짜
 assert.deepEqual(await page.locator('.sx-orderbar').evaluateAll(els=>els.map(e=>e.dataset.order)),['20261012','20260920']);
 const bar=page.locator('.sx-orderbar[data-order="20261012"]');assert.equal(clean(await bar.locator('.sx-order-head').textContent()),'📦 10/12 발주5줄 · 43개');
 assert.deepEqual((await bar.locator('.sx-order-steps li').allTextContents()).map(clean),['접수2줄10/12','결제1줄10/14','창고 입고0줄10/16','출고1줄10/17','국내 도착0줄—','검수0줄—','상품 등록0줄—','보류(판매자 문의)1줄—']);
 assert.deepEqual(await bar.locator('.sx-order-steps li').evaluateAll(els=>els.map(e=>e.className.trim())),['on','on','passed','on','','','','on']);
 const old=page.locator('.sx-orderbar[data-order="20260920"]');assert.match(await old.getAttribute('class'),/done/);assert.equal(clean(await old.locator('.sx-order-head').textContent()),'📦 9/20 발주1줄 · 3개');
 assert.equal(clean(await old.locator('.sx-order-steps li').last().textContent()),'상품 등록1줄10/5');assert.equal(await old.locator('.sx-order-steps li.passed').count(),6);
 assert.match(clean(await page.locator('.sx-order-note').textContent()),/장바구니 1줄은 아직 발주에 들어가지 않았습니다\. .*원가·신청 번호는 이 화면에 표시하지 않습니다/);
 // 줄마다 배지: 발주·지금 단계·날짜·다음 단계. 이름 앞의 '✅ … 발주 접수 ·' 글은 배지가 있으면 이름에서 빠진다
 assert.equal(await page.locator('input.sx-qty').count(),7);assert.equal(await page.locator('.sx-stage').count(),6);
 assert.equal(clean(await row(A).locator('.sx-stage').textContent()),'📦 10/12 발주 · 접수 10/12다음 결제');assert.equal(await row(A).locator('.sx-stage').getAttribute('title'),'접수 10/12');
 assert.equal(clean(await row(A).locator('td.maincell > span.sub').first().textContent()),'빨강');
 assert.equal(clean(await row(C).locator('.sx-stage').textContent()),'📦 10/12 발주 · 결제 10/14다음 창고 입고');assert.equal(await row(C).locator('.sx-stage').getAttribute('title'),'접수 10/12 → 결제 10/14');
 assert.equal(await row(D).locator('.sx-stage').count(),0);assert.equal(clean(await row(D).locator('td.maincell > span.sub').first().textContent()),'✅ 10/12 발주 접수 · 초록','단계 자료가 없는 줄의 이름은 그대로 둔다');
 assert.equal(clean(await row(E).locator('.sx-stage').textContent()),'📦 9/20 발주 · 상품 등록 10/5');assert.match(await row(E).locator('.sx-stage').getAttribute('class'),/done/);
 assert.equal(clean(await row(F).locator('.sx-stage').textContent()),'📦 10/12 발주 · 출고 10/17다음 국내 도착','줄에 단계가 없으면 발주 묶음의 값');
 assert.equal(clean(await row(G).locator('.sx-stage').textContent()),'📦 10/12 발주 · 보류(판매자 문의)');
 // 공개하면 안 되는 값은 어디에도 나오지 않는다(HTML 전체·속성 포함)
 assert.doesNotMatch(await page.content(),/TEST_PRIVATE/,'장부에 섞인 원가·신청 번호·제목·메모가 화면에 나오지 않는다');
 assert.equal(writes.length,0,'보기만 해서는 장부에 쓰지 않는다');
 console.log('PASS cart shows a per-order stage summary and a stage badge on every ordered line; private fields in the ledger never render');

 // 3) 다른 탭·견적·모바일
 assert.match(await page.locator('.sx-quote').textContent(),/예상 견적/);
 await page.locator('.chip[data-id="items"]').click();assert.equal(await page.locator('.sx-orderbar,.sx-stage').count(),0,'후보 탭에는 나오지 않는다');
 await page.locator('.sx-quote [data-sx="quote"]').click();assert.doesNotMatch(await page.content(),/TEST_PRIVATE/);
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html');await page.locator('.chip[data-id="cart"]').click();await page.locator('.sx-orderbar').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);assert.ok(await page.locator('.sx-order-steps li').first().evaluate(e=>e.getBoundingClientRect().width>=60),'단계 칸이 읽을 수 있는 너비 '+width);}
 assert.deepEqual(errors,[]);assert.equal(writes.length,0);
 console.log('PASS other tabs unchanged, mobile widths, no runtime errors, nothing written');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
