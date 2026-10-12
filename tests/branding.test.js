// '브랜딩 도구' 화면 — 격리된 가상 주소와 합성 장부만 쓴다(운영 장부·실제 주문 자료 없음).
//  1) 공개 목록 계약: 공개해도 되는 칸만 있고, 비공개 칸·링크·경로·시험용 표식이 공개 자산에 없다. 빌드 관문이 막는다.
//  2) 공개 목록만 있을 때의 화면(증거 없는 상태 없음, 바깥 요청 없음)
//  3) 공개 자료에 비공개 값이 섞여 들어와도 화면·수정 창·저장 자료에 나오지 않는다(표식 회귀 검사)
//  4) 내 기록: 새 품목 등록 → 옵션·상태·시험 수정 → 새로고침 → 취소·복구 → 백업 → 다른 브라우저에서 복원, 다른 장부 보존
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
 const src=['src/branding-data.js','src/pages/branding.js','branding.html'].map(read).join('\n');
 for(const [what,re] of [['드라이브·문서 링크',/drive\.google|docs\.google|\/file\/d\/|\/folders\//i],['개인 경로',/[A-Za-z]:[\\/]+Users|\/Users\/|H:[\\/]|내 드라이브/],['인증 정보',/password|token|secret|apiKey/i]])
  assert.doesNotMatch(src,re,'공개 파일에 '+what+'가 없어야 한다');
 const publicAssets=[...fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')).map(f=>path.join(ROOT,f)),...walk(path.join(ROOT,'src'))];
 for(const f of publicAssets)assert.doesNotMatch(fs.readFileSync(f,'utf8'),/TEST_PRIVATE|SENTINEL/,'시험용 표식이 공개 자산에 남지 않는다: '+path.relative(ROOT,f));
 const D=await import(require('node:url').pathToFileURL(path.join(ROOT,'src/branding-data.js')).href);
 const ALLOW={top:['id','kind','name','use','status','vendor','productNo','url','model','form','printSize','artSize','option','ink','price','art','pending','caution'],ink:['maker','model','volume','compat'],price:['lines','total','note','checked'],art:['rule']};
 for(const it of D.ITEMS){
  assert.deepEqual(Object.keys(it).filter(k=>!ALLOW.top.includes(k)),[],it.id+' — 공개 목록에는 허용한 칸만(주문·도안 원본 칸 없음)');
  for(const k of ['ink','price','art'])if(it[k])assert.deepEqual(Object.keys(it[k]).filter(x=>!ALLOW[k].includes(x)),[],it.id+'.'+k+' — 허용한 칸만');
  assert.ok(['unregistered','candidate','recommended'].includes(it.status),it.id+' — 공개 목록의 상태는 미등록·후보·권고까지만');
  if(it.price)assert.equal(it.price.lines.reduce((a,[,v])=>a+v,0),it.price.total,it.id+' 금액 합계');
  if(it.url)assert.match(it.url,/^https:\/\/gogostamp\.com\//,it.id+' 판매처 공개 상품 주소만');}
 const by=Object.fromEntries(D.ITEMS.map(i=>[i.id,i]));
 assert.equal(by['STAMP-PAPER-01'].status,'recommended');assert.equal(by['INK-PAPER-01'].status,'recommended');assert.equal(by['STAMP-OPP-01'].status,'candidate');assert.equal(by['INK-OPP-01'].status,'candidate');
 assert.equal(by['STAMP-PAPER-01'].price.total,32000);assert.equal(by['STAMP-OPP-01'].price.total,48000);assert.equal(by['INK-PAPER-01'].price.total,2000);
 assert.match(D.STATUS_RULE,/준비안 반영 완료·실제 주문 전/);assert.doesNotMatch(D.STATUS_RULE,/준비 중/);assert.match(D.STATUS_RULE,/414 리필 호환·OPP 실물 시험은 아직 확정이 아니/);
 assert.match(by['INK-OPP-01'].ink.compat,/전용 리필로 확정하지 않음/);
 assert.ok(D.DONT.some(t=>/110/.test(t)&&/속건|비닐/.test(t)&&/권하지 않/.test(t)),'110에 속건 잉크를 넣는 방식은 비추천으로 표시');
 // 빌드 관문: 공개 목록에 비공개 칸·링크가 들어오면 build.py 가 멈춘다(임시 폴더의 사본으로 확인 — 저장소 파일은 건드리지 않는다)
 const py=['python','python3','py'].find(c=>!spawnSync(c,['--version'],{encoding:'utf8'}).error);
 if(!py)console.log('SKIP build gate — python 실행 파일을 찾지 못함');
 else{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mmt-brand-gate-'));
  try{
   fs.cpSync(path.join(ROOT,'src'),path.join(tmp,'src'),{recursive:true});fs.copyFileSync(path.join(ROOT,'build.py'),path.join(tmp,'build.py'));
   const run=()=>spawnSync(py,['build.py'],{cwd:tmp,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
   const clean=run();assert.equal(clean.status,0,'손대지 않은 사본은 빌드된다: '+clean.stderr);
   const data=path.join(tmp,'src/branding-data.js'),original=fs.readFileSync(data,'utf8');
   for(const [what,poison] of [['주문번호 칸',"id:'STAMP-PAPER-01',orderNo:'"+MARK+"ORDER',"],['도안 원본 칸',"id:'STAMP-PAPER-01',art:{source:'"+MARK+"SOURCE'},"],['드라이브 링크',"id:'STAMP-PAPER-01',memo:'https://drive.google.com/file/d/"+MARK+"ID',"]]){
    fs.writeFileSync(data,original.replace("id:'STAMP-PAPER-01',",poison));fs.rmSync(path.join(tmp,'branding.html'),{force:true});
    const r=run();assert.notEqual(r.status,0,what+'가 들어오면 빌드가 멈춘다');assert.match(r.stderr+r.stdout,/빌드 중단/);assert.ok(!fs.existsSync(path.join(tmp,'branding.html')),'멈춘 빌드는 화면 파일을 만들지 않는다');}
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 }
 console.log('PASS public list holds only allowed fields and statuses; no private links, paths or test markers in public assets; build gate stops private fields');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME,args:['--no-sandbox']});
 const errors=[],outside=[],sent=[];
 // 격리된 브라우저(=다른 기기 한 대)를 만든다. poison 이 있으면 공개 목록 응답을 바꿔 치기한다.
 async function device({poison=null,width=1440}={}){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(([key,value])=>{try{if(!localStorage.getItem(key))localStorage.setItem(key,value);}catch(e){}},[KEY,JSON.stringify(ledger())]);
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());sent.push(u.href+' '+(req.postData()||''));
   if(u.origin!=='https://mumutori.test'){outside.push(u.href);return route.abort();}
   const name=u.pathname.replace('/mumutori-dashboard/','')||'index.html';const file=path.join(ROOT,name);const ext=path.extname(file);
   if(poison&&name==='src/branding-data.js')return route.fulfill({status:200,contentType:'application/javascript',body:poison(fs.readFileSync(file,'utf8'))});
   return route.fulfill({status:fs.existsSync(file)?200:404,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.gz':'application/gzip'})[ext]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'Not found'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const open=async name=>{await page.goto(ORIGIN+name+'.html');await page.locator('h1').waitFor();};
  const stored=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
  const save=async()=>{await page.locator('#submit-record').click();await page.locator('[role="dialog"]').waitFor({state:'hidden',timeout:2500}).catch(async()=>{throw Error('Save failed: '+await page.locator('#form-error').textContent());});};
  return {context,page,open,stored,save};
 }

 // 2) 공개 목록만 있을 때
 const A=await device();let {page,open,stored,save}=A;
 let modules=[];page.on('request',r=>{if(r.url().includes('/src/pages/'))modules.push(new URL(r.url()).pathname);});
 await open('branding');await page.locator('.br-card').first().waitFor();
 assert.equal(await page.locator('body').getAttribute('data-page'),'branding');assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('data-view'),'branding');
 assert.equal(modules.length,1);assert(modules[0].endsWith('/branding.js'));
 assert.equal(await page.locator('.br-card').count(),D.ITEMS.length);assert.equal(await page.locator('.br-table tbody tr').count(),D.ITEMS.length);
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

 // 3) 표식 회귀 검사: 공개 자료에 비공개 값·모르는 칸·증거 없는 상태가 섞여 들어온 경우
 const poison=text=>text.replace("id:'STAMP-PAPER-01',","id:'STAMP-PAPER-01',orderNo:'"+MARK+"ORDER_NO',artSource:'"+MARK+"ART_SOURCE',paid:'"+MARK+"PAID',orderUrl:'https://example.test/"+MARK+"ORDER_URL',secretPath:'"+MARK+"UNKNOWN',order:{number:'"+MARK+"NESTED_ORDER',date:'2026-01-01',received:'2026-01-02',sampleTest:'"+MARK+"TEST'},")
  .replace("art:{rule:'박스·봉투용","art:{source:'"+MARK+"NESTED_SOURCE',version:'"+MARK+"VERSION',rule:'박스·봉투용").replace("use:'비코팅 헤더카드·크라프트·택배 상자',status:'recommended'","use:'비코팅 헤더카드·크라프트·택배 상자',status:'inuse'");
 assert.equal((poison(read('src/branding-data.js')).match(/TEST_PRIVATE_/g)||[]).length,9,'표식 9개가 가상 응답에 모두 들어갔는지');
 const B=await device({poison});
 await B.open('branding');await B.page.locator('.br-card').first().waitFor();
 assert.equal(await B.page.locator('.br-card').count(),D.ITEMS.length);
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
 assert.equal((await stored()).erp.branding.length,1);assert.equal(await page.locator('.br-card').count(),D.ITEMS.length+1);assert.equal(await page.locator('#PACK-TAPE-01 .br-minetag').count(),1);
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
 assert.equal(await page.locator('.br-card').count(),D.ITEMS.length+1,'같은 품목이 두 번 나오지 않는다');assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/내 기록/);assert.match(await page.locator('#STAMP-PAPER-01 .br-pub').textContent(),/공개 목록의 안내 보기/);
 await page.locator('[data-action="void"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();await page.locator('#f-reason').fill('시험 취소');await save();
 assert.equal(await page.locator('#STAMP-PAPER-01 .br-minetag').count(),0);assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/취소한 내 기록이 있습니다/);assert.doesNotMatch(await page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 await page.locator('[data-action="void"][data-type="branding"][data-id="STAMP-PAPER-01"]').click();await page.locator('#STAMP-PAPER-01 .br-minetag').waitFor();assert.match(await page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 await page.locator('#search').fill('TAPE');await page.waitForFunction(n=>document.querySelectorAll('.br-card').length===n,1);await page.locator('#search').fill('');await page.waitForFunction(n=>document.querySelectorAll('.br-card').length===n,D.ITEMS.length+1);
 // 다른 장부·모르는 칸 보존, 변경 이력에는 값이 남지 않는다, 바깥으로 나가지 않는다
 const after=await stored();
 for(const k of ['products','bankTransactions','purchaseLines','purchaseOrders','stockMoves'])assert.deepEqual(after[k],before[k],k+' 그대로');
 assert.deepEqual(after.finance.customUnknown,{keep:'me'});assert.equal(after.erp.unknownField,'보존');assert.deepEqual(after.erp.partners,before.erp.partners);assert.deepEqual(after.erp.accounts,before.erp.accounts);
 assert.ok(after.erp.audit.some(l=>l.type==='branding'&&l.recordId==='PACK-TAPE-01'));assert.doesNotMatch(JSON.stringify(after.erp.audit),/ORDER-PRIVATE-7781|private-folder/,'변경 이력에는 칸 이름만');
 await open('audit');assert.match(await page.locator('.table').textContent(),/브랜딩 기록/);assert.doesNotMatch(await page.content(),/ORDER-PRIVATE-7781|private-folder/);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.top-actions [data-action="backup"]').click()]);
 const backup=fs.readFileSync(await download.path(),'utf8');assert.equal(JSON.parse(backup).erp.branding.length,2,'전체 백업에 브랜딩 기록이 들어간다');
 // 다른 브라우저(새 기기)에서 백업 가져오기
 const Cdev=await device();
 await Cdev.open('branding');assert.equal(await Cdev.page.locator('.br-minetag').count(),0);
 await Cdev.open('settings');await Cdev.page.locator('#backup-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
 await Cdev.page.locator('[role="dialog"]').waitFor();assert.match(await Cdev.page.locator('[role="dialog"]').textContent(),/추가 2건/);await Cdev.save();
 await Cdev.open('branding');await Cdev.page.locator('#PACK-TAPE-01').waitFor();
 assert.equal(await Cdev.page.locator('.br-minetag').count(),2);assert.match(await Cdev.page.locator('#PACK-TAPE-01').textContent(),/ORDER-PRIVATE-7781/);assert.match(await Cdev.page.locator('#STAMP-PAPER-01').textContent(),/본체 검정 — 내 메모/);
 const restored=await Cdev.stored();assert.deepEqual(restored.products,before.products);assert.equal(restored.erp.unknownField,'보존');assert.deepEqual(restored.finance.customUnknown,{keep:'me'});
 await Cdev.context.close();
 assert.deepEqual(outside,[],'화면이 바깥 주소로 요청을 보내지 않는다');
 assert.ok(!sent.some(s=>/ORDER-PRIVATE-7781|private-folder|TEST_PRIVATE/.test(s)),'내 기록의 값은 어떤 요청에도 실리지 않는다');
 console.log('PASS my records: add item, edit option/status/test, evidence rule, reload, void/restore, backup and restore on another browser; other ledgers and unknown fields kept; nothing leaves the browser');

 // 5) 모바일 폭
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await open('branding');await page.locator('.br-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll at '+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="edit"][data-type="branding"][data-id="PACK-TAPE-01"]').click();
 const box=await page.locator('.modal').boundingBox();assert(box.x>=0&&box.x+box.width<=391,'수정 창이 화면 안에 들어온다');
 assert.deepEqual(errors,[]);console.log('PASS mobile widths, editor fits, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
