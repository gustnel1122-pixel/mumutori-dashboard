// Sourcing board checks with a mocked Firebase REST/EventSource endpoint and synthetic records only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
let remoteCart=null; // 다른 기기에서 담은 줄(실시간 patch로 들어옴)
const fixture=()=>({
 items:{'111':{pid:'D01',cat:'친구들',name:'멍한 오리',url:'https://detail.1688.com/offer/111.html',img:'https://cbu01.alicdn.com/img/ibank/a.jpg',priceMin:3.5,priceMax:4,moq:20,unit:'个',weightG:40,freight:4,options:[{spec:'黄色>20cm',ko:'노랑 20cm',price:3.5,img:'https://cbu01.alicdn.com/img/ibank/b.jpg',weightG:40},{spec:'白色>30cm',ko:'흰색 30cm',price:4},{spec:'黄色>平口圆形【9*9*邦高10把高23】',ko:'노랑 원형',price:4,img:'https://cbu01.alicdn.com/img/ibank/b.jpg'}],sizeImgs:[{url:'https://cbu01.alicdn.com/img/ibank/size.jpg',cap:'크기 안내 시험'}],rounds:{r9:true},shop:{company:'시험 공장',years:'7',repeat:'40%'}},
        '222':{pid:'B01',cat:'바구니',name:'리본 바구니',url:'https://detail.1688.com/offer/222.html',img:'https://cbu01.alicdn.com/img/ibank/c.jpg',options:[{spec:'圆形',ko:'원형',price:5.8}],rounds:{r9:true},warn:'확인 필요'}},
 marks:{'222':{design:true,note:'무늬가 별로'}},
 rounds:{r9:{title:'9차 시험',date:'2026-10-07',note:'시험 회차',items:{'111':true,'222':true}}},
 sets:{r9_S1:{name:'시험 세트',round:'r9',parts:[{offerId:'111',spec:'黄色>20cm',qty:2},{offerId:'222',spec:'圆形',qty:1}]}},
 taste:{t1:{kind:'avoid',text:'얼굴 붙인 음식',active:true,source:'시험'}},
 meta:{rate:200,fee:0.05}
});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1080}});const errors=[],writes=[];
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 await context.route('https://cbu01.alicdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:PIXEL}));
 await context.route(DB+'**',route=>{const r=route.request(),u=new URL(r.url());
  if(r.method()==='GET'){
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:fixture()})}\n\n`+(remoteCart?`event: patch\ndata: ${JSON.stringify({path:'/cart',data:remoteCart})}\n\n`:'')});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture())});
  }
  writes.push({method:r.method(),path:u.pathname.replace('/sourcing/','').replace(/\.json$/,''),body:r.postData()?JSON.parse(r.postData()):null});
  return route.fulfill({status:200,contentType:'application/json',body:r.postData()||'null'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(ORIGIN+'sourcing.html');await page.locator('.sx-card').first().waitFor();
 assert.equal(await page.locator('.sx-card').count(),2);
 assert.equal(await page.locator('.nav-item.active').getAttribute('data-view'),'sourcing');
 assert.match(await page.locator('.sx-card.bad').textContent(),/리본 바구니/);
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.match(csp,/firebasedatabase\.app/);
 assert.equal(await page.locator('.sx-img img').first().getAttribute('referrerpolicy'),'no-referrer');
 assert.equal(await page.locator('.sx-quote').count(),0,'no estimate bar while cart is empty');
 console.log('PASS sourcing board renders Firebase records, marks and page-only CSP');

 const duck=page.locator('.sx-card',{hasText:'멍한 오리'});
 await duck.locator('[data-k="like"]').click();
 await page.waitForFunction(()=>document.querySelector('.sx-card.like'));
 let w=writes.find(x=>x.path==='marks/111');assert.equal(w.method,'PATCH');assert.equal(w.body.like,true);assert.equal(w.body.design,false);
 await duck.locator('.sx-note').fill('표정 좋아');await duck.locator('.sx-note').press('Tab');
 await page.waitForFunction(()=>true);assert.ok(writes.some(x=>x.path==='marks/111'&&x.body.note==='표정 좋아'));
 // 옵션 줄: 1688 원래 옵션명 + 복사, 옵션 사진 없으면 '대표 사진' 표시, 1688 대조 링크
 const optRow=page.locator('.sx-card.like .sx-opt');
 assert.match(await optRow.nth(0).locator('.sx-spec').textContent(),/黄色>20cm/);
 assert.equal(await optRow.nth(0).locator('.sx-optfb').count(),0);
 assert.equal(await optRow.nth(1).locator('.sx-optfb').count(),1);
 assert.match(await optRow.nth(1).textContent(),/옵션 사진 없음 · 대표 사진/);
 assert.match(await page.locator('.sx-card.like .sx-optlink').getAttribute('href'),/offer\/111\.html/);
 assert.match(await page.locator('.sx-card.like .sx-link').textContent(),/1688에서 보기/);
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://mumutori.test'});
 await optRow.nth(1).locator('[data-sx="copy"]').click();
 await page.locator('#toast:not([hidden])').waitFor();
 assert.match(await page.locator('#toast').textContent(),/복사했습니다/);
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'白色>30cm');
 console.log('PASS option rows show 1688 option name with copy, mark missing option photos, link to 1688');

 // 사진 크게 보기: 옵션 사진(원본 주소·옵션명) → Esc, 대표 사진 옵션 → × 버튼, 카드 대표 사진(키보드 Enter) → 배경 클릭
 const lb=page.locator('.sx-lightbox');
 await optRow.nth(0).locator('[data-sx="zoom"]').click();await lb.waitFor();
 assert.equal(await lb.locator('img').getAttribute('src'),'https://cbu01.alicdn.com/img/ibank/b.jpg');
 assert.equal(await lb.locator('img').getAttribute('referrerpolicy'),'no-referrer');
 assert.match(await lb.locator('figcaption').textContent(),/노랑 20cm[\s\S]*黄色>20cm/);
 assert.equal(await lb.locator('.badge.red').count(),0);
 await page.keyboard.press('Escape');assert.equal(await lb.count(),0);
 await optRow.nth(1).locator('[data-sx="zoom"]').click();await lb.waitFor();
 assert.match(await lb.locator('figcaption').textContent(),/옵션 사진 없음 · 대표 사진[\s\S]*흰색 30cm[\s\S]*白色>30cm/);
 assert.equal(await lb.locator('img').getAttribute('src'),'https://cbu01.alicdn.com/img/ibank/a.jpg');
 await lb.locator('.sx-lb-close').click();assert.equal(await lb.count(),0);
 await duck.locator('.sx-zoom.sx-img').focus();await page.keyboard.press('Enter');await lb.waitFor();
 assert.match(await lb.locator('figcaption').textContent(),/멍한 오리/);
 await page.mouse.click(5,5);assert.equal(await lb.count(),0);
 await page.locator('.sx-set .sx-part [data-sx="zoom"]').first().click();await lb.waitFor();
 assert.match(await lb.locator('figcaption').textContent(),/멍한 오리 · 노랑 20cm/);
 await page.keyboard.press('Escape');assert.equal(await lb.count(),0);
 console.log('PASS photos open large (original URL, option names, 대표 사진 badge) and close by Esc, × and backdrop');

 // 같은 사진 옵션 표시 + 1688 옵션명에서 뽑은 치수·모양 + 크기·모양 안내 이미지
 assert.match(await optRow.nth(0).locator('.sx-same').textContent(),/같은 사진 2개/);
 assert.match(await optRow.nth(2).locator('.sx-same').textContent(),/같은 사진 2개/);
 assert.equal(await optRow.nth(1).locator('.sx-same').count(),0);
 assert.equal(await duck.locator('.sx-samehint').count(),1);
 assert.match(await optRow.nth(0).locator('.sx-dims').textContent(),/20cm/);
 assert.match(await optRow.nth(2).locator('.sx-dims').textContent(),/평평한 원형[\s\S]*9×9 · 몸통 높이 10 · 손잡이까지 23/);
 assert.match(await duck.locator('.sx-sizebtn').textContent(),/크기·모양 안내 보기/);
 await duck.locator('.sx-sizebtn').click();await lb.waitFor();
 assert.equal(await lb.locator('img').getAttribute('src'),'https://cbu01.alicdn.com/img/ibank/size.jpg');
 assert.match(await lb.locator('figcaption').textContent(),/크기 안내 시험/);
 await page.keyboard.press('Escape');assert.equal(await lb.count(),0);
 console.log('PASS same-photo options are labelled, sizes/shapes read from 1688 names, size guide opens large');
 await page.locator('.sx-card.like .sx-opt input').first().fill('12');
 await page.locator('.sx-card.like .sx-opt button[data-sx="add"]').first().click();
 w=writes.find(x=>x.method==='PUT'&&x.path.startsWith('cart/111~'));assert.equal(w.body.qty,12);assert.equal(w.body.spec,'黄色>20cm');assert.equal(w.body.price,3.5);
 console.log('PASS 💗 mark, note and option quantity are written to shared ledger');

 // 실시간 예상 견적 줄: 담자마자 후보 탭 아래에 뜸. 12개×¥3.5 + 판매자 배송비 ¥4, 수수료 5%, 환율 200 → 구매 ¥48.3 ≈ 9,660원
 // 무게 40g×12=0.48kg ×1.1 + 상자 0.5kg = 1.03kg → 1.5kg: 기본 9,630 + 통관 19,500 + 상자·CJ 6,900 + 원산지 720 = 36,750원 → 합계 46,410원
 const bar=page.locator('.sx-quote');
 await bar.waitFor();
 let qt=await bar.locator('.sx-q-head').textContent();
 assert.match(qt,/예상 견적/);assert.match(qt,/1줄 12개/);assert.match(qt,/¥48\.3 ≈ 9,660원/);assert.match(qt,/국제배송 ≈ 36,750원/);assert.match(qt,/1\.5kg/);assert.match(qt,/합계 ≈ 46,410원/);
 assert.match(await bar.locator('.sx-q-warns').textContent(),/최소 주문 미달 — 멍한 오리 12\/20개/);
 assert.doesNotMatch(await bar.textContent(),/무게 모름/);
 assert.equal(await bar.locator('.sx-q-head').getAttribute('aria-expanded'),'false');
 await bar.locator('.sx-q-head').click();await bar.locator('.sx-q-detail').waitFor();
 assert.equal(await bar.locator('.sx-q-head').getAttribute('aria-expanded'),'true');
 const det=await bar.locator('.sx-q-detail').textContent();
 assert.match(det,/시험 공장[\s\S]*멍한 오리 · 노랑 20cm[\s\S]*12개 × ¥3\.5[\s\S]*¥42[\s\S]*판매자 배송비[\s\S]*¥4/);
 assert.match(det,/구매대행 수수료 5%[\s\S]*¥2\.3/);assert.match(det,/9,630원/);assert.match(det,/19,500원/);assert.match(det,/6,900원/);assert.match(det,/720원/);
 assert.match(det,/멍한 오리: 최소 주문 20개인데 12개/);assert.match(det,/관부가세 별도/);assert.match(det,/모든 숫자는 예상/);
 await bar.locator('.sx-q-head').click();assert.equal(await bar.locator('.sx-q-detail').count(),0);
 console.log('PASS estimate bar appears on add: goods, seller freight, 5% fee, weight-based shipping, MOQ warning, detail toggle');

 await page.locator('[data-sx="tab"][data-id="cart"]').click();
 assert.equal(await page.locator('.sx-qty').inputValue(),'12');
 assert.match(await page.locator('tbody .sx-spec').first().textContent(),/黄色>20cm/);
 await page.locator('tbody [data-sx="zoom"]').first().click();await page.locator('.sx-lightbox').waitFor();
 assert.match(await page.locator('.sx-lightbox figcaption').textContent(),/멍한 오리 · 노랑 20cm/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.sx-lightbox').count(),0);
 assert.match(await page.locator('.sx-total').textContent(),/¥42/);
 assert.match(await page.locator('.sx-total').textContent(),/8,820원/); // 42 × 200 × 1.05
 // 수량 25로 바꾸면 바로 다시 계산: (87.5+4)×1.05×200=19,215원 · 1kg×1.1+0.5=1.6→2kg: 11,450+19,500+6,900+1,500=39,350원 → 58,565원
 await page.locator('.sx-qty').fill('25');await page.locator('.sx-qty').press('Tab');
 await page.waitForFunction(()=>/1줄 25개/.test(document.querySelector('.sx-q-head')?.textContent||''));
 qt=await page.locator('.sx-q-head').textContent();
 assert.match(qt,/≈ 19,215원/);assert.match(qt,/국제배송 ≈ 39,350원/);assert.match(qt,/\(2kg\)/);assert.match(qt,/합계 ≈ 58,565원/);
 assert.equal(await page.locator('.sx-q-warns').count(),0,'MOQ warning clears at 25');
 assert.ok(writes.some(x=>x.method==='PATCH'&&x.path.startsWith('cart/111~')&&x.body.qty===25));
 await page.locator('[data-sx="request"]').click();
 assert.ok(writes.some(x=>x.method==='PUT'&&x.path.startsWith('requests/')&&x.body.status==='요청'));
 await page.locator('[data-sx="tab"][data-id="taste"]').click();
 await page.locator('.sx-addrule input[name="text"]').fill('반짝이 소재 빼기');await page.locator('.sx-addrule button').click();
 assert.ok(writes.some(x=>x.method==='PUT'&&x.path.startsWith('taste/')&&x.body.text==='반짝이 소재 빼기'));
 assert.match(await page.locator('.sx-thumbs').nth(1).textContent(),/리본 바구니/);
 assert.equal(await page.locator('.sx-quote').count(),1,'estimate bar on taste tab too');
 await page.locator('.sx-q-head').click();await page.locator('.sx-q-cart').click();
 assert.equal(await page.locator('.chip.active[data-id="cart"]').count(),1,'estimate detail button goes to cart tab');
 await page.locator('[data-sx="remove"]').first().click();
 await page.waitForFunction(()=>!document.querySelector('.sx-quote'));
 console.log('PASS cart totals, order request and taste rules');

 const other=await context.newPage();await other.goto(ORIGIN+'purchases.html');await other.locator('.pagehead').waitFor();
 assert.doesNotMatch(await other.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/firebase/);
 assert.ok(await other.locator('.handoff-strip a[href="sourcing.html"]').count());
 await other.close();
 remoteCart={'111~a':{offerId:'111',spec:'黄色>20cm',ko:'노랑 20cm',price:3.5,qty:12,weightG:40,at:'2026-10-08T01:00:00Z'},'222~b':{offerId:'222',spec:'圆形',ko:'원형',price:5.8,qty:3,at:'2026-10-08T01:01:00Z'}};
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html');await page.locator('.sx-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal scroll at '+width);
  // 다른 기기에서 담은 줄이 실시간(patch)으로 들어와도 견적 줄이 다시 계산되고, 무게 모르는 품목을 알린다
  await page.locator('.sx-quote').waitFor();assert.match(await page.locator('.sx-q-head').textContent(),/2줄 15개/);
  await page.waitForFunction(()=>document.querySelector('.content').getAnimations().every(a=>a.playState==='finished')); // 화면 등장 효과(7px)가 끝난 뒤 잰다
  assert.match(await page.locator('.sx-q-warns').textContent(),/무게 모름 1개 — 배송비 더 나올 수 있음/);
  let qb=await page.locator('.sx-quote').boundingBox();
  assert.ok(qb.x>=0&&qb.x+qb.width<=width+1&&qb.y+qb.height<=901&&qb.height<=(width<500?190:120),'estimate bar compact and on screen at '+width+' '+JSON.stringify(qb));
  await page.locator('.sx-q-head').click();await page.locator('.sx-q-detail').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal scroll with open estimate at '+width);
  qb=await page.locator('.sx-quote').boundingBox();assert.ok(qb.y>=0&&qb.y+qb.height<=901,'open estimate fits screen at '+width+' '+JSON.stringify(qb));
  await page.locator('.sx-q-head').click();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const [lastBottom,barTop]=await page.evaluate(()=>{const q=document.querySelector('.sx-quote');return [q.previousElementSibling.getBoundingClientRect().bottom,q.getBoundingClientRect().top];});
  assert.ok(lastBottom<=barTop+1,'estimate bar does not cover the last content at page bottom at '+width);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('.sx-card .sx-zoom.sx-img').first().click();const fig=await page.locator('.sx-lightbox figure').boundingBox();
  assert.ok(fig.x>=0&&fig.y>=0&&fig.x+fig.width<=width+1&&fig.y+fig.height<=901,'large photo fits screen at '+width);
  const close=await page.locator('.sx-lb-close').boundingBox();assert.ok(close.x>=0&&close.x+close.width<=width+1&&close.y>=0,'close button visible at '+width);
  await page.keyboard.press('Escape');}
 assert.deepEqual(errors,[]);
 console.log('PASS other pages keep strict CSP, purchases links to sourcing, mobile widths, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
