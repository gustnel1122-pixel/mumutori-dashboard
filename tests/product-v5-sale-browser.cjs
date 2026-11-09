'use strict';
// Browser tests with the existing in-memory preview and synthetic examples.
// No real identity, remote services, private storage or operating data.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const base='https://preview.invalid';
const files=new Set(['/preview-v5/index.html','/preview-v5/fresh.html','/preview-v5/styles.css','/preview-v5/app.js','/preview-v5/model.js','/preview-v5/store.js','/preview-v5/sale-model.js','/preview-v5/fresh-entry.js','/preview-v5/fresh-adapter.js','/preview-v5/fresh-schema.js']);
async function local(route){
 const u=new URL(route.request().url());
 if(u.origin!==base||!files.has(u.pathname)||route.request().method()!=='GET')return route.abort();
 const file=path.join(root,...u.pathname.slice(1).split('/'));
 return route.fulfill({status:200,contentType:mime[path.extname(file)],body:fs.readFileSync(file)});
}
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:width===1280?1500:900}});const errors=[];let remoteAttempts=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(base+'/'))return local(route);remoteAttempts++;return route.abort()});
   await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('#grid-p .card').first().waitFor();
   assert.equal(await page.locator('#grid-p .card').count(),4);
   const first=page.locator('[data-product="demo-p1"]');
   await first.locator('[data-product-toggle]').click();
   await first.locator('[data-sale-decision="판매"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(await first.locator('[data-sale-decision="판매"]').getAttribute('aria-pressed'),'true');
   assert.equal(await first.locator('[data-sale-details]').getAttribute('open'),'');
   await first.locator('[data-sale-price="own"]').fill('12000');
   await first.locator('[data-sale-price="own"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(await first.locator('[data-sale-price="own"]').inputValue(),'12000');
   assert.match(await first.locator('.sale-margins').innerText(),/7,720원/);
   await first.locator('[data-sale-price="smart"]').fill('0');
   await first.locator('[data-sale-price="smart"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(await first.locator('[data-sale-price="smart"]').inputValue(),'0');
   assert.match(await first.locator('.sale-margins').innerText(),/-4,280원/);
   await first.locator('[data-sale-price="smart"]').fill('');
   await first.locator('[data-sale-price="smart"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(await first.locator('[data-sale-price="smart"]').inputValue(),'');
   assert.equal(((await first.locator('.sale-margins').innerText()).match(/7,720원/g)||[]).length,3);
   await first.locator('[data-sale-url="own"]').fill('javascript:alert(1)');
   await first.locator('[data-sale-url="own"]').press('Tab');
   assert.match(await first.locator('[data-sale-save-status]').innerText(),/https/);
   await first.locator('[data-sale-url="own"]').fill('https://example.com/fake');
   await first.locator('[data-sale-url="own"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   await first.locator('[data-sale-registered="own"]').check();
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   await page.locator('[data-sale-filter="등록 완료"]').click();
   assert.equal(await page.locator('#grid-p .card').count(),1);
   await first.locator('[data-sale-registered="own"]').uncheck();
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   await page.locator('[data-sale-filter="전체"]').click();
   await page.locator('[data-group="batch"][data-value="1차"]').click();
   assert.equal(await page.locator('#grid-p .card').count(),2);
   assert.equal(await page.locator('[data-product="demo-p1"]').count(),1);
   await page.locator('[data-group="batch"][data-value="1차"]').click();
   await page.locator('[data-group="batch"][data-value="2차"]').click();
   assert.equal(await page.locator('#grid-p .card').count(),2);
   assert.equal(await page.locator('[data-product="demo-p3"]').count(),1);
   await page.locator('[data-group="batch"][data-value="2차"]').click();
   const unknown=page.locator('[data-product="demo-p4"]');
   await unknown.locator('[data-product-toggle]').click();
   await unknown.locator('[data-sale-price="own"]').fill('5000');
   await unknown.locator('[data-sale-price="own"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p4"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(((await unknown.locator('.sale-margins').innerText()).match(/확인 필요/g)||[]).length,3);
   await page.locator('[data-sale-filter="판매 확정 미등록"]').click();
   assert.equal(await page.locator('#grid-p .card').count(),1);
   assert.equal(await page.locator('#grid-p .card').first().getAttribute('data-product'),'demo-p1');
   const view=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(view.width<=view.viewport,`horizontal overflow at ${width}`);
   // External requests, if any (for example a font), were aborted above.
   assert.deepEqual(errors,[]);
   await page.close();process.stdout.write(`sale synthetic ${width}px PASS\n`);
  }
  // Only an explicitly enabled synthetic setting shows margins. Empty channel
  // prices inherit the own-store price; explicit zero and unknown costs do not.
  {
   const page=await browser.newPage({viewport:{width:390,height:900}});
   await page.route('**/*',route=>local(route));
   await page.addInitScript(()=>{
    const known={id:'allowed-p',name:'가상 원가 상품',kind:'기타',status:'판매 준비',batch:'1차',channels:[],stock:null,links:[],receipts:[],unitCost:200,unitCostCurrency:'KRW',sale:{decision:'판매',prices:{own:1000,smart:0}}};
    const unknown={id:'unknown-p',name:'가상 원가 미확인',kind:'기타',status:'판매 준비',batch:'2차',channels:[],stock:null,links:[],receipts:[],sale:{decision:'판매',prices:{own:1000}}};
    window.__MMT_V5_FRESH_STORE__={load:async()=>structuredClone({products:[known,unknown],materials:[],sets:[]}),canViewMargin:()=>true,revision:()=> 'synthetic'};
   });
   await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
   const known=page.locator('[data-product="allowed-p"]');await known.waitFor();await known.locator('[data-product-toggle]').click();
   const result=await known.locator('.sale-margins').innerText();
   assert.match(result,/-200원/);assert.equal((result.match(/800원/g)||[]).length,2);
   const unknown=page.locator('[data-product="unknown-p"]');await unknown.locator('[data-product-toggle]').click();
   const missing=await unknown.locator('.sale-margins').innerText();assert.equal((missing.match(/확인 필요/g)||[]).length,3);
   await page.close();process.stdout.write('sale synthetic explicit-margin-setting PASS\n');
  }
  // A production-shaped synthetic adapter stores change history with the
  // update and removes private content on sign-out. It never contacts Firebase.
  {
   const page=await browser.newPage({viewport:{width:390,height:900}});let puts=0,gets=0,external=0,etag='"fake-1"';
   let data={schema:'product-v5-fresh-v1',products:[{id:'fake-p',name:'가상 상품',kind:'기타',status:'판매 준비',channels:[],stock:null,links:[],receipts:[]}],materials:[],sets:[]};
   const auth=`let user={uid:'fake'};const c=new Set();window.testAuth={signout(){user=null;c.forEach(f=>f(null))}};export const current=()=>user;export const onAuth=f=>{c.add(f);queueMicrotask(()=>f(user));return()=>c.delete(f)};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`;
   await page.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url.startsWith(base+'/src/fbauth.js'))return route.fulfill({status:200,contentType:'text/javascript',body:auth});
    if(url.startsWith(base+'/assets/vendor/firebase/'))return route.fulfill({status:200,contentType:'text/javascript',body:''});
    if(url.startsWith(base+'/mock/')){
     assert.equal(new URL(url).pathname,'/mock/productCatalogPrivate/products_v5');
     if(req.method()==='PUT'){
      puts++;assert.equal(req.headers()['if-match'],etag);data=JSON.parse(req.postData());etag='"fake-2"';
      return route.fulfill({status:200,contentType:'application/json',headers:{ETag:etag},body:'null'});
     }
     assert.equal(req.method(),'GET');gets++;
     return route.fulfill({status:200,contentType:'application/json',headers:{ETag:etag},body:JSON.stringify(data)});
    }
    if(url.startsWith(base+'/'))return local(route);external++;return route.abort();
   });
   await page.goto(base+'/preview-v5/fresh.html',{waitUntil:'domcontentloaded'});
   const card=page.locator('[data-product="fake-p"]');await card.waitFor();
   await card.locator('[data-product-toggle]').click();
   await card.locator('[data-sale-decision="판매"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-product="fake-p"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.equal(puts,1);assert.ok(gets>=3);assert.equal(data.products[0].sale.decision,'판매');
   assert.equal(data.products[0].sale.history.length,1);assert.equal(data.products[0].sale.history[0].field,'decision');
   assert.equal(await card.locator('[data-sale-decision="판매"]').getAttribute('aria-pressed'),'true');
   assert.equal(await card.locator('.sale-margins').count(),1,'margin defaults allowed for permitted account');
   await page.evaluate(()=>window.testAuth.signout());
   await page.getByText('로그인이 바뀌었어요. 다시 불러와 주세요.').waitFor();
   assert.equal(await page.locator('#grid-p').count(),0);
   await page.close();process.stdout.write('sale synthetic atomic-history and auth-revocation PASS\n');
  }
  // A focused input retains the revision from when editing began. If another
  // operator changes that revision, retain the draft and do not write it.
  {
   const page=await browser.newPage({viewport:{width:390,height:900}});let external=0;
   await page.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(base+'/'))return local(route);external++;return route.abort()});
   await page.addInitScript(()=>{
    let revision='v1',serverRevision='v1',writes=0,uncertain=false;
    const data={products:[{id:'conflict-p',name:'가상 경합 상품',kind:'기타',status:'판매 준비',channels:[],stock:null,links:[],receipts:[]}],materials:[],sets:[]};
    window.testConflict={change(){serverRevision='v2'},restore(){serverRevision='v1'},writes(){return writes},uncertain(){uncertain=true}};
    window.__MMT_V5_FRESH_STORE__={load:async()=>structuredClone(data),revision:()=>revision,canViewMargin:()=>false,
     saveSale:async(_id,_patch,expected)=>{if(expected!==serverRevision)throw Error('다른 곳에서 자료가 바뀌었어요. 다시 불러와 주세요.');if(uncertain)throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.');writes++}};
   });
   await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
   const card=page.locator('[data-product="conflict-p"]');await card.waitFor();
   await card.locator('[data-product-toggle]').click();
   const input=card.locator('[data-sale-price="own"]');await input.focus();await input.fill('9000');
   await page.evaluate(()=>window.testConflict.change());await input.press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="conflict-p"] [data-sale-save-status]')?.textContent?.includes('바뀌었어요'));
   assert.equal(await page.evaluate(()=>window.testConflict.writes()),0);
   assert.equal(await input.inputValue(),'9000');assert.equal(await input.getAttribute('aria-invalid'),'true');
   assert.equal(await page.locator('[data-sale-filter="전체"]').isDisabled(),true);
   await card.getByRole('button',{name:'입력 취소'}).click();assert.equal(await input.inputValue(),'');
   await page.evaluate(()=>{window.testConflict.restore();window.testConflict.uncertain()});
   await input.focus();await input.fill('7000');await input.press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="conflict-p"] [data-sale-save-status]')?.textContent?.includes('저장 여부 확인 필요'));
   assert.equal(await input.inputValue(),'7000');assert.equal(await input.getAttribute('aria-invalid'),'true');
   await card.getByRole('button',{name:'입력 취소'}).click();
   assert.equal(await input.inputValue(),'');
   assert.match(await card.locator('[data-sale-save-status]').innerText(),/저장 여부는 다시 불러와 확인/);
   assert.equal(await page.evaluate(()=>window.testConflict.writes()),0);
   await page.close();process.stdout.write('sale synthetic concurrent-edit draft preservation PASS\n');
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
