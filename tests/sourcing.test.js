// Sourcing board checks with a mocked Firebase REST/EventSource endpoint and synthetic records only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const fixture=()=>({
 items:{'111':{pid:'D01',cat:'친구들',name:'멍한 오리',url:'https://detail.1688.com/offer/111.html',img:'https://cbu01.alicdn.com/img/ibank/a.jpg',priceMin:3.5,priceMax:4,moq:1,unit:'个',weightG:40,options:[{spec:'黄色>20cm',ko:'노랑 20cm',price:3.5,img:'https://cbu01.alicdn.com/img/ibank/b.jpg',weightG:40},{spec:'白色>30cm',ko:'흰색 30cm',price:4}],rounds:{r9:true},shop:{years:'7',repeat:'40%'}},
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
   if((r.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`event: put\ndata: ${JSON.stringify({path:'/',data:fixture()})}\n\n`});
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
 await page.locator('.sx-card.like .sx-opt input').first().fill('12');
 await page.locator('.sx-card.like .sx-opt button[data-sx="add"]').first().click();
 w=writes.find(x=>x.method==='PUT'&&x.path.startsWith('cart/111~'));assert.equal(w.body.qty,12);assert.equal(w.body.spec,'黄色>20cm');assert.equal(w.body.price,3.5);
 console.log('PASS 💗 mark, note and option quantity are written to shared ledger');

 await page.locator('[data-sx="tab"][data-id="cart"]').click();
 assert.equal(await page.locator('.sx-qty').inputValue(),'12');
 assert.match(await page.locator('tbody .sx-spec').first().textContent(),/黄色>20cm/);
 await page.locator('tbody [data-sx="zoom"]').first().click();await page.locator('.sx-lightbox').waitFor();
 assert.match(await page.locator('.sx-lightbox figcaption').textContent(),/멍한 오리 · 노랑 20cm/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.sx-lightbox').count(),0);
 assert.match(await page.locator('.sx-total').textContent(),/¥42/);
 assert.match(await page.locator('.sx-total').textContent(),/8,820원/); // 42 × 200 × 1.05
 await page.locator('[data-sx="request"]').click();
 assert.ok(writes.some(x=>x.method==='PUT'&&x.path.startsWith('requests/')&&x.body.status==='요청'));
 await page.locator('[data-sx="tab"][data-id="taste"]').click();
 await page.locator('.sx-addrule input[name="text"]').fill('반짝이 소재 빼기');await page.locator('.sx-addrule button').click();
 assert.ok(writes.some(x=>x.method==='PUT'&&x.path.startsWith('taste/')&&x.body.text==='반짝이 소재 빼기'));
 assert.match(await page.locator('.sx-thumbs').nth(1).textContent(),/리본 바구니/);
 console.log('PASS cart totals, order request and taste rules');

 const other=await context.newPage();await other.goto(ORIGIN+'purchases.html');await other.locator('.pagehead').waitFor();
 assert.doesNotMatch(await other.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/firebase/);
 assert.ok(await other.locator('.handoff-strip a[href="sourcing.html"]').count());
 await other.close();
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html');await page.locator('.sx-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal scroll at '+width);
  await page.locator('.sx-card .sx-zoom.sx-img').first().click();const fig=await page.locator('.sx-lightbox figure').boundingBox();
  assert.ok(fig.x>=0&&fig.y>=0&&fig.x+fig.width<=width+1&&fig.y+fig.height<=901,'large photo fits screen at '+width);
  const close=await page.locator('.sx-lb-close').boundingBox();assert.ok(close.x>=0&&close.x+close.width<=width+1&&close.y>=0,'close button visible at '+width);
  await page.keyboard.press('Escape');}
 assert.deepEqual(errors,[]);
 console.log('PASS other pages keep strict CSP, purchases links to sourcing, mobile widths, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
