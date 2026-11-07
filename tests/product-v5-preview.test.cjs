// Isolated browser verification: no real Firebase or third-party network requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..', 'preview-v5');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server = http.createServer((req,res)=>{
  const name = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = name === '/' ? '/index.html' : name;
  const file = path.resolve(root, '.' + relative);
  if(!file.startsWith(root + path.sep) || !fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try{
    for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:900}});
      let writes=0;const errors=[];
      page.on('pageerror',e=>{errors.push(e.message);process.stderr.write(`page error: ${e.stack}\n`);});
      await page.route('**/*',route=>{
        const req=route.request();
        if(req.method()!=='GET'){writes++;return route.abort();}
        return req.url().startsWith(base+'/')?route.continue():route.abort();
      });
      await page.goto(base+'/',{waitUntil:'domcontentloaded'});
      await page.locator('#grid-p .card').first().waitFor();
      assert.equal(await page.locator('#grid-p .card').count(),4);
      const overflow=await page.evaluate(()=>({total:document.documentElement.scrollWidth,viewport:innerWidth,offenders:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))}));
      assert.equal(overflow.total<=overflow.viewport,true,`horizontal overflow at ${width}: ${JSON.stringify(overflow)}`);
      if(process.env.V5_SHOTS)await page.screenshot({path:path.join(process.env.V5_SHOTS,`product-v5-${width}.png`),fullPage:true});
      await page.getByRole('button',{name:'인형',exact:true}).click();
      assert.equal(await page.locator('#grid-p .card').count(),1);
      assert.match(await page.locator('#grid-p .num').first().innerText(),/4,280원/);
      await page.locator('#material-cost').uncheck();
      assert.match(await page.locator('#grid-p .num').first().innerText(),/4,200원/);
      await page.locator('#material-cost').check();
      await page.getByRole('button',{name:'자세히 (입고 기록)'}).click();
      assert.equal(await page.getByRole('heading',{name:'입고 기록'}).count(),1);
      await page.getByRole('button',{name:'입고 기록 추가'}).click();
      const receipt=page.locator('[data-receipt-form="demo-p1"]');
      await receipt.locator('[name=batch]').fill('2');
      await receipt.locator('[name=date]').fill('2026-11-07');
      await receipt.locator('[name=supplier]').fill('가상 판매처');
      await receipt.locator('[name=url]').fill('https://example.com/product');
      await receipt.locator('[name=unitCost]').fill('2300');
      await receipt.locator('[name=quantity]').fill('10');
      await receipt.locator('[name=memo]').fill('가상 입고');
      await receipt.getByRole('button',{name:'기록 저장'}).click();
      assert.match(await receipt.locator('.receipt-error').innerText(),/1688/);
      await receipt.locator('[name=url]').fill('https://detail.1688.com/offer/123.html');
      await receipt.getByRole('button',{name:'기록 저장'}).click();
      await page.getByText('가상 판매처',{exact:false}).waitFor();
      assert.match(await page.locator('[data-product="demo-p1"] .sell').innerText(),/재고 62/);
      await page.locator('[data-product="demo-p1"] [data-receipt-edit="1"]').click();
      const edit=page.locator('[data-receipt-form="demo-p1"]');
      await edit.locator('[name=memo]').fill('가상 수정');
      await edit.getByRole('button',{name:'기록 저장'}).click();
      await page.getByText('가상 수정',{exact:true}).waitFor();
      const photo=page.locator('[data-photo-product="demo-p1"]');
      await photo.setInputFiles({name:'too-big.png',mimeType:'image/png',buffer:Buffer.alloc(1024*1024+1)});
      assert.match(await page.locator('#product-error').innerText(),/1MB/);
      await photo.setInputFiles({name:'not-image.txt',mimeType:'text/plain',buffer:Buffer.from('example')});
      assert.match(await page.locator('#product-error').innerText(),/PNG/);
      await photo.setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==','base64')});
      await page.locator('[data-product="demo-p1"] .thumb img').waitFor();
      await page.getByRole('button',{name:'부자재 연결'}).click();
      await page.locator('[data-link="demo-m2"]').click();
      assert.equal(await page.locator('[data-unlink="demo-m2"]').count(),1);
      await page.getByRole('button',{name:'초기화'}).click();
      assert.equal(await page.locator('#grid-p .card').count(),4);
      await page.getByRole('tab',{name:/부자재/}).click();
      await page.locator('#mf-name').fill('테스트 리본');
      await page.locator('#mf-price').fill('50');
      await page.locator('#mf-stock').fill('20');
      await page.locator('#mf-min').fill('5');
      await page.locator('#mform button[type=submit]').click();
      assert.equal(await page.getByRole('cell',{name:'테스트 리본'}).count(),1);
      await page.locator('#mf-name').fill('테스트 박스');
      await page.locator('#mf-price').fill('20');
      await page.locator('#mf-stock').fill('10');
      await page.locator('#mf-min').fill('1');
      await page.locator('#mform button[type=submit]').click();
      assert.match(await page.locator('#material-error').innerText(),/박스 연결은 아직/);
      assert.equal(await page.getByRole('cell',{name:'테스트 박스'}).count(),0);
      await page.getByRole('tab',{name:/세트/}).click();
      await page.locator('#sf-name').fill('테스트 세트');
      await page.locator('#sf-price').fill('20000');
      await page.locator('[data-pick-product="demo-p1"]').check();
      await page.locator('[data-pick-product="demo-p2"]').check();
      await page.locator('[data-pick-pack="demo-m3"]').check();
      await page.locator('#setform button[type=submit]').click();
      assert.equal(await page.locator('#grid-s .card').count(),2);
      assert.equal(await page.getByText('테스트 세트',{exact:true}).count(),1);
      assert.equal(writes,0);assert.deepEqual(errors,[]);
      await page.close();
      process.stdout.write(`preview ${width}px: PASS\n`);
    }
  }finally{await browser.close();server.close();}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
