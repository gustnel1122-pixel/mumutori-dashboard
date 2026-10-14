// '캐릭터 만들기' 화면 — 격리된 가상 주소만 쓴다(바깥 요청·운영 장부·공용 장부 없음).
//  1) 공개 자산 계약: 화면 코드·참고 그림 폴더에 드라이브 주소·개인 경로·공용 장부 주소가 없고, 이 화면의 CSP 는 바깥 연결을 허용하지 않는다
//  2) 처음 열었을 때: 캐릭터 6명 · 그림 14칸 · 참고 그림 · 열어 보기만 해서는 아무것도 저장하지 않음
//  3) 프로필 적기 → 저장 → 새로고침 뒤에도 남음
//  4) 그림 칸: 상태 · 파일 위치 · 미리보기 올리기(작게 줄여 저장) · 대표 그림 고르기
//  5) 확정(고정): 빠진 것 안내 → 확정 → 프로필·대표 그림 잠김, 날짜·이름 남음 → 잠금 해제
//  6) 캐릭터 추가·빼기
//  7) 넘기기: 확정 목록 파일(확정된 캐릭터만) · 전체 저장 파일 → 다른 브라우저에서 가져오기 · 잘못된 파일은 통째로 거절
//  8) 자료 규칙(characters-core): 모르는 칸·긴 글·그림이 아닌 미리보기·잘못된 상태를 걸러 냄
//  9) 모바일 폭, 쉬운 말(화면에 기술 용어 없음), 운영 장부를 건드리지 않음
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const KEY='mumutori-character-board-v1',ERP_KEY='mumutori-private-finance-v3';
const TYPES={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.gz':'application/gzip','.webp':'image/webp','.png':'image/png'};
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
(async()=>{
 // 1) 공개 자산 계약
 const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
 const code=['src/pages/characters.js','src/characters-core.js','characters.html'].map(read).join('\n');
 for(const bad of [/drive\.google|docs\.google|googleusercontent/i,/\b[A-Za-z]:\\|\b[A-Z]:\/(?!\/)/,/firebasedatabase|firebaseio/i,/mumutori-private-finance/])assert(!bad.test(code),'캐릭터 화면 코드에 넣으면 안 되는 것: '+bad);
 const refs=walk(path.join(ROOT,'src/character-ref'));
 assert.deepEqual(refs.map(f=>path.basename(f)).sort(),['ref-01-sheet.webp','ref-05-chickpea.webp','ref-05-dotori.webp','ref-05-peanut.webp','ref-05-seed.webp','ref-05-sunflower.webp']);
 assert(refs.every(f=>fs.statSync(f).size<120000),'참고 그림은 줄인 미리보기만 둔다');
 const csp=/Content-Security-Policy" content="([^"]+)"/.exec(read('characters.html'))[1];
 assert(/connect-src 'self';/.test(csp)&&/frame-src 'none'/.test(csp)&&!/firebase|google/.test(csp),'캐릭터 화면은 바깥 연결을 허용하지 않는다');
 console.log('PASS 1 공개 자산: 드라이브 주소·개인 경로·공용 장부 주소 없음, 참고 그림은 줄인 미리보기 6장, 바깥 연결 없는 CSP');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME});
 const open=async(viewport={width:1360,height:900})=>{
  const context=await browser.newContext({viewport,acceptDownloads:true}),outside=[],errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://mumutori.test'){outside.push(u.href.slice(0,80));return route.abort();}
   const name=decodeURIComponent(u.pathname.replace('/mumutori-dashboard/',''))||'index.html',file=path.join(ROOT,name);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:TYPES[path.extname(file)]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'missing'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const go=async()=>{await page.goto(ORIGIN+'characters.html');await page.locator('#cb-root .cb-pick').first().waitFor();};
  return {context,page,outside,errors,go};
 };
 const A=await open(),{page}=A;let dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),KEY);
 const field=k=>page.locator(`[data-cb-field="${k}"]`);
 const msg=async()=>(await page.locator('#cb-msg').isVisible())?(await page.locator('#cb-msg').textContent()).trim():'';
 const flush=async()=>{await page.locator('h1').click();await page.waitForTimeout(60);};

 // 2) 처음 열었을 때
 await A.go();
 const erpBefore=await page.evaluate(k=>localStorage.getItem(k),ERP_KEY);
 assert.equal(await page.locator('body').getAttribute('data-page'),'characters');assert.equal(await page.locator('nav [aria-current="page"]').getAttribute('data-view'),'characters');
 assert.deepEqual(await page.locator('.cb-pick b').allTextContents(),['도토리','해바라기씨','병아리콩','호박씨','땅콩','작은 씨앗']);
 assert.deepEqual(await page.locator('.cb-pick small').allTextContents(),['주인공','씨앗 친구','씨앗 친구','씨앗 친구','씨앗 친구','씨앗 친구']);
 assert.equal(await page.locator('.cb-slot').count(),14);
 assert.deepEqual(await page.locator('.cb-group').evaluateAll(l=>l.map(e=>e.firstChild.textContent.trim())),['기준 시트','표정 6종','대표 포즈 3종','3D 투명 PNG(웹용)']);
 assert.deepEqual(await page.locator('.cb-slot[data-slot^="sheet"] .cb-slothead b').allTextContents(),['정면','비스듬히(3/4)','옆','뒤']);
 assert.deepEqual(await page.locator('[data-cb-status="sheet-front"] option').allTextContents(),['할 일','작업 중','확정']);
 assert.equal(await saved(),null,'열어 보기만 해서는 저장하지 않는다');
 assert.equal((await page.locator('.cb-top #cb-saved').textContent()).trim(),'아직 저장한 내용이 없습니다');
 assert(/이 브라우저에만.*브라우저나 컴퓨터를 바꾸면 보이지 않습니다/.test(await page.locator('.cb-topinfo').textContent()),'브라우저를 바꾸면 안 보인다는 안내');
 assert.deepEqual((await page.locator('.cb-topact .cb-big').allTextContents()).map(t=>t.trim()),['파일로 내보내기','파일 불러오기','확정 목록 내보내기']);
 assert(/무무토리 > 캐릭터 > 확정/.test(await page.locator('.cb-steps').textContent()),'확정 파일을 넣을 드라이브 폴더 안내');
 await page.locator('.cb-ref img').first().scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.cb-ref img').count(),6);assert(await page.locator('.cb-ref img').evaluateAll(l=>l.every(i=>i.complete&&i.naturalWidth>0)),'참고 그림 6장이 보인다');
 const refNote=await page.locator('.cb-refs').locator('xpath=preceding-sibling::div[1]').textContent();
 assert(/스타일이 서로 다릅니다/.test(refNote)&&/확정하는 분이 정합니다/.test(refNote),'참고 그림의 스타일 안내');
 assert(await page.locator('[data-cb="export"]').isDisabled(),'확정된 캐릭터가 없으면 내보내기를 누를 수 없다');
 console.log('PASS 2 처음 화면: 캐릭터 6명 · 그림 14칸 · 참고 그림 6장과 스타일 안내 · 저장 없음');

 // 3) 프로필 적기
 await field('trait0').fill('느긋함');await field('trait1').fill('호기심');await field('trait2').fill('다정함');
 await field('voice').fill('안녕, 나는 도토리야.\n오늘은 뭐 하고 놀까?');await field('likes').fill('낮잠');await field('dislikes').fill('비 오는 날');
 await field('look.colors').fill('몸 #F2C58B, 모자 #6A3906');await field('look.ratio').fill('머리와 몸이 1:1');await field('look.must').fill('모자 꼭지');await field('look.never').fill('눈썹 그리지 않기');
 await field('relations').fill('씨앗 친구들의 대장');await field('memo').fill('메모');await field('memo').pressSequentially('입니다');await page.waitForTimeout(400);
 assert.equal((await saved()).characters[0].memo,'메모입니다','칸을 벗어나지 않아도 적는 즉시 저장된다');
 assert(/^마지막 저장 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test((await page.locator('#cb-saved').textContent()).trim()),'마지막 저장 시각이 위에 보인다');await flush();
 assert.equal(await page.locator('#cb-swatches .cb-swatch').count(),2,'HEX 색을 적으면 색 견본이 보인다');
 let s=await saved();assert.equal(s.schema,'mumutori-characters/1');assert.equal(s.characters.length,6);
 assert.deepEqual(s.characters[0].traits,['느긋함','호기심','다정함']);assert.equal(s.characters[0].look.colors,'몸 #F2C58B, 모자 #6A3906');assert.equal(s.characters[0].voice,'안녕, 나는 도토리야.\n오늘은 뭐 하고 놀까?');
 await page.locator('.cb-pick').nth(1).click();await field('name').fill('해든');await flush();
 assert.equal(await page.locator('.cb-pick').nth(1).locator('b').textContent(),'해든','이름을 고치면 위 목록에도 반영');
 await A.go();assert.equal(await field('memo').inputValue(),'메모입니다');assert.equal(await field('look.never').inputValue(),'눈썹 그리지 않기');
 assert.equal(await page.locator('.cb-pick').nth(1).locator('b').textContent(),'해든');assert(/^마지막 저장 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test((await page.locator('#cb-saved').textContent()).trim()),'새로고침 뒤에도 마지막 저장 시각이 보인다');
 console.log('PASS 3 프로필: 적는 대로 저장, 색 견본, 새로고침 뒤에도 남음');

 // 4) 그림 칸
 const png=Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=900;const x=c.getContext('2d');x.fillStyle='#f2c58b';x.beginPath();x.arc(600,450,380,0,7);x.fill();return c.toDataURL('image/png');})).split(',')[1],'base64');
 await page.locator('[data-cb-status="sheet-front"]').selectOption('done');
 await page.locator('[data-cb-link="sheet-side"]').fill('도토리_옆_v1.png');await page.locator('[data-cb-note="face-1"]').fill('웃음');await flush();
 await page.locator('[data-cb-file="web-3d"]').setInputFiles({name:'도토리_3D_v1.png',mimeType:'image/png',buffer:png});
 await page.locator('.cb-slot[data-slot="web-3d"] .cb-thumb img').waitFor();
 s=await saved();const im=s.characters[0].images;
 assert.equal(im['sheet-front'].status,'done');assert.equal(im['sheet-side'].link,'도토리_옆_v1.png');assert.equal(im['face-1'].note,'웃음');
 assert(/^data:image\/(webp|png);base64,/.test(im['web-3d'].thumb)&&im['web-3d'].thumb.length<=90000,'미리보기는 작게 줄여 저장');
 const dim=await page.locator('.cb-slot[data-slot="web-3d"] .cb-thumb img').evaluate(i=>[i.naturalWidth,i.naturalHeight]);assert(Math.max(...dim)<=240&&dim[0]>dim[1],'미리보기 크기 '+dim);
 assert.equal(im['web-3d'].link,'도토리_3D_v1.png');assert.equal(im['web-3d'].status,'doing','그림을 올리면 할 일 → 작업 중');
 assert(/원본 파일은 따로 보관/.test(await msg()));assert(/확정 1 · 작업 중 1 · 전체 14칸/.test(await page.locator('.panelhead .cb-small').nth(1).textContent()));
 assert.equal(await page.locator('.cb-pick').first().locator('.cb-state').textContent(),'만드는 중 · 그림 1/14');
 await page.locator('[data-cb-file="sheet-back"]').setInputFiles({name:'메모.txt',mimeType:'text/plain',buffer:Buffer.from('x')});
 assert(/PNG, JPG, WEBP 그림만/.test(await msg()),'그림이 아닌 파일은 받지 않는다');
 assert.equal(await page.locator('.cb-slot.cover').getAttribute('data-slot'),'web-3d');
 await page.locator('.cb-slot[data-slot="sheet-front"] [data-cb="cover"]').click();assert.equal(await page.locator('.cb-slot.cover').getAttribute('data-slot'),'sheet-front');
 console.log('PASS 4 그림 칸: 상태 · 파일 위치 · 설명 · 미리보기(240px 이하로 줄임) · 대표 그림 고르기');

 // 5) 확정(고정)
 await page.locator('[data-cb="lock"]').click();assert(/확정하는 분의 이름/.test(await msg()),'이름 없이 확정할 수 없다');
 await page.locator('#cb-by').fill('시험 담당');await page.locator('[data-cb="lock"]').click();
 assert(/먼저 채워 주세요: 대표 그림/.test(await msg()),'대표 그림이 없으면 확정할 수 없다: '+await msg());assert.equal((await saved()).characters[0].lock,null);
 await page.locator('.cb-slot[data-slot="web-3d"] [data-cb="cover"]').click();await page.locator('#cb-by').fill('시험 담당');await page.locator('[data-cb="lock"]').click();
 assert(/확정했습니다/.test(await msg()));
 s=await saved();assert.equal(s.characters[0].lock.by,'시험 담당');assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.characters[0].lock.at));
 const bar=await page.locator('.cb-lock.locked').textContent();assert(bar.includes(s.characters[0].lock.at.slice(0,10))&&bar.includes('시험 담당 님이 확정'),'확정한 날짜와 이름이 보인다');
 assert(await page.locator('.cb-form [data-cb-field]').evaluateAll(l=>l.length===14&&l.every(e=>e.disabled)),'확정하면 프로필 칸이 모두 잠긴다');
 assert(await page.locator('.cb-slot[data-slot="web-3d"]').locator('select,input').evaluateAll(l=>l.every(e=>e.disabled)),'대표 그림 칸도 잠긴다');
 assert(await page.locator('.cb-slot [data-cb="cover"]').evaluateAll(l=>l.every(e=>e.disabled)),'대표 그림을 바꿀 수 없다');
 assert.equal(await page.locator('.cb-slot[data-slot="web-3d"] [data-cb="clear"]').count(),0);assert.equal(await page.locator('[data-cb="remove"]').count(),0,'확정된 캐릭터는 뺄 수 없다');
 await page.locator('[data-cb-status="face-2"]').selectOption('doing');assert.equal((await saved()).characters[0].images['face-2'].status,'doing','다른 그림 칸은 확정 뒤에도 채울 수 있다');
 assert.equal(await page.locator('.cb-pick').first().locator('.cb-state').textContent(),'🔒 확정 · 그림 1/14');
 await A.go();assert(await field('name').isDisabled(),'새로고침해도 잠겨 있다');
 // 잠긴 칸을 억지로 고쳐도 저장되지 않는다
 await field('name').evaluate(e=>{e.disabled=false;e.value='바꿔치기';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal((await saved()).characters[0].name,'도토리');
 dialogs=[];await page.locator('[data-cb="unlock"]').click();assert(dialogs.length===1&&/잠금을 풉니다/.test(dialogs[0]));
 s=await saved();assert.equal(s.characters[0].lock,null);assert.deepEqual(s.characters[0].log.map(l=>l.action),['lock','unlock']);assert(await field('name').isEnabled());
 await page.locator('#cb-by').fill('시험 담당');await page.locator('[data-cb="lock"]').click();assert.equal((await saved()).characters[0].lock.by,'시험 담당');
 console.log('PASS 5 확정: 빠진 것 안내 → 확정(날짜·이름) → 프로필·대표 그림 잠김 → 잠금 해제 뒤에만 수정');

 // 6) 캐릭터 추가·빼기
 await page.locator('[data-cb="add"]').click();assert.equal(await page.locator('.cb-pick').count(),7);assert.equal(await field('name').inputValue(),'새 캐릭터');
 await field('name').fill('버터');await field('role').fill('새 친구');await flush();assert.equal((await saved()).characters[6].name,'버터');
 dialogs=[];await page.locator('[data-cb="remove"]').click();assert(dialogs.length===1&&/목록에서 뺍니다/.test(dialogs[0]));assert.equal(await page.locator('.cb-pick').count(),6);assert.equal((await saved()).characters.length,6);
 console.log('PASS 6 캐릭터 추가 · 이름 적기 · 빼기(물어본 뒤)');

 // 7) 넘기기
 const grab=async sel=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);return {name:d.suggestedFilename(),text:fs.readFileSync(await d.path(),'utf8')};};
 const conf=await grab('[data-cb="export"]'),cj=JSON.parse(conf.text);
 assert(/^mumutori-characters-confirmed-\d{8}\.json$/.test(conf.name));assert.equal(cj.kind,'confirmed');assert.equal(cj.characters.length,1,'확정된 캐릭터만 나간다');
 const c0=cj.characters[0];assert.equal(c0.name,'도토리');assert.equal(c0.confirmedBy,'시험 담당');assert.deepEqual(c0.traits,['느긋함','호기심','다정함']);assert.equal(c0.look.must,'모자 꼭지');
 assert.equal(c0.cover.slot,'web-3d');assert(c0.cover.thumb.startsWith('data:image/'));assert.equal(c0.cover.link,'도토리_3D_v1.png');
 assert(!('log' in c0)&&!conf.text.includes('해든'),'확정하지 않은 캐릭터와 작업 기록은 넣지 않는다');
 assert.deepEqual(c0.images.map(i=>i.slot).sort(),['face-2','sheet-front','sheet-side','web-3d'].sort(),'상태를 바꿨거나 파일 위치를 적은 그림 칸만 목록에');
 assert(/무무토리 > 캐릭터 > 확정/.test(await msg()),'내보낸 뒤 어디에 넣는지 알려 준다');
 const all=await grab('[data-cb="backup"]');assert(/^mumutori-characters-all-\d{8}\.json$/.test(all.name));assert.equal(JSON.parse(all.text).characters.length,6);
 const Bx=await open();Bx.page.on('dialog',d=>d.accept());await Bx.go();
 const pick=async text=>{await Bx.page.locator('[data-cb-import]').setInputFiles({name:'x.json',mimeType:'application/json',buffer:Buffer.from(text)});await Bx.page.waitForTimeout(150);};
 const bMsg=async()=>(await Bx.page.locator('#cb-msg').textContent()).trim(),bSaved=()=>Bx.page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),KEY);
 await pick('{"이건":"아님"}');assert(/저장 파일이 아닙니다/.test(await bMsg()));await pick('깨진 글');assert(/파일을 읽지 못했습니다/.test(await bMsg()));
 await pick(conf.text);assert(/'확정 목록' 파일입니다/.test(await bMsg()),'확정 목록 파일은 가져오기에 쓸 수 없다');
 assert.equal(await bSaved(),null,'거절된 파일은 아무것도 바꾸지 않는다');assert.equal(await Bx.page.locator('.cb-pick b').nth(1).textContent(),'해바라기씨');
 await pick(all.text);assert(/캐릭터 6명을 가져왔습니다/.test(await bMsg()));
 const b=await bSaved();assert.equal(b.characters[1].name,'해든');assert.equal(b.characters[0].lock.by,'시험 담당');assert.equal(b.characters[0].images['web-3d'].thumb,(await saved()).characters[0].images['web-3d'].thumb);
 assert(await Bx.page.locator('[data-cb-field="name"]').isDisabled(),'가져온 뒤에도 확정된 캐릭터는 잠겨 있다');
 assert.equal(Bx.errors.length,0);assert.equal(Bx.outside.length,0);await Bx.context.close();
 console.log('PASS 7 넘기기: 확정 목록(확정된 캐릭터만) · 전체 저장 파일 → 다른 브라우저에서 가져오기 · 잘못된 파일 3가지는 통째로 거절');

 // 8) 자료 규칙
 const core=await page.evaluate(async()=>{
  const K=await import('./src/characters-core.js');const long='가'.repeat(3000),ok='data:image/png;base64,AAAA';
  const n=K.normalizeBoard({characters:[{id:'a b<script>',name:long,role:1,traits:['x'],secret:'TEST_PRIVATE',look:{colors:long,extra:1},images:{'sheet-front':{status:'끝',link:long,thumb:'data:text/html;base64,AAAA'},'sheet-34':{status:'done',thumb:ok},'web-3d':{thumb:'data:image/png;base64,'+'A'.repeat(100000)},junk:{status:'done'}},cover:'없는칸',lock:{at:'어제',by:'x'},log:[{action:'hack',at:'2026-10-14T08:00'},{action:'lock',at:'2026-10-14T08:00',by:long}]},{id:'dotori'},{id:'dotori'}]});
  const c=n.characters[0];let lockErr='';try{K.lockCharacter(K.emptyCharacter('z','',''),'나','2026-10-14T09:00');}catch(e){lockErr=e.message;}
  return {id:c.id,name:c.name.length,role:c.role,traits:c.traits,keys:Object.keys(c).sort(),colors:c.look.colors.length,lookKeys:Object.keys(c.look),st:c.images['sheet-front'].status,link:c.images['sheet-front'].link.length,badThumb:c.images['sheet-front'].thumb,okThumb:c.images['sheet-34'].thumb,bigThumb:c.images['web-3d'].thumb,slots:Object.keys(c.images).length,cover:c.cover,lock:c.lock,log:c.log.map(l=>[l.action,l.by.length]),ids:n.characters.map(x=>x.id),lockErr,
   empty:K.normalizeBoard(null).characters.length,json:JSON.stringify(n)};});
 assert.equal(core.id,'c1');assert.equal(core.name,30);assert.equal(core.role,'');assert.deepEqual(core.traits,['x','','']);
 assert.deepEqual(core.keys,['cover','dislikes','id','images','likes','lock','log','look','memo','name','relations','role','traits','voice']);assert(!core.json.includes('TEST_PRIVATE'),'모르는 칸은 버린다');
 assert.equal(core.colors,200);assert.deepEqual(core.lookKeys,['colors','ratio','must','never']);assert.equal(core.st,'todo');assert.equal(core.link,500);
 assert.equal(core.badThumb,'');assert.equal(core.okThumb,'data:image/png;base64,AAAA');assert.equal(core.bigThumb,'');assert.equal(core.slots,14);assert.equal(core.cover,'web-3d');assert.equal(core.lock,null);
 assert.deepEqual(core.log,[['lock',30]]);assert.deepEqual(core.ids,['c1','dotori','dotorix']);assert(/이름, 역할, 대표 그림/.test(core.lockErr));assert.equal(core.empty,6);
 console.log('PASS 8 자료 규칙: 모르는 칸·긴 글·그림이 아닌 미리보기·큰 미리보기·잘못된 상태·겹치는 번호를 걸러 냄');

 // 9) 모바일 폭 · 쉬운 말 · 운영 장부
 const words=await page.evaluate(()=>document.getElementById('cb-root').innerText);
 for(const jargon of ['localStorage','JSON','Firebase','스키마','캐시','동기화','schema'])assert(!words.includes(jargon),'화면에 어려운 말: '+jargon);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),ERP_KEY),erpBefore,'운영 장부는 그대로다');
 assert.equal(A.errors.length,0,A.errors.join(' | '));assert.equal(A.outside.length,0,'바깥 요청 없음: '+A.outside.join(' '));
 const M=await open({width:390,height:844});await M.go();
 assert(!await M.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'모바일 폭에서 가로로 넘치지 않는다');
 assert.equal(await M.page.locator('.cb-slot').count(),14);assert.equal(M.errors.length,0);await M.context.close();
 console.log('PASS 9 모바일 폭 · 쉬운 말 · 운영 장부 그대로 · 화면 오류 0 · 바깥 요청 0');

 // 10) 처음이면 읽기 — 가이드(화면 글만). 칸 이름은 화면의 실제 칸 이름과 같아야 하고, 사장님이 꼭 넣으라고 한 것이 다 있어야 한다.
 const G=await open();await G.go();const g=G.page.locator('#cb-help');
 assert.equal(await g.evaluate(e=>e.open),true,'처음 열면 펼쳐져 있다');assert(/처음이면 읽기/.test(await g.locator('summary').textContent()));
 assert(await G.page.evaluate(()=>!!(document.getElementById('cb-help').compareDocumentPosition(document.getElementById('cb-root'))&Node.DOCUMENT_POSITION_FOLLOWING)),'가이드는 캐릭터 목록보다 위에 있다');
 assert.deepEqual(await g.locator('.cb-help-steps > li > b').allTextContents(),['캐릭터 고르기','프로필 칸 채우기','기준 이미지 만들기(AI)','사장님 확인',"'확정'으로 잠그기",'자사몰 교체용으로 넘기기'],'전체 순서 6단계');
 const stepText=await g.locator('#cb-help-steps').innerText();for(const must of ['＋ 캐릭터 추가','미리보기 올리기','파일 위치','확정하는 분 이름','확정(고정)하기','확정 목록 내보내기','무무토리 > 캐릭터 > 확정'])assert(stepText.includes(must),'순서 설명에 실제 단추·칸 이름: '+must);
 const labels=await G.page.evaluate(()=>[...document.querySelectorAll('.cb-form > .field > span:first-child')].map(e=>e.textContent.trim()).filter(t=>t!=='생김새 규칙'));
 assert.equal(labels.length,12);assert.deepEqual(await g.locator('.cb-help-fields dt').allTextContents(),labels,'가이드의 칸 이름 = 화면의 프로필 칸 이름(순서까지)');
 assert(await g.locator('.cb-help-fields dd').evaluateAll(l=>l.length===12&&l.every(e=>e.textContent.trim().length>1)),'칸마다 예시가 하나씩');assert(/지어낸 예시/.test(await g.locator('#cb-help-fields').innerText()));
 const ai=await g.locator('#cb-help-ai').innerText();
 for(const must of ['투명','입체 3D 오브젝트','#EFE9E4','#FDE9BE','#6A3906','한 번에 3장까지만','기준 시트를 먼저','첨부','캐릭터이름_칸이름_v번호.png','무무토리 > 캐릭터 > 작업중','무무토리 > 캐릭터 > 확정','.png','바둑판무늬'])assert(ai.includes(must),'AI 쓰는 법에 있어야 함: '+must);
 const prompts=await g.locator('.cb-help-prompt pre').allTextContents();assert.equal(prompts.length,3);
 assert(/\[캐릭터 이름\]/.test(prompts[0])&&/다듬어/.test(prompts[0])&&/지어내지 말 것/.test(prompts[0]),'프로필 다듬기 요청 글');
 assert(/정면 · 옆 · 뒤/.test(prompts[1])&&/모두 3장/.test(prompts[1])&&/완전히 투명/.test(prompts[1])&&/3D 오브젝트/.test(prompts[1])&&/#EFE9E4/.test(prompts[1])&&/닮지 않은/.test(prompts[1]),'기준 시트 요청 글');
 assert(/첨부한 그림과 똑같은 캐릭터/.test(prompts[2])&&/모두 3장/.test(prompts[2])&&/완전히 투명/.test(prompts[2]),'이어서 요청하는 글');
 await G.page.evaluate(()=>{window.__copied=[];navigator.clipboard.writeText=async t=>{window.__copied.push(t);};});
 await g.locator('[data-cb-copy="cb-prompt-sheet"]').click();await G.page.waitForFunction(()=>window.__copied.length===1);
 assert.equal(await G.page.evaluate(()=>window.__copied[0]),prompts[1],'복사 단추는 요청 글을 그대로 복사한다');assert.equal(await g.locator('[data-cb-copy="cb-prompt-sheet"]').textContent(),'복사했습니다');
 const dont=await g.locator('.cb-help-dont > li > b').allTextContents();assert.equal(dont.length,4);
 assert(/다른 회사 캐릭터/.test(dont[0])&&/유명 캐릭터나 브랜드 이름/.test(dont[1])&&/확정\(🔒\)된 프로필/.test(dont[2])&&/개인정보.*원가/.test(dont[3]),'하지 말 것 네 가지: '+dont.join(' | '));
 const ask=await g.locator('#cb-help-ask').innerText();assert(/사장님께 메시지로 묻습니다/.test(ask)&&/보고판/.test(ask)&&/캡처/.test(ask)&&/메모/.test(ask),'막히면 누구에게 어떻게');
 const guideWords=await g.innerText();for(const jargon of ['localStorage','JSON','Firebase','스키마','캐시','동기화','schema','프롬프트'])assert(!guideWords.includes(jargon),'가이드에 어려운 말: '+jargon);
 // 안내가 맞는지: 투명 PNG 를 올리면 미리보기 모서리가 투명하다(바둑판무늬가 비친다)
 const clear=Buffer.from((await G.page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=600;const x=c.getContext('2d');x.fillStyle='#fde9be';x.beginPath();x.arc(300,300,200,0,7);x.fill();return c.toDataURL('image/png');})).split(',')[1],'base64');
 await G.page.locator('[data-cb-file="sheet-34"]').setInputFiles({name:'도토리_비스듬히_v1.png',mimeType:'image/png',buffer:clear});await G.page.locator('.cb-slot[data-slot="sheet-34"] .cb-thumb img').waitFor();
 const alpha=await G.page.locator('.cb-slot[data-slot="sheet-34"] .cb-thumb img').evaluate(async i=>{await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [x.getImageData(1,1,1,1).data[3],x.getImageData(c.width>>1,c.height>>1,1,1).data[3]];});
 assert(alpha[0]===0&&alpha[1]===255,'투명 PNG 의 미리보기는 모서리가 투명하다: '+alpha);assert(/conic-gradient/.test(await G.page.locator('.cb-slot[data-slot="sheet-34"] .cb-thumb').evaluate(e=>getComputedStyle(e).backgroundImage)),'미리보기 칸 바탕은 바둑판무늬');
 // 화면을 다시 그려도 가이드는 그대로이고, 접어 두면 다음에도 접혀 있다
 assert.equal(await g.evaluate(e=>e.open),true,'그림을 올려 화면이 다시 그려져도 펼친 채로');
 await g.locator('[data-cb-help-close]').click();assert.equal(await g.evaluate(e=>e.open),false,"맨 아래 '이 안내 접기'로도 접힌다");await G.go();assert.equal(await G.page.locator('#cb-help').evaluate(e=>e.open),false,'접어 두면 다음에도 접혀 있다');
 await G.page.locator('#cb-help summary').click();await G.go();assert.equal(await G.page.locator('#cb-help').evaluate(e=>e.open),true,'다시 펼치면 다음에도 펼쳐져 있다');
 assert.equal(G.errors.length,0,G.errors.join(' | '));assert.equal(G.outside.length,0);await G.context.close();
 const GM=await open({width:390,height:844});await GM.go();
 assert.equal(await GM.page.locator('#cb-help').evaluate(e=>e.open),true);assert(!await GM.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'모바일 폭에서 가이드가 가로로 넘치지 않는다');
 assert(await GM.page.evaluate(()=>[...document.querySelectorAll('#cb-help pre,#cb-help dl,#cb-help li,#cb-help code')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})),'요청 글·예시 표·목록이 화면 안에 들어온다');
 assert(await GM.page.locator('#cb-help .cb-help-fields > div').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===1),'좁은 화면에서는 칸 이름 아래에 예시가 온다');
 assert.equal(GM.errors.length,0);await GM.context.close();
 console.log('PASS 10 처음이면 읽기: 순서 6단계 · 칸별 예시 12개(실제 칸 이름) · AI 요청 글 3개와 복사 · 저장 규칙 · 하지 말 것 4가지 · 막히면 · 접기 기억 · 모바일');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
