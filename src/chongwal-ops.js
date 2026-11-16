// 총괄 운영실 — agents.html '총괄 운영실' 섹션의 제안함·실행전략→일흐름·자리별 지금(20261117_0004, 2326 다음).
// Firebase RTDB hub/chongwalOps 전용 — 공개 저장소에는 이 자료가 절대 들어가지 않는다(내부 운영 화면 전용).
// 기존 agents-daily.js(validatedDay·SEATS·NUMS_SCHEMA)와도, chongwal-report.js(validatedReport)와도 완전히
// 분리된 자료·코드 경로다(2026-11-15 "허용 목록이 좁아 화면이 깨졌던" 흉터를 되풀이하지 않기 위함) — 이 파일이
// 읽지 못하는 모양이면 이 섹션만 조용히 "불러오지 못했어요"를 보여주고 다른 화면은 그대로 돈다.
// 데이터: H:\...\총괄_일감함\보고서\현재\ops.json(총괄이 씀) → _tools\chongwal_ops_sync.py가 hub/chongwalOps로.
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}

const STR_MAX=200,ID_MAX=60,SHORT_MAX=40;
function isImgDataUri(s){
  return typeof s==='string'&&s.length<4_000_000&&/^data:image\/(jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/.test(s);
}
function str(v,max){if(typeof v!=='string'||v.length>max)throw Error('format');return v;}
function optStr(v,max){if(v==null)return undefined;return str(v,max);}

// 바깥(Firebase)에서 들어오는 값은 모양이 틀리면 거부(throw)한다 — chongwal-report.js의 validatedReport와
// 같은 태도지만 코드는 공유하지 않는다(완전히 분리된 경로).
export function validatedOps(x){
  if(x==null)return null;
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const strategy=Array.isArray(x.strategy)?x.strategy.slice(0,10).map(s=>{
    if(!s||typeof s!=='object')throw Error('format');
    return {pillar:str(s.pillar,SHORT_MAX),face:str(s.face,20),goal:str(s.goal,STR_MAX)};
  }):[];
  const proposals=Array.isArray(x.proposals)?x.proposals.slice(0,30).map(p=>{
    if(!p||typeof p!=='object')throw Error('format');
    const out={
      id:str(p.id,ID_MAX),name:str(p.name,80),stage:str(p.stage,20),
      next:optStr(p.next,STR_MAX)??'',due:optStr(p.due,20)??'',
      jobs:Array.isArray(p.jobs)?p.jobs.slice(0,20).map(j=>str(j,ID_MAX)):[],
      warn:p.warn===true,
    };
    if(p.image!=null){if(!isImgDataUri(p.image))throw Error('format');out.image=p.image;}
    return out;
  }):[];
  const jobs=Array.isArray(x.jobs)?x.jobs.slice(0,80).map(j=>{
    if(!j||typeof j!=='object')throw Error('format');
    const out={
      job:str(j.job,ID_MAX),title:str(j.title,STR_MAX),plan:optStr(j.plan,SHORT_MAX)??'',
      seats:Array.isArray(j.seats)?j.seats.slice(0,10).map(s=>str(s,SHORT_MAX)):[],
      sent:optStr(j.sent,30)??'',due:optStr(j.due,30)??'',status:optStr(j.status,20)??'보냄',
    };
    if(j.result!=null)out.result=str(j.result,400);
    if(j.proposal!=null)out.proposal=str(j.proposal,ID_MAX);
    return out;
  }):[];
  const seats=Array.isArray(x.seats)?x.seats.slice(0,20).map(s=>{
    if(!s||typeof s!=='object')throw Error('format');
    return {seat:str(s.seat,SHORT_MAX),face:str(s.face,20),where:optStr(s.where,20)??'',does:optStr(s.does,STR_MAX)??''};
  }):[];
  return {
    updatedAt:optStr(x.updatedAt,40)??'',
    by:optStr(x.by,40)??'',
    strategy,proposals,jobs,seats,
  };
}

// 홈 화면 작은 카드(실행 중 N · 사장님 OK 기다림 N · 막힘 N) — chongwal-ops.js·home-ops.js가 같이 쓰는
// 순수 계산 함수(이 기능 안에서만 공유, agents-daily.js와는 공유하지 않음).
export function countHomeStats(data){
  const running=data.jobs.filter(j=>j.status==='하는 중').length;
  const blocked=data.jobs.filter(j=>j.status==='막힘').length;
  const waitingOwnerOk=data.proposals.filter(p=>p.stage==='사장님 OK').length;
  return {running,blocked,waitingOwnerOk};
}

// 자리 얼굴 — 그림 vs 글자만 토글. 사장님이 캐릭터 얼굴을 싫다고 하시면 이 불리언 하나만 false로 바꾸면 된다
// (20261117_0004 요구사항: "쉽게 글자만으로 바꾸기 쉬운 구조로").
export const FACE_SETTINGS={useIcons:true};
// ops.json의 seats[].face · strategy[].face는 정본 캐릭터 한글 이름 그대로 온다(예: '도토리','밤') —
// src/character-canon의 정본 2D 파일 이름으로만 매핑한다(새 그림을 만들지 않음, 있는 파일만 씀).
const FACE_FILE={'도토리':'dotori','밤':'chestnut','땅콩':'peanut','완두콩':'peas','해바라기씨':'sunflower','쌀':'rice','병아리콩':'chickpea'};
function faceNode(name){
  if(!name)return null;
  if(FACE_SETTINGS.useIcons&&FACE_FILE[name]){
    const img=document.createElement('img');
    img.className='ops-face-icon';img.alt=name;img.loading='lazy';
    img.src=`src/character-canon/2d-${FACE_FILE[name]}.png`;
    return img;
  }
  return el('span','ops-face-text',name);
}

const STAGES=['제안','기획안','사장님 OK','실행','끝'];
function stagePath(stage){
  const idx=STAGES.indexOf(stage);
  const ul=el('ul','ops-stage-path');
  STAGES.forEach((s,i)=>{
    const li=el('li','',s);
    if(idx<0){/* 모르는 단계면 색 없이 그냥 보여줌(지어내지 않기) */}
    else if(i<idx)li.classList.add('done');
    else if(i===idx)li.classList.add('current');
    ul.append(li);
  });
  return ul;
}

let lightboxEl=null,lastFocus=null;
function closeLightbox(){if(!lightboxEl)return;lightboxEl.remove();lightboxEl=null;document.removeEventListener('keydown',onLightboxKey,true);if(lastFocus?.isConnected)lastFocus.focus();}
function onLightboxKey(e){if(e.key==='Escape'){e.preventDefault();closeLightbox();}}
// 2326의 chongwal-report.js 라이트박스와 모양은 비슷하지만 이 파일 안에 따로 둔다(코드 공유로 생기는
// 뜻밖의 깨짐을 막기 위해 — 2326도 agents-daily.js와 같은 이유로 따로 두었다).
function openLightbox(img,caption){
  closeLightbox();lastFocus=document.activeElement;
  const overlay=el('div','chongwal-lightbox');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.onclick=e=>{if(e.target===overlay)closeLightbox();};
  const head=el('div','chongwal-lightbox-head');head.append(el('strong','',caption||''));
  const closeBtn=el('button','chongwal-lightbox-close','닫기 ✕');closeBtn.type='button';closeBtn.onclick=closeLightbox;head.append(closeBtn);
  const body=el('div','chongwal-lightbox-body');
  const im=document.createElement('img');im.className='chongwal-lightbox-img';im.src=img;im.alt=caption||'';
  body.append(im);overlay.append(head,body);document.body.append(overlay);lightboxEl=overlay;
  document.addEventListener('keydown',onLightboxKey,true);closeBtn.focus();
}

function proposalCard(p){
  const card=el('div','ops-proposal');
  const head=el('div','ops-proposal-head');
  head.append(el('strong','',p.name));
  if(p.due)head.append(el('span','badge','기한 '+p.due));
  if(p.warn)head.append(el('span','badge amber','확인 필요'));
  card.append(head);
  card.append(stagePath(p.stage));
  if(p.next)card.append(el('p','note','다음: '+p.next));
  if(p.image){
    const btn=el('button','ops-proposal-thumb');btn.type='button';btn.setAttribute('aria-label',p.name+' 기획안 크게 보기');
    const img=document.createElement('img');img.src=p.image;img.alt='';img.loading='lazy';btn.append(img);
    btn.onclick=()=>openLightbox(p.image,p.name);
    card.append(btn);
  }
  return card;
}

function proposalsBlock(data){
  const wrap=el('div','section-gap');
  wrap.append(el('h3','ops-block-title','제안함'));
  if(!data.proposals.length){wrap.append(el('p','note','아직 제안이 없어요.'));return wrap;}
  const list=el('div','ops-proposals');
  for(const p of data.proposals)list.append(proposalCard(p));
  wrap.append(list);
  return wrap;
}

const STATUS_CLASS={'보냄':'st-sent','하는 중':'st-doing','끝':'st-done','막힘':'st-blocked'};
function jobCard(job,seatFace){
  const card=el('div','ops-job-card');
  const chip=el('span','ops-job-chip '+(STATUS_CLASS[job.status]||'st-sent'),job.status||'보냄');
  card.append(chip);
  const top=el('div','ops-job-top');
  for(const s of job.seats){const f=faceNode(seatFace.get(s));if(f)top.append(f);}
  top.append(el('strong','',job.title));
  card.append(top);
  if(job.seats.length)card.append(el('p','sub',job.seats.join(' · ')));
  card.append(el('p','note',job.result||'아직 결과 없음'));
  const meta=[];
  if(job.sent)meta.push('보낸 때 '+job.sent);
  if(job.due)meta.push('기한 '+job.due);
  if(meta.length)card.append(el('small','sub',meta.join(' · ')));
  return card;
}

// 세 갈래(온라인 몰 · 오프라인 매장 · 캐릭터 사업·운영) — 운영(plan:'운영')은 캐릭터 사업 갈래에 같이 묶는다
// (20261117_0004 지시문 "캐릭터 사업·운영"을 그대로 따름 — 전략 pillar는 셋뿐이라 운영 전용 갈래는 없음).
const COLUMNS=[
  {label:'온라인 몰',plans:['온라인 몰']},
  {label:'오프라인 매장',plans:['오프라인 매장']},
  {label:'캐릭터 사업 · 운영',plans:['캐릭터 사업','운영']},
];
function flowBlock(data,seatFace){
  const wrap=el('div','section-gap');
  wrap.append(el('h3','ops-block-title','실행 전략 → 일 흐름'));
  const dispatcher=el('div','ops-dispatcher');
  const dot=faceNode('도토리');if(dot)dispatcher.append(dot);
  dispatcher.append(el('span','','총괄이 자리에 일을 나눠 줘요'));
  wrap.append(dispatcher);

  const cols=el('div','ops-flow-columns');
  const used=new Set();
  for(const col of COLUMNS){
    const jobsHere=data.jobs.filter(j=>col.plans.includes(j.plan));
    jobsHere.forEach(j=>used.add(j));
    const strat=data.strategy.find(s=>col.plans[0]===s.pillar);
    const colEl=el('div','ops-flow-col');
    const head=el('div','ops-flow-col-head');
    const f=faceNode(strat?.face);if(f)head.append(f);
    const headText=el('div','');
    headText.append(el('strong','',col.label));
    if(strat?.goal)headText.append(el('p','',strat.goal));
    head.append(headText);
    colEl.append(head);
    const jobsWrap=el('div','ops-flow-jobs');
    if(!jobsHere.length)jobsWrap.append(el('p','note','아직 보낸 일이 없어요.'));
    for(const j of jobsHere)jobsWrap.append(jobCard(j,seatFace));
    colEl.append(jobsWrap);
    cols.append(colEl);
  }
  // 어느 갈래에도 안 들어간 일감(plan이 비어 있거나 모르는 값) — 지어내지 않고 '그 밖'으로만 보여줌.
  const rest=data.jobs.filter(j=>!used.has(j));
  if(rest.length){
    const colEl=el('div','ops-flow-col');
    const head=el('div','ops-flow-col-head');head.append(el('strong','','그 밖'));
    colEl.append(head);
    const jobsWrap=el('div','ops-flow-jobs');
    for(const j of rest)jobsWrap.append(jobCard(j,seatFace));
    colEl.append(jobsWrap);
    cols.append(colEl);
  }
  wrap.append(cols);
  return wrap;
}

function seatNowCard(seat,jobsForSeat){
  const card=el('div','ops-seat-card');
  const head=el('div','ops-seat-head');
  const f=faceNode(seat.face);if(f)head.append(f);
  const title=el('div','');title.append(el('strong','',seat.seat));
  if(seat.where)title.append(el('span','ops-seat-where',seat.where));
  head.append(title);
  card.append(head);
  if(seat.does)card.append(el('p','sub',seat.does));
  const current=jobsForSeat.find(j=>j.status!=='끝')||jobsForSeat[0];
  if(current){
    card.append(el('p','',`지금: ${current.title}`));
    card.append(el('p','note',current.result||'아직 결과 없음'));
  }else{
    card.append(el('p','note','맡은 일 없음'));
  }
  return card;
}

function seatsBlock(data){
  const wrap=el('div','section-gap');
  wrap.append(el('h3','ops-block-title','자리별 지금'));
  if(!data.seats.length){wrap.append(el('p','note','아직 자리 자료가 없어요.'));return wrap;}
  const grid=el('div','ops-seats-grid');
  for(const seat of data.seats){
    const jobsForSeat=data.jobs.filter(j=>j.seats.includes(seat.seat)).slice().sort((a,b)=>(b.sent||'').localeCompare(a.sent||''));
    grid.append(seatNowCard(seat,jobsForSeat));
  }
  wrap.append(grid);
  return wrap;
}

function render(host,state,reload){
  host.replaceChildren();
  if(state.loading){host.append(el('p','note',state.loading));return;}
  if(state.error){
    host.append(el('p','note error',state.error));
    const retry=el('button','','다시 불러오기');retry.type='button';retry.onclick=reload;host.append(retry);
    return;
  }
  const data=state.data;
  if(!data){host.append(el('p','note','아직 총괄 운영실 자료가 없어요.'));return;}
  const seatFace=new Map(data.seats.map(s=>[s.seat,s.face]));
  host.append(proposalsBlock(data));
  host.append(flowBlock(data,seatFace));
  host.append(seatsBlock(data));
}

export function mountChongwalOps(host){
  let closed=false,epoch=0,currentAuth=null,currentUser=null,unsubscribe=()=>{};
  const active=v=>!closed&&host.isConnected&&epoch===v;
  const state={loading:'불러오는 중이에요.',error:null,data:null};
  function draw(){render(host,state,load);}
  async function load(){
    const version=++epoch;
    if(!currentUser?.uid){state.loading='로그인하면 보여요.';state.error=null;state.data=null;draw();return;}
    state.loading='불러오는 중이에요.';state.error=null;draw();
    try{
      const url=await currentAuth.dbUrl('hub/chongwalOps');
      const r=await fetch(url,{method:'GET',cache:'no-store'});
      if(!active(version))return;
      if(r.status===401||r.status===403){state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();return;}
      if(!r.ok)throw Error('load');
      const raw=await r.json();
      state.loading=null;state.error=null;
      state.data=validatedOps(raw);
      draw();
    }catch(_){if(active(version)){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';draw();}}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{
    if(closed||!host.isConnected)return;
    unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});
  }).catch(()=>{if(!closed&&host.isConnected){state.loading=null;state.error='로그인 연결을 확인해 주세요.';draw();}});
  return ()=>{closed=true;++epoch;unsubscribe();closeLightbox();host.replaceChildren();};
}
