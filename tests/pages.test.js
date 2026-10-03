// Integration checks use an isolated origin and synthetic records only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const C=require('../src/erp-core.js'),ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const fixture=()=>C.migrate({products:[{id:'CHECK-01',name:'연결 검증 상품',salesStatus:'판매 중',price:5000},{id:'CHECK-02',name:'준비 중 상품',salesStatus:'판매 준비'}],bankTransactions:[],finance:{},erp:{accounts:[{id:'main',name:'검증 통장'}],warehouses:['기본 창고']},preserveMe:{source:'old-browser-ledger'}});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1080}});const errors=[];
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const go=async url=>{await page.goto(ORIGIN+url);await page.locator('h1').waitFor();};
 await go('index.html');await page.screenshot({path:'/tmp/mumutori-studio-home.png',fullPage:true,animations:'disabled'});
 let modules=[];page.on('request',r=>{if(r.url().includes('/src/pages/'))modules.push(new URL(r.url()).pathname);});
 for(const id of ['finance','bank','products','purchases','sales','stock','partners','audit','settings']){
  modules=[];await go(id+'.html');assert.equal(await page.locator('body').getAttribute('data-page'),id);assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('data-view'),id);assert.equal(modules.length,1);assert(modules[0].endsWith('/'+id+'.js'));
  assert.equal(await page.locator('iframe').count(),0);assert(await page.locator('h1').isVisible());
  if(['finance','products','stock'].includes(id))await page.screenshot({path:'/tmp/mumutori-studio-'+id+'.png',fullPage:true,animations:'disabled'});
 }
 console.log('PASS all 10 direct pages; only selected page module loads; correct active navigation');
 // New pages must retain the previous storage key and unknown fields.
 await page.evaluate(d=>localStorage.setItem('mumutori-private-finance-v3',JSON.stringify(d)),fixture());
 await go('products.html?q=CHECK-01');assert.equal(await page.locator('.table tbody tr').count(),1);
 await page.locator('[data-action="edit"][data-id="CHECK-01"]').click();await page.locator('#f-name').fill('부서 공통 상품');await page.locator('#submit-record').click();await page.locator('[role="dialog"]').waitFor({state:'hidden'});
 await page.locator('.table-link').filter({hasText:'재고'}).click();await page.locator('h1').waitFor();assert(new URL(page.url()).pathname.endsWith('stock.html'));assert.equal(new URL(page.url()).searchParams.get('q'),'CHECK-01');assert((await page.locator('.table tbody').textContent()).includes('부서 공통 상품'));
 await page.goBack();await page.locator('h1').waitFor();assert(new URL(page.url()).pathname.endsWith('products.html'));assert((await page.locator('.table tbody').textContent()).includes('부서 공통 상품'));
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mumutori-private-finance-v3')));assert.equal(stored.preserveMe.source,'old-browser-ledger');
 console.log('PASS existing browser data preservation, product handoff query and browser back');
 // Two departments in different tabs see saves; an open draft cannot overwrite newer state.
 const second=await context.newPage();second.on('dialog',d=>d.accept());second.on('pageerror',e=>errors.push(e.message));await second.goto(ORIGIN+'products.html');await second.locator('h1').waitFor();
 await second.locator('[data-action="edit"][data-id="CHECK-01"]').click();await second.locator('#f-name').fill('보존할 초안');
 await page.locator('[data-action="edit"][data-id="CHECK-01"]').click();await page.locator('#f-price').fill('7700');await page.locator('#submit-record').click();await page.locator('[role="dialog"]').waitFor({state:'hidden'});
 await second.locator('#submit-record').click();assert.match(await second.locator('#form-error').textContent(),/다른 창/);assert.equal(await second.locator('#f-name').inputValue(),'보존할 초안');
 await second.locator('[data-action="modal-close"]').first().click();await second.reload();await second.locator('h1').waitFor();
 await second.locator('[data-action="edit"][data-id="CHECK-01"]').click();assert.equal(await second.locator('#f-price').inputValue(),'7700');await second.locator('[data-action="modal-close"]').first().click();
 await page.locator('[data-action="edit"][data-id="CHECK-01"]').click();await page.locator('#f-name').fill('탭 동기화 완료');await page.locator('#submit-record').click();await page.locator('[role="dialog"]').waitFor({state:'hidden'});await second.getByText('탭 동기화 완료',{exact:true}).waitFor();
 console.log('PASS cross-tab live updates and stale-draft overwrite protection');
 await second.close();
 await go('index.html#stock');await page.waitForURL('**/stock.html');await page.locator('h1').waitFor();console.log('PASS legacy hash bookmark redirects to real page');
 // Filtered tasks are reversible, and table rendering stays bounded at scale.
 const big=fixture();big.products=Array.from({length:1200},(_,i)=>({id:'PERF-'+String(i).padStart(4,'0'),name:'상품 '+i,salesStatus:'판매 중',active:true}));
 await page.evaluate(d=>localStorage.setItem('mumutori-private-finance-v3',JSON.stringify(d)),big);await go('products.html');assert.equal(await page.locator('.table tbody tr').count(),25);await page.locator('[data-action="page"][data-value="1"]').click();assert((await page.locator('.pager').textContent()).includes('26–50'));
 await go('stock.html?attention=uncounted');assert(await page.locator('.attention-note').isVisible());await page.locator('[data-action="attention-clear"]').click();assert(!new URL(page.url()).searchParams.has('attention'));
 console.log('PASS 1,200 products remain paginated at 25 rows and task filter can be cleared');
 await page.evaluate(()=>localStorage.clear());
 for(const width of [390,768]){
  await page.setViewportSize({width,height:844});
  for(const name of ['index','finance','products','purchases','sales','stock','bank','partners','audit','settings']){
   await go(name+'.html');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,`Page overflow at ${width}: ${name}`);
   if(width===390&&['index','products','finance'].includes(name))await page.screenshot({path:'/tmp/mumutori-studio-mobile-'+name+'.png',fullPage:true,animations:'disabled'});
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});await go('index.html');assert.equal(await page.locator('.mascot').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);console.log('PASS all pages at mobile/tablet sizes; reduced motion; no runtime errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
