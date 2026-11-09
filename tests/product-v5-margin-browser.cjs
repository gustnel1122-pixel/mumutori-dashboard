'use strict';
// Isolated synthetic preview and permissions tests. No local server, live
// account, emails, credentials, user data, or external network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base='https://preview.invalid',root=path.resolve(__dirname,'..');
const output='C:/Users/ilc57/github/activity-work/product-v5-sale-prep-rows-20261109/06_PC_한줄목록_마진보임.png';
const files=new Set(['/preview-v5/index.html','/preview-v5/fresh.html','/preview-v5/styles.css','/preview-v5/app.js','/preview-v5/model.js','/preview-v5/store.js','/preview-v5/sale-model.js','/preview-v5/fresh-entry.js','/preview-v5/fresh-adapter.js','/preview-v5/fresh-schema.js']);
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
async function staticFile(route){const u=new URL(route.request().url());if(u.origin!==base||!files.has(u.pathname)||route.request().method()!=='GET')return route.abort();const p=path.join(root,...u.pathname.slice(1).split('/'));return route.fulfill({status:200,contentType:type[path.extname(p)],body:fs.readFileSync(p)});}
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try {
  // Screenshot the default allowed setting using fictional built-in products.
  {
   const page=await browser.newPage({viewport:{width:1280,height:1800}});let external=0;
   await page.route('**/*',async route=>{if(new URL(route.request().url()).origin===base)return staticFile(route);external++;return route.abort()});
   await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
   const card=page.locator('[data-product="demo-p1"]');await card.waitFor();await card.locator('[data-product-toggle]').click();
   await card.locator('[data-sale-decision="판매"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   await card.locator('[data-sale-price="own"]').fill('12000');await card.locator('[data-sale-price="own"]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
   assert.match(await card.locator('.sale-margins').innerText(),/7,720원/);
   // External requests (for example, optional fonts) are intercepted and
   // aborted before network access, not fulfilled or followed.
   await page.evaluate(()=>{const n=document.createElement('div');n.textContent='가상 미리보기 · 예시 자료';Object.assign(n.style,{position:'fixed',zIndex:'99999',right:'4px',bottom:'4px',background:'#222',color:'#fff',fontSize:'12px',padding:'4px 6px'});document.body.append(n);window.scrollTo(0,0)});
   fs.mkdirSync(path.dirname(output),{recursive:true});await page.screenshot({path:output});await page.close();
  }
  // Authentication and response routes below are entirely fake. Two
  // identities are authorized by the mock server, another receives 403.
  for(const [uid,permitted] of [['fake_a',true],['fake_b',true],['fake_denied',false]]){
   const page=await browser.newPage({viewport:{width:390,height:844}});let blocked=0,api=0,deny=false;
   const auth=`let user={uid:${JSON.stringify(uid)}};const c=new Set();window.testAuth={signout(){user=null;c.forEach(f=>f(null))},refresh(){c.forEach(f=>f(user))}};export const current=()=>user;export const onAuth=f=>{c.add(f);queueMicrotask(()=>f(user));return()=>c.delete(f)};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`;
   const data={schema:'product-v5-fresh-v1',products:[{id:'synthetic-p',name:'가상 상품',kind:'기타',status:'판매 준비',channels:[],stock:null,links:[],receipts:[],unitCost:200,unitCostCurrency:'KRW',sale:{decision:'판매',prices:{own:1000}}}],materials:[],sets:[]};
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin!==base){blocked++;return route.abort()}
    if(u.pathname==='/src/fbauth.js')return route.fulfill({status:200,contentType:'text/javascript',body:auth});
    if(u.pathname.startsWith('/assets/vendor/firebase/'))return route.fulfill({status:200,contentType:'text/javascript',body:''});
    if(u.pathname==='/mock/productCatalogPrivate/products_v5'&&req.method()==='GET'){api++;return route.fulfill({status:permitted&&!deny?200:403,contentType:'application/json',headers:{ETag:'"fake"'},body:permitted&&!deny?JSON.stringify(data):'null'});}
    return staticFile(route);
   });
   await page.goto(base+'/preview-v5/fresh.html',{waitUntil:'domcontentloaded'});
   if(permitted){
    const card=page.locator('[data-product="synthetic-p"]');await card.waitFor();await card.locator('[data-product-toggle]').click();
    assert.match(await card.locator('.sale-margins').innerText(),/800원/);
    if(uid==='fake_a'){
      deny=true;await page.evaluate(()=>window.testAuth.refresh());
      await page.getByText('이 계정은 상품 관리를 볼 수 없어요.').waitFor();
      assert.equal(await page.locator('.sale-margins').count(),0);
    } else {
      await page.evaluate(()=>window.testAuth.signout());
      await page.getByText('로그인이 바뀌었어요. 다시 불러와 주세요.').waitFor();
      assert.equal(await page.locator('.sale-margins').count(),0);
    }
   } else {
    await page.getByText('이 계정은 상품 관리를 볼 수 없어요.').waitFor();
    assert.equal(await page.locator('#grid-p').count(),0);assert.equal(await page.locator('.sale-margins').count(),0);
   }
   assert.ok(api>=1);await page.close();
  }
  process.stdout.write('MARGIN_TWO_ACCOUNTS_DENIED_LOGOUT_SCREENSHOT_PASS\n');
 } finally {await browser.close();}
}
run().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
