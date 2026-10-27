const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='https://mumutori.test/mumutori-dashboard/';
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'src/project-progress.json')));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://mumutori.test/**',route=>{const name=new URL(route.request().url()).pathname.replace('/mumutori-dashboard/','')||'index.html',file=path.join(ROOT,name),ext=path.extname(file);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
 for(const width of [1440,768,390,360]){
  await page.setViewportSize({width,height:1000});await page.goto(ORIGIN);await page.locator('#pg-title').waitFor();
  assert.equal(await page.locator('[data-progress-row]').count(),11);
  assert.equal(await page.locator('.pg-step').count(),55);
  assert.equal(await page.locator('.pg-includes').count(),11);
  assert.equal(await page.locator('#progress details,#progress summary,#progress [aria-expanded],#progress .pg-detail,#progress [data-action]').count(),0);
  assert.equal(await page.locator('#projects .ops-project-card').count(),11);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width}`);
  assert((await page.locator('.pg-milestone-head').textContent()).includes('11/10까지의 일정'));
  assert((await page.locator('.pg-previous').textContent()).includes('이전 일정'));
  const first=page.locator('[data-progress-row]').first(),before=await first.textContent();await first.click();assert.equal(await first.textContent(),before);assert.equal(await first.getAttribute('open'),null);
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.PROGRESS_CAPTURE_DIR){fs.mkdirSync(process.env.PROGRESS_CAPTURE_DIR,{recursive:true});await page.locator('#progress').screenshot({path:path.join(process.env.PROGRESS_CAPTURE_DIR,`home-projects-${width}.png`)});}
  await page.locator('[data-pg-filter="waiting"]').click();assert.equal(await page.locator('[data-progress-row]:visible').count(),2);
  await page.locator('[data-pg-filter="all"]').click();await page.locator('[data-pg-search]').fill('소싱');assert.equal(await page.locator('[data-progress-row]:visible').count(),1);assert.equal(await page.locator('[data-progress-row]:visible').getAttribute('data-project'),'product');
  await page.locator('[data-pg-search]').fill('없는프로젝트');assert(await page.locator('[data-pg-empty]').isVisible());
 }
 // All retained legacy IDs resolve into the assigned major project, never a subproject page.
 await page.setViewportSize({width:1440,height:1000});
 for(const p of data.projects){for(const id of p.includes){await page.goto(ORIGIN+'project-hub.html?project='+id);await page.locator('h1').waitFor();assert.equal(new URL(page.url()).searchParams.get('project'),p.id);assert.equal(await page.locator('h1').textContent(),p.name);assert.equal(await page.locator('.ops-project-card').count(),11);}}
 for(const id of ['characters','buttermilk']){await page.goto(ORIGIN+'project-hub.html?project='+id);await page.locator('h1').waitFor();assert.equal(new URL(page.url()).searchParams.get('project'),'brand');}
 await page.goto(ORIGIN+'store-opening.html');await page.locator('#store-status').waitFor();assert.equal(await page.locator('#store-status li').count(),3);assert((await page.locator('#store-status').textContent()).includes('11/10'));assert.equal(await page.locator('.big-link').getAttribute('href'),'https://gustnel1122-pixel.github.io/mumutori-offline-pages/');assert((await page.locator('.lead').textContent()).includes('11월 10일'));
 await context.route('**/src/project-progress.json',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto(ORIGIN);await page.locator('#progress [role="status"]').waitFor();assert(await page.locator('.home-top').isVisible());
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS 11 static projects/55 gates; 27 legacy routes + characters/book redirect; 4 viewport widths; filters/search; shared cards; feed failure isolation; no runtime errors');
})().catch(e=>{console.error(e);process.exit(1)});
