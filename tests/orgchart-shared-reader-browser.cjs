'use strict';
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const groups=['people','lead','agent','tool','automation','page','drive'].map((id,i)=>({id,label:'가상 그룹 '+i}));
const nodes=groups.map((g,i)=>({id:'node_'+i,group:g.id,label:'가상 항목 '+i,description:'가상 설명',steps:['첫째','둘째','셋째'],requestedBy:'가상 지시',result:'가상 결과',status:'켜짐',engine:'가상 모델'}));
const fixture={groups,nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}))};
const auth=`let user=null, cb=()=>{};export function current(){return user}export function onAuth(f){cb=f;window.testOrgAccount=u=>{user=u?{uid:u}:null;cb(user)};queueMicrotask(()=>cb(user));return ()=>{cb=()=>{}}}export async function dbUrl(){return 'https://orgchart.test/orgdata.json'}`;
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-build="000000000000"><div id="root"></div><script src="/src/mobile-nav.js?v=000000000000"></script><script type="module">import page from '/src/pages/agents.js';document.querySelector('#root').innerHTML=page({head:()=>''});</script></body></html>`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    let role='dahee',writeRequests=0;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.hostname!=='orgchart.test')return route.abort();
      if(u.pathname==='/'||u.pathname==='/agents.html')return route.fulfill({contentType:'text/html',body:html});
      if(u.pathname==='/src/fbauth.js')return route.fulfill({contentType:'application/javascript',body:auth});
      if(u.pathname==='/orgdata.json'){
        if(route.request().method()!=='GET'){writeRequests++;return route.fulfill({status:403,body:'{}'});}
        const allowed=role==='owner'||role==='dahee';
        return route.fulfill({status:allowed?200:403,contentType:'application/json',body:allowed?JSON.stringify(fixture):'{}'});
      }
      const file=path.join(root,u.pathname.slice(1));return route.fulfill({status:fs.existsSync(file)?200:404,contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.existsSync(file)?fs.readFileSync(file):''});
    });
    await page.goto('https://orgchart.test/');await page.waitForFunction(()=>window.testOrgAccount);
    await page.evaluate(()=>window.testOrgAccount('dahee'));await page.locator('.orgx-node').first().waitFor();
    assert.equal(await page.locator('.orgx-group').count(),7);assert.equal(await page.locator('.orgx-node').count(),7);
    if(width===390){
      await page.locator('.mmt-mobile-nav [data-tab="all"]').click();
      assert.equal(await page.locator('.mmt-mobile-all [data-href="agents.html"]').textContent(),'조직도');
      await Promise.all([page.waitForURL('**/agents.html'),page.locator('.mmt-mobile-all [data-href="agents.html"]').click()]);
      await page.waitForFunction(()=>window.testOrgAccount);await page.evaluate(()=>window.testOrgAccount('dahee'));
      await page.locator('.orgx-node').first().waitFor();assert.equal(await page.locator('.orgx-node').count(),7);
      await page.locator('[data-id="node_1"]').click();assert.equal(await page.locator('.orgx-desktop-detail ol li').count(),3);assert.equal(await page.locator('dialog[open]').count(),0);
    }
    assert.equal(await page.locator('.orgx-root input,.orgx-root textarea,.orgx-root [contenteditable=true]').count(),0);
    role='other';await page.evaluate(()=>window.testOrgAccount('other'));
    await page.getByText('이 계정의 조직도 접근 권한을 확인해 주세요.').waitFor();assert.equal(await page.locator('.orgx-node').count(),0);
    await page.evaluate(()=>window.testOrgAccount(null));await page.getByText('로그인하면 허용된 계정으로 조직도를 볼 수 있어요.').waitFor();
    assert.equal(writeRequests,0);assert.deepEqual(errors,[]);await context.close();
  }
  await browser.close();console.log('PASS 390/1440 shared reader, menu entry, account isolation and zero organization writes');
})().catch(e=>{console.error(e);process.exit(1)});
