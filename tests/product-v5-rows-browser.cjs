'use strict';
// Isolated synthetic preview: no HTTP server, no real account or data, and
// only the explicitly listed local assets may be fulfilled to the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const base = 'https://preview.invalid';
const root = path.resolve(__dirname, '..');
const output = 'C:/Users/ilc57/github/activity-work/product-v5-sale-prep-rows-20261109';
const allowed = new Set([
  '/preview-v5/index.html', '/preview-v5/styles.css', '/preview-v5/app.js',
  '/preview-v5/model.js', '/preview-v5/store.js', '/preview-v5/sale-model.js'
]);
const types = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8'};
async function isolate(page) {
  let forbidden = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || !allowed.has(url.pathname) || route.request().method() !== 'GET') {
      forbidden++;
      return route.abort();
    }
    const file = path.join(root, ...url.pathname.slice(1).split('/'));
    return route.fulfill({status:200, contentType:types[path.extname(file)], body:fs.readFileSync(file)});
  });
  return () => forbidden;
}
async function stamp(page) {
  await page.evaluate(() => {
    const n = document.createElement('div');
    n.textContent = '가상 미리보기 · 예시 자료';
    Object.assign(n.style, {position:'fixed',zIndex:'99999',right:'4px',bottom:'4px',background:'#222',color:'#fff',fontSize:'12px',padding:'4px 6px'});
    document.body.append(n);
  });
}
async function openPreview(browser,width,height){
  const page=await browser.newPage({viewport:{width,height}});
  const blocked=await isolate(page), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#grid-p .card').first().waitFor();
  return {page,blocked,errors};
}
async function run(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    for (const [width,height] of [[1280,1600],[390,844]]) {
      const {page,errors}=await openPreview(browser,width,height);
      const cards=page.locator('#grid-p .card');
      assert.equal(await cards.count(),4,'only fictional products are used');
      const first=page.locator('[data-product="demo-p1"]'),second=page.locator('[data-product="demo-p2"]');
      const toggle=first.locator('button.product-row-toggle[data-product-toggle]');
      const other=second.locator('button.product-row-toggle[data-product-toggle]');
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.equal(await first.locator('.product-detail').isVisible(),false);
      for(const name of ['.product-row-name','.product-row-batch','.product-row-decision','.product-row-price','.product-row-market']) assert.ok(await first.locator(name).count(),name);
      const size=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(size.page<=size.viewport,`horizontal overflow ${width}`);
      await stamp(page);
      if(width===390){await page.locator('#sum-p').scrollIntoViewIfNeeded();await page.evaluate(()=>{const y=document.querySelector('#sum-p').getBoundingClientRect().top+window.scrollY;window.scrollTo(0,Math.max(0,y-70));});await page.screenshot({path:path.join(output,'04_폰_접힘.png')});}
      await toggle.focus();await toggle.press('Space');
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      assert.equal(await first.locator('.product-detail').isVisible(),true);
      await other.click();
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.equal(await other.getAttribute('aria-expanded'),'true');
      await other.press('Enter');assert.equal(await other.getAttribute('aria-expanded'),'false');
      await toggle.click();
      await first.locator('[data-sale-decision="판매"]').click();
      assert.equal(await toggle.getAttribute('aria-expanded'),'true','editing must not collapse row');
      await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
      assert.match(await first.locator('.product-row-decision').innerText(),/판매/);
      assert.equal(await first.locator('[data-sale-details]').getAttribute('open'),'','expanding the row also opens sale preparation');
      const price=first.locator('[data-sale-price="own"]');
      await price.fill('12000');await price.press('Tab');
      await page.waitForFunction(()=>document.querySelector('[data-product="demo-p1"] [data-sale-save-status]')?.textContent?.includes('저장됨'));
      assert.match(await first.locator('.product-row-price').innerText(),/12,000/);
      if(width===390){await toggle.scrollIntoViewIfNeeded();await first.evaluate(el=>{const y=el.querySelector('[data-product-toggle]').getBoundingClientRect().top+window.scrollY;window.scrollTo(0,Math.max(0,y-12));});await page.screenshot({path:path.join(output,'05_폰_펼침.png')});}
      else {await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'03_PC_한줄목록.png')});}
      // Unsaved pre-existing receipt form must not disappear through any
      // collapse, unrelated panel, filter or sort rerender.
      await first.locator('[data-action="details"]').click();
      await first.locator('[data-receipt-edit="0"]').click();
      const memo=first.locator('[data-receipt-form] textarea[name="memo"]');
      await memo.fill('가상의 미저장 내용');
      for (const selector of ['[data-action="details"]','[data-action="links"]']) {
        await first.locator(selector).click();
        assert.equal(await memo.inputValue(),'가상의 미저장 내용',`draft lost on ${selector}`);
      }
      await page.locator('[data-group="batch"][data-value="2차"]').click();
      assert.equal(await memo.inputValue(),'가상의 미저장 내용','filter must not discard receipt draft');
      await other.click();
      assert.equal(await memo.inputValue(),'가상의 미저장 내용','opening another row must not discard receipt draft');
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      await first.locator('[data-receipt-cancel]').click();
      await other.click();assert.equal(await other.getAttribute('aria-expanded'),'true','row switches normally after cancelling receipt');
      assert.deepEqual(errors,[]);
      await page.close();
      process.stdout.write(`ROWS_${width}_PASS\n`);
    }
    // A failed save remains an editable draft; opening another row or
    // changing filters cannot discard it. The store uses synthetic data only.
    {
      const page=await browser.newPage({viewport:{width:390,height:844}});await isolate(page);
      await page.addInitScript(()=>{
        const data={products:[{id:'fake-a',name:'가상 상품 A',kind:'기타',status:'판매 준비',batch:['1차'],channels:[],stock:null,links:[],receipts:[]},{id:'fake-b',name:'가상 상품 B',kind:'기타',status:'판매 준비',batch:['2차'],channels:[],stock:null,links:[],receipts:[]}],materials:[],sets:[]};
        window.__MMT_V5_FRESH_STORE__={load:async()=>structuredClone(data),revision:()=> 'synthetic',canViewMargin:()=>false,saveSale:async()=>{throw Error('다른 곳에서 자료가 바뀌었어요. 다시 불러와 주세요.')}};
      });
      await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
      const a=page.locator('[data-product="fake-a"]'),b=page.locator('[data-product="fake-b"]');await a.waitFor();
      await a.locator('[data-product-toggle]').click();
      assert.equal(await a.locator('[data-sale-details]').getAttribute('open'),'');
      const input=a.locator('[data-sale-price="own"]');await input.fill('9000');await input.press('Tab');
      await page.waitForFunction(()=>document.querySelector('[data-product="fake-a"] [data-sale-save-status]')?.textContent?.includes('바뀌었어요'));
      assert.equal(await input.inputValue(),'9000');assert.equal(await input.getAttribute('aria-invalid'),'true');
      await b.locator('[data-product-toggle]').click({force:true});
      assert.equal(await a.locator('[data-product-toggle]').getAttribute('aria-expanded'),'true');
      assert.equal(await b.locator('[data-product-toggle]').getAttribute('aria-expanded'),'false');
      assert.equal(await input.inputValue(),'9000');
      await a.getByRole('button',{name:'입력 취소'}).click();
      await b.locator('[data-product-toggle]').click();
      assert.equal(await b.locator('[data-product-toggle]').getAttribute('aria-expanded'),'true');
      await page.close();process.stdout.write('ROWS_DRAFT_PRESERVATION_PASS\n');
    }
  } finally { await browser.close(); }
}
run().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
