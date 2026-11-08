'use strict';
// Isolated synthetic browser test: real network and operational data blocked.
const assert=require('node:assert/strict'), http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}); fs.createReadStream(file).pipe(res);
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const data={schema:'product-v5-fresh-v1',products:[{id:'fake-p1',name:'가상 상품',batch:['1차','2차'],channels:[],kind:'인형',status:'판매 준비',stock:null,salePrice:null,links:[],receipts:[
    {batch:1,date:'2026-10-24',status:'입고 완료',quantity:2,saleQuantity:2,eventQuantity:0,unitCost:null,currency:'CNY'},
    {batch:2,date:'',status:'배송 중',orderDate:'2026-10-29',orderedQuantity:3,quantity:0,saleQuantity:0,eventQuantity:0,unitCost:null,currency:'CNY'}
  ]}],materials:[{id:'fake-m1',name:'가상 부자재',kind:'unknown',stock:null,minStock:null,unitCost:null,receipts:[{batch:2,date:'',status:'배대지 창고',orderedQuantity:1}]}],sets:[]};
  try {
    for(const width of [390,1280]) {
      const page=await browser.newPage({viewport:{width,height:900}}); let accesses=[]; const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const req=route.request(), url=req.url();
        if(url.startsWith(base+'/src/fbauth.js')) return route.fulfill({status:200,contentType:'text/javascript',body:`let user={uid:'fake'};const c=new Set();window.testAuth={signout(){user=null;c.forEach(f=>f(null))},refresh(){c.forEach(f=>f(user))}};export const current=()=>user;export const onAuth=f=>{c.add(f);queueMicrotask(()=>f(user));return()=>c.delete(f)};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`});
        if(url.startsWith(base+'/mock/')) {
          accesses.push(url.slice((base+'/mock/').length));
          return route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"fake"'},body:JSON.stringify(data)});
        }
        if(url.startsWith(base+'/')) return route.continue();
        return route.abort();
      });
      await page.goto(base+'/preview-v5/fresh.html',{waitUntil:'domcontentloaded'});
      await page.locator('#grid-p .card').first().waitFor();
      assert.equal(await page.locator('#grid-p .card').count(),1);
      await page.getByRole('button',{name:'자세히 (입고 기록)'}).click();
      assert.match(await page.locator('.record').nth(1).innerText(),/입고일 확인 필요 · 배송 중/);
      assert.match(await page.locator('.record').nth(1).innerText(),/주문 수 3/);
      await page.getByRole('tab',{name:/부자재/}).click();
      assert.match(await page.locator('#tbl-m').innerText(),/확인 필요/);
      const scroll=await page.evaluate(()=>({width:document.documentElement.scrollWidth,view:innerWidth}));
      assert.ok(scroll.width<=scroll.view,`overflow ${width}`);
      assert.ok(accesses.length>=1 && accesses.every(p=>p==='productCatalogPrivate/products_v5'));
      await page.evaluate(()=>window.testAuth.signout());
      await page.getByText('로그인이 바뀌었어요. 다시 불러와 주세요.').waitFor();
      assert.equal(await page.locator('#grid-p').count(),0);
      assert.deepEqual(errors,[]); await page.close();
      process.stdout.write(`fresh synthetic ${width}px PASS\n`);
    }
    {
      const page=await browser.newPage(); let saved=null, value=structuredClone(data), puts=0;
      Object.assign(value.products[0].receipts[1],{status:'확인 필요',memo:'가상 오류입고 — 확인 필요'});
      await page.route('**/*',async route=>{
        const req=route.request(),url=req.url();
        if(url.startsWith(base+'/src/fbauth.js')) return route.fulfill({status:200,contentType:'text/javascript',body:`const u={uid:'fake'};export const current=()=>u;export const onAuth=f=>{queueMicrotask(()=>f(u));return()=>{}};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`});
        if(url.startsWith(base+'/mock/')) {
          assert.ok(url.endsWith('/productCatalogPrivate/products_v5'));
          if(req.method()==='PUT'){puts++;saved=JSON.parse(req.postData());value=saved;}
          return route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"fake"'},body:JSON.stringify(value)});
        }
        if(url.startsWith(base+'/')) return route.continue(); return route.abort();
      });
      await page.goto(base+'/preview-v5/fresh.html');
      await page.locator('#grid-p .card').first().waitFor();
      assert.equal(await page.getByText('입고 확인 필요',{exact:true}).count(),1);
      await page.locator('button[data-group="status"][data-value="확인 필요"]').click();
      assert.equal(await page.locator('#grid-p .card').count(),1);
      await page.getByRole('button',{name:'자세히 (입고 기록)'}).click();
      assert.match(await page.locator('.record').nth(1).innerText(),/입고일 확인 필요 · 확인 필요/);
      await page.locator('[data-receipt-edit="1"]').click();
      const form=page.locator('[data-receipt-form="fake-p1"]');
      assert.equal(await form.locator('[name=status]').inputValue(),'확인 필요');
      assert.equal(await form.locator('[name=date]').inputValue(),'');
      await form.getByRole('button',{name:'기록 저장'}).click();
      await page.waitForFunction(()=>!document.querySelector('[data-receipt-form="fake-p1"]'));
      assert.equal(puts,1);assert.equal(saved.products[0].receipts[1].status,'확인 필요');
      assert.equal(saved.products[0].receipts[1].orderedQuantity,3);assert.equal(saved.products[0].receipts[1].quantity,0);
      assert.equal(saved.products[0].receipts[1].memo,'가상 오류입고 — 확인 필요');
      await page.close(); process.stdout.write('fresh synthetic review status filter and save PASS\n');
    }
    {
      const page=await browser.newPage(); let oldPaths=0;
      await page.route('**/*',async route=>{
        const url=route.request().url();
        if(url.startsWith(base+'/src/fbauth.js')) return route.fulfill({status:200,contentType:'text/javascript',body:`const u={uid:'fake'};export const current=()=>u;export const onAuth=f=>{queueMicrotask(()=>f(u));return()=>{}};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`});
        if(url.startsWith(base+'/mock/')) { if(!url.endsWith('/productCatalogPrivate/products_v5')) oldPaths++; return route.fulfill({status:403,contentType:'application/json',body:'null'}); }
        if(url.startsWith(base+'/')) return route.continue(); return route.abort();
      });
      await page.goto(base+'/preview-v5/fresh.html');
      await page.getByText('이 계정은 상품 관리를 볼 수 없어요.').waitFor();
      assert.equal(await page.locator('#grid-p').count(),0); assert.equal(oldPaths,0);
      await page.close(); process.stdout.write('fresh synthetic denied PASS\n');
    }
    {
      const page=await browser.newPage(); let revoked=false, unavailable=false;
      await page.route('**/*',async route=>{
        const url=route.request().url();
        if(url.startsWith(base+'/src/fbauth.js')) return route.fulfill({status:200,contentType:'text/javascript',body:`let user={uid:'fake'};const c=new Set();window.testAuth={refresh(){c.forEach(f=>f(user))}};export const current=()=>user;export const onAuth=f=>{c.add(f);queueMicrotask(()=>f(user));return()=>c.delete(f)};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`});
        if(url.startsWith(base+'/mock/')) return route.fulfill({status:revoked?403:unavailable?503:200,contentType:'application/json',headers:{ETag:'"fake"'},body:(revoked||unavailable)?'null':JSON.stringify(data)});
        if(url.startsWith(base+'/')) return route.continue(); return route.abort();
      });
      await page.goto(base+'/preview-v5/fresh.html');
      await page.locator('#grid-p .card').first().waitFor();
      await page.getByRole('button',{name:'자세히 (입고 기록)'}).click();
      await page.locator('[data-receipt-edit="1"]').click();
      const draft=page.locator('[data-receipt-form="fake-p1"] [name="memo"]');
      await draft.fill('가상 미저장 메모');
      await page.evaluate(()=>window.testAuth.refresh());
      await draft.waitFor({state:'visible'});
      assert.equal(await draft.inputValue(),'가상 미저장 메모');
      unavailable=true;
      await page.evaluate(()=>window.testAuth.refresh());
      await page.getByText('접근 권한을 확인하지 못했어요. 다시 확인해 주세요.').waitFor();
      assert.equal(await draft.isVisible(),false);
      unavailable=false; await page.getByRole('button',{name:'다시 확인'}).click();
      await draft.waitFor({state:'visible'}); assert.equal(await draft.inputValue(),'가상 미저장 메모');
      revoked=true;
      await page.evaluate(()=>window.testAuth.refresh());
      await page.getByText('이 계정은 상품 관리를 볼 수 없어요.').waitFor();
      assert.equal(await page.locator('#grid-p').count(),0); await page.close();
      process.stdout.write('fresh synthetic draft preserved and revoked on refresh PASS\n');
    }
  } finally {await browser.close();server.close();}
}
main().catch(e=>{process.stderr.write(String(e)+'\n');server.close();process.exitCode=1});
