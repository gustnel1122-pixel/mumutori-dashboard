// 소싱 장바구니: 줄마다 수량 구간·행사가 표시와 '몇 개 더 사면' 계산 — 화면만(가격 자료 items/<상품>/priceInfo 는 읽기만).
// 수량 칸에 입력하는 즉시(저장 전) 다시 계산되고, 저장은 예전처럼 칸을 벗어날 때 수량 한 칸만 간다.
// 가짜 Firebase 응답과 합성 자료만 쓴다.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const url=f=>require('node:url').pathToFileURL(path.join(ROOT,f)).href;
(async()=>{
 // 1) 계산만(브라우저 없이)
 const T=await import(url('src/sourcing-tiers.js')),P=await import(url('src/sourcing-policy.js'));
 const goose={mode:'tier',tiers:[{min:200,price:0.43},{min:2,price:0.53},{min:50,price:0.48}]};   // 순서가 섞여 와도
 assert.deepEqual(T.tiersOf(goose).map(t=>t.min),[2,50,200]);assert.deepEqual(T.tiersOf({tiers:{0:{min:1,price:2},1:{min:10,price:1.5}}}).length,2,'Firebase가 묶음으로 돌려줘도 읽는다');
 assert.deepEqual([0,1,2].map(i=>T.tierLabel(T.tiersOf(goose),i)),['2~49개','50~199개','200개~']);
 let p=T.tierPlan(goose,100);assert.equal(p.kind,'tier');assert.equal(p.current.price,0.48);assert.equal(p.next.min,200);assert.equal(p.more,100);assert.equal(p.diff,38);assert.equal(p.keepMin,50);
 p=T.tierPlan(goose,50);assert.equal(p.current.price,0.48);assert.equal(p.keepMin,undefined,'구간의 첫 수량이면 더 줄일 수 없다');
 p=T.tierPlan(goose,199);assert.equal(p.more,1);assert.equal(p.diff,-9.52,'199×0.48=95.52 → 200×0.43=86: 1개 더 사면 총액이 내려간다');
 p=T.tierPlan(goose,200);assert.equal(p.current.price,0.43);assert.equal(p.next,null);assert.equal(p.diff,undefined);
 p=T.tierPlan(goose,1);assert.equal(p.below,true);assert.equal(p.need,1);assert.equal(T.unitAt(goose,'x',1),null);
 assert.equal(T.tierPlan({mode:'fixed',tiers:[{min:2,price:18.5}]},5).kind,'fixed');assert.equal(T.tierPlan({mode:'tier',tiers:[{min:1,price:2},{min:10,price:2}]},5).kind,'fixed','단가가 하나뿐이면 구간이 아니다');
 assert.equal(T.tierPlan(null,5).kind,'fixed');assert.equal(T.tierPlan({mode:'tier',tiers:'x'},5).kind,'fixed');
 const yamInfo={mode:'fixed',options:{k:{list:1,price:1,promo:0.5}},promo:{has:true,limit:5}};
 assert.deepEqual(T.promoOf(yamInfo,'k',50),{kind:'limited',promo:0.5,limit:5,regular:1,within:false});assert.equal(T.promoOf(yamInfo,'k',5).within,true);assert.equal(T.promoOf(yamInfo,'none',5),null);
 assert.deepEqual(T.promoOf({options:{k:{list:0.35,price:0.14,promo:0.14}},promo:{has:true,limit:-1}},'k',10),{kind:'sale',price:0.14,list:0.35});
 assert.equal(T.promoOf({options:{k:{list:17.5,price:17.5}},promo:{has:true,limit:-1}},'k',5),null,'정가와 같으면 행사가가 아니다');
 assert.equal(T.unitAt(yamInfo,'k',50),1);assert.equal(T.unitAt(goose,'x',120),0.48);assert.equal(T.unitAt({mode:'fixed',options:{}},'k',5),null);
 console.log('PASS tier math: ordering, labels, next-tier difference (including cheaper totals), minimum, fixed and promo cases');

 // 2) 화면
 const K=P.keyOfSpec,line=(offerId,spec,over)=>[offerId+'~'+K(spec),{offerId,spec,ko:(over.koBase||spec)+' ｜ 💰 옛 안내 글',img:'https://cbu01.alicdn.com/img/ibank/x.jpg',at:'2026-10-12T00:0'+over.n+':00Z',updatedAt:'2026-10-12T00:00:00Z',...over}];
 const item=(pid,name,specs,priceInfo)=>({pid,cat:'시험',name,url:'https://detail.1688.com/offer/'+pid+'.html',img:'https://cbu01.alicdn.com/img/ibank/'+pid+'.jpg',priceMin:1,priceMax:1,moq:1,unit:'个',options:specs.map(s=>({spec:s,ko:s,price:1})),...(priceInfo?{priceInfo}:{})});
 const build=()=>({items:{
   '201':item('G01','시험 거위 키링',['鹅A','鹅B','鹅C'],{mode:'tier',cartQty:100,tiers:[{min:2,price:0.53},{min:50,price:0.48},{min:200,price:0.43}],next:{at:200,more:100,verdict:'비추천'},options:{[K('鹅A')]:{stock:9},[K('鹅B')]:{stock:9},[K('鹅C')]:{stock:9}},promo:{has:false,limit:-1},readAt:'2026-10-12T10:48:20'}),
   '202':item('W01','시험 감자 지갑',['土豆'],{mode:'tier',cartQty:300,tiers:[{min:1,price:3.2},{min:10,price:2.9},{min:150,price:2.7}],options:{[K('土豆')]:{stock:9}},promo:{has:false,limit:-1}}),
   '203':item('C01','시험 뚱한 소',['牛45'],{mode:'fixed',cartQty:5,options:{[K('牛45')]:{list:17.5,price:17.5}},promo:{has:true,limit:-1}}),
   '204':item('Y01','시험 군고구마',['红薯'],{mode:'fixed',cartQty:50,options:{[K('红薯')]:{list:1,price:1,promo:0.5}},promo:{has:true,limit:5}}),
   '205':item('S01','시험 스티커',['贴纸'],{mode:'fixed',cartQty:100,options:{[K('贴纸')]:{list:0.35,price:0.14,promo:0.14}},promo:{has:true,limit:-1}}),
   '206':item('N01','시험 메모만 있는 상품',['备注']),'207':item('N02','시험 자료 없는 상품',['无'])},
  cart:Object.fromEntries([line('201','鹅A',{qty:40,price:0.48,koBase:'베레모 거위',n:1}),line('201','鹅B',{qty:30,price:0.48,koBase:'물방울 거위',n:2}),line('201','鹅C',{qty:30,price:0.48,koBase:'선글라스 거위',n:3}),
   line('202','土豆',{qty:300,price:2.7,koBase:'해피 감자',n:4}),line('203','牛45',{qty:5,price:17.5,koBase:'45cm',n:5}),line('204','红薯',{qty:50,price:1,koBase:'체인 없는 원판',n:6}),
   line('205','贴纸',{qty:100,price:0.14,koBase:'투명 스티커',n:7}),line('206','备注',{qty:3,price:2,koBase:'메모 옵션',tierNote:'소싱 담당이 적어 둔 안내',n:8}),line('207','无',{qty:2,price:2,koBase:'자료 없는 옵션',n:9})]),
  marks:{},meta:{rate:200,fee:0.05,watcher:{version:P.POLICY_VERSION,at:new Date().toISOString()}}});
 let state=build();
 const setAt=(tree,p,v)=>{const keys=p.split('/').filter(Boolean);let o=tree;for(const k of keys.slice(0,-1)){o[k]=o[k]&&typeof o[k]==='object'?o[k]:{};o=o[k];}if(v===null)delete o[keys.at(-1)];else o[keys.at(-1)]=v;};
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
 const id=(offer,spec)=>offer+'~'+K(spec),box=lid=>page.locator(`.sx-tier[data-line="${lid}"]`),qty=lid=>page.locator(`input.sx-qty[data-sx-qty="${lid}"]`);
 const text=async lid=>(await box(lid).textContent()).replace(/\s+/g,' ').trim();
 await page.goto(ORIGIN+'sourcing.html');await page.locator('.chip[data-id="cart"]').click();await page.locator('.sx-tier').first().waitFor();
 assert.equal(await page.locator('.sx-qty').count(),9);assert.equal(await page.locator('.sx-tier').count(),8,'자료도 메모도 없는 줄에는 칸이 없다');
 const gA=id('201','鹅A'),gB=id('201','鹅B'),gC=id('201','鹅C'),potato=id('202','土豆'),cow=id('203','牛45'),yam=id('204','红薯'),sticker=id('205','贴纸'),memo=id('206','备注');
 // 구간이 있는 판매글: 구간 표시, 지금 구간 강조, 몇 개 더 사면, 줄여도 되는 수량, 소싱 담당 의견
 for(const g of [gA,gB,gC]){
  assert.deepEqual((await box(g).locator('.sx-tier-chip').allTextContents()).map(s=>s.trim()),['2~49개 ¥0.53','50~199개 ¥0.48','200개~ ¥0.43']);assert.equal((await box(g).locator('.sx-tier-chip.on').textContent()).trim(),'50~199개 ¥0.48');
  const t=await text(g);assert.match(t,/이 판매글 3줄 합계 100개 → 개당 ¥0\.48/);assert.match(t,/100개 더 사면\(합계 200개\) 개당 ¥0\.48 → ¥0\.43 · 총액 \+¥38 ≈ \+7,980원/);
  assert.match(t,/소싱 담당 의견: 비추천/);assert.match(t,/50개까지 줄여도 개당 ¥0\.48 그대로 · 49개 이하면 ¥0\.53/);assert.match(t,/1688 가격 확인 10\. 12\./);assert.doesNotMatch(t,/저장 전|이 수량이면/);}
 let t=await text(potato);assert.match(t,/지금 300개 → 개당 ¥2\.7 · 가장 싼 구간입니다/);assert.match(t,/150개까지 줄여도 개당 ¥2\.7 그대로 · 149개 이하면 ¥2\.9/);assert.equal(await box(potato).locator('.sx-tier-next').count(),0);
 // 고정 단가 / 수량 한도가 있는 행사가 / 한도 없는 행사가 / 소싱 담당 메모만 있는 줄
 assert.match(await text(cow),/수량 할인 없음 · 몇 개를 사도 개당 ¥17\.5/);assert.match(await box(cow).getAttribute('class'),/sx-tier-flat/);
 t=await text(yam);assert.match(t,/행사가 ¥0\.5는 5개까지만 — 지금 50개는 정가 ¥1\. 수량 할인은 없습니다/);assert.doesNotMatch(await box(yam).getAttribute('class'),/sx-tier-flat/);
 assert.match(await text(sticker),/지금은 행사가 ¥0\.14 \(정가 ¥0\.35\) — 행사가 끝나면 오릅니다/);
 assert.match(await text(memo),/소싱 담당이 적어 둔 안내/);
 // 옵션 이름은 원래 이름으로(안내 글이 이름 뒤에 붙지 않는다)
 const rowText=await page.locator('tr',{has:qty(gA)}).textContent();assert.match(rowText,/베레모 거위/);assert.doesNotMatch(await page.locator('.table').textContent(),/옛 안내 글/);
 assert.equal(writes.length,0,'보기만 해서는 장부에 쓰지 않는다');
 console.log('PASS every cart line shows its tiers, current tier, next-tier difference, fixed/promo notes and the original option name');

 // 3) 수량을 입력하는 즉시(저장 전) 다시 계산 — 같은 판매글의 다른 줄까지
 await qty(gA).fill('140');
 for(const g of [gA,gB,gC]){const s=await text(g);assert.equal((await box(g).locator('.sx-tier-chip.on').textContent()).trim(),'200개~ ¥0.43');assert.match(s,/이 판매글 3줄 합계 200개 → 개당 ¥0\.43 · 가장 싼 구간입니다 입력한 수량 기준 · 저장 전/);
  assert.match(s,/이 수량이면 개당 ¥0\.43인데 장바구니에는 ¥0\.48로 적혀 있어요/);assert.doesNotMatch(s,/줄여도/,'합계가 구간의 첫 수량이면 더 줄일 수 없다');assert.doesNotMatch(s,/소싱 담당 의견/);}
 const rowA=page.locator('tr',{has:qty(gA)});assert.equal((await rowA.locator('[data-sx-sub]').textContent()).trim(),'¥67.2');assert.equal((await rowA.locator('[data-sx-krw]').textContent()).trim(),'14,112원');
 assert.match(await text(potato),/지금 300개/,'다른 판매글은 그대로');
 await qty(gA).fill('139');assert.match(await text(gB),/합계 199개 → 개당 ¥0\.48/);assert.match(await text(gB),/1개 더 사면\(합계 200개\) 개당 ¥0\.48 → ¥0\.43 · 총액 −¥9\.52 ≈ −1,999원 — 더 사는 쪽이 총액도 쌉니다/);assert.equal(await box(gB).locator('.sx-tier-next.good').count(),1);
 await qty(gA).fill('');assert.match(await text(gA),/합계 100개 → 개당 ¥0\.48/);assert.doesNotMatch(await text(gA),/저장 전/,'칸을 비우면 저장된 수량 기준으로 돌아간다');
 await qty(gA).fill('40');
 await qty(potato).fill('149');t=await text(potato);assert.equal((await box(potato).locator('.sx-tier-chip.on').textContent()).trim(),'10~149개 ¥2.9');
 assert.match(t,/지금 149개 → 개당 ¥2\.9 입력한 수량 기준 · 저장 전/);assert.match(t,/1개 더 사면\(합계 150개\) 개당 ¥2\.9 → ¥2\.7 · 총액 −¥27\.1 ≈ −5,691원 — 더 사는 쪽이 총액도 쌉니다/);assert.match(t,/이 수량이면 개당 ¥2\.9인데 장바구니에는 ¥2\.7로 적혀 있어요/);
 await qty(potato).fill('300');assert.doesNotMatch(await text(potato),/저장 전/);
 await qty(yam).fill('5');assert.match(await text(yam),/지금 5개는 행사가 대상일 수 있어요\(소싱 담당 확인 필요\)/);assert.match(await text(yam),/저장 전/);await qty(yam).fill('50');
 assert.equal(writes.length,0,'입력하는 동안에는 아무것도 저장하지 않는다(원래 수량으로 되돌린 칸은 벗어나도 저장되지 않는다)');
 // 칸을 벗어나면 예전처럼 수량 한 칸만 저장된다 — 단가·가격 자료는 건드리지 않는다.
 // 그 저장으로 화면이 다시 그려져도, 그사이 입력 중인 다른 줄의 '입력한 수량 기준' 계산은 유지된다.
 await qty(potato).fill('150');await qty(gA).fill('140');
 await page.waitForFunction(lid=>{const b=document.querySelector(`.sx-tier[data-line="${lid}"]`);return b&&/지금 150개/.test(b.textContent)&&!b.querySelector('em');},potato);
 assert.equal(writes.length,1,JSON.stringify(writes));assert.equal(writes[0].method,'PATCH');assert.equal(writes[0].path,'cart/'+potato);assert.deepEqual(Object.keys(writes[0].body).sort(),['qty','updatedAt']);assert.equal(writes[0].body.qty,150);
 t=await text(potato);assert.match(t,/지금 150개 → 개당 ¥2\.7 · 가장 싼 구간입니다/);assert.doesNotMatch(t,/저장 전|줄여도|이 수량이면/);
 assert.equal(await qty(gA).inputValue(),'140');for(const g of [gA,gB,gC])assert.match(await text(g),/합계 200개 → 개당 ¥0\.43 · 가장 싼 구간입니다 입력한 수량 기준 · 저장 전/,'다시 그려진 뒤에도 입력 중인 수량 기준');
 await page.waitForTimeout(150);assert.equal(writes.length,1,'화면이 다시 그려졌다고 입력 중인 수량이 저절로 저장되지 않는다: '+JSON.stringify(writes));
 // 다시 그려진 칸이라도 벗어나면 저장된다. 구간이 바뀌었는데 장바구니 단가는 그대로라는 안내가 남는다(단가는 소싱 담당이 맞춘다).
 await qty(gA).press('Tab');await page.waitForFunction(()=>!document.querySelector('.sx-tier em'));
 assert.equal(writes.length,2,JSON.stringify(writes));assert.equal(writes[1].path,'cart/'+gA);assert.deepEqual(Object.keys(writes[1].body).sort(),['qty','updatedAt']);assert.equal(writes[1].body.qty,140);
 for(const g of [gA,gB,gC]){const s=await text(g);assert.match(s,/합계 200개 → 개당 ¥0\.43 · 가장 싼 구간입니다/);assert.match(s,/이 수량이면 개당 ¥0\.43인데 장바구니에는 ¥0\.48로 적혀 있어요/);assert.doesNotMatch(s,/저장 전/);}
 // 고쳤다가 원래 수량으로 되돌린 칸, 0 이하를 넣은 칸은 저장하지 않는다
 await qty(gB).fill('31');await qty(gB).fill('30');await qty(gB).press('Tab');await qty(gC).fill('0');await qty(gC).press('Tab');await page.waitForTimeout(150);
 assert.equal(writes.length,2,JSON.stringify(writes));assert.match(await page.locator('#toast').textContent(),/수량을 1개 이상/);assert.equal(state.cart[gC].qty,30);
 assert.ok(!writes.some(w=>/^items|priceInfo|price/.test(w.path)||'price' in (w.body||{})||'tierNote' in (w.body||{})),'가격 자료·단가·안내 글에는 쓰지 않는다');
 assert.deepEqual(state.items['202'].priceInfo.tiers.length,3);assert.equal(state.cart[potato].price,2.7);assert.equal(state.cart[gA].price,0.48);
 console.log('PASS typing recalculates at once for every line of the same listing (nothing saved); a redraw keeps the typed quantity without saving it; leaving the field saves the quantity only');

 // 4) 견적 줄·다른 탭은 그대로, 모바일 폭
 assert.match(await page.locator('.sx-quote').textContent(),/예상 견적/);
 await page.locator('.chip[data-id="items"]').click();assert.equal(await page.locator('.sx-tier').count(),0,'후보 탭에는 나오지 않는다');
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'sourcing.html');await page.locator('.chip[data-id="cart"]').click();await page.locator('.sx-tier').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.match(csp,/connect-src 'self' https:\/\/mumutori-letter-default-rtdb/);
 assert.deepEqual(errors,[]);assert.equal(writes.length,2);
 console.log('PASS other tabs unchanged, mobile widths, no runtime errors, only the two quantity saves the user made');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
