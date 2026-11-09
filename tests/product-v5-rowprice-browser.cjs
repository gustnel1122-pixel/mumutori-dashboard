'use strict';
// Isolated fake product tests: all requests are intercepted; no live data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base='https://preview.invalid',root=path.resolve(__dirname,'..');
const output='C:/Users/ilc57/github/activity-work/product-v5-photos2-20261109';
const files=new Set(['/preview-v5/index.html','/preview-v5/fresh.html','/preview-v5/styles.css','/preview-v5/app.js','/preview-v5/model.js','/preview-v5/store.js','/preview-v5/sale-model.js','/preview-v5/fresh-entry.js','/preview-v5/fresh-adapter.js','/preview-v5/fresh-schema.js']);
const content={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const examples=[
 {id:'sample-own',name:'목도리 소 인형 · 가상',kind:'기타',batch:'1차',status:'판매 준비',channels:[],stock:null,links:[],receipts:[],unitCost:2000,unitCostCurrency:'KRW',sale:{prices:{own:10000,smart:11000}}},
 {id:'sample-smart',name:'별 키링 · 가상',kind:'기타',batch:'2차',status:'판매 준비',channels:[],stock:null,links:[],receipts:[],unitCost:6000,unitCostCurrency:'KRW',sale:{prices:{smart:10000}}},
 {id:'sample-missing',name:'먹거리 참 · 가상',kind:'기타',batch:['1차','2차'],status:'판매 준비',channels:[],stock:null,links:[],receipts:[],sale:{}},
 {id:'sample-block',name:'야광 장식 · 가상',kind:'기타',batch:'2차',status:'판매 준비',channels:[],stock:null,links:[],receipts:[],unitCost:7000,unitCostCurrency:'KRW',sale:{prices:{own:8000}}}
];
async function file(route){const u=new URL(route.request().url());if(u.origin!==base||!files.has(u.pathname)||route.request().method()!=='GET')return route.abort();const p=path.join(root,...u.pathname.slice(1).split('/'));return route.fulfill({status:200,contentType:content[path.extname(p)],body:fs.readFileSync(p)});}
async function fixture(page,allow){
 await page.addInitScript(({examples,allow})=>{const materials=allow?[]:[{id:'fake-m',name:'가상 부자재',kind:'pack',unitCost:1234,currency:'KRW',stock:2,minStock:1,receipts:[{batch:1,settlementKrw:9876}]}],sets=allow?[]:[{id:'fake-set',name:'가상 세트',components:[{id:'sample-own',quantity:1}],materials:[{materialId:'fake-m',quantity:1}],salePrice:20000}];window.__MMT_V5_FRESH_STORE__={load:async()=>({products:examples,materials,sets}),canViewMargin:()=>allow,revision:()=>null,saveSale:async(id,patch)=>{const p=examples.find(x=>x.id===id);if(patch.prices)p.sale.prices={...p.sale.prices,...patch.prices}}}}, {examples,allow});
 await page.route('**/*',async route=>{if(new URL(route.request().url()).origin===base)return file(route);return route.abort()});
 await page.goto(base+'/preview-v5/index.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-product="sample-own"]').waitFor();
}
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:1100}});await fixture(page,true);
   const own=page.locator('[data-product="sample-own"] .product-row-toggle'),smart=page.locator('[data-product="sample-smart"] .product-row-toggle'),missing=page.locator('[data-product="sample-missing"] .product-row-toggle'),blocked=page.locator('[data-product="sample-block"] .product-row-toggle');
   assert.ok(await own.locator('.product-row-cost').count()===1,'cost present for allowed user');
   assert.ok((await own.locator('.product-row-price small').innerText())==='자사몰','own price priority');
   assert.ok((await smart.locator('.product-row-price small').innerText())==='스스','smart price fallback');
   assert.ok((await smart.locator('.product-row-price').getAttribute('aria-label')).includes('스마트스토어'),'smart price accessible label');
   assert.ok((await missing.locator('.product-row-price').innerText()).includes('판매가 없음'),'missing price');
   assert.ok(await own.locator('.product-row-roas.g').count()===1,'green class');
   assert.ok(await smart.locator('.product-row-roas.w').count()===1,'orange class and smart fee');
   assert.ok(await missing.locator('.product-row-roas.b[aria-label*="확인 필요"]').count()===1,'unknown red');
   assert.ok(await blocked.locator('.product-row-roas.b').count()===1,'nonpositive margin red');
   assert.ok(await own.getAttribute('aria-expanded')==='false','row starts collapsed');
   const dim=await page.evaluate(()=>{const e=document.querySelector('[data-product="sample-own"] .product-row-toggle'), fields=Array.from(e.children);return {horizontal:document.documentElement.scrollWidth>innerWidth, overflow:fields.some(x=>x.getBoundingClientRect().right>e.getBoundingClientRect().right+1), row:fields.every(x=>x.getBoundingClientRect().top>=e.getBoundingClientRect().top&&x.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom),textclip:Array.from(e.querySelectorAll('.product-row-price span,.product-row-cost span')).some(x=>x.scrollWidth>x.clientWidth+1)}});
   assert.ok(!dim.horizontal&&!dim.overflow&&dim.row&&!dim.textclip,'row fits and financial text does not truncate');
   if(width===390){assert.ok(await own.locator('.product-row-name').evaluate(e=>e.getBoundingClientRect().width>=80),'mobile leaves room for product identification');assert.ok((await missing.locator('.product-row-batch').innerText())==='1·2차','combined batches remain compact');}
   await page.evaluate(()=>{const n=document.createElement('div');n.textContent='가상 미리보기 · 원가 가림';Object.assign(n.style,{position:'fixed',right:'4px',bottom:'4px',zIndex:99999,background:'#222',color:'#fff',padding:'4px 6px',fontSize:'12px'});document.body.append(n)});
   if(width===390)await page.locator('[data-product="sample-own"]').scrollIntoViewIfNeeded();
   fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,width===390?'13_접힌줄_390.png':'12_접힌줄_원가판매가_PC.png'),mask:[page.locator('.product-row-cost span')],maskColor:'#8b765c'});
   if(width===390){const fits=await own.evaluate(e=>{for(const n of e.querySelectorAll('.product-row-price span,.product-row-cost span'))n.textContent=(1234567).toLocaleString('ko-KR')+'원';return [...e.querySelectorAll('.product-row-price span,.product-row-cost span')].every(n=>n.scrollWidth<=n.clientWidth+1)});assert.ok(fits,'long currency values remain visible');}
   await own.click();const card=page.locator('[data-product="sample-own"]');const input=card.locator('[data-sale-price="own"]');await input.fill('9000');await input.press('Tab');await card.locator('[data-sale-save-status]').getByText('저장됨').waitFor();
   assert.ok((await own.locator('.product-row-price').innerText()).includes('9,000원'),'updated row price');
   await page.close();
  }
  {
   const page=await browser.newPage({viewport:{width:390,height:844}});await fixture(page,false);
   assert.ok(await page.locator('.product-row-cost').count()===0,'cost hidden without permission');
   assert.ok(await page.locator('.product-row-roas').count()===0,'ROAS hidden without permission');
   assert.ok(await page.locator('.product-row-price').count()===examples.length,'price remains visible');
   await page.locator('[data-product="sample-own"] [data-product-toggle]').click();
   assert.ok(await page.locator('[data-product="sample-own"] [data-action="details"]').count()===0,'receipt cost details hidden');
   assert.ok(!await page.locator('body').evaluate(e=>e.textContent.includes((2000).toLocaleString('ko-KR')+'원')),'product cost absent from DOM');
   await page.locator('#tab-s').click();await page.locator('[data-pick-product="sample-own"]').check();
   assert.ok(!await page.locator('#view-s').evaluate(e=>e.textContent.includes('세트 원가')||e.textContent.includes('최소 ROAS')),'set cost and ROAS hidden');
   await page.locator('#tab-m').click();
   assert.ok(!await page.locator('#tbl-m').evaluate(e=>e.textContent.includes((1234).toLocaleString('ko-KR'))||e.textContent.includes((9876).toLocaleString('ko-KR'))),'material cost and settlement hidden');
   assert.ok(await page.locator('[data-edit-material]').count()===0,'material cost editing hidden');
   assert.ok(await page.locator('#mform').isHidden(),'material form hidden');await page.close();
  }
  for(const kind of ['deny','logout','switch']){
   const page=await browser.newPage({viewport:{width:390,height:844}});let denied=kind==='deny';
   const auth=`let user={uid:'fake_a'};const c=new Set();window.testAuth={signout(){user=null;c.forEach(f=>f(null))},change(){user={uid:'fake_b'};c.forEach(f=>f(user))},refresh(){c.forEach(f=>f(user))}};export const current=()=>user;export const onAuth=f=>{c.add(f);queueMicrotask(()=>f(user));return()=>c.delete(f)};export const signIn=async()=>{};export const dbUrl=async p=>location.origin+'/mock/'+p;`;
   await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base)return route.abort();if(u.pathname==='/src/fbauth.js')return route.fulfill({status:200,contentType:'text/javascript',body:auth});if(u.pathname.startsWith('/assets/vendor/firebase/'))return route.fulfill({status:200,body:''});if(u.pathname==='/mock/productCatalogPrivate/products_v5'&&req.method()==='GET')return route.fulfill({status:denied?403:200,contentType:'application/json',headers:{ETag:'"fake"'},body:denied?'null':JSON.stringify({schema:'product-v5-fresh-v1',products:examples,materials:[],sets:[]})});return file(route)});
   await page.goto(base+'/preview-v5/fresh.html',{waitUntil:'domcontentloaded'});
   if(kind==='deny'){await page.getByText('이 계정은 상품 관리를 볼 수 없어요.').waitFor();}
   else {await page.locator('.product-row-cost').first().waitFor();await page.evaluate(kind=>kind==='logout'?window.testAuth.signout():window.testAuth.change(),kind);await page.getByText('로그인이 바뀌었어요. 다시 불러와 주세요.').waitFor();}
   assert.ok(await page.locator('.product-row-cost').count()===0,'cost wiped');assert.ok(await page.locator('.product-row-roas').count()===0,'ROAS wiped');await page.close();
  }
  process.stdout.write('ROW_PRICE_BROWSER_PASS\n');
 }finally{await browser.close();}
}
run().catch(e=>{process.stderr.write('ROW_PRICE_BROWSER_FAIL '+String(e?.message||'error').replace(/[0-9]+/g,'#')+'\n');process.exitCode=1});
