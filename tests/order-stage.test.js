// 소싱 보드: 발주한 줄은 장바구니가 아니라 '발주 진행' 탭에 발주 묶음별로 보인다 — 화면만(장부 orders/<발주일>·cart/<줄>/orderStage 는 읽기만).
// 장바구니 줄 수·합계·예상 견적은 아직 발주하지 않은 줄만 센다. 발주한 옵션은 후보 카드에서 다시 담거나 고칠 수 없다.
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
 assert.deepEqual(O.orderLines({items:{'301~k':{name:MARK+'NAME',offerId:'301',spec:'甲',qty:'10',cost:MARK+'COST'},'302~z':{qty:-1},bad:'x'}}),[{id:'301~k',offerId:'301',spec:'甲',qty:10},{id:'302~z',offerId:'302',spec:'',qty:0}],'줄 번호·상품 번호·옵션 원문·수량만 읽는다');
 assert.deepEqual(O.orderLines(null),[]);
 console.log('PASS order-stage reading: labels, order, per-line stage with fallback, per-order counts, dates and lines, malformed data ignored');

 // 2) 화면
 const K=P.keyOfSpec,ALL={'접수':'2026-09-20','결제':'2026-09-21','창고 입고':'2026-09-24','출고':'2026-09-25','국내 도착':'2026-09-30','검수':'2026-10-02','상품 등록':'2026-10-05'};
 const item=(oid,pid,name,specs)=>({pid,cat:'시험',name,url:'https://detail.1688.com/offer/'+oid+'.html',img:'https://cbu01.alicdn.com/img/ibank/'+oid+'.jpg',priceMin:1,priceMax:1,moq:1,unit:'个',options:specs.map((x,i)=>({spec:x,ko:'옵션 '+x,price:1,img:'https://cbu01.alicdn.com/img/ibank/'+oid+'o'+i+'.jpg'})),rounds:{r9:true}});   // 옵션 사진이 있어야 후보로 보인다(사진 없는 옵션은 따로 검수 필요)
 const approve=(oid,it)=>({...it,review:{status:'approved',by:'SYNTHETIC TEST ONLY',at:'2026-10-08T10:00:00Z',snapshot:P.snapshot(oid,it),reviewedImages:[it.img,...it.options.map(o=>o.img)].filter(Boolean),reviewedOptions:it.options.map(o=>o.spec),
  classification:{category:'synthetic',use:'test display',age:'adult test fixture',materials:'test fabric',regime:'fixture only',rationale:'not a real product review'},
  checks:Object.fromEntries(['product','supplier','ip','regulatory'].map(k=>[k,{status:'supported',note:'synthetic evidence only',evidence:['https://example.test/evidence']}])),riskResolution:'synthetic fixture'}});
 const id=(offer,spec)=>offer+'~'+K(spec),A=id('301','甲'),B=id('301','乙'),C=id('302','丙'),D=id('303','丁'),E=id('303','戊'),F=id('302','己'),G=id('302','庚'),H=id('302','辛'),I=id('303','癸');
 const line=(lid,n,over)=>[lid,{offerId:lid.split('~')[0],img:'https://cbu01.alicdn.com/img/ibank/x.jpg',price:1,at:'2026-10-12T00:0'+n+':00Z',updatedAt:'2026-10-12T00:00:00Z',...over}];
 const raw={'301':item('301','A01','시험 인형',['甲','乙','壬']),'302':item('302','B01','시험 지갑',['丙','己','庚','辛']),'303':item('303','C01','시험 키링',['丁','戊','癸'])};   // 주소의 상품 번호가 장부 번호와 같아야 검수 통과로 인정된다
 const state={items:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,approve(k,v)])),
  cart:Object.fromEntries([line(A,1,{spec:'甲',qty:10,koBase:'✅ 10/12 발주 접수 · 빨강',ko:'✅ 10/12 발주 접수 · 빨강 ｜ 💰 옛 글',orderBatch:'20261012',orderStage:'접수',orderStages:{'접수':'2026-10-12'},orderedAt:'2026-10-12',unitCostKrw:MARK+'CART_COST',applyNo:MARK+'CART_APPLY'}),
   line(B,2,{spec:'乙',qty:20,koBase:'✅ 10/12 발주 접수 · 파랑',orderBatch:'20261012',orderStage:'접수',orderStages:{'접수':'2026-10-12'}}),
   line(C,3,{spec:'丙',qty:5,koBase:'✅ 10/12 발주 접수 · 노랑',orderBatch:'20261012',orderStage:'결제',orderStages:{'접수':'2026-10-12','결제':'2026-10-14'}}),
   line(D,4,{spec:'丁',qty:2,koBase:'초록'}),
   line(E,5,{spec:'戊',qty:3,koBase:'보라',orderBatch:'20260920',orderStage:'상품 등록',orderStages:ALL}),
   line(F,6,{spec:'己',qty:7,koBase:'하양',orderBatch:'20261012'}),
   line(G,7,{spec:'庚',qty:1,koBase:'검정',orderBatch:'20261012',orderStage:'보류(판매자 문의)',orderStages:{'접수':'2026-10-12'}}),
   line(I,8,{spec:'癸',qty:6,koBase:'주황',orderBatch:'20261001',orderStage:'검수',orderStages:{'검수':'2026-10-09'}}),
   line(H,9,{spec:'辛',qty:9,koBase:'다시 담은 것'})]),   // 10/12에 발주한 옵션(H)을 나중에 새로 담은 줄 — 발주 표시가 없으므로 장바구니에 남는다
  orders:{'20261012':{title:'10/12 발주 '+MARK+'TITLE',note:MARK+'NOTE',applyNo:MARK+'APPLY_NO',cost:{total:MARK+'COST_TOTAL'},by:MARK+'BY',stage:'접수',stages:{'접수':'2026-10-12'},lines:6,qty:47,
    stageOrder:['접수','결제','창고 입고','출고','국내 도착','검수','상품 등록'],
    items:{[A]:{name:MARK+'ITEM_NAME',offerId:'301',spec:'甲',qty:10,stage:'접수',stages:{'접수':'2026-10-12'},unitCostKrw:MARK+'UNIT_COST'},[B]:{offerId:'301',spec:'乙',qty:20,stage:'접수',stages:{'접수':'2026-10-12'}},
     [C]:{offerId:'302',spec:'丙',qty:5,stage:'결제',stages:{'접수':'2026-10-12','결제':'2026-10-14'}},[F]:{offerId:'302',spec:'己',qty:7,stage:'출고',stages:{'접수':'2026-10-12','결제':'2026-10-14','창고 입고':'2026-10-16','출고':'2026-10-17'}},
     [G]:{offerId:'302',spec:'庚',qty:1,stage:'보류(판매자 문의)',stages:{'접수':'2026-10-12'}},[H]:{name:MARK+'GONE_NAME',offerId:'302',spec:'辛',qty:4,stage:'접수',stages:{'접수':'2026-10-12'}}}},
   '20260920':{applyNo:MARK+'OLD_APPLY',items:{[E]:{offerId:'303',spec:'戊',qty:3,stage:'상품 등록',stages:ALL,paidKrw:MARK+'OLD_PAID'}}},broken:MARK+'BROKEN',empty:{stage:'접수',note:MARK+'EMPTY'}},
  marks:{'301':{like:true}},rounds:{r9:{title:'시험 회차',date:'2026-10-12',items:{'301':true,'302':true,'303':true}}},meta:{rate:200,fee:0.05,watcher:{version:P.POLICY_VERSION,at:new Date().toISOString()}}};
 assert.equal((JSON.stringify(state).match(/TEST_PRIVATE_/g)||[]).length,14,'표식 14개가 가짜 장부에 들어갔는지');
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
 const clean=x=>x.replace(/\s+/g,' ').trim(),chip=name=>page.locator(`.chip[data-id="${name}"]`);
 await page.goto(ORIGIN+'sourcing.html');await chip('cart').waitFor();
 // 탭 숫자: 장바구니는 아직 발주하지 않은 줄, 발주 진행은 발주한 줄
 assert.equal(clean(await chip('cart').textContent()),'장바구니 2');assert.equal(clean(await chip('orders').textContent()),'발주 진행 7');
 // 장바구니: 발주 전 줄만. 머리에 안내 한 줄. 합계·예상 견적도 그 줄만.
 await chip('cart').click();await page.locator('.sx-sentnote').waitFor();
 assert.deepEqual(await page.locator('input.sx-qty').evaluateAll(els=>els.map(e=>e.dataset.sxQty)),[D,H],'발주 표시가 없는 줄만 — 발주했던 옵션을 새로 담은 줄도 장바구니에 있다');
 assert.match(clean(await page.locator('.sx-sentnote').textContent()),/📦 발주로 넘어간 7줄은 발주 진행에서 보기 → 장바구니에는 아직 발주하지 않은 것만 남습니다/);
 assert.equal(await page.locator('.sx-orderbar,.sx-stage').count(),0,'장바구니에는 발주 묶음·단계 배지가 없다');
 assert.match(clean(await page.locator('.sx-total').textContent()),/상품 2줄 · 11개.*합계 ¥11 /);assert.match(clean(await page.locator('.sx-quote .sx-q-head').textContent()),/2줄 11개/);
 assert.doesNotMatch(await page.locator('.table').textContent(),/빨강|파랑|노랑|보라|하양|검정|주황/,'발주한 줄은 장바구니 표에 없다');
 // 안내의 버튼으로 발주 진행 탭으로
 await page.locator('.sx-sentnote [data-sx="tab"]').click();await page.locator('.sx-orderbar').first().waitFor();
 assert.equal(await page.locator('.chip.active[data-id="orders"]').count(),1);
 assert.deepEqual(await page.locator('.sx-orderbar').evaluateAll(els=>els.map(e=>e.dataset.order)),['20261012','20260920','loose'],'최근 발주가 앞, 묶음 기록이 없는 줄은 맨 뒤');
 const bar=page.locator('.sx-orderbar[data-order="20261012"]');
 assert.equal(clean(await bar.locator('.sx-order-head').textContent()),'📦 10/12 발주6줄 · 47개지금 단계 접수 3줄 · 결제 1줄 · 출고 1줄 · 보류(판매자 문의) 1줄발주한 줄 접기 ▴');
 assert.deepEqual((await bar.locator('.sx-order-steps li').allTextContents()).map(clean),['접수3줄10/12','결제1줄10/14','창고 입고0줄10/16','출고1줄10/17','국내 도착0줄—','검수0줄—','상품 등록0줄—','보류(판매자 문의)1줄—']);
 assert.deepEqual(await bar.locator('.sx-order-steps li').evaluateAll(els=>els.map(e=>e.className.trim())),['on','on','passed','on','','','','on']);
 // 묶음 안의 줄: 이름·옵션·수량·단계 배지. 고치는 칸·빼기 버튼은 없다. 장바구니에서 지워진 줄도 발주 기록으로 보인다.
 const rows=bar.locator('tbody tr');assert.equal(await rows.count(),6);
 const rowOf=name=>bar.locator('tbody tr',{hasText:name}).first();
 assert.match(clean(await rowOf('빨강').textContent()),/시험 인형빨강甲\s*10개\s*📦 10\/12 발주 · 접수 10\/12다음 결제/);assert.equal(await rowOf('빨강').locator('.sx-stage').getAttribute('title'),'접수 10/12');
 assert.match(clean(await rowOf('노랑').textContent()),/시험 지갑노랑丙\s*5개\s*📦 10\/12 발주 · 결제 10\/14다음 창고 입고/);
 assert.match(clean(await rowOf('하양').textContent()),/출고 10\/17다음 국내 도착/,'줄에 단계가 없으면 발주 묶음의 값');assert.match(clean(await rowOf('검정').textContent()),/보류\(판매자 문의\)/);
 assert.match(clean(await rowOf('辛').textContent()),/시험 지갑옵션 辛辛\s*4개\s*📦 10\/12 발주 · 접수 10\/12다음 결제/,'발주 기록의 값(4개·접수)으로 보인다 — 같은 옵션을 새로 담은 줄(9개)과 섞이지 않는다');assert.doesNotMatch(await bar.textContent(),/다시 담은 것/);
 assert.equal(await page.locator('input.sx-qty,[data-sx="remove"],.sx-tier').count(),0,'발주 진행에는 수량 칸·빼기·수량 구간 안내가 없다');
 // 지난 발주는 접혀 있고 펼칠 수 있다. 마지막 단계까지 끝난 발주는 표시가 다르다.
 const old=page.locator('.sx-orderbar[data-order="20260920"]');assert.match(await old.getAttribute('class'),/done/);
 assert.equal(clean(await old.locator('.sx-order-head').textContent()),'📦 9/20 발주1줄 · 3개지금 단계 상품 등록 10/5발주한 줄 1개 보기 ▾');assert.equal(await old.locator('tbody tr').count(),0);
 await old.locator('[data-sx="order-toggle"]').click();assert.equal(await old.locator('tbody tr').count(),1);assert.match(clean(await old.locator('tbody tr').textContent()),/시험 키링보라戊\s*3개\s*📦 9\/20 발주 · 상품 등록 10\/5/);assert.match(await old.locator('.sx-stage').getAttribute('class'),/done/);
 await bar.locator('[data-sx="order-toggle"]').click();assert.equal(await bar.locator('tbody tr').count(),0);assert.match(clean(await bar.locator('[data-sx="order-toggle"]').textContent()),/발주한 줄 6개 보기/);await bar.locator('[data-sx="order-toggle"]').click();assert.equal(await bar.locator('tbody tr').count(),6);
 const loose=page.locator('.sx-orderbar[data-order="loose"]');assert.equal(clean(await loose.locator('.sx-order-head').textContent()),'📦 발주 묶음 기록이 없는 줄1줄 · 6개');assert.match(clean(await loose.locator('tbody tr').textContent()),/시험 키링주황癸\s*6개\s*📦 10\/1 발주 · 검수 10\/9다음 상품 등록/);
 assert.match(clean(await page.locator('.sx-order-note').textContent()),/장바구니 합계와 예상 견적에 들어가지 않습니다.*원가·신청 번호는 이 화면에 표시하지 않습니다/);
 assert.doesNotMatch(await page.content(),/TEST_PRIVATE/,'장부에 섞인 원가·신청 번호·제목·메모·이름이 화면에 나오지 않는다');
 assert.equal(writes.length,0,'보기만 해서는 장부에 쓰지 않는다');
 console.log('PASS cart keeps only lines not yet ordered (count, total, estimate, notice); ordered lines show per order under the new tab with stages; private fields never render');

 // 3) 후보 카드: 이미 발주한 옵션은 다시 담거나 고칠 수 없고 상태만 보인다. 발주하지 않은 옵션은 그대로 담을 수 있다.
 await chip('items').click();const doll=page.locator('.sx-card',{hasText:'시험 인형'});await doll.locator('.sx-opt').first().waitFor();
 assert.equal(await doll.locator('.sx-opt').count(),3);assert.deepEqual((await doll.locator('.sx-sentopt').allTextContents()).map(clean),['📦 10/12 발주 · 접수 · 10개','📦 10/12 발주 · 접수 · 20개']);
 assert.equal(await doll.locator('.sx-opt input[type="number"]').count(),1,'발주하지 않은 옵션만 수량 칸이 있다');assert.equal(await doll.locator('[data-sx="add"]').count(),1);assert.equal(clean(await doll.locator('[data-sx="add"]').textContent()),'담기');
 assert.equal(clean(await doll.locator('.sx-in-sent').textContent()),'📦 발주 진행 2줄 · 30개');assert.equal(await page.locator('.sx-orderbar,.sx-stage').count(),0);
 assert.doesNotMatch(await page.content(),/TEST_PRIVATE/);
 // 주소로 바로 열기(?tab=orders), 견적 상세, 모바일
 await page.goto(ORIGIN+'sourcing.html?tab=orders');await page.locator('.sx-orderbar').first().waitFor();assert.equal(await page.locator('.chip.active[data-id="orders"]').count(),1);
 await page.locator('.sx-quote [data-sx="quote"]').click();assert.equal(await page.locator('.sx-q-item').count(),2,'견적 상세에도 발주 전 줄만');assert.doesNotMatch(await page.content(),/TEST_PRIVATE/);
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html?tab=orders');await page.locator('.sx-orderbar').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);assert.ok(await page.locator('.sx-order-steps li').first().evaluate(e=>e.getBoundingClientRect().width>=60),'단계 칸이 읽을 수 있는 너비 '+width);
  await chip('cart').click();await page.locator('.sx-sentnote').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'cart: no horizontal page scroll at '+width);}
 assert.deepEqual(errors,[]);assert.equal(writes.length,0);
 console.log('PASS candidate cards lock ordered options; deep link, estimate detail and mobile widths; no runtime errors, nothing written');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
