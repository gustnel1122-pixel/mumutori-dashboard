// Isolated, synthetic data only. This never signs in or accesses live data.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const groups=['people','lead','agent','tool','automation','page','drive'].map((id,i)=>({id,label:'그룹 '+(i+1)}));
const nodes=groups.flatMap((g,i)=>Array.from({length:i===2?8:4},(_,j)=>({id:`n_${i}_${j}`,group:g.id,label:`항목 ${i+1}-${j+1}`,description:'무엇을 하는지에 대한 가상 설명',steps:['첫째 단계','둘째 단계','셋째 단계'],requestedBy:'가상 지시',result:'가상 결과',status:'켜짐',engine:'가상 모델'})));
const edges=nodes.filter(n=>n.id!=='n_0_0').map(n=>({from:'n_0_0',to:n.id}));
// Include an unrelated edge so dimming can be distinguished from highlighting.
edges.push({from:'n_1_1',to:'n_2_1'});
const fixture={groups,nodes,edges};
const auth=`let user=null,cb=()=>{};export function current(){return user}export function onAuth(f){cb=f;window.testOrgAccount=u=>{user=u?{uid:u}:null;cb(user)};queueMicrotask(()=>cb(user));return ()=>{cb=()=>{}}}export async function dbUrl(){return 'https://orgchart.test/orgdata.json'}`;
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),p=await context.newPage(),errors=[];let role='owner',delay=0;
    p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.hostname!=='orgchart.test')return route.abort();
      if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-build="000000000000"><div id="root"></div><script type="module">import page from "/src/pages/agents.js";document.querySelector("#root").innerHTML=page({head:()=>""});</script></body></html>'});
      if(u.pathname==='/src/fbauth.js')return route.fulfill({contentType:'application/javascript',body:auth});
      if(u.pathname==='/orgdata.json'){const capturedRole=role,capturedDelay=delay;if(capturedDelay)await new Promise(r=>setTimeout(r,capturedDelay));return route.fulfill({status:capturedRole==='owner'||capturedRole==='dahee'?200:403,contentType:'application/json',body:capturedRole==='owner'||capturedRole==='dahee'?JSON.stringify(fixture):'{}'}).catch(()=>{});}
      const file=path.join(root,u.pathname.replace(/^\//,''));return route.fulfill({status:fs.existsSync(file)?200:404,contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.existsSync(file)?fs.readFileSync(file):''});
    });
    await p.goto('https://orgchart.test/');await p.waitForFunction(()=>window.testOrgAccount);await p.evaluate(()=>window.testOrgAccount('owner'));await p.locator('.orgx-node').first().waitFor();
    await p.waitForFunction(()=>document.querySelectorAll('.orgx-lines path').length>0);
    assert.equal(await p.locator('.orgx-group').count(),7);
    assert.equal(await p.locator('.orgx-node').count(),nodes.length);
    const bounds=await p.locator('.orgx-group').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
    assert(bounds.every(r=>r.left>=-1&&r.right<=width+1),'all seven groups must be visible across viewport width');
    assert(Math.max(...bounds.map(r=>r.top))-Math.min(...bounds.map(r=>r.top))<4,'groups must be aligned horizontally');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page must not overflow horizontally');
    assert.equal(await p.locator('dialog[open]').count(),0,'no popup');
    if(process.env.ORG_SCREENSHOTS){fs.mkdirSync(process.env.ORG_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.ORG_SCREENSHOTS,`synthetic-${width}-initial.png`),fullPage:true});}
    if(width===390){const cdp=await context.newCDPSession(p),before=await p.evaluate(()=>visualViewport.scale);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:165,y:90,id:1},{x:225,y:90,id:2}]});for(let n=1;n<=20;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:165-n*3,y:90,id:1},{x:225+n*3,y:90,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(300);const after=await p.evaluate(()=>visualViewport.scale);assert(after>before,'two-finger pinch must increase page scale');await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await cdp.detach();}
    const node=p.locator('[data-id="n_1_1"]');await node.scrollIntoViewIfNeeded();const r=await node.boundingBox();
    if(width===390)await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);else await node.click();
    assert.equal(await node.getAttribute('aria-pressed'),'true');
    assert((await p.locator('.orgx-node.is-related').count())>0,'related nodes highlighted');
    assert((await p.locator('.orgx-node.is-dim').count())>0,'unrelated nodes dimmed');
    assert((await p.locator('.orgx-lines path.is-highlight').count())>0,'connected line highlighted');
    assert((await p.locator('.orgx-lines path.is-dim').count())>0,'unrelated line dimmed');
    assert.equal(await p.locator('dialog[open]').count(),0,'selection must not open a dialog');
    if(process.env.ORG_SCREENSHOTS)await p.screenshot({path:path.join(process.env.ORG_SCREENSHOTS,`synthetic-${width}-selected.png`),fullPage:true});
    const detail=p.locator('.orgx-desktop-detail');
    assert(await detail.isVisible(),'detail stays below map');assert.equal(await detail.locator('ol li').count(),3);
    assert(await detail.getByText('무엇을 하는지에 대한 가상 설명').isVisible());
    assert((await detail.boundingBox()).y>=(await p.locator('.orgx-map').boundingBox()).y+(await p.locator('.orgx-map').boundingBox()).height-1,'details below map');
    const link=detail.locator('.orgx-related button').first();const linkText=await link.textContent();await link.click();assert.equal(await p.locator('.orgx-node.is-selected strong').textContent(),linkText);
    const selected=p.locator('.orgx-node.is-selected');await selected.scrollIntoViewIfNeeded();await selected.click();assert.equal(await p.locator('.orgx-node.is-selected').count(),0,'repeat selection clears');
    await p.locator('[data-id="n_1_1"]').click();await p.locator('.orgx-map').scrollIntoViewIfNeeded();const mapRect=await p.locator('.orgx-map').boundingBox();await p.mouse.click(mapRect.x+2,mapRect.y+2);assert.equal(await p.locator('.orgx-node.is-selected').count(),0,'blank map click clears');
    role='dahee';await p.evaluate(()=>window.testOrgAccount('dahee'));await p.locator('.orgx-node').first().waitFor();
    role='other';await p.evaluate(()=>window.testOrgAccount('other'));await p.getByText('이 계정의 조직도 접근 권한을 확인해 주세요.').waitFor();assert.equal(await p.locator('.orgx-node').count(),0);
    role='owner';delay=400;await p.evaluate(()=>window.testOrgAccount('owner'));role='other';delay=0;await p.evaluate(()=>window.testOrgAccount('other'));await p.getByText('이 계정의 조직도 접근 권한을 확인해 주세요.').waitFor();await p.waitForTimeout(500);assert.equal(await p.locator('.orgx-node').count(),0);
    await p.evaluate(()=>window.testOrgAccount(null));await p.getByText('로그인하면 허용된 계정으로 조직도를 볼 수 있어요.').waitFor();assert.equal(await p.locator('.orgx-node').count(),0);assert.deepEqual(errors,[]);
    await context.close();
    console.log(`PASS ${width}: seven columns, touch, selection, inline details, deselection and account changes`);
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
