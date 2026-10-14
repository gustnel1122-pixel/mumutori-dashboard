// 캐릭터 만들기 — 캐릭터마다 프로필과 그림을 채우고, 다 되면 확정(고정)한다. 사장님이 아닌 분이 쓰는 화면이라 글은 쉬운 말로.
// 저장: 함께 보는 곳(src/characters-sync.js — 소싱 보드와 같은 Firebase 방식, 로그인 없음). 한 사람이 고치면 다른 기기에서 새로고침 없이 보인다. 보안 규칙은 건드리지 않는다.
// 넘기기: '확정 목록 내보내기' 파일(확정된 캐릭터만)을 드라이브 '무무토리 > 캐릭터 > 확정' 폴더에 넣으면 자사몰 목업 담당이 읽는다.
// 받아 두기: '파일로 내보내기'(전부) · '파일 불러오기'(함께 보는 내용을 파일 내용으로 바꿈). 예전에 이 브라우저에만 저장한 내용은 '예전 내용 올리기'로 옮긴다.
// 참고 그림(src/character-ref)은 줄인 미리보기다. 원본·드라이브 주소는 저장소에 넣지 않는다.
const B=document.body.dataset.build;
const K=await import(`../characters-core.js?v=${B}`);
const {STORAGE_KEY,MOVED_KEY,STATUS,GROUPS,SLOTS}=K;
const {openStore}=await import(`../characters-sync.js?v=${B}`);
const GUIDE=await import(`../characters-guide.js?v=${B}`);   // '처음이면 읽기' 가이드(화면 글만)
const REFS=[['dotori','도토리'],['sunflower','해바라기씨'],['chickpea','병아리콩'],['peanut','땅콩'],['seed','작은 씨앗']];
const FIELDS=[['name','이름','예: 도토리',30],['role','역할','예: 주인공, 씨앗 친구',40]];
const LONG=[['voice','말투 · 대사 예시','이 캐릭터가 할 법한 말을 두세 줄 적어 주세요',600],['likes','좋아하는 것','',200],['dislikes','싫어하는 것','',200],['relations','세계관 속 관계','다른 캐릭터와 어떤 사이인지',600],['memo','메모','더 적어 둘 것',1000]];
const LOOK=[['colors','색 (HEX)','예: 몸 #F2C58B, 모자 #6A3906',200],['ratio','비율','예: 머리와 몸이 1:1, 팔다리는 짧게',120],['must','꼭 지킬 특징','빠지면 이 캐릭터가 아닌 것',400],['never','하면 안 되는 것','예: 눈썹 그리지 않기',400]];
let ctx=null,started=false,board=null,sel='',by='',msg=null,saveTimer=0,store=null,ready=false,link='connecting',stale=false,legacy=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
const day=at=>String(at||'').slice(0,10);
const cur=()=>board.characters.find(c=>c.id===sel)||board.characters[0]||null;
// 예전에 이 브라우저에만 저장해 둔 내용(2026-10-14 오전까지의 방식). 읽기만 하고 지우지 않는다 — '예전 내용 올리기'로 옮긴다.
function readLegacy(){
  try{if(localStorage.getItem(MOVED_KEY))return null;const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return raw&&Array.isArray(raw.characters)&&raw.characters.length?K.normalizeBoard(raw):null;}catch(e){return null;}
}
const path=(c,sub)=>`characters/${c.id}/${sub}`;
const fieldUpdate=(c,key)=>key.startsWith('trait')?{[path(c,'traits')]:[...c.traits]}:key.startsWith('look.')?{[path(c,'look/'+key.slice(5))]:c.look[key.slice(5)]}:{[path(c,key)]:c[key]};
// 새 캐릭터의 순서 번호(함께 보는 곳이 비어 있으면 화면 목록의 자리 그대로)
const nextOrder=()=>store.isEmpty()?board.characters.length-1:Math.max(-1,...Object.values(store.tree()?.characters||{}).map(c=>Number.isFinite(c?.order)?c.order:-1))+1;
// 고친 칸만 함께 보는 곳에 보낸다. 열어 보기만 해서는 아무것도 보내지 않는다. soon=true 면 글자를 치는 동안 0.4초 모았다가 한 번에.
function commit(updates,soon=false){
  board.savedAt=now();
  store.write({...updates,savedAt:board.savedAt},()=>K.toRemote(board,board.savedAt));
  clearTimeout(saveTimer);stamp('저장하는 중…');
  if(soon)saveTimer=setTimeout(()=>store.flush().then(()=>stamp(savedText())),400);else store.flush().then(()=>stamp(savedText()));
}
const LINK={connecting:['연결하는 중…',''],ok:['함께 보는 중','ok'],retry:['연결이 끊겨 다시 잇는 중','bad'],poll:['20초마다 새로 읽는 중','bad'],denied:['저장할 수 없는 상태입니다 — 담당자에게 알려 주세요','bad'],offline:['인터넷 연결이 끊겼습니다 — 연결되면 이어서 저장합니다','bad']};
const savedText=()=>store?.pendingCount()?(link==='offline'||link==='denied'?'아직 저장하지 못한 내용이 있습니다':'저장하는 중…'):board.savedAt?'마지막 저장 '+board.savedAt.replace('T',' '):'아직 저장한 내용이 없습니다';
const stamp=t=>{const el=document.getElementById('cb-saved');if(el)el.textContent=t;};
function say(text,error=false){msg={text,error};const el=document.getElementById('cb-msg');if(el){el.className='note cb-msg'+(error?' error':'');el.textContent=text;el.hidden=false;}}
const swatches=text=>(String(text).match(/#[0-9A-Fa-f]{6}\b/g)||[]).slice(0,8).map(h=>`<i class="cb-swatch" style="background:${h}" title="${h}"></i>`).join('');
function download(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// ---- 화면
function roster(){
  const c0=cur();
  return `<div class="cb-roster" role="tablist" aria-label="캐릭터 고르기">${board.characters.map(c=>{const p=K.progress(c);
    return `<button type="button" role="tab" aria-selected="${c===c0}" class="cb-pick${c===c0?' active':''}" data-cb="pick" data-id="${esc(c.id)}"><b>${esc(c.name||'이름 없음')}</b><small>${esc(c.role||'역할 미정')}</small>
      <span class="cb-state${c.lock?' locked':''}">${c.lock?'🔒 확정':'만드는 중'} · 그림 ${p.done}/${p.all}</span></button>`;}).join('')}
    <button type="button" class="cb-add" data-cb="add">＋ 캐릭터 추가</button></div>`;
}
function lockBar(c){
  if(c.lock)return `<div class="cb-lock locked"><div><b>🔒 확정된 캐릭터입니다</b><span>${esc(day(c.lock.at))} · ${esc(c.lock.by)} 님이 확정했습니다. 프로필과 대표 그림은 잠겨 있습니다. 고치려면 먼저 잠금을 풀어 주세요.</span></div>
    <button type="button" data-cb="unlock">잠금 해제</button></div>`;
  const miss=K.missingForLock(c);
  return `<div class="cb-lock"><div><b>다 되었으면 확정(고정)해 주세요</b><span>${miss.length?'확정하려면 먼저 채울 것: '+esc(miss.join(', ')):'확정하면 프로필과 대표 그림이 잠기고, 확정한 날짜와 이름이 남습니다.'}</span></div>
    <label class="cb-by">확정하는 분 이름<input id="cb-by" data-cb-by maxlength="30" value="${esc(by)}" placeholder="이름 또는 별명" autocomplete="off"></label>
    <button type="button" class="primary" data-cb="lock">확정(고정)하기</button></div>`;
}
function profile(c){
  const off=c.lock?'disabled':'',inp=(k,label,ph,max,val,extra='')=>`<label class="field"><span>${label}</span><input data-cb-field="${k}" maxlength="${max}" value="${esc(val)}" placeholder="${esc(ph)}" ${off} autocomplete="off">${extra}</label>`;
  return `<section class="panel"><div class="panelhead"><h2>프로필</h2><span class="muted cb-small">${c.lock?'잠겨 있어 고칠 수 없습니다':'적는 대로 저장됩니다'}</span></div><div class="panelbody"><div class="formgrid cb-form">
    ${FIELDS.map(([k,l,ph,max])=>inp(k,l,ph,max,c[k])).join('')}
    <div class="field full"><span>성격 (키워드 3개)</span><div class="cb-three">${[0,1,2].map(i=>`<input data-cb-field="trait${i}" maxlength="20" value="${esc(c.traits[i])}" placeholder="${['예: 느긋함','예: 호기심','예: 다정함'][i]}" aria-label="성격 키워드 ${i+1}" ${off} autocomplete="off">`).join('')}</div></div>
    ${LONG.slice(0,1).map(([k,l,ph,max])=>`<label class="field full"><span>${l}</span><textarea data-cb-field="${k}" maxlength="${max}" placeholder="${esc(ph)}" ${off}>${esc(c[k])}</textarea></label>`).join('')}
    ${LONG.slice(1,3).map(([k,l,ph,max])=>inp(k,l,ph,max,c[k])).join('')}
    <div class="field full cb-look"><span>생김새 규칙</span><small>그림을 그릴 때 꼭 지켜야 하는 것들입니다. 색은 #으로 시작하는 여섯 자리 값으로 적어 주세요.</small></div>
    ${LOOK.map(([k,l,ph,max])=>inp('look.'+k,l,ph,max,c.look[k],k==='colors'?`<span class="cb-swatches" id="cb-swatches">${swatches(c.look.colors)}</span>`:'')).join('')}
    ${LONG.slice(3).map(([k,l,ph,max])=>`<label class="field full"><span>${l}</span><textarea data-cb-field="${k}" maxlength="${max}" placeholder="${esc(ph)}" ${off}>${esc(c[k])}</textarea></label>`).join('')}
  </div></div></section>`;
}
function slotCard(c,s,g){
  const im=c.images[s.id],locked=K.slotLocked(c,s.id),off=locked?'disabled':'',cover=c.cover===s.id;
  return `<article class="cb-slot${cover?' cover':''}" data-slot="${s.id}">
    <div class="cb-thumb">${im.thumb?`<img src="${im.thumb}" alt="${esc(s.label)} 미리보기">`:'<span>그림 없음</span>'}</div>
    <div class="cb-slotbody"><div class="cb-slothead"><b>${esc(s.label)}</b>${cover?'<span class="badge green">대표 그림</span>':''}${locked?'<span class="badge">🔒 잠김</span>':''}</div>
      ${g.id==='face'||g.id==='pose'?`<input class="cb-note" data-cb-note="${s.id}" maxlength="60" value="${esc(im.note)}" placeholder="${g.id==='face'?'어떤 표정인지 (예: 웃음)':'어떤 자세인지 (예: 손 흔들기)'}" aria-label="${esc(s.label)} 설명" ${off} autocomplete="off">`:''}
      <label class="cb-row">상태<select data-cb-status="${s.id}" ${off}>${STATUS.map(([k,l])=>`<option value="${k}" ${im.status===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="cb-row">파일 위치<input data-cb-link="${s.id}" maxlength="500" value="${esc(im.link)}" placeholder="파일 이름이나 주소" ${off} autocomplete="off"></label>
      <div class="cb-slotact"><label class="cb-upload${locked?' off':''}">미리보기 올리기<input type="file" accept="image/png,image/jpeg,image/webp" data-cb-file="${s.id}" ${off}></label>
        ${im.thumb&&!locked?`<button type="button" class="text" data-cb="clear" data-slot="${s.id}">그림 지우기</button>`:''}
        ${cover?'':`<button type="button" class="text" data-cb="cover" data-slot="${s.id}" ${c.lock?'disabled':''}>대표 그림으로</button>`}</div>
    </div></article>`;
}
function images(c){
  const p=K.progress(c);
  return `<section class="panel"><div class="panelhead"><h2>그림 체크리스트</h2><span class="muted cb-small">확정 ${p.done} · 작업 중 ${p.doing} · 전체 ${p.all}칸</span></div><div class="panelbody">
    <div class="note">칸마다 그림을 만들면 <b>상태</b>를 바꾸고, 파일을 어디에 두었는지 적어 주세요. '미리보기 올리기'는 그림을 작게 줄여 이 화면에서 볼 수 있게 할 뿐이니, <b>원본 파일은 따로 보관</b>해 주세요.</div>
    ${GROUPS.map(g=>`<h3 class="cb-group">${g.label} <small>${g.hint}</small></h3><div class="cb-slots">${g.slots.map(([id,label])=>slotCard(c,{id,label},g)).join('')}</div>`).join('')}
  </div></section>`;
}
function detail(c){
  return `<div class="cb-detail" data-character="${esc(c.id)}">${lockBar(c)}${profile(c)}${images(c)}
    ${c.lock?'':`<div class="cb-danger"><button type="button" class="text danger" data-cb="remove">이 캐릭터를 목록에서 빼기</button></div>`}</div>`;
}
function refs(){
  return `<section class="panel"><div class="panelhead"><h2>참고 자료 — 지금 쓰는 그림</h2></div><div class="panelbody">
    <div class="note amber"><b>두 그림은 스타일이 서로 다릅니다.</b> ① 캐릭터 기준 시트는 매끈한 점토 느낌이고, ② 투명 3D 그림은 보송보송한 털실 느낌입니다. 어느 스타일로 갈지는 <b>확정하는 분이 정합니다.</b> 정한 스타일은 캐릭터마다 '생김새 규칙'에 적어 주세요.</div>
    <div class="cb-refs"><figure class="cb-ref wide"><img src="src/character-ref/ref-01-sheet.webp?v=${B}" alt="캐릭터 기준 시트: 도토리, 해바라기씨, 병아리콩, 호박씨, 땅콩, 작은 씨앗이 나란히 서 있는 그림"><figcaption>① 01 캐릭터 기준 시트 — 왼쪽부터 도토리 · 해바라기씨 · 병아리콩 · 호박씨 · 땅콩 · 작은 씨앗</figcaption></figure>
    <figure class="cb-ref"><div class="cb-ref3d">${REFS.map(([id,name])=>`<span><img src="src/character-ref/ref-05-${id}.webp?v=${B}" alt="투명 3D 그림: ${name}"><small>${name}</small></span>`).join('')}</div><figcaption>② 05 투명 3D 그림 — 홈페이지에 쓰는 배경 없는 그림 (호박씨는 아직 받은 그림이 없습니다)</figcaption></figure></div>
    <p class="cb-small muted">여기 그림은 보기 편하게 줄인 것입니다. 원본은 담당자에게 받아 주세요.</p>
  </div></section>`;
}
function handoff(){
  const n=board.characters.filter(c=>c.lock).length;
  return `<section class="panel"><div class="panelhead"><h2>확정한 캐릭터 넘기는 방법</h2></div><div class="panelbody"><ol class="cb-steps">
    <li>캐릭터를 <b>확정(고정)</b>합니다. 지금 확정된 캐릭터는 <b>${n}명</b>입니다.</li>
    <li>화면 맨 위의 <b>확정 목록 내보내기</b>를 누르면 파일 하나가 내려받아집니다.</li>
    <li>그 파일을 구글 드라이브의 <b>무무토리 &gt; 캐릭터 &gt; 확정</b> 폴더에 넣어 주세요. 그림 원본 파일도 같은 폴더에 함께 넣어 주세요.</li>
    <li>자사몰 담당이 이 폴더를 읽어 홈페이지의 캐릭터 그림을 바꿉니다. 폴더가 보이지 않으면 담당자에게 알려 주세요.</li></ol>
    <div class="note">만드는 중인 내용은 따로 보내지 않아도 됩니다. 사장님이나 다른 분이 이 화면을 열면 <b>지금 적은 그대로</b> 보입니다. 맨 위의 <b>파일로 내보내기</b>는 내용을 파일로 받아 두고 싶을 때 쓰세요.</div>
  </div></section>`;
}
function topbar(){
  const n=board.characters.filter(c=>c.lock).length;
  return `<div class="cb-top"><div class="cb-topinfo"><b id="cb-saved" class="cb-saved" role="status">${savedText()}</b>
      <span><i id="cb-link" class="cb-link ${LINK[link][1]}">${LINK[link][0]}</i>적는 즉시 저장되고, <b>다른 컴퓨터·휴대폰에서 이 화면을 연 분에게도 바로 보입니다.</b> 새로고침하지 않아도 됩니다.</span></div>
    <div class="cb-topact"><button type="button" class="primary cb-big" data-cb="backup">파일로 내보내기</button>
      <label class="cb-upload cb-big">파일 불러오기<input type="file" accept="application/json,.json" data-cb-import></label>
      <button type="button" class="cb-big" data-cb="export" ${n?'':'disabled'} title="${n?'':'확정된 캐릭터가 있어야 누를 수 있습니다'}">확정 목록 내보내기${n?' ('+n+'명)':''}</button></div></div>`;
}
function legacyBar(){
  if(!legacy)return '';
  return `<div class="note amber cb-legacy"><b>이 브라우저에만 저장해 둔 예전 내용이 있습니다</b> — 캐릭터 ${legacy.characters.length}명${legacy.savedAt?' · 마지막 저장 '+esc(legacy.savedAt.replace('T',' ')):''}. 이제는 적은 내용을 모두가 함께 봅니다. 예전 내용을 이어서 쓰려면 <b>예전 내용 올리기</b>를 눌러 주세요.
    <span class="cb-legacyact"><button type="button" class="primary" data-cb="legacy-up">예전 내용 올리기</button><button type="button" data-cb="legacy-file">파일로 받아 두기</button><button type="button" class="text" data-cb="legacy-hide">이 안내 닫기</button></span></div>`;
}
function view(){
  if(!ready)return `<div class="note cb-wait${link==='denied'||link==='offline'?' error':''}" role="status">${link==='denied'||link==='offline'?'함께 보는 내용을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요. 계속 안 되면 담당자에게 알려 주세요.':'함께 보는 내용을 불러오는 중입니다…'}</div>${refs()}`;
  const c=cur();
  return `${topbar()}${legacyBar()}<div class="note cb-guide"><b>이렇게 쓰세요</b> ① 아래에서 캐릭터를 고릅니다 → ② 프로필을 적습니다 → ③ 그림을 하나씩 만들어 상태를 바꿉니다 → ④ 다 되면 <b>확정(고정)</b>을 누릅니다.</div>
    <div id="cb-msg" class="note cb-msg${msg?.error?' error':''}" role="status" ${msg?'':'hidden'}>${esc(msg?.text||'')}</div>
    ${roster()}${c?detail(c):'<div class="empty"><b>캐릭터가 없습니다</b>위의 ＋ 캐릭터 추가를 눌러 주세요.</div>'}${refs()}${handoff()}`;
}
function refresh(keepMsg=false){stale=false;if(!keepMsg)msg=null;const root=document.getElementById('cb-root');if(root)root.innerHTML=view();}

// ---- 동작
function setField(c,key,value){
  if(c.lock)return false;
  if(key.startsWith('trait'))c.traits[+key.slice(5)]=value;else if(key.startsWith('look.'))c.look[key.slice(5)]=value;else c[key]=value;
  return true;
}
// 올린 그림은 작게 줄여 미리보기로만 저장한다(원본은 저장하지 않는다).
async function shrink(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG, JPG, WEBP 그림만 올릴 수 있습니다.');
  if(file.size>25*1024*1024)throw Error('그림 파일이 너무 큽니다(25MB까지).');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('그림을 읽지 못했습니다. 다른 파일로 해 보세요.'));i.src=url;});
    for(const size of [240,180,120]){
      const k=Math.min(1,size/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement('canvas');
      cv.width=Math.max(1,Math.round(img.naturalWidth*k));cv.height=Math.max(1,Math.round(img.naturalHeight*k));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      let out=cv.toDataURL('image/webp',.8);if(!out.startsWith('data:image/webp'))out=cv.toDataURL('image/png');
      if(out.length<=90000)return out;
    }
    throw Error('그림을 미리보기로 줄이지 못했습니다. 다른 파일로 해 보세요.');
  }finally{URL.revokeObjectURL(url);}
}
function onClick(e){
  const el=e.target.closest('[data-cb]');if(!el||!document.getElementById('cb-root')?.contains(el))return;
  const act=el.dataset.cb,c=cur();
  try{
    if(act==='pick'){sel=el.dataset.id;refresh();document.querySelector('.cb-pick.active')?.focus();return;}
    if(act==='legacy-file'){if(legacy)download(K.exportAll(legacy,now()),`mumutori-characters-old-${day(now()).replace(/-/g,'')}.json`);say('예전 내용을 파일로 받았습니다. 이 파일은 파일 불러오기로 다시 열 수 있습니다.');return;}
    if(act==='legacy-hide'){try{localStorage.setItem(MOVED_KEY,'hidden '+now());}catch(e){}legacy=null;refresh();say('안내를 닫았습니다. 예전 내용은 이 브라우저에 그대로 남아 있습니다.');return;}
    if(act==='legacy-up'){uploadLegacy();return;}
    if(act==='add'){const id=K.newId(board),nc=K.emptyCharacter(id,'새 캐릭터','씨앗 친구');board.characters.push(nc);sel=id;commit({['characters/'+id]:K.remoteCharacter(nc,nextOrder())});refresh();say('캐릭터를 추가했습니다. 이름부터 적어 주세요.');document.querySelector('[data-cb-field="name"]')?.select();return;}
    if(!c)return;
    const at=board.characters.indexOf(c);
    if(act==='lock'){const d=board.characters[at]=K.lockCharacter(c,by,now());commit({[path(d,'lock')]:d.lock,[path(d,'log')]:d.log});refresh();say(`'${board.characters[at].name}'을(를) 확정했습니다. 프로필과 대표 그림이 잠겼습니다.`);return;}
    if(act==='unlock'){if(!confirm(`'${c.name}'의 잠금을 풉니다. 풀면 프로필과 대표 그림을 다시 고칠 수 있고, 확정 목록에서 빠집니다. 계속할까요?`))return;const d=board.characters[at]=K.unlockCharacter(c,by,now());commit({[path(d,'lock')]:null,[path(d,'log')]:d.log});refresh();say('잠금을 풀었습니다. 다 고친 뒤 다시 확정해 주세요.');return;}
    if(act==='remove'){if(c.lock)throw Error('확정된 캐릭터는 뺄 수 없습니다. 먼저 잠금을 풀어 주세요.');if(!confirm(`'${c.name||'이름 없음'}'을(를) 목록에서 뺍니다. 적어 둔 프로필과 미리보기 그림도 함께 사라집니다. 계속할까요?`))return;board.characters.splice(at,1);sel=board.characters[0]?.id||'';commit({['characters/'+c.id]:null});refresh();say('캐릭터를 목록에서 뺐습니다.');return;}
    if(act==='cover'){if(c.lock)throw Error('확정된 캐릭터는 대표 그림을 바꿀 수 없습니다. 먼저 잠금을 풀어 주세요.');c.cover=el.dataset.slot;commit({[path(c,'cover')]:c.cover});refresh();return;}
    if(act==='clear'){if(K.slotLocked(c,el.dataset.slot))throw Error('잠긴 대표 그림입니다. 먼저 잠금을 풀어 주세요.');c.images[el.dataset.slot].thumb='';commit({[path(c,'images/'+el.dataset.slot+'/thumb')]:''});refresh();return;}
    if(act==='export'){const data=K.exportConfirmed(board,now());if(!data.characters.length)throw Error('확정된 캐릭터가 아직 없습니다.');download(data,`mumutori-characters-confirmed-${day(now()).replace(/-/g,'')}.json`);say(`확정된 캐릭터 ${data.characters.length}명을 파일로 내보냈습니다. 이 파일을 구글 드라이브의 '무무토리 > 캐릭터 > 확정' 폴더에 넣어 주세요.`);return;}
    if(act==='backup'){download(K.exportAll(board,now()),`mumutori-characters-all-${day(now()).replace(/-/g,'')}.json`);say('지금까지 적은 내용을 파일로 내보냈습니다. 이 파일은 파일 불러오기로 다시 열 수 있습니다.');return;}
  }catch(err){say(err.message,true);}
}
function onInput(e){
  const t=e.target;if(!document.getElementById('cb-root')?.contains(t))return;
  if(t.matches('[data-cb-by]')){by=t.value;return;}
  const c=cur();if(!c)return;
  if(t.dataset.cbField){if(setField(c,t.dataset.cbField,t.value)){commit(fieldUpdate(c,t.dataset.cbField),true);if(t.dataset.cbField==='look.colors'){const s=document.getElementById('cb-swatches');if(s)s.innerHTML=swatches(t.value);}}return;}
  const slot=t.dataset.cbLink||t.dataset.cbNote;
  if(slot&&!K.slotLocked(c,slot)){const k=t.dataset.cbLink?'link':'note';c.images[slot][k]=t.value;commit({[path(c,'images/'+slot+'/'+k)]:t.value},true);}
}
async function onChange(e){
  const t=e.target;if(!document.getElementById('cb-root')?.contains(t))return;
  const c=cur();
  try{
    if(t.dataset.cbStatus&&c){if(K.slotLocked(c,t.dataset.cbStatus))throw Error('잠긴 대표 그림입니다. 먼저 잠금을 풀어 주세요.');c.images[t.dataset.cbStatus].status=t.value;commit({[path(c,'images/'+t.dataset.cbStatus+'/status')]:t.value});refresh();return;}
    if(t.dataset.cbFile&&c){const file=t.files?.[0],slot=t.dataset.cbFile;t.value='';if(!file)return;if(K.slotLocked(c,slot))throw Error('잠긴 대표 그림입니다. 먼저 잠금을 풀어 주세요.');
      const id=c.id,thumb=await shrink(file),d=board.characters.find(x=>x.id===id);if(!d||K.slotLocked(d,slot))return;   // 줄이는 동안 다른 기기의 변경이 들어왔을 수 있어 다시 찾는다
      d.images[slot].thumb=thumb;if(!d.images[slot].link)d.images[slot].link=file.name.slice(0,500);if(d.images[slot].status==='todo')d.images[slot].status='doing';
      commit({[path(d,'images/'+slot)]:{...d.images[slot]}});refresh();say('미리보기를 올렸습니다. 원본 파일은 따로 보관해 주세요.');return;}
    if(t.matches('[data-cb-import]')){const file=t.files?.[0];t.value='';if(!file)return;const next=K.parseBackup(await file.text());
      if(!confirm(`파일에 캐릭터 ${next.characters.length}명이 들어 있습니다. 함께 보는 내용을 이 파일 내용으로 바꿉니다(다른 분의 화면도 바뀝니다). 계속할까요?`))return;
      try{await store.replace(K.toRemote(next,now()));}catch(err){throw Error('파일 내용을 올리지 못했습니다. 인터넷 연결을 확인하고 다시 해 주세요.');}
      sel=board.characters[0]?.id||'';refresh();say(`파일에서 캐릭터 ${board.characters.length}명을 가져왔습니다.`);return;}
    if(t.dataset.cbField||t.dataset.cbLink||t.dataset.cbNote){clearTimeout(saveTimer);store.flush().then(()=>stamp(savedText()));const el=document.querySelector(`.cb-pick[data-id="${CSS.escape(sel)}"]`);if(el&&c){el.querySelector('b').textContent=c.name||'이름 없음';el.querySelector('small').textContent=c.role||'역할 미정';}}
  }catch(err){say(err.message,true);}
}

async function uploadLegacy(){
  if(!legacy)return;
  try{
    if(!store.isEmpty()&&!confirm(`함께 보는 곳에 이미 적힌 내용이 있습니다. 그 내용을 이 브라우저의 예전 내용(캐릭터 ${legacy.characters.length}명)으로 바꿉니다. 다른 분이 적은 내용이 사라질 수 있습니다. 계속할까요?`))return;
    const n=legacy.characters.length;await store.replace(K.toRemote(legacy,now()));
    try{localStorage.setItem(MOVED_KEY,'moved '+now());}catch(e){}
    legacy=null;sel=board.characters[0]?.id||'';refresh();say(`예전 내용(캐릭터 ${n}명)을 올렸습니다. 이제 다른 분에게도 보입니다.`);
  }catch(err){say('올리지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',true);}
}
const typingEl=()=>{const a=document.activeElement;return a&&document.getElementById('cb-root')?.contains(a)&&a.matches('textarea,input:not([type=file])')?a:null;};
function valueFor(c,el){
  const d=el.dataset;
  if(d.cbField){const k=d.cbField;return k.startsWith('trait')?c.traits[+k.slice(5)]:k.startsWith('look.')?c.look[k.slice(5)]:c[k];}
  const im=c.images[d.cbLink||d.cbNote||d.cbStatus];return im?(d.cbLink?im.link:d.cbNote?im.note:im.status):'';
}
// 함께 보는 곳의 내용이 바뀌었을 때(다른 기기의 변경, 내가 보낸 것의 되돌아옴). 글자를 치는 중이면 그 칸은 건드리지 않고 다른 칸의 글만 바꾼다
// (한글 입력이 끊기지 않게) — 칸에서 나오면 전체를 다시 그린다.
function onRemote(tree){
  const first=!ready,keep=sel,el=typingEl(),before=first?'':JSON.stringify(board);
  board=K.fromRemote(tree);ready=true;sel=board.characters.some(c=>c.id===keep)?keep:(board.characters[0]?.id||'');
  if(first){refresh(true);return;}
  if(JSON.stringify(board)===before){stamp(savedText());return;}   // 달라진 것이 없으면(내가 보낸 것이 되돌아온 경우) 다시 그리지 않는다
  if(!el){refresh(true);return;}
  const c=cur(),root=document.getElementById('cb-root');stale=true;
  if(!c||root.querySelector('.cb-detail')?.dataset.character!==c.id)return;
  // 치고 있는 칸의 글은 화면 것이 맞다(아직 보내는 중일 수 있다) → 내 자료에 다시 얹는다
  if(el.dataset.cbField)setField(c,el.dataset.cbField,el.value);else if(el.dataset.cbLink||el.dataset.cbNote){const slot=el.dataset.cbLink||el.dataset.cbNote;if(!K.slotLocked(c,slot))c.images[slot][el.dataset.cbLink?'link':'note']=el.value;}
  for(const f of root.querySelectorAll('[data-cb-field],[data-cb-link],[data-cb-note],[data-cb-status]')){if(f===el)continue;const v=valueFor(c,f);if(f.value!==v)f.value=v;}
  for(const p of root.querySelectorAll('.cb-pick')){const x=board.characters.find(y=>y.id===p.dataset.id);if(x){p.querySelector('b').textContent=x.name||'이름 없음';p.querySelector('small').textContent=x.role||'역할 미정';}}
  stamp(savedText());
}
// 치던 칸에서 나오면 미뤄 둔 다시 그리기를 한다(누른 단추가 사라지지 않게 한 박자 늦춘다).
function onFocusOut(e){if(!stale||!document.getElementById('cb-root')?.contains(e.target))return;setTimeout(()=>{if(stale&&!typingEl())refresh(true);},300);}
function onLink(s){link=s;const el=document.getElementById('cb-link');if(el){el.textContent=LINK[s][0];el.className='cb-link '+LINK[s][1];}if(ready)stamp(savedText());else refresh(true);}

export default function renderPage(c){
  ctx=c;
  if(!started){started=true;board=K.defaultBoard();sel=board.characters[0].id;legacy=readLegacy();
    document.addEventListener('click',onClick);document.addEventListener('input',onInput);document.addEventListener('change',onChange);document.addEventListener('focusout',onFocusOut);
    addEventListener('pagehide',()=>{clearTimeout(saveTimer);store?.flush();});   // 창을 닫을 때 아직 안 보낸 것이 있으면 보낸다
    store=openStore({onChange:onRemote,onStatus:onLink});}
  return ctx.head('캐릭터 만들기','캐릭터마다 프로필과 그림을 채우고, 다 되면 확정(고정)합니다. 확정한 캐릭터는 파일로 내보내 자사몰에 넣습니다.','')+GUIDE.guideHtml({shared:true})+`<div id="cb-root">${view()}</div>`;
}
