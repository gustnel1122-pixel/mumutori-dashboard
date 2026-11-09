'use strict';
// Synthetic-only, with all requests intercepted: no server, accounts or writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const base = 'https://preview.invalid';
const allowed = new Set(['/preview-v5/index.html','/preview-v5/styles.css','/preview-v5/app.js','/preview-v5/model.js','/preview-v5/store.js','/preview-v5/sale-model.js']);
const contentTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    let forbidden=0;const errors=[];const blocked=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.origin!==base||!allowed.has(u.pathname)||route.request().method()!=='GET'){forbidden++;blocked.push(u.origin+u.pathname);return route.abort();}
      const file=path.join(root,...u.pathname.slice(1).split('/'));
      return route.fulfill({status:200,contentType:contentTypes[path.extname(file)],body:fs.readFileSync(file)});
    });
    await page.addInitScript(()=>{
      const addresses=['https://detail.1688.com/offer/test.html?type=a&sample=b','https://1688.com/test','https://1688.com.evil.invalid/test','http://detail.1688.com/test','https://user:pass@detail.1688.com/test','https://detail.1688.com:444/test','javascript:alert(1)',''];
      const materials=[{id:'fake-material',name:'가상 부자재',kind:'pack',stock:null,minStock:null,unitCost:null,receipts:addresses.map((url,i)=>({batch:i+1,status:'가상 기록',date:'',settlementKrw:null,memo:'가상 자료',url}))}];
      window.__MMT_V5_FRESH_STORE__={load:async()=>({products:[],materials,sets:[]}),revision:()=> 'synthetic',canViewMargin:()=>false};
    });
    await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('#tab-m').click();
    const details=page.locator('#tbl-m details');await details.locator('summary').click();
    const entries=details.locator('p');assert.equal(await entries.count(),8);
    assert.equal(await entries.nth(0).getByRole('link',{name:'1688 상품 보기'}).getAttribute('href'),'https://detail.1688.com/offer/test.html?type=a&sample=b');
    assert.equal(await entries.nth(1).getByRole('link',{name:'1688 상품 보기'}).getAttribute('href'),'https://1688.com/test');
    for(let i=2;i<8;i++)assert.equal(await entries.nth(i).locator('a').count(),0,`invalid address ${i} must not be linked`);
    assert.equal(await entries.nth(0).locator('a').getAttribute('target'),'_blank');
    assert.equal(await entries.nth(0).locator('a').getAttribute('rel'),'noopener noreferrer');
    assert.ok(blocked.every(u=>u==='https://fonts.googleapis.com/css2'),`unexpected requests: ${blocked.join(', ')}`);assert.equal(forbidden,blocked.length);assert.deepEqual(errors,[]);
    await page.evaluate(()=>{const el=document.createElement('div');el.textContent='가상 미리보기 · 예시 자료';Object.assign(el.style,{position:'fixed',right:'8px',bottom:'8px',zIndex:'999',background:'#222',color:'#fff',padding:'5px 8px'});document.body.append(el);});
    const out='C:/Users/ilc57/github/activity-work/product-v5-photos2-20261109';fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'부자재_구매링크_가상_PC.png')});
    await page.close();process.stdout.write('MATERIAL_LINKS_PASS\n');
  } finally {await browser.close();}
}
main().catch(e=>{process.stderr.write(`MATERIAL_LINKS_FAILED: ${e.message}\n`);process.exitCode=1;});
