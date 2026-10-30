'use strict';
// Real shared route code, synthetic authentication/data, no live traffic.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const cases=[
  ['letter',{workId:'nav1_letter_synthetic_letter',screen:'레터'},'/mumutori-dashboard/letter-hub.html?letter=synthetic_letter&notice=letter#inbox'],
  ['finance',{workId:'nav1_finance_synthetic_entry',screen:'장부'},'/mumutori-dashboard/finance.html?entry=synthetic_entry&notice=finance'],
  ['review',{workId:'nav1_bank_',screen:'은행'},'/mumutori-dashboard/finance.html?notice=review#fin-needs'],
  ['login',{workId:'nav1_login_',screen:'로그인'},'/mumutori-dashboard/settings.html?notice=login#app-push-settings'],
  ['cart',{workId:'nav1_cart_',screen:'소싱'},'/mumutori-dashboard/sourcing.html?tab=cart&notice=cart'],
  ['board',{workId:'nav1_board_',screen:'소싱'},'/mumutori-dashboard/sourcing.html?tab=items&notice=board'],
  ['order',{workId:'nav1_order_synthetic_item',screen:'주문판'},'/mumutori-offline-pages/index.html?item=synthetic_item&notice=order'],
  ['unknown',{screen:'pc',action:'가상 알림'},null]
];
const auth=`const user={uid:'synthetic_owner'};export function current(){return user}export function onAuth(f){queueMicrotask(()=>f(user));return()=>{}}export function signIn(){return Promise.reject(Error('synthetic'))}`;
const state=`(()=>{window.MumutoriNoticeState={readEvents:async()=>({[window.__fixture.id]:window.__fixture.event}),readAll:async()=>({}),write:async(uid,id,action)=>{sessionStorage.setItem('write',JSON.stringify({uid,id,action}));return[id]}}})();`;
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mumutori-dashboard/src/notification-center.css"></head><body data-build="000000000000"><script type="module" src="/mumutori-dashboard/src/notification-center.js"></script></body></html>`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
  for(const [id,fields,expected] of cases){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(f=>{window.__fixture=f;window.MumutoriMobileNav={hasActiveWork:()=>false};},{id,event:{...fields,action:fields.action||'가상 알림',body:'가상 설명',actor:'가상',createdAt:1}});
    await page.route('**/*',async r=>{
      const u=new URL(r.request().url());if(u.hostname!=='mumutori.test')return r.abort();
      if(u.pathname==='/mumutori-dashboard/index.html')return r.fulfill({contentType:'text/html',body:html});
      if(u.pathname==='/mumutori-dashboard/src/fbauth.js')return r.fulfill({contentType:'application/javascript',body:auth});
      if(u.pathname==='/mumutori-dashboard/src/notification-state.js')return r.fulfill({contentType:'application/javascript',body:state});
      if(u.pathname==='/mumutori-dashboard/src/bell-diagnostics.js')return r.fulfill({contentType:'application/javascript',body:''});
      if(u.pathname.startsWith('/mumutori-dashboard/src/')){const f=path.join(root,u.pathname.slice('/mumutori-dashboard/'.length));return r.fulfill({status:fs.existsSync(f)?200:404,contentType:f.endsWith('.css')?'text/css':'application/javascript',body:fs.existsSync(f)?fs.readFileSync(f):''});}
      return r.fulfill({contentType:'text/html',body:'<!doctype html><title>synthetic target</title>'});
    });
    await page.goto('https://mumutori.test/mumutori-dashboard/index.html');
    await page.locator('.mmt-notice-bell').tap();
    const card=page.locator(`[data-event-id="${id}"]`);await card.waitFor();await card.tap();
    if(expected){await page.waitForURL('**'+expected);const u=new URL(page.url());assert.equal(u.pathname+u.search+u.hash,expected,id);const w=JSON.parse(await page.evaluate(()=>sessionStorage.getItem('write')));assert.equal(w.id,id);assert.equal(w.action,'read');}
    else{await page.waitForFunction(()=>document.querySelector('.mmt-notice-detail')?.open);assert.equal(new URL(page.url()).pathname,'/mumutori-dashboard/index.html');assert((await page.locator('.mmt-notice-detail-body').innerText()).includes('가상 설명'));}
    assert.deepEqual(errors,[]);await context.close();
  }
  await browser.close();console.log('PASS 390 touch with real router: letter, finance, bank review, login, cart, sourcing, order and no destination');
})().catch(e=>{console.error(e);process.exit(1)});
