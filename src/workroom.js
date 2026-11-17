// 자리별 작업실 — 실시간(20261117_1030 2번) — 총괄 운영실 '자리별 지금' 다음. 사장님 피드백(11/17):
// "그 친구들의 작업공간이 실시간으로 보여졌으면 좋겠어". 자료: _tools\workroom_sync.py가 자리마다
// 작업실\<자리>.jsonl(또는 자동 추정)을 Firebase hub/workroom 에 올린 것 — 이 화면은 그 경로를
// EventSource로 듣기만 한다(characters-sync.js의 소싱 보드 듣기 패턴과 같은 모양, 코드는 공유하지 않음).
// chongwal-ops.js·revenue-plan.js와도 완전히 분리된 자료·코드 경로(20261116·17의 반복 원칙).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}

const STR_MAX=200,SHORT_MAX=60;
function str(v,max){if(typeof v!=='string')return '';return v.length>max?v.slice(0,max):v;}
function isDataUri(s){return typeof s==='string'&&s.length<200_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);}

// 자리 9개 — 폴더 영문키 → 보여줄 한글 이름·얼굴(ops.json seats[]와 같은 캐릭터 배정을 그대로 따름, 다만
// 자료 자체는 공유하지 않는다). 순서는 화면에 보여줄 고정 순서.
export const SEAT_ORDER=['coupang','detail-mall','kakao','purchase','sourcing','design3d','video','video-analysis','hamili'];
const SEAT_LABEL={coupang:'광고',   'detail-mall':'자사몰·상세', kakao:'카카오채널', purchase:'구매·장부',
  sourcing:'소싱', design3d:'디자인', video:'영상', 'video-analysis':'영상분석', hamili:'해밀리'};
const SEAT_FACE={coupang:'밤','detail-mall':'완두콩', kakao:'해바라기씨', purchase:'밤',
  sourcing:'땅콩', design3d:'완두콩', video:'완두콩', 'video-analysis':'완두콩', hamili:'도토리'};
const FACE_FILE={'도토리':'dotori','밤':'chestnut','땅콩':'peanut','완두콩':'peas','해바라기씨':'sunflower','쌀':'rice','병아리콩':'chickpea'};
function faceNode(name){
  if(!name||!FACE_FILE[name])return null;
  const img=document.createElement('img');
  img.className='wr-face-icon';img.alt=name;img.loading='lazy';
  img.src=`src/character-canon/2d-${FACE_FILE[name]}.png`;
  return img;
}

const STATUS_CLASS={'움직이는 중':'wr-run','쉬는 중':'wr-idle','막힘':'wr-blocked','확인 필요':'wr-unknown'};

// 바깥(Firebase)에서 들어오는 값은 모양이 안 맞으면 그 자리만 '확인 필요'로 보여주고(throw 하지 않음) —
// 자리 9개 중 하나가 깨진 자료를 보내도 나머지 8개는 그대로 보이게(한 자리 사고가 전체를 막지 않음, 이 화면만의 태도).
function validatedSeat(x){
  if(!x||typeof x!=='object'||Array.isArray(x))return {status:'확인 필요',job:'',progress:'',lastMovedAt:'',steps:[],images:[],autoEstimated:false};
  const steps=Array.isArray(x.steps)?x.steps.slice(0,50).map(s=>({
    at:str(s?.at,40),job:str(s?.job,60),step:str(s?.step,STR_MAX),progress:str(s?.progress,20),
  })):[];
  const images=Array.isArray(x.images)?x.images.filter(isDataUri).slice(0,3):[];
  return {
    status:str(x.status,20)||'확인 필요',
    job:str(x.job,STR_MAX),
    progress:str(x.progress,20),
    lastMovedAt:str(x.lastMovedAt,40),
    steps,images,
    autoEstimated:x.autoEstimated===true,
  };
}
export function validatedWorkroom(x){
  if(x==null)return null;
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const out={};
  for(const seat of SEAT_ORDER)out[seat]=validatedSeat(x[seat]);
  return out;
}

function minutesAgo(iso,now){
  if(!iso)return null;
  const t=new Date(iso).getTime();
  if(!Number.isFinite(t))return null;
  return Math.max(0,Math.round((now-t)/60000));
}
function relTime(iso,now){
  const m=minutesAgo(iso,now);
  if(m==null)return '';
  if(m<1)return '방금 전';
  if(m<60)return m+'분 전';
  return Math.round(m/60)+'시간 전';
}

function stepRow(s){
  const li=el('li','wr-step');
  li.append(el('span','wr-step-text',s.step||'(빈 단계)'));
  if(s.progress)li.append(el('span','wr-step-progress',s.progress));
  const m=s.at?new Date(s.at):null;
  if(m&&!Number.isNaN(m.getTime()))li.append(el('time','wr-step-at',m.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})));
  return li;
}

