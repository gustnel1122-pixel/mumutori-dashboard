// 총괄 보고서 — AI 조직도 맨 위, 이미지 중심 카드 섹션(20261116_2326).
// Firebase RTDB hub/chongwalReport/current · hub/chongwalReport/history/<id> 전용 — 공개 저장소에는 이미지가
// 절대 들어가지 않는다(여긴 내부 운영 화면, report.json 뼈대만 저장소에 있고 실제 그림은 전부 base64 data URI로
// Firebase에만 있음). 기존 하루 보고(agents-daily.js)의 validatedDay·SEATS·NUMS_SCHEMA와는 완전히 다른 자료라
// 그 쪽 허용 목록을 전혀 건드리지 않는다(2026-11-15 "허용 목록이 좁아 화면이 깨졌던" 흉터를 되풀이하지 않기 위함) —
// 이 파일이 읽지 못하는 모양이면 이 섹션만 조용히 "불러오지 못했어요"를 보여주고 자리 카드·조직도는 그대로 돈다.
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}

const TITLE_MAX=200,CAPTION_MAX=200,ID_MAX=60,CARDS_MAX=8;
function isImgDataUri(s){
  return typeof s==='string'&&s.length<4_000_000&&/^data:image\/(jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/.test(s);
}
// 바깥(Firebase)에서 들어오는 값은 모양이 틀리면 거부(throw)한다 — agents-daily.js의 validatedDay와 같은 태도지만
// 코드는 공유하지 않는다(완전히 분리된 경로).
export function validatedReport(x){
  if(x==null)return null;
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  if(typeof x.id!=='string'||!x.id||x.id.length>ID_MAX)throw Error('format');
  if(typeof x.updatedAt!=='string'||!x.updatedAt)throw Error('format');
  if(typeof x.title!=='string'||x.title.length>TITLE_MAX)throw Error('format');
  if(!Array.isArray(x.cards)||!x.cards.length||x.cards.length>CARDS_MAX)throw Error('format');
  const cards=x.cards.map(c=>{
    if(!c||typeof c!=='object'||Array.isArray(c))throw Error('format');
    if(typeof c.caption!=='string'||c.caption.length>CAPTION_MAX)throw Error('format');
    if(!isImgDataUri(c.img))throw Error('format');
    return {caption:c.caption,img:c.img};
  });
  return {id:x.id,updatedAt:x.updatedAt,title:x.title,cards};
}

function cardsRow(report,onOpen){
  const wrap=el('div','chongwal-cards');
  report.cards.forEach((c,i)=>{
    const card=el('div','chongwal-card');
    const btn=el('button','chongwal-card-btn');btn.type='button';
    btn.setAttribute('aria-label',(c.caption||'보고서 카드')+' 크게 보기');
    const img=document.createElement('img');img.src=c.img;img.alt=c.caption||'';img.loading='lazy';
    btn.append(img);
    btn.onclick=()=>onOpen(report.cards,i,report.title);
    card.append(btn);
    if(c.caption)card.append(el('p','chongwal-caption',c.caption));
    wrap.append(card);
  });
  return wrap;
}

let lightboxEl=null,lastFocus=null;
function closeLightbox(){
  if(!lightboxEl)return;
  lightboxEl.remove();lightboxEl=null;
  document.removeEventListener('keydown',onLightboxKey,true);
  if(lastFocus?.isConnected)lastFocus.focus();
}
function onLightboxKey(e){if(e.key==='Escape'){e.preventDefault();closeLightbox();}}
function openLightbox(cards,startIndex,title){
  closeLightbox();
  lastFocus=document.activeElement;
  let i=startIndex;
  const overlay=el('div','chongwal-lightbox');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.onclick=e=>{if(e.target===overlay)closeLightbox();};
  const head=el('div','chongwal-lightbox-head');
  head.append(el('strong','',title||''));
  const closeBtn=el('button','chongwal-lightbox-close','닫기 ✕');closeBtn.type='button';closeBtn.onclick=closeLightbox;
  head.append(closeBtn);
  const body=el('div','chongwal-lightbox-body');
  const img=document.createElement('img');img.className='chongwal-lightbox-img';
  const cap=el('p','chongwal-lightbox-caption');
  function draw(){img.src=cards[i].img;img.alt=cards[i].caption||'';cap.textContent=cards[i].caption||'';prev.disabled=i<=0;next.disabled=i>=cards.length-1;}
  const nav=el('div','chongwal-lightbox-nav');
  const prev=el('button','','◀');prev.type='button';prev.onclick=()=>{if(i>0){i--;draw();}};
  const next=el('button','','▶');next.type='button';next.onclick=()=>{if(i<cards.length-1){i++;draw();}};
  nav.append(prev,next);
  body.append(img,cap,nav);
  overlay.append(head,body);
  document.body.append(overlay);
  lightboxEl=overlay;
  draw();
  document.addEventListener('keydown',onLightboxKey,true);
  closeBtn.focus();
}

function pastList(ids,onPick){
  const details=el('details','chongwal-past');
  details.append(el('summary','','지난 보고서'+(ids.length?` (${ids.length})`:'')));
  const panel=el('div','chongwal-past-body');
  if(!ids.length){
    panel.append(el('p','note','아직 지난 보고서가 없어요.'));
  }else{
    const list=el('ul','chongwal-past-list');
    for(const id of ids){
      const li=el('li','');
      const b=el('button','','');b.type='button';b.textContent=id;
      b.onclick=()=>onPick(id,b);
      li.append(b);list.append(li);
    }
    panel.append(list);
  }
  details.append(panel);
  return details;
}

function render(host,auth,state,reload){
  host.replaceChildren();
  const wrap=el('div','chongwal-report');
  if(state.loading){wrap.append(el('p','note',state.loading));host.append(wrap);return;}
  if(state.error){wrap.append(el('p','note error',state.error));const retry=el('button','','다시 불러오기');retry.type='button';retry.onclick=reload;wrap.append(retry);host.append(wrap);return;}
  const report=state.viewing||state.current;
  if(!report){wrap.append(el('p','note','아직 총괄 보고서가 없어요.'));host.append(wrap);return;}
  const headRow=el('div','chongwal-head');
  headRow.append(el('h3','',report.title||'총괄 보고서'));
  if(state.viewing){
    const back=el('button','','현재 보고서로');back.type='button';
    back.onclick=()=>{state.viewing=null;render(host,auth,state,reload);};
    headRow.append(back);
  }
  wrap.append(headRow);
  wrap.append(cardsRow(report,openLightbox));
  wrap.append(pastList(state.historyIds||[],async(id,btn)=>{
    btn.disabled=true;
    try{
      const url=await auth.dbUrl(`hub/chongwalReport/history/${encodeURIComponent(id)}`);
      const r=await fetch(url,{method:'GET',cache:'no-store'});
      if(!r.ok)throw Error('load');
      const raw=await r.json();
      const picked=validatedReport(raw);
      if(!picked)throw Error('empty');
      state.viewing=picked;
      render(host,auth,state,reload);
    }catch(_){btn.disabled=false;alert('그 보고서를 불러오지 못했어요.');}
  }));
  host.append(wrap);
}

export function mountChongwalReport(host){
  let closed=false,epoch=0,currentAuth=null,currentUser=null,unsubscribe=()=>{};
  const active=v=>!closed&&host.isConnected&&epoch===v;
  const state={loading:'불러오는 중이에요.',error:null,current:null,historyIds:[],viewing:null};
  function draw(){render(host,currentAuth,state,load);}
  async function load(){
    const version=++epoch;
    if(!currentUser?.uid){state.loading='로그인하면 보여요.';state.error=null;state.current=null;draw();return;}
    state.loading='불러오는 중이에요.';state.error=null;draw();
    try{
      const curUrl=await currentAuth.dbUrl('hub/chongwalReport/current');
      const histUrl=(await currentAuth.dbUrl('hub/chongwalReport/history'))+'&shallow=true'; // shallow 목록만(이미지 안 받음)
      const [curRes,histRes]=await Promise.all([
        fetch(curUrl,{method:'GET',cache:'no-store'}),
        fetch(histUrl,{method:'GET',cache:'no-store'}),
      ]);
      if(!active(version))return;
      if(curRes.status===401||curRes.status===403){state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();return;}
      if(!curRes.ok)throw Error('load');
      const curRaw=await curRes.json();
      const histRaw=histRes.ok?await histRes.json():null;
      state.loading=null;state.error=null;
      state.current=validatedReport(curRaw);
      state.historyIds=histRaw&&typeof histRaw==='object'?Object.keys(histRaw).sort().reverse():[];
      state.viewing=null;
      draw();
    }catch(_){if(active(version)){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';draw();}}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{
    if(closed||!host.isConnected)return;
    unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});
  }).catch(()=>{if(!closed&&host.isConnected){state.loading=null;state.error='로그인 연결을 확인해 주세요.';draw();}});
  return ()=>{closed=true;++epoch;unsubscribe();closeLightbox();host.replaceChildren();};
}
