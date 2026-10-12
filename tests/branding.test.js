// '브랜딩 도구' 화면 — 공개해도 되는 자료만 보이는지, 증거 없는 상태(주문 완료·사용 중)가 없는지, 비공개 자료가 섞이지 않았는지 확인한다.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
(async()=>{
 // 1) 소스 검사: 공개 저장소에 넣지 않기로 한 것이 자료·화면 코드에 없는지
 const src=['src/branding-data.js','src/pages/branding.js'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
 for(const [what,re] of [['드라이브·문서 링크',/drive\.google|docs\.google|\/file\/d\/|\/folders\//i],['개인 경로',/[A-Za-z]:\\\\?Users|\/Users\/|H:\\\\|내 드라이브/],['주문번호 값',/number:\s*['"][^'"]+['"]/],['인증 정보',/password|token|secret|apiKey/i]])
  assert.doesNotMatch(src,re,'공개 파일에 '+what+'가 없어야 한다');
 const D=await import('file://'+path.join(ROOT,'src/branding-data.js').replace(/\\/g,'/'));
 assert.equal(D.ITEMS.filter(i=>['ordered','inuse'].includes(i.status)).length,0,'주문·사용 증거가 없으므로 주문 완료·사용 중 품목이 없어야 한다');
 const by=Object.fromEntries(D.ITEMS.map(i=>[i.id,i]));
 assert.equal(by['STAMP-PAPER-01'].status,'recommended');assert.equal(by['INK-PAPER-01'].status,'recommended');
 assert.equal(by['STAMP-OPP-01'].status,'candidate');assert.equal(by['INK-OPP-01'].status,'candidate');
 assert.equal(by['STAMP-PAPER-01'].price.total,32000);assert.equal(by['STAMP-OPP-01'].price.total,48000);assert.equal(by['INK-PAPER-01'].price.total,2000);
 for(const it of D.ITEMS){assert.equal(it.order.date,null,it.id+' 발주일은 확인 전');assert.equal(it.order.number,null);assert.equal(it.order.sampleTest,null);
  if(it.price)assert.equal(it.price.lines.reduce((a,[,v])=>a+v,0),it.price.total,it.id+' 금액 합계');
  if(it.url)assert.match(it.url,/^https:\/\/gogostamp\.com\//,it.id+' 판매처 공개 상품 주소만');}
 assert.ok(D.DONT.some(t=>/110/.test(t)&&/속건|비닐/.test(t)&&/권하지 않/.test(t)),'110에 속건 잉크를 넣는 방식은 비추천으로 표시');
 console.log('PASS data file holds only public reorder facts; no order/in-use status, private links, paths or order numbers');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[],outside=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://mumutori.test'){outside.push(u.href);return route.abort();}
  const name=u.pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);
  return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 let modules=[];page.on('request',r=>{if(r.url().includes('/src/pages/'))modules.push(new URL(r.url()).pathname);});
 await page.goto(ORIGIN+'branding.html');await page.locator('.br-card').first().waitFor();
 assert.equal(await page.locator('body').getAttribute('data-page'),'branding');assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('data-view'),'branding');
 assert.equal(modules.length,1);assert(modules[0].endsWith('/branding.js'));
 assert.equal(await page.locator('.br-card').count(),D.ITEMS.length);assert.equal(await page.locator('.br-table tbody tr').count(),D.ITEMS.length);
 assert.equal(await page.locator('.br-card.br-ordered,.br-card.br-inuse').count(),0);
 const paper=page.locator('#STAMP-PAPER-01');assert.match(await paper.textContent(),/권고/);assert.match(await paper.textContent(),/남은 확인/);
 await paper.locator('summary').click();const grid=await paper.locator('.br-grid').textContent();
 assert.match(grid,/고고스탬프/);assert.match(grid,/최대 72×46mm/);assert.match(grid,/32,000원/);assert.match(grid,/34,000원 예상/);assert.match(grid,/발주일\s*확인 전/);assert.match(grid,/주문번호\s*확인 전/);assert.match(grid,/판매자 확인 전/);
 const a=paper.locator('.br-grid a');assert.equal(await a.getAttribute('rel'),'noopener noreferrer');assert.equal(await a.getAttribute('target'),'_blank');
 assert.match(await page.locator('#STAMP-OPP-01').textContent(),/후보/);assert.match(await page.locator('#INK-OPP-01').textContent(),/확인 전에는 414에 넣지 않습니다/);
 const html=await page.content();assert.doesNotMatch(html,/drive\.google|docs\.google/i);
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.doesNotMatch(csp,/firebase|googleapis|apis\.google/);assert.match(csp,/frame-src 'none'/);
 assert.deepEqual(outside,[],'화면이 바깥 주소로 요청을 보내지 않는다');
 console.log('PASS branding page renders every item with status, reorder facts and blanks for unconfirmed fields; strict CSP, no outside requests');

 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.goto(ORIGIN+'branding.html');await page.locator('.br-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 assert.deepEqual(errors,[]);console.log('PASS mobile widths and no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