function seatCard(seat,data,now){
  const card=el('div','wr-card');
  const head=el('div','wr-card-head');
  const f=faceNode(SEAT_FACE[seat]);if(f)head.append(f);
  const title=el('div','');
  title.append(el('strong','',SEAT_LABEL[seat]||seat));
  const chip=el('span','wr-chip '+(STATUS_CLASS[data.status]||'wr-unknown'),data.status);
  title.append(chip);
  head.append(title);
  card.append(head);

  const now_line=el('p','wr-now');
  now_line.append(el('span','',data.job?`지금: ${data.job}`:'지금 하는 일 없음'));
  if(data.lastMovedAt)now_line.append(el('small','wr-ago',relTime(data.lastMovedAt,now)));
  card.append(now_line);
  if(data.progress)card.append(el('p','wr-progress',data.progress));
  if(data.autoEstimated)card.append(el('span','badge amber','자동 추정'));

  if(data.images.length){
    const row=el('div','wr-images');
    for(const src of data.images){
      const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';
      row.append(img);
    }
    card.append(row);
  }

  if(data.steps.length){
    const details=el('details','wr-steps-wrap');
    const summary=document.createElement('summary');summary.textContent=`오늘 쌓인 단계 (${data.steps.length})`;
    details.append(summary);
    const ol=el('ul','wr-steps');
    for(const s of data.steps)ol.append(stepRow(s));
    details.append(ol);
    card.append(details);
  }else{
    card.append(el('p','note','아직 쌓인 단계가 없어요.'));
  }
  return card;
}

function render(host,state){
  host.replaceChildren();
  if(state.loading){host.append(el('p','note',state.loading));return;}
  if(state.error){host.append(el('p','note error',state.error));return;}
  if(!state.data){host.append(el('p','note','아직 작업실 자료가 없어요.'));return;}
  const now=Date.now();
  const grid=el('div','wr-grid');
  for(const seat of SEAT_ORDER)grid.append(seatCard(seat,state.data[seat],now));
  host.append(grid);
}

export function mountWorkroom(host){
  let closed=false,source=null,currentAuth=null,currentUser=null,unsubscribe=()=>{},pollTimer=null,rerenderTimer=null;
  const state={loading:'불러오는 중이에요.',error:null,data:null};
  function draw(){render(host,state);}
  function got(raw){
    try{state.loading=null;state.error=null;state.data=validatedWorkroom(raw);}
    catch(_){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';state.data=null;}
    draw();
  }
  function closeSource(){if(source){source.close();source=null;}if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}
  async function once(url){
    try{
      const r=await fetch(url,{method:'GET',cache:'no-store'});
      if(r.status===401||r.status===403){state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();return;}
      if(!r.ok)throw Error('load');
      got(await r.json());
    }catch(_){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';draw();}
  }
  function listen(url){
    closeSource();
    if(!window.EventSource){pollTimer=setInterval(()=>once(url),20000);once(url);return;}
    source=new EventSource(url);
    let failures=0;
    for(const ev of ['put','patch'])source.addEventListener(ev,e=>{
      failures=0;
      try{const parsed=JSON.parse(e.data);got(parsed?.data!==undefined?parsed.data:parsed);}catch(_){/* 지어내지 않음 — 그냥 이 이벤트만 건너뜀 */}
    });
    source.addEventListener('cancel',()=>{closeSource();state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();});
    source.onerror=()=>{if(++failures>=3){closeSource();pollTimer=setInterval(()=>once(url),20000);once(url);}};
  }
  async function load(){
    if(!currentUser?.uid){state.loading='로그인하면 보여요.';state.error=null;state.data=null;draw();return;}
    state.loading='불러오는 중이에요.';state.error=null;draw();
    const url=await currentAuth.dbUrl('hub/workroom');
    await once(url);
    listen(url);
  }
  import('./fbauth.js?v=access20261028').then(auth=>{
    if(closed||!host.isConnected)return;
    unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});
  }).catch(()=>{if(!closed&&host.isConnected){state.loading=null;state.error='로그인 연결을 확인해 주세요.';draw();}});
  // '방금 전/N분 전' 표시가 시간이 지나도 맞게 — 자료를 다시 받지 않고 1분마다 다시 그리기만.
  rerenderTimer=setInterval(()=>{if(!state.loading&&!state.error&&state.data)draw();},60000);
  return ()=>{closed=true;unsubscribe();closeSource();if(rerenderTimer)clearInterval(rerenderTimer);host.replaceChildren();};
}
