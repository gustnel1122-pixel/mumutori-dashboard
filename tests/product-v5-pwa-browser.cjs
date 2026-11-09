'use strict';
// Isolated cache-transition test. No real authentication, data or network.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  try{
    const page=await context.newPage();
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/src/fbauth.js'))return route.fulfill({status:200,contentType:'text/javascript',body:`const u={uid:'fake'};export const current=()=>u;export const onAuth=f=>{queueMicrotask(()=>f(u));return()=>{}};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`});
      if(url.startsWith(base+'/mock/'))return route.fulfill({status:200,contentType:'application/json',headers:{ETag:'"fake"'},body:JSON.stringify({schema:'product-v5-fresh-v1',products:[],materials:[],sets:[]})});
      if(url.startsWith(base+'/'))return route.continue();
      return route.abort();
    });
    await page.goto(base+'/offline.html');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
    await page.reload();
    await page.evaluate(async()=>{
      const cache=await caches.open('mumutori-pwa:/:simulated-old');
      await cache.put('/products.html',new Response('<title>stale legacy</title>기존 캐시', {headers:{'Content-Type':'text/html'}}));
    });
    await page.goto(base+'/products.html');
    await page.getByRole('heading',{name:'상품 관리',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'옛 상품 화면'}).getAttribute('href'),'products-preview.html');
    assert.equal(await page.title(),'상품 관리 v5');
    await context.setOffline(true);
    await page.goto(base+'/products.html');
    assert.equal(await page.title(),'연결 안 됨 — 무무토리');
    assert.equal(await page.getByText('기존 캐시').count(),0);
    process.stdout.write('synthetic installed app: updated product screen and private offline fallback PASS\n');
  }finally{await context.close();await browser.close();server.close();}
}
main().catch(e=>{process.stderr.write(String(e)+'\n');server.close();process.exitCode=1;});
