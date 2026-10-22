// '브랜딩 도구' 화면 — 격리된 가상 주소와 합성 장부만 쓴다(운영 장부·실제 주문 자료 없음).
//  1) 공개 목록 계약: src/branding-data.json 에 허용한 칸·형식·값만 있고, 비공개 칸·경로·링크·시험용 표식이 공개 자산에 없다.
//     빌드 관문(brand_public_check.py, build.py)을 python 으로 실제 실행해 따옴표 키·모든 종류의 경로·판매처 밖 주소를 막는지 본다(SKIP 없음).
//  2) 공개 목록만 있을 때의 화면(증거 없는 상태 없음, 바깥 요청 없음)
//  3) 공개 자료에 비공개 값이 섞여 들어와도 화면·수정 창·저장 자료에 나오지 않는다(표식 회귀 검사)
//  4) 내 기록: 새 품목 등록 → 옵션·상태·시험 수정 → 새로고침 → 취소·복구 → 백업 → 다른 브라우저에서 복원, 다른 장부 보존.
//     증거 없는 상태가 든 백업은 가져오기에서 거절되고 장부·미리보기가 보존된다.
//  5) 모바일 폭
const {chromium}=require('playwright');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const {spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const KEY='mumutori-private-finance-v3';
const MARK='TEST_PRIVATE_';   // 시험용 비공개 표식 — 공개 자산과 화면에 남으면 안 된다
const ledger=()=>({products:[{id:'P1',name:'시험 상품',salesStatus:'판매 중'}],purchaseOrders:[],purchaseLines:[],stockMoves:[],bankTransactions:[],
 finance:{customUnknown:{keep:'me'}},erp:{accounts:[{id:'main',name:'사업 통장'}],partners:[{id:'pt1',name:'시험 거래처',type:'구매처'}],unknownField:'보존'}});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
(async()=>{
 // 1) 공개 목록 계약
 const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
 const src=['src/branding-data.json','src/pages/branding.js','branding.html'].map(read).join('\n');
 for(const [what,re] of [['드라이브·문서 링크',/drive\.google|docs\.google|\/file\/d\/|\/folders\//i],['개인 경로',/[A-Za-z]:[\\/]+Users|\/Users\/|H:[\\/]|내 드라이브/],['인증 정보',/password|token|secret|apiKey/i]])
  assert.doesNotMatch(src,re,'공개 파일에 '+what+'가 없어야 한다');
 assert.ok(!fs.existsSync(path.join(ROOT,'src/branding-data.js')),'공개 목록은 JSON 하나만 둔다(예전 JS 자료 파일 없음)');
 const publicAssets=[...fs.readdirSync(ROOT).filter(f=>/\.(html|py)$/.test(f)).map(f=>path.join(ROOT,f)),...walk(path.join(ROOT,'src'))];
 for(const f of publicAssets)assert.doesNotMatch(fs.readFileSync(f,'utf8'),/TEST_PRIVATE|SENTINEL|SYNTHETIC_/,'시험용 표식이 공개 자산에 남지 않는다: '+path.relative(ROOT,f));
 const D=JSON.parse(read('src/branding-data.json'));
 const ALLOW={root:['about','updated','editor','basis','statusRule','items','dont','makerRules','artPlan','reorderSteps','privateNote'],top:['id','kind','name','use','status','vendor','productNo','url','model','form','printSize','artSize','option','ink','price','art','pending','caution'],ink:['maker','model','volume','compat'],price:['lines','total','note','checked'],art:['rule']};
 assert.deepEqual(Object.keys(D).filter(k=>!ALLOW.root.includes(k)),[],'공개 목록 최상위에도 허용한 칸만');
 for(const it of D.items){
  assert.deepEqual(Object.keys(it).filter(k=>!ALLOW.top.includes(k)),[],it.id+' — 공개 목록에는 허용한 칸만(주문·도안 원본 칸 없음)');
  for(const k of ['ink','price','art'])if(it[k])assert.deepEqual(Object.keys(it[k]).filter(x=>!ALLOW[k].includes(x)),[],it.id+'.'+k+' — 허용한 칸만');
  assert.ok(['unregistered','candidate','recommended'].includes(it.status),it.id+' — 공개 목록의 상태는 미등록·후보·권고까지만');
  if(it.price)assert.equal(it.price.lines.reduce((a,[,v])=>a+v,0),it.price.total,it.id+' 금액 합계');
  if(it.url)assert.match(it.url,/^https:\/\/gogostamp\.com\//,it.id+' 판매처 공개 상품 주소만');}
 const by=Object.fromEntries(D.items.map(i=>[i.id,i]));
 assert.equal(by['STAMP-PAPER-01'].status,'recommended');assert.equal(by['INK-PAPER-01'].status,'recommended');assert.equal(by['STAMP-OPP-01'].status,'candidate');assert.equal(by['INK-OPP-01'].status,'candidate');
 assert.equal(by['STAMP-PAPER-01'].price.total,32000);assert.equal(by['STAMP-OPP-01'].price.total,48000);assert.equal(by['INK-PAPER-01'].price.total,2000);
 assert.match(D.statusRule,/준비안 반영 완료·실제 주문 전/);assert.doesNotMatch(D.statusRule,/준비 중/);assert.match(D.statusRule,/414 리필 호환·OPP 실물 시험은 아직 확정이 아니/);
 assert.match(by['INK-OPP-01'].ink.compat,/전용 리필로 확정하지 않음/);
 assert.ok(D.dont.some(t=>/110/.test(t)&&/속건|비닐/.test(t)&&/권하지 않/.test(t)),'110에 속건 잉크를 넣는 방식은 비추천으로 표시');
 console.log('PASS public list (JSON) holds only allowed fields and statuses; no private links, paths or test markers in public assets');

 // 빌드 관문 — python 을 실제로 실행한다. 임시 폴더의 사본만 쓰고 저장소 파일은 건드리지 않는다.
 const py=['python','python3','py'].find(c=>{const r=spawnSync(c,['--version'],{encoding:'utf8'});return !r.error&&r.status===0;});
 assert.ok(py,'빌드 관문 검사에는 python 이 필요하다 — 건너뛰지 않고 실패로 처리한다');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mmt-brand-gate-'));
 try{
  for(const d of ['src','_tools','assets'])if(fs.existsSync(path.join(ROOT,d)))fs.cpSync(path.join(ROOT,d),path.join(tmp,d),{recursive:true});   // 빌드가 쓰는 폴더(앱 아이콘: _tools · assets)
  for(const f of ['build.py','brand_public_check.py','manifest.webmanifest','offline.html'])if(fs.existsSync(path.join(ROOT,f)))fs.copyFileSync(path.join(ROOT,f),path.join(tmp,f));
  const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'},list=path.join(tmp,'src/branding-data.json'),original=fs.readFileSync(list,'utf8'),probe=path.join(tmp,'probe.json');
  const check=textOrObj=>{fs.writeFileSync(probe,typeof textOrObj==='string'?textOrObj:JSON.stringify(textOrObj));return spawnSync(py,['brand_public_check.py',probe],{cwd:tmp,encoding:'utf8',env});};
  const fresh=()=>JSON.parse(original),first=o=>o.items[0];assert.equal(first(fresh()).id,'STAMP-PAPER-01');
  const refused=(what,input,expect)=>{const r=check(input),outText=r.stdout+r.stderr;assert.equal(r.status,1,what+' — 검사가 거절해야 한다: '+outText);if(expect)assert.match(outText,expect,what);
   assert.doesNotMatch(outText,/SYNTHETIC|synthetic-private|someone|logo/,what+' — 검사 기록에 값 자체를 남기지 않는다');};
  const withItem=fn=>{const o=fresh();fn(first(o),o);return o;};
  assert.equal(check(original).status,0,'현재 공개 목록은 통과한다');
  // (가) 허용하지 않은 칸 — 따옴표를 붙인 칸 이름, 중첩, 최상위, 형식 바꿔치기
  refused('따옴표 키 orderNo(원문에 직접 끼워 넣음)',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01",\'orderNo\':\'SYNTHETIC_ORDER_PRIVATE\','),/JSON으로 읽을 수 없습니다/);
  refused('따옴표 키 "orderNo"',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01","orderNo":"SYNTHETIC_ORDER_PRIVATE",'),/허용하지 않은 칸 'orderNo'/);
  refused('따옴표 키 "artSource"',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01","artSource":"SYNTHETIC_SOURCE_PRIVATE",'),/허용하지 않은 칸 'artSource'/);
  refused('중첩 art.source',withItem(it=>{it.art.source='SYNTHETIC_SOURCE_PRIVATE';}),/art: 허용하지 않은 칸 'source'/);
  refused('중첩 price.paid',withItem(it=>{it.price.paid=34000;}),/price: 허용하지 않은 칸 'paid'/);
  refused('중첩 ink.memo',withItem(it=>{it.ink.memo='SYNTHETIC_NOTE';}),/ink: 허용하지 않은 칸 'memo'/);
  refused('주문 묶음 order{}',withItem(it=>{it.order={number:'SYNTHETIC_ORDER_PRIVATE',date:'2026-01-01'};}),/허용하지 않은 칸 'order'/);
  refused('최상위에 모르는 칸',withItem((it,o)=>{o.orders=[{no:'SYNTHETIC_ORDER_PRIVATE'}];}),/공개 목록: 허용하지 않은 칸 'orders'/);
  refused('글 칸에 묶음을 넣어 숨김',withItem(it=>{it.art.rule={source:'SYNTHETIC_SOURCE_PRIVATE'};}),/art\.rule: 글이어야/);
  refused('목록 칸에 묶음을 넣어 숨김',withItem(it=>{it.pending=[{orderNo:'SYNTHETIC_ORDER_PRIVATE'}];}),/pending: 글 목록이어야/);
  refused('같은 칸을 두 번 적어 숨김',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01","name":"SYNTHETIC_HIDDEN",'),/두 번 적혀/);
  refused('증거 없는 상태',withItem(it=>{it.status='inuse';}),/상태는/);
  refused('겹치는 품목 ID',withItem((it,o)=>{o.items[1].id=it.id;}),/품목 ID가 겹칩니다/);
  refused('금액 합 불일치',withItem(it=>{it.price.total+=1;}),/합이 total과 다릅니다/);
  refused('JSON 아님',original.slice(0,-3),/JSON으로 읽을 수 없습니다/);
  // (나) 허용한 칸 안의 값 — 파일 위치(윈도우 드라이브 양방향 슬래시·UNC·POSIX·홈·file:)와 판매처 밖 주소·개인 연락처
  const paths=[['윈도우 드라이브(/)','H:/synthetic-private/logo.ai'],['윈도우 드라이브(\\)','H:\\synthetic-private\\logo.ai'],['윈도우 Users 경로','C:/Users/someone/logo.ai'],['소문자 드라이브','c:\\work\\synthetic-private\\logo.ai'],
   ['UNC(\\\\)','\\\\nas\\share\\synthetic-private\\logo.ai'],['UNC(//)','//nas/share/synthetic-private/logo.ai'],['POSIX /home','/home/someone/logo.ai'],['POSIX /Users','/Users/someone/logo.ai'],['POSIX 일반','/synthetic-private/art/logo.ai'],
   ['POSIX 루트 파일','/logo-synthetic-private.ai'],['홈 폴더','~/synthetic-private/logo.ai'],['상대 경로(./)','./synthetic-private/logo'],['상대 경로(../)','../synthetic-private/logo'],['허용한 주소 뒤에 끼운 링크','https://gogostamp.com/product/110?next=https://drive.google.com/file/d/SYNTHETICID'],['허용한 주소 뒤에 끼운 도메인','https://gogostamp.com/go?u=drive.google.com/open'],['허용한 주소 뒤에 끼운 파일 ID','https://gogostamp.com/go?id=SYNTHETIC1UWJC7Y05arIqp70PGDHyFX1TSLxw'],['인코딩한 주소','https://gogostamp.com/go?u=https%3A%2F%2Fexample.test%2Fsomeone'],['지나치게 긴 글','가'.repeat(1001)],['file: 주소','file:///H:/synthetic-private/logo.ai'],['상대 폴더/파일','synthetic-private/logo-v01.ai'],['글 중간의 경로','원본은 D:/synthetic-private/로고 폴더에 있음'],
   ['드라이브 링크','https://drive.google.com/file/d/SYNTHETICID/view'],['주소 표시 없는 드라이브 링크','drive.google.com/open?id=SYNTHETICID'],['판매처 밖 주소','https://example.test/orders/SYNTHETIC_ORDER_PRIVATE'],['판매처를 흉내 낸 주소','https://gogostamp.com.evil.test/x'],
   ['@로 감춘 주소','https://gogostamp.com@evil.test/x'],['http 주소','http://gogostamp.com/product/110'],['메일','someone@example.test'],['전화번호','010-1234-5678'],['파일 ID 같은 문자열','SYNTHETIC1UWJC7Y05arIqp70PGDHyFX1TSLxw']];
  const spots=[['art.rule',(it,v)=>{it.art.rule=v;}],['caution',(it,v)=>{it.caution='메모 '+v;}],['pending',(it,v)=>{it.pending.push(v);}],['price.note',(it,v)=>{it.price.note=v;}],['price.lines 이름',(it,v)=>{it.price.lines[0][0]=v;}],['dont',(it,v,o)=>{o.dont.push(v);}],['statusRule',(it,v,o)=>{o.statusRule+=' '+v;}]];
  for(const [i,[what,value]] of paths.entries()){const [spot,put]=spots[i%spots.length];refused(what+' → '+spot,withItem((it,o)=>put(it,value,o)));}
  for(const [what,value] of [['url 칸: javascript','javascript:alert(1)'],['url 칸: http','http://gogostamp.com/product/110'],['url 칸: 판매처 밖','https://example.test/x'],['url 칸: 파일 경로','H:/synthetic-private/logo.ai'],['url 칸: 묶음',{href:'https://gogostamp.com/'}]])refused(what,withItem(it=>{it.url=value;}),/url: 판매처 상품 주소는/);
  refused('url 칸: 뒤에 끼운 링크',withItem(it=>{it.url='https://gogostamp.com/product/110?next=https://example.test/someone';}),/url: 주소 안에 끼워 넣은/);
  refused('금액 칸에 숨긴 긴 숫자',withItem(it=>{it.price.lines[0][1]=1012345678;it.price.total=1012345678+3000;}),/이하의 정수/);
  // (다) 오탐 없음 — 평소 쓰는 표현은 통과한다
  assert.equal(check(withItem(it=>{it.caution='30/35/40mm 비교 · 7/20~8/16 · AI / PDF · 1:1 mm · v01.ai / .pdf · 630원/개 · https://gogostamp.com/product/detail.html?product_no=110 참고';})).status,0,'평소 표현은 막지 않는다');
  // (라) 빌드 전체: 통과하면 화면 파일을 만들고, 어긋나면 아무것도 만들지 않고 멈춘다
  const build=()=>spawnSync(py,['build.py'],{cwd:tmp,encoding:'utf8',env}),html=path.join(tmp,'branding.html');
  const clean=build();assert.equal(clean.status,0,'손대지 않은 사본은 빌드된다: '+clean.stderr);assert.ok(fs.existsSync(html));
  for(const [what,text] of [['"orderNo" 칸',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01","orderNo":"SYNTHETIC_ORDER_PRIVATE",')],['"artSource" 칸',original.replace('"id": "STAMP-PAPER-01",','"id": "STAMP-PAPER-01","artSource":"SYNTHETIC_SOURCE_PRIVATE",')],
   ['허용한 칸 안의 H:/ 경로',JSON.stringify(withItem(it=>{it.art.rule='H:/synthetic-private/logo.ai';}))],['허용한 칸 안의 UNC 경로',JSON.stringify(withItem(it=>{it.caution='\\\\nas\\share\\logo.ai';}))]]){
   fs.writeFileSync(list,text);for(const f of fs.readdirSync(tmp).filter(f=>f.endsWith('.html')))fs.rmSync(path.join(tmp,f));
   const r=build();assert.notEqual(r.status,0,what+' — 빌드가 멈춘다');assert.match(r.stderr+r.stdout,/빌드 중단/);assert.equal(fs.readdirSync(tmp).filter(f=>f.endsWith('.html')).length,0,what+' — 멈춘 빌드는 화면 파일을 하나도 만들지 않는다');}
  fs.writeFileSync(list,original);fs.writeFileSync(path.join(tmp,'src/branding-data.js'),"export const ITEMS=[{id:'X','orderNo':'SYNTHETIC_ORDER_PRIVATE'}];");
  const stale=build();assert.notEqual(stale.status,0,'예전 JS 자료 파일이 다시 생기면 빌드가 멈춘다');assert.match(stale.stderr+stale.stdout,/branding-data\.js/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 console.log('PASS build gate really ran in python: unknown/quoted/nested fields, every path form, outside links and contacts are refused without echoing values; clean list builds');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const errors=[],outside=[],sent=[];
 // 격리된 브라우저(=다른 기기 한 대)를 만든다. poison 이 있으면 공개 목록 응답을 바꿔 치기한다.
 async function device({poison=null,width=1440}={}){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(([key,value])=>{try{if(!localStorage.getItem(key))localStorage.setItem(key,value);}catch(e){}},[KEY,JSON.stringify(ledger())]);
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());sent.push(u.href+' '+(req.postData()||''));
   if(u.origin!=='https://mumutori.test'){outside.push(u.href);return route.abort();}
   const name=u.pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);
   if(poison&&name==='src/branding-data.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(poison(JSON.parse(fs.readFileSync(file,'utf8'))))});
   return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const open=async name=>{await page.goto(ORIGIN+name+'.html');await page.locator('h1').waitFor();};
  const raw=()=>page.evaluate(k=>localStorage.getItem(k),KEY);
  const stored=async()=>JSON.parse(await raw());
  const save=async()=>{await page.locator('#submit-record').click();await page.locator('[role="dialog"]').waitFor({state:'hidden',timeout:2500}).catch(async()=>{throw Error('Save failed: '+await page.locator('#form-error').textContent());});};
  return {context,page,open,raw,stored,save};
 }

 // 2) 공개 목록만 있을 때
 const A=await device();let {page,open,stored,save}=A;
 let modules=[];page.on('request',r=>{if(r.url().includes('/src/pages/'))modules.push(new URL(r.url()).pathname);});
 await open('branding');await page.locator('.br-card').first().waitFor();
 assert.equal(await page.locator('body').getAttribute('data-page'),'branding');assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('data-view'),'branding');
 assert.equal(modules.length,1);assert(modules[0].endsWith('/branding.js'));
 assert.equal(await page.locator('.br-card').count(),D.items.length);assert.equal(await page.locator('.br-table tbody tr').count(),D.items.length);
 assert.equal(await page.locator('.br-card.br-ordered,.br-card.br-received,.br-card.br-inuse').count(),0,'증거 없는 주문 완료·수령·사용 중 없음');assert.equal(await page.locator('.br-minetag').count(),0);
 const paper=page.locator('#STAMP-PAPER-01');assert.match(await paper.textContent(),/권고/);assert.match(await paper.textContent(),/남은 확인/);
 await paper.locator('details>summary').first().click();const grid=await paper.locator('details').first().textContent();
 assert.match(grid,/고고스탬프/);assert.match(grid,/최대 72×46mm/);assert.match(grid,/32,000원/);assert.match(grid,/34,000원 예상/);assert.match(grid,/발주일\s*기록 없음/);assert.match(grid,/주문번호\s*기록 없음/);assert.match(grid,/도안 원본 위치\s*기록 없음/);assert.match(grid,/이 브라우저에만 저장/);
 const a=paper.locator('.br-grid a').first();assert.equal(await a.getAttribute('rel'),'noopener noreferrer');assert.equal(await a.getAttribute('target'),'_blank');assert.match(await a.getAttribute('href'),/^https:\/\/gogostamp\.com\//);
 assert.match(await page.locator('#STAMP-OPP-01').textContent(),/후보/);assert.match(await page.locator('#INK-OPP-01').textContent(),/확인 전에는 414에 넣지 않습니다/);
 assert.match(await page.locator('.note.amber').textContent(),/준비안 반영 완료·실제 주문 전/);assert.match(await page.locator('.br-store').textContent(),/이 브라우저에만 저장/);
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.doesNotMatch(csp,/firebase|googleapis|apis\.google/);assert.match(csp,/connect-src 'self';/);assert.match(csp,/frame-src 'none'/);
 assert.equal((await stored()).erp.branding,undefined,'보기만 해서는 장부에 칸을 만들지 않는다');
 console.log('PASS public-only view: every item with status, reorder facts and blanks; no evidence-less status; strict CSP; viewing writes nothing');

 // 3) 표식 회귀 검사: (빌드 관문을 거치지 않고) 공개 자료에 비공개 값·모르는 칸·증거 없는 상태가 섞여 들어온 경우
 const poison=o=>{const it=o.items[0];Object.assign(it,{orderNo:MARK+'ORDER_NO',artSource:MARK+'ART_SOURCE',paid:MARK+'PAID',orderUrl:'https://example.test/'+MARK+'ORDER_URL',secretPath:MARK+'UNKNOWN',order:{number:MARK+'NESTED_ORDER',date:'2026-01-01',received:'2026-01-02',sampleTest:MARK+'TEST'},status:'inuse'});
  Object.assign(it.art,{source:MARK+'NESTED_SOURCE',version:MARK+'VERSION'});o.leak={path:MARK+'TOP_LEVEL'};return o;};
 assert.equal((JSON.stringify(poison(JSON.parse(read('src/branding-data.json')))).match(/TEST_PRIVATE_/g)||[]).length,10,'표식 10개가 가상 응답에 모두 들어갔는지');
 const B=await device({poison});
 await B.open('branding');await B.page.locator('.br-card').first().waitFor();
 assert.equal(await B.page.locator('.br-card').count(),D.items.length);
 assert.doesNotMatch(await B.page.content(),/TEST_PRIVATE/,'공개 자료에 섞인 비공개 값이 화면(HTML 전체)에 나오지 않는다');
 assert.equal(await B.page.locator('.br-card.br-inuse').count(),0,'공개 자료만으로는 사용 중이 되지 않는다');assert.match(await B.page.locator('#STAMP-PAPER-01 header').textContent(),/후보/);
 assert.match(await B.page.locator('#STAMP-PAPER-01 details').first().textContent(),/발주일\s*기록 없음/);
 await B.page.locator('[data-action="edit"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();
 const formValues=await B.page.evaluate(()=>[...document.querySelectorAll('#editor-form input,#editor-form textarea,#editor-form select')].map(e=>e.name+'='+e.value).join('\n'));
 assert.doesNotMatch(formValues,/TEST_PRIVATE/,'수정 창에도 넘어오지 않는다');assert.match(formValues,/orderNo=\n/);assert.match(formValues,/artSource=\n/);assert.match(formValues,/orderDate=\n/);
 await B.save();const savedB=JSON.stringify(await B.stored());assert.doesNotMatch(savedB,/TEST_PRIVATE/,'저장한 장부에도 들어가지 않는다');assert.equal((await B.stored()).erp.branding[0].status,'candidate');
 await B.context.close();
 console.log('PASS private markers injected into the public list never reach the page, the editor or the saved ledger; public data cannot raise status');

 // 4) 내 기록 관리
 const before=await stored();
 await page.locator('.pagehead [data-action="edit"][data-type="branding"]').click();
 assert.equal(await page.locator('[role="dialog"] h2').textContent(),'브랜딩 기록 등록');assert.equal(await page.locator('#f-id').inputValue(),'BRAND-01');
 await page.locator('#f-id').fill('PACK-TAPE-01');await page.locator('#f-kind').selectOption('포장재');await page.locator('#f-name').fill('시험 포장 테이프');await page.locator('#f-use').fill('택배 상자 봉합');
 await page.locator('#f-vendor').fill('시험 판매처');await page.locator('#f-productNo').fill('T-48');await page.locator('#f-option').fill('투명 48mm');
 await page.locator('#f-url').fill('javascript:alert(1)');await page.locator('#submit-record').click();assert.match(await page.locator('#form-error').textContent(),/http/);
 await page.locator('#f-url').fill('https://example.test/tape');await page.locator('#f-status').selectOption('ordered');await page.locator('#submit-record').click();
 assert.match(await page.locator('#form-error').textContent(),/발주일/,'증거 없이 주문 완료로 올릴 수 없다');
 await page.locator('#f-status').selectOption('candidate');await save();
 assert.equal((await stored()).erp.branding.length,1);assert.equal(await page.locator('.br-card').count(),D.items.length+1);assert.equal(await page.locator('#PACK-TAPE-01 .br-minetag').count(),1);
 await page.locator('[data-action="edit"][data-type="branding"][data-id="PACK-TAPE-01"]').click();
 assert.equal(await page.locator('[role="dialog"] h2').textContent(),'브랜딩 기록 수정');assert.equal(await page.locator('#f-id').isDisabled(),true);
 await page.locator('#f-option').fill('투명 48mm × 50m');await page.locator('#f-status').selectOption('received');await page.locator('#f-orderDate').fill('2026-10-20');await page.locator('#f-receivedDate').fill('2026-10-23');
 await page.locator('#f-orderNo').fill('ORDER-PRIVATE-7781');await page.locator('#f-paid').fill('12000');await page.locator('#f-artSource').fill('private-folder/tape-art-v02.ai');await page.locator('#f-artVersion').fill('v02');
 await page.locator('#f-testDate').fill('2026-10-24');await page.locator('#f-testResult').selectOption('합격');await page.locator('#f-testMaterial').fill('지금 쓰는 택배 상자');await page.locator('#f-testNote').fill('문지름·구김 통과');await save();
 await page.reload();await page.locator('#PACK-TAPE-01').waitFor();
 const tape=await page.locator('#PACK-TAPE-01').textContent();
 for(const re of [/수령/,/투명 48mm × 50m/,/ORDER-PRIVATE-7781/,/12,000원/,/private-folder\/tape-art-v02\.ai/,/2026-10-24 · 합격 · 지금 쓰는 택배 상자/,/문지름·구김 통과/])assert.match(tape,re,'새로고침 뒤에도 내 기록이 보인다');
 assert.equal(await page.locator('#PACK-TAPE-01 .br-mine a').count(),0,'주소가 아닌 도안 위치는 글로만 보인다');
 assert.match(await page.locator('.br-table tbody tr',{hasText:'PACK-TAPE-01'}).textContent(),/발주 2026-10-20 · 수령 2026-10-23 · 시험 합격/);
 // 공개 목록의 품목에 내 기록 만들기 → 취소하면 공개 내용으로 돌아가고 복구할 수 있다
 await page.locator('[data-action="edit"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();
 assert.equal(await page.locator('#f-id').inputValue(),'STAMP-PAPER-01');assert.equal(await page.locator('#f-id').isDisabled(),true);assert.equal(await page.locator('#f-priceTotal').inputValue(),'32000');assert.equal(await page.locator('#f-vendor').inputValue(),'고고스탬프');
 await page.locator('#f-artVersion').fill('v01');await page.locator('#f-option').fill('본체 검정 — 내 메모');await save();
 let rec=(await stored()).erp.branding.find(r=>r.id==='STAMP-PAPER-01');assert.equal(rec.status,'recommended');assert.equal(rec.artVersion,'v01');assert.equal(rec.shape,'잉크 내장 만년형(외부 패드 불필요)');
 assert.equal(await page.locator('.br-card').count(),D.items.length+1,'같은 품목이 두 번 나오지 않는다');assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/내 기록/);assert.match(await page.locator('#STAMP-PAPER-01 .br-pub').textContent(),/공개 목록의 안내 보기/);
 await page.locator('[data-action="void"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();await page.locator('#f-reason').fill('시험 취소');await save();
 assert.equal(await page.locator('#STAMP-PAPER-01 .br-minetag').count(),0);assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/취소한 내 기록이 있습니다/);assert.doesNotMatch(await page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 await page.locator('[data-action="void"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();await page.locator('#STAMP-PAPER-01 .br-minetag').waitFor();assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 await page.locator('#search').fill('TAPE');await page.waitForFunction(n=>document.querySelectorAll('.br-card').length===n,1);await page.locator('#search').fill('');await page.waitForFunction(n=>document.querySelectorAll('.br-card').length===n,D.items.length+1);
 // 다른 장부·모르는 칸 보존, 변경 이력에는 값이 남지 않는다
 const after=await stored();
 for(const k of ['products','bankTransactions','purchaseLines','purchaseOrders','stockMoves'])assert.deepEqual(after[k],before[k],k+' 그대로');
 assert.deepEqual(after.finance.customUnknown,{keep:'me'});assert.equal(after.erp.unknownField,'보존');assert.deepEqual(after.erp.partners,before.erp.partners);assert.deepEqual(after.erp.accounts,before.erp.accounts);
 assert.ok(after.erp.audit.some(l=>l.type==='branding'&&l.recordId==='PACK-TAPE-01'));assert.doesNotMatch(JSON.stringify(after.erp.audit),/ORDER-PRIVATE-7781|private-folder/,'변경 이력에는 칸 이름만');
 await open('audit');assert.match(await page.locator('.table').textContent(),/브랜딩 기록/);assert.doesNotMatch(await page.content(),/ORDER-PRIVATE-7781|private-folder/);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.top-actions [data-action="backup"]').click()]);
 const backup=fs.readFileSync(await download.path(),'utf8');assert.equal(JSON.parse(backup).erp.branding.length,2,'전체 백업에 브랜딩 기록이 들어간다');
 console.log('PASS my records: add item, edit option/status/test, evidence rule, reload, void/restore, search, backup download; other ledgers and unknown fields kept; audit holds field names only');

 // 다른 브라우저(새 기기)에서 백업 가져오기 — 증거 없는 상태가 든 백업은 거절, 정상 백업은 예전처럼 병합
 const E=await device();
 await E.open('branding');assert.equal(await E.page.locator('.br-minetag').count(),0);
 await E.open('settings');const untouched=await E.raw();
 const file=(name,obj)=>({name,mimeType:'application/json',buffer:Buffer.from(typeof obj==='string'?obj:JSON.stringify(obj))});
 const tampered=fn=>{const b=JSON.parse(backup);fn(b.erp.branding);return b;};
 for(const [what,bad,re] of [['증거 없는 사용 중',tampered(rows=>rows.push({id:'SYN-UNPROVEN',name:'Synthetic unproven use',kind:'도장',status:'inuse'})),/SYN-UNPROVEN[\s\S]*수령일이나 사용 근거/],
  ['발주일 없는 주문 완료',tampered(rows=>{rows[0].status='ordered';delete rows[0].orderDate;}),/PACK-TAPE-01[\s\S]*발주일/],['스크립트 주소',tampered(rows=>{rows[0].url='javascript:alert(1)';}),/주소/],['기록이 아닌 줄',tampered(rows=>rows.push(null)),/형식/]]){
  await E.page.locator('#backup-file').setInputFiles(file('backup.json',bad));
  await E.page.waitForFunction(()=>{const t=document.querySelector('#toast');return t&&!t.hidden&&t.classList.contains('error');});
  assert.match(await E.page.locator('#toast').textContent(),re,what+' — 이유를 알려 준다');assert.equal(await E.page.locator('[role="dialog"]').count(),0,what+' — 병합 창이 열리지 않는다');
  assert.equal(await E.raw(),untouched,what+' — 장부 전체가 그대로');assert.equal(await E.page.evaluate(()=>localStorage.getItem('mumutori-before-import')),null);
  await E.page.evaluate(()=>{document.querySelector('#toast').hidden=true;});}
 // 같은 이름의 파일을 바로잡아 다시 고르면 미리보기가 열린다
 await E.page.locator('#backup-file').setInputFiles(file('backup.json',backup));
 await E.page.locator('[role="dialog"]').waitFor();assert.match(await E.page.locator('[role="dialog"]').textContent(),/추가 2건/);
 // 병합을 누르는 순간 다른 창이 장부를 바꿨다면: 저장하지 않고, 미리보기 창과 다른 창의 자료를 그대로 둔다
 const otherWindow=await E.page.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));d.otherWindowMark='다른 창에서 저장';const t=JSON.stringify(d);localStorage.setItem(k,t);return t;},KEY);
 await E.page.locator('#submit-record').click();
 assert.match(await E.page.locator('#form-error').textContent(),/다른 창에서 자료가 변경/);assert.match(await E.page.locator('[role="dialog"]').textContent(),/추가 2건/,'미리보기 창이 남아 있다');assert.equal(await E.raw(),otherWindow,'다른 창이 저장한 장부를 덮어쓰지 않는다');
 // 새로 읽은 뒤 다시 가져오면 예전 규칙대로 병합된다
 await E.open('settings');await E.page.locator('#backup-file').setInputFiles(file('backup.json',backup));
 await E.page.locator('[role="dialog"]').waitFor();assert.match(await E.page.locator('[role="dialog"]').textContent(),/추가 2건/);await E.save();
 await E.open('branding');await E.page.locator('#PACK-TAPE-01').waitFor();
 assert.equal(await E.page.locator('.br-minetag').count(),2);assert.match(await E.page.locator('#PACK-TAPE-01').textContent(),/ORDER-PRIVATE-7781/);assert.match(await E.page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 const restored=await E.stored();assert.deepEqual(restored.products,before.products);assert.equal(restored.erp.unknownField,'보존');assert.deepEqual(restored.finance.customUnknown,{keep:'me'});assert.equal(restored.otherWindowMark,'다른 창에서 저장');
 assert.equal(restored.erp.branding.length,2);assert.ok(!restored.erp.branding.some(r=>r.id==='SYN-UNPROVEN'));
 await E.context.close();
 assert.deepEqual(outside,[],'화면이 바깥 주소로 요청을 보내지 않는다');
 assert.ok(!sent.some(s=>/ORDER-PRIVATE-7781|private-folder|TEST_PRIVATE|SYN-UNPROVEN/.test(s)),'내 기록의 값은 어떤 요청에도 실리지 않는다');
 console.log('PASS backup import: evidence-less or malformed branding rows are refused with the reason and the ledger untouched; preview survives a commit failure; a valid backup still merges; nothing leaves the browser');

 // 5) 모바일 폭
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await open('branding');await page.locator('.br-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="edit"][data-type="branding"][data-id="PACK-TAPE-01"]').click();
 const box=await page.locator('.modal').boundingBox();assert(box.x>=0&&box.x+box.width<=391,'수정 창이 화면 안에 들어온다');
 assert.deepEqual(errors,[]);console.log('PASS mobile widths, editor fits, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
