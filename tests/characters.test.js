// '캐릭터 만들기' 화면 — 격리된 가상 주소만 쓴다. 함께 보는 곳(공용 장부의 한 칸)은 이 시험 안의 가짜 응답으로 대신한다(실제 장부에 닿지 않음).
//  1) 공개 자산 계약: 화면 코드·참고 그림 폴더에 드라이브 주소·개인 경로가 없고, 장부 주소는 연결 모듈 한 곳(캐릭터 칸 하나)에만 있으며, CSP 는 그 주소 하나만 허용한다
//  2) 처음 열었을 때: 캐릭터 6명 · 그림 14칸 · 참고 그림 · 열어 보기만 해서는 아무것도 저장하지 않음
//  3) 프로필 적기 → 저장 → 새로고침 뒤에도 남음
//  4) 그림 칸: 상태 · 파일 위치 · 미리보기 올리기(작게 줄여 저장) · 대표 그림 고르기
//  5) 확정(고정): 빠진 것 안내 → 확정 → 프로필·대표 그림 잠김, 날짜·이름 남음 → 잠금 해제
//  6) 캐릭터 추가·빼기
//  7) 넘기기: 확정 목록 파일(확정된 캐릭터만) · 전체 저장 파일 → 다른 브라우저에서 가져오기 · 잘못된 파일은 통째로 거절
//  8) 자료 규칙(characters-core): 모르는 칸·긴 글·그림이 아닌 미리보기·잘못된 상태를 걸러 냄
//  9) 모바일 폭, 쉬운 말(화면에 기술 용어 없음), 운영 장부를 건드리지 않음
// 10) 함께 보기: 한 기기에서 고치면 다른 기기에 새로고침 없이 보임 · 치는 중인 칸은 건드리지 않음 · 저장 실패 뒤 다시 보냄
// 11) 예전에 이 브라우저에만 저장한 내용: 안내 → 파일로 받기 → 올리기(지우지 않음) → 다른 기기에도 보임
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ORIGIN='https://mumutori.test/mumutori-dashboard/';
const KEY='mumutori-character-board-v1',MOVED=KEY+'-moved',ERP_KEY='mumutori-private-finance-v3';
const DB_HOST='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app',DB=DB_HOST+'/sourcing/meta/characterBoard';
// 가짜 '함께 보는 곳': Firebase REST 의 PUT · PATCH(여러 칸 한 번에) · 실시간 읽기(끊길 때마다 지금 내용을 다시 줌)를 흉내 낸다. null·빈 묶음은 저장되지 않는다.
const remote={tree:null,writes:[],fail:false};
const prune=v=>{if(v===null||v===undefined)return null;if(typeof v!=='object')return v;const out=Array.isArray(v)?[]:{};let n=0;for(const [k,x] of Object.entries(v)){const y=prune(x);if(y!==null){out[k]=y;n++;}}return n?out:null;};
const setIn=(t,p,v)=>{const keys=p.split('/').filter(Boolean);if(!keys.length)return v;t=t&&typeof t==='object'?t:{};let o=t;for(const k of keys.slice(0,-1)){if(!o[k]||typeof o[k]!=='object')o[k]={};o=o[k];}if(v===null)delete o[keys.at(-1)];else o[keys.at(-1)]=v;return t;};
function serveRemote(route){
 const q=route.request(),m=q.method();
 if(m==='GET'){if((q.headers().accept||'').includes('text/event-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:`retry: 200\nevent: put\ndata: ${JSON.stringify({path:'/',data:remote.tree})}\n\n`});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote.tree)});}
 if(remote.fail)return route.abort();
 const body=JSON.parse(q.postData()||'null');remote.writes.push({m,keys:m==='PATCH'?Object.keys(body):['(전체)']});
 if(m==='PUT')remote.tree=prune(body);else if(m==='PATCH'){let t=remote.tree;for(const [k,v] of Object.entries(body))t=setIn(t,k,prune(v));remote.tree=prune(t);}else return route.fulfill({status:405,body:'x'});
 return route.fulfill({status:200,contentType:'application/json',body:q.postData()||'null'});
}
// 함께 보는 곳의 모양(번호로 찾는 묶음 + 순서)을 화면 순서의 목록으로
const boardOf=t=>t&&t.characters?{schema:t.schema,savedAt:t.savedAt,characters:Object.entries(t.characters).map(([id,c])=>({...c,id,lock:c.lock||null,log:c.log||[]})).sort((a,b)=>a.order-b.order)}:null;
const TYPES={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.gz':'application/gzip','.webp':'image/webp','.png':'image/png'};
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
(async()=>{
 // 1) 공개 자산 계약
 const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
 const code=['src/pages/characters.js','src/characters-core.js','src/characters-sync.js','characters.html'].map(read).join('\n');
 for(const bad of [/drive\.google|docs\.google|googleusercontent/i,/\b[A-Za-z]:\\|\b[A-Z]:\/(?!\/)/,/firebaseio/i,/mumutori-private-finance/])assert(!bad.test(code),'캐릭터 화면 코드에 넣으면 안 되는 것: '+bad);
 // 장부 주소는 연결 모듈 한 곳에만, 캐릭터 칸 하나만 가리킨다(소싱 자료의 다른 칸을 읽거나 쓰지 않는다)
 for(const f of ['src/pages/characters.js','src/characters-core.js'])assert(!/firebasedatabase/.test(read(f)),f+' 에는 장부 주소를 두지 않는다');
 assert.deepEqual(read('src/characters-sync.js').match(/https:\/\/[^'"`\s]+/g),[DB],'연결 모듈의 주소는 캐릭터 칸 하나');
 const refs=walk(path.join(ROOT,'src/character-ref'));
 assert.deepEqual(refs.map(f=>path.basename(f)).sort(),['ref-01-sheet.webp','ref-05-chickpea.webp','ref-05-dotori.webp','ref-05-peanut.webp','ref-05-seed.webp','ref-05-sunflower.webp']);
 assert(refs.every(f=>fs.statSync(f).size<120000),'참고 그림은 줄인 미리보기만 둔다');
 const csp=/Content-Security-Policy" content="([^"]+)"/.exec(read('characters.html'))[1];
 assert(csp.includes(`connect-src 'self' ${DB_HOST};`)&&/frame-src 'none'/.test(csp)&&!/google|\*/.test(csp)&&/script-src 'self';/.test(csp),'캐릭터 화면은 장부 주소 하나만 연결을 허용한다: '+csp);
 console.log('PASS 1 공개 자산: 드라이브 주소·개인 경로 없음, 장부 주소는 연결 모듈의 캐릭터 칸 하나, 참고 그림은 줄인 미리보기 6장, CSP 는 그 주소 하나만');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_CHROME});
 const open=async(viewport={width:1360,height:900},init=null)=>{
  const context=await browser.newContext({viewport,acceptDownloads:true}),outside=[],errors=[];
  if(init)await context.addInitScript(init.fn,init.arg);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.href.split('?')[0]===DB+'.json')return serveRemote(route);if(u.origin!=='https://mumutori.test'){outside.push(u.href.slice(0,80));return route.abort();}
   const name=decodeURIComponent(u.pathname.replace('/mumutori-dashboard/',''))||'index.html',file=path.join(ROOT,name);return route.fulfill({status:fs.existsSync(file)?200:404,contentType:TYPES[path.extname(file)]||'text/plain',body:fs.existsSync(file)?fs.readFileSync(file):'missing'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const go=async()=>{await page.goto(ORIGIN+'characters.html');await page.locator('#cb-root .cb-pick').first().waitFor();};
  return {context,page,outside,errors,go};
 };
 const A=await open(),{page}=A;let dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 // 저장이 끝나기를 기다렸다가 함께 보는 곳의 내용을 읽는다
 const settle=pg=>pg.waitForFunction(()=>{const e=document.getElementById('cb-saved');return !e||e.textContent!=='저장하는 중…';});
 const saved=async()=>{await settle(page);return boardOf(remote.tree);};
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
 assert.equal(await saved(),null,'열어 보기만 해서는 저장하지 않는다');assert.equal(remote.writes.length,0,'열어 보기만 해서는 아무것도 보내지 않는다');assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),null);
 assert.equal((await page.locator('.cb-top #cb-saved').textContent()).trim(),'아직 저장한 내용이 없습니다');
 assert(/다른 컴퓨터·휴대폰에서 이 화면을 연 분에게도 바로 보입니다/.test(await page.locator('.cb-topinfo').textContent()),'다른 기기에도 바로 보인다는 안내');assert.equal(await page.locator('#cb-link').textContent(),'함께 보는 중');assert.equal(await page.locator('.cb-legacy').count(),0);
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
 await field('relations').fill('씨앗 친구들의 대장');await field('memo').fill('메모');await field('memo').pressSequentially('입니다');
 assert.equal((await saved()).characters[0].memo,'메모입니다','칸을 벗어나지 않아도 적는 즉시 저장된다');
 assert(/^마지막 저장 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test((await page.locator('#cb-saved').textContent()).trim()),'마지막 저장 시각이 위에 보인다');await flush();
 assert.equal(await page.locator('#cb-swatches .cb-swatch').count(),2,'HEX 색을 적으면 색 견본이 보인다');
 let s=await saved();assert.equal(s.schema,'mumutori-characters/1');assert.equal(s.characters.length,6);
 assert.equal(remote.writes[0].m,'PUT','비어 있던 곳에는 처음 한 번 전체를 올린다');assert(remote.writes.slice(1).every(w=>w.m==='PATCH'&&w.keys.includes('savedAt')&&w.keys.every(k=>k==='savedAt'||/^characters\/dotori\/(traits|voice|likes|dislikes|relations|memo|look\/\w+)$/.test(k))),'그 뒤에는 고친 칸만 보낸다: '+JSON.stringify(remote.writes.slice(1,4)));
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),null,'이 브라우저에는 따로 저장하지 않는다');
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
 const bMsg=async()=>(await Bx.page.locator('#cb-msg').textContent()).trim(),bSaved=async()=>{await settle(Bx.page);return boardOf(remote.tree);};const beforeImport=JSON.stringify(remote.tree);
 await pick('{"이건":"아님"}');assert(/저장 파일이 아닙니다/.test(await bMsg()));await pick('깨진 글');assert(/파일을 읽지 못했습니다/.test(await bMsg()));
 await pick(conf.text);assert(/'확정 목록' 파일입니다/.test(await bMsg()),'확정 목록 파일은 가져오기에 쓸 수 없다');
 await settle(Bx.page);assert.equal(JSON.stringify(remote.tree),beforeImport,'거절된 파일은 아무것도 바꾸지 않는다');assert.equal(await Bx.page.locator('.cb-pick b').nth(1).textContent(),'해든','다른 기기에서 열어도 같은 내용이 보인다');
 const edited=JSON.parse(all.text);edited.characters[1].name='해든이';
 await pick(JSON.stringify(edited));await Bx.page.waitForFunction(()=>/가져왔습니다/.test(document.getElementById('cb-msg')?.textContent||''));assert(/캐릭터 6명을 가져왔습니다/.test(await bMsg()));
 await page.waitForFunction(()=>document.querySelectorAll('.cb-pick b')[1]?.textContent==='해든이');   // 파일을 불러온 것이 다른 기기(A)에도 새로고침 없이 보인다
 const b=await bSaved();assert.equal(b.characters[1].name,'해든이');assert.equal(b.characters[0].lock.by,'시험 담당');assert.equal(b.characters[0].images['web-3d'].thumb,(await saved()).characters[0].images['web-3d'].thumb);
 assert(await Bx.page.locator('[data-cb-field="name"]').isDisabled(),'가져온 뒤에도 확정된 캐릭터는 잠겨 있다');
 assert.equal(Bx.errors.length,0);assert.equal(Bx.outside.length,0);await Bx.context.close();
 console.log('PASS 7 넘기기: 확정 목록(확정된 캐릭터만) · 전체 저장 파일 → 다른 기기에서 불러오면 모두의 화면이 바뀜 · 잘못된 파일 3가지는 통째로 거절');

 // 8) 자료 규칙
 const core=await page.evaluate(async()=>{
  const K=await import('./src/characters-core.js');const long='가'.repeat(3000),ok='data:image/png;base64,AAAA';
  const n=K.normalizeBoard({characters:[{id:'a b<script>',name:long,role:1,traits:['x'],secret:'TEST_PRIVATE',look:{colors:long,extra:1},images:{'sheet-front':{status:'끝',link:long,thumb:'data:text/html;base64,AAAA'},'sheet-34':{status:'done',thumb:ok},'web-3d':{thumb:'data:image/png;base64,'+'A'.repeat(100000)},junk:{status:'done'}},cover:'없는칸',lock:{at:'어제',by:'x'},log:[{action:'hack',at:'2026-10-14T08:00'},{action:'lock',at:'2026-10-14T08:00',by:long}]},{id:'dotori'},{id:'dotori'}]});
  const c=n.characters[0];let lockErr='';try{K.lockCharacter(K.emptyCharacter('z','',''),'나','2026-10-14T09:00');}catch(e){lockErr=e.message;}
  return {id:c.id,name:c.name.length,role:c.role,traits:c.traits,keys:Object.keys(c).sort(),colors:c.look.colors.length,lookKeys:Object.keys(c.look),st:c.images['sheet-front'].status,link:c.images['sheet-front'].link.length,badThumb:c.images['sheet-front'].thumb,okThumb:c.images['sheet-34'].thumb,bigThumb:c.images['web-3d'].thumb,slots:Object.keys(c.images).length,cover:c.cover,lock:c.lock,log:c.log.map(l=>[l.action,l.by.length]),ids:n.characters.map(x=>x.id),lockErr,
   empty:K.normalizeBoard(null).characters.length,json:JSON.stringify(n),
   round:(()=>{const b=K.defaultBoard();b.characters[2].memo='왕복';b.characters.reverse();const t=JSON.parse(JSON.stringify(K.toRemote(b,'2026-10-14T10:00'))),back=K.fromRemote(t);return {keys:Object.keys(t.characters).length,hasId:'id' in t.characters.dotori,order:back.characters.map(c=>c.id).join(),memo:back.characters.find(c=>c.id==='chickpea').memo,savedAt:back.savedAt};})(),
   loose:(()=>{const b=K.fromRemote({characters:{b:{order:1,name:'둘',traits:{1:'가운데'},log:{0:{action:'lock',at:'2026-10-14T09:00',by:'나'}}},a:{order:0,name:'하나',secret:'TEST_PRIVATE'},junk:'x'}});return {names:b.characters.map(c=>c.name).join(),traits:b.characters[1].traits,log:b.characters[1].log.length,json:JSON.stringify(b)};})(),
   none:[K.hasRemote(null),K.hasRemote({characters:{}}),K.fromRemote(null).characters.length]};});
 assert.equal(core.id,'c1');assert.equal(core.name,30);assert.equal(core.role,'');assert.deepEqual(core.traits,['x','','']);
 assert.deepEqual(core.keys,['cover','dislikes','id','images','likes','lock','log','look','memo','name','relations','role','traits','voice']);assert(!core.json.includes('TEST_PRIVATE'),'모르는 칸은 버린다');
 assert.equal(core.colors,200);assert.deepEqual(core.lookKeys,['colors','ratio','must','never']);assert.equal(core.st,'todo');assert.equal(core.link,500);
 assert.equal(core.badThumb,'');assert.equal(core.okThumb,'data:image/png;base64,AAAA');assert.equal(core.bigThumb,'');assert.equal(core.slots,14);assert.equal(core.cover,'web-3d');assert.equal(core.lock,null);
 assert.deepEqual(core.log,[['lock',30]]);assert.deepEqual(core.ids,['c1','dotori','dotorix']);assert(/이름, 역할, 대표 그림/.test(core.lockErr));assert.equal(core.empty,6);
 assert.deepEqual(core.round,{keys:6,hasId:false,order:'seed,peanut,pumpkin,chickpea,sunflower,dotori',memo:'왕복',savedAt:'2026-10-14T10:00'},'함께 보는 곳의 모양으로 갔다가 돌아와도 순서·내용이 같다');
 assert.equal(core.loose.names,'하나,둘');assert.deepEqual(core.loose.traits,['','가운데','']);assert.equal(core.loose.log,1);assert(!core.loose.json.includes('TEST_PRIVATE'),'함께 보는 곳에 모르는 칸이 있어도 버린다');assert.deepEqual(core.none,[false,false,6]);
 console.log('PASS 8 자료 규칙: 모르는 칸·긴 글·그림이 아닌 미리보기·큰 미리보기·잘못된 상태·겹치는 번호를 걸러 냄 · 함께 보는 곳의 모양과 왕복');

 // 9) 모바일 폭 · 쉬운 말 · 운영 장부
 const words=await page.evaluate(()=>document.getElementById('cb-root').innerText);
 for(const jargon of ['localStorage','JSON','Firebase','스키마','캐시','동기화','schema'])assert(!words.includes(jargon),'화면에 어려운 말: '+jargon);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),ERP_KEY),erpBefore,'운영 장부는 그대로다');
 assert.equal(A.errors.length,0,A.errors.join(' | '));assert.equal(A.outside.length,0,'바깥 요청 없음: '+A.outside.join(' '));
 const M=await open({width:390,height:844});await M.go();
 assert(!await M.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'모바일 폭에서 가로로 넘치지 않는다');
 assert.equal(await M.page.locator('.cb-slot').count(),14);assert.equal(M.errors.length,0);await M.context.close();
 console.log('PASS 9 모바일 폭 · 쉬운 말 · 운영 장부 그대로 · 화면 오류 0 · 바깥 요청 0');

 // 10) 함께 보기 — 두 기기(A·C)
 const C=await open();C.page.on('dialog',d=>d.accept());await C.go();
 const cField=k=>C.page.locator(`[data-cb-field="${k}"]`);
 await page.locator('.cb-pick').nth(1).click();await C.page.locator('.cb-pick').nth(2).click();
 await cField('name').fill('콩이');await C.page.locator('h1').click();
 await page.waitForFunction(()=>document.querySelectorAll('.cb-pick b')[2]?.textContent==='콩이');   // 새로고침 없이 A 의 목록에 보인다
 // A 가 '메모'를 치는 중에 C 가 같은 캐릭터의 역할·그림 상태를 바꾼다 → A 의 다른 칸은 바뀌고, 치던 칸과 커서는 그대로
 await field('memo').click();await field('memo').pressSequentially('치는 중');
 await C.page.locator('.cb-pick').nth(1).click();await cField('role').fill('햇살 담당');await C.page.locator('[data-cb-status="face-3"]').selectOption('doing');
 await page.waitForFunction(()=>document.querySelector('[data-cb-field="role"]').value==='햇살 담당'&&document.querySelector('[data-cb-status="face-3"]').value==='doing');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.cbField),'memo','치던 칸에 그대로 있다');assert.equal(await field('memo').inputValue(),'치는 중');
 await field('memo').pressSequentially(' 계속');await flush();s=await saved();
 assert.equal(s.characters[1].memo,'치는 중 계속','치던 글이 끊기지 않고 저장된다');assert.equal(s.characters[1].role,'햇살 담당','다른 기기가 고친 칸을 덮어쓰지 않는다');assert.equal(s.characters[1].images['face-3'].status,'doing');
 await C.page.waitForFunction(()=>document.querySelector('[data-cb-field="memo"]').value==='치는 중 계속');
 // 확정·추가도 다른 기기에 바로 보인다
 await C.page.locator('[data-cb="add"]').click();await page.waitForFunction(()=>document.querySelectorAll('.cb-pick').length===7);
 C.page.once('dialog',()=>{});await C.page.locator('[data-cb="remove"]').click();await page.waitForFunction(()=>document.querySelectorAll('.cb-pick').length===6);
 // 저장이 실패하면 알리고, 연결되면 밀린 것까지 다시 보낸다
 remote.fail=true;await field('likes').fill('햇볕');await flush();
 await page.waitForFunction(()=>/인터넷 연결이 끊겼습니다/.test(document.getElementById('cb-link').textContent)&&document.getElementById('cb-saved').textContent==='아직 저장하지 못한 내용이 있습니다');
 assert.notEqual(boardOf(remote.tree).characters[1].likes,'햇볕');
 remote.fail=false;await field('dislikes').fill('그늘');await flush();s=await saved();
 assert.equal(s.characters[1].likes,'햇볕','밀린 것도 다시 보냈다');assert.equal(s.characters[1].dislikes,'그늘');assert.equal(await page.locator('#cb-link').textContent(),'함께 보는 중');
 assert.equal(C.errors.length,0,C.errors.join(' | '));assert.equal(C.outside.length,0);await C.context.close();
 console.log('PASS 10 함께 보기: 다른 기기의 변경이 새로고침 없이 보임 · 치는 중인 칸은 그대로 · 서로 다른 칸은 덮어쓰지 않음 · 저장 실패 뒤 다시 보냄');

 // 11) 예전에 이 브라우저에만 저장한 내용 옮기기
 const old={schema:'mumutori-characters/1',savedAt:'2026-10-14T09:10',characters:[{id:'dotori',name:'옛 도토리',role:'주인공',memo:'브라우저에만 있던 글'},{id:'c9',name:'옛 친구',role:'씨앗 친구'}]};
 const L=await open({width:1360,height:900},{fn:([k,v])=>{if(!localStorage.getItem(k))localStorage.setItem(k,v);},arg:[KEY,JSON.stringify(old)]});let asked=[];L.page.on('dialog',d=>{asked.push(d.message());d.accept();});await L.go();
 assert.equal(await L.page.locator('.cb-pick').count(),6,'먼저 함께 보는 내용이 보인다');
 const oldBar=await L.page.locator('.cb-legacy').textContent();assert(/이 브라우저에만 저장해 둔 예전 내용이 있습니다/.test(oldBar)&&/캐릭터 2명/.test(oldBar)&&/2026-10-14 09:10/.test(oldBar),oldBar);
 const [dl]=await Promise.all([L.page.waitForEvent('download'),L.page.locator('[data-cb="legacy-file"]').click()]);assert(/^mumutori-characters-old-\d{8}\.json$/.test(dl.suggestedFilename()));
 assert.equal(JSON.parse(fs.readFileSync(await dl.path(),'utf8')).characters[0].memo,'브라우저에만 있던 글');
 await L.page.locator('[data-cb="legacy-up"]').click();await L.page.waitForFunction(()=>/올렸습니다/.test(document.getElementById('cb-msg')?.textContent||''));
 assert(asked.length===1&&/이미 적힌 내용이 있습니다/.test(asked[0]),'함께 보는 곳에 내용이 있으면 바꾸기 전에 묻는다');
 const moved=boardOf(remote.tree);assert.deepEqual(moved.characters.map(c=>c.name),['옛 도토리','옛 친구']);assert.equal(moved.characters[0].memo,'브라우저에만 있던 글');
 assert.equal(await L.page.locator('.cb-legacy').count(),0);assert.equal(JSON.parse(await L.page.evaluate(k=>localStorage.getItem(k),KEY)).characters.length,2,'예전 내용은 지우지 않는다');assert(/^moved /.test(await L.page.evaluate(k=>localStorage.getItem(k),MOVED)));
 await page.waitForFunction(()=>document.querySelectorAll('.cb-pick').length===2&&document.querySelector('.cb-pick b').textContent==='옛 도토리');   // 다른 기기(A)에도 바로
 await L.go();assert.equal(await L.page.locator('.cb-legacy').count(),0,'올린 뒤에는 안내가 다시 나오지 않는다');assert.equal(await L.page.locator('.cb-pick').count(),2);
 assert.equal(L.errors.length,0,L.errors.join(' | '));assert.equal(L.outside.length,0);await L.context.close();assert.equal(A.errors.length,0,A.errors.join(' | '));
 console.log('PASS 11 예전 내용 옮기기: 안내 → 파일로 받기 → 올리기(묻고, 지우지 않음) → 다른 기기에도 보임 → 안내 사라짐');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
