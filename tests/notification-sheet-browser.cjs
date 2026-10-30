'use strict';
// Synthetic events, stubbed authentication and in-memory state only.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mumutori-dashboard/src/notification-center.css"></head><body data-build="000000000000"><script type="module" src="/mumutori-dashboard/src/notification-center.js"></script></body></html>`;
const auth=`let u=null,handlers=new Set();window.testAccount=x=>{u=x?{uid:x}:null;for(const f of handlers)f(u)};export function current(){return u}export function onAuth(f){handlers.add(f);queueMicrotask(()=>f(u));return()=>handlers.delete(f)}export function signIn(){return Promise.reject(Error('synthetic'))}`;
const state=`(()=>{window.MumutoriNoticeState={readEvents:async(uid)=>uid==='other'?{}:{test:window.__fixture},readAll:async()=>({}),write:async(uid,id,action)=>{window.__writes.push({uid,id,action});if(window.__delay)await new Promise(r=>setTimeout(r,500));return[id]}}})();`;
const samples=[
  {name:'명시 장부',event:{workId:'nav1_finance_row_1',screen:'레터',action:'가상 활동',body:'가상 장부 설명'},label:'보러가기',url:/\/finance\.html\?entry=row_1/},
  {name:'옛 장부',event:{workId:'nav1_home_',screen:'운영홈',action:'장부 확인 필요',body:'가상의 장부 항목을 확인해 주세요.'},label:'장부 탭 열기',url:/\/finance\.html/},
  {name:'완료와 확인 혼합',event:{workId:'nav1_home_',screen:'운영홈',action:'장부 처리 완료',body:'일부 연결에 실패해 확인이 필요해요.'},label:'장부 탭 열기',url:/\/finance\.html/},
  {name:'옛 일감',event:{workId:'nav1_home_',screen:'운영홈',action:'가상 업무',body:'일감을 확인해 주세요.'},label:'일감 탭 열기',url:/\/index\.html.*#mobile-tasks/},
  {name:'옛 장바구니',event:{workId:'nav1_home_',screen:'운영홈',action:'장바구니 확인',body:'가상 상품을 확인해 주세요.'},label:'장바구니 열기',url:/\/sourcing\.html.*tab=cart/},
  {name:'위험 링크',event:{workId:'nav1_home_',screen:'운영홈',action:'가상 안내',body:'https://evil.invalid/finance?token=private'},label:'알림함 열기',url:/\/index\.html/},
  {name:'목적지 불명',event:{workId:'nav1_home_',screen:'운영홈',action:'업무 처리',body:'내용을 확인해 주세요.'},label:'알림함 열기',url:/\/index\.html/},
  {name:'상충',event:{workId:'nav1_home_',screen:'운영홈',action:'장부와 일감 확인',body:'두 화면을 확인해 주세요.'},label:'알림함 열기',url:/\/index\.html/}
];
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 try{
  for(const sample of samples){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(f=>{window.__fixture={...f,createdAt:1};window.__writes=[];window.MumutoriMobileNav={hasActiveWork:()=>!!window.__draft};},sample.event);
   await page.route('**/*',async r=>{
    const u=new URL(r.request().url());if(u.hostname!=='mumutori.test')return r.abort();
    if(u.pathname==='/mumutori-dashboard/index.html')return r.fulfill({contentType:'text/html',body:html});
    if(u.pathname==='/mumutori-dashboard/src/fbauth.js')return r.fulfill({contentType:'application/javascript',body:auth});
    if(u.pathname==='/mumutori-dashboard/src/notification-state.js')return r.fulfill({contentType:'application/javascript',body:state});
    if(u.pathname==='/mumutori-dashboard/src/bell-diagnostics.js')return r.fulfill({contentType:'application/javascript',body:''});
    if(u.pathname.startsWith('/mumutori-dashboard/src/')){const f=path.join(root,u.pathname.slice('/mumutori-dashboard/'.length));return r.fulfill({status:fs.existsSync(f)?200:404,contentType:f.endsWith('.css')?'text/css':'application/javascript',body:fs.existsSync(f)?fs.readFileSync(f):''});}
    return r.fulfill({contentType:'text/html',body:'<!doctype html><title>synthetic target</title>'});
   });
   await page.goto('https://mumutori.test/mumutori-dashboard/index.html?notice=test&detail=1#notifications');await page.waitForFunction(()=>window.testAccount);await page.evaluate(()=>testAccount('owner'));
   const modal=page.locator('.mmt-notice-detail');await page.waitForFunction(()=>document.querySelector('.mmt-notice-detail')?.open);
   const text=await modal.innerText();assert(text.includes('무슨 일'),sample.name+' description must explain the event');assert(text.includes('할 일'),sample.name+' description must explain the next action');if(sample.name==='완료와 확인 혼합')assert(!text.includes('할 일 없음'),'failure must not be described as no action');
   const go=modal.locator('[data-notice-go]');assert.equal(await go.innerText(),sample.label,sample.name);const box=await go.boundingBox();assert(box.width>=44&&box.height>=44,'button must support mobile touch');
   if(sample.name==='명시 장부'){
    await page.evaluate(()=>{window.__oldGo=document.querySelector('[data-notice-go]');testAccount('other');window.__oldGo.click()});await page.waitForTimeout(600);
    assert.equal(new URL(page.url()).pathname,'/mumutori-dashboard/index.html','old-account button must not navigate');
    assert(!(await page.locator('.mmt-notice-detail').innerText()).includes('가상 장부 설명'),'old-account detail must clear');
    await page.reload();await page.waitForFunction(()=>window.testAccount);await page.evaluate(()=>testAccount('owner'));await page.waitForFunction(()=>document.querySelector('.mmt-notice-detail')?.open);
    await page.evaluate(()=>window.__draft=true);await go.tap();assert.equal(new URL(page.url()).pathname,'/mumutori-dashboard/index.html','draft must not be lost');
    assert((await modal.innerText()).includes('저장'),'draft warning must be visible in dialog, not behind it');await page.evaluate(()=>window.__draft=false);
   }
   await go.tap();if(sample.name==='목적지 불명'||sample.name==='상충'||sample.name==='위험 링크'){
    await page.waitForFunction(()=>!document.querySelector('.mmt-notice-detail')?.open);assert.equal(new URL(page.url()).pathname,'/mumutori-dashboard/index.html');
    assert(await page.locator('.mmt-notice-panel').evaluate(e=>e.open),'fallback inbox must be operable');
   }else{await page.waitForURL(sample.url);assert(!/token=|secret=|evil\.invalid/.test(page.url()));}
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close();}
 console.log('PASS 390 notification sheet: descriptions, named destination buttons, fallback and draft protection');
}
main().catch(e=>{console.error(e);process.exit(1)});
