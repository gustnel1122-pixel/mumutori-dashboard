// 돈 버는 길(20261117_1030) — 총괄 운영실 맨 위. 사장님 피드백(11/17): "정확히 뭘 어떻게 해서 수익을 낼 거고
// 언제까지 할 거다라는 말도 없어서" — 갈래마다 '무엇으로 돈' 한 줄 → 단계(마감·끝/지남) → 숫자 목표를 보여준다.
// 데이터: ops.json의 revenuePlan[](총괄이 씀) → _tools\chongwal_ops_sync.py가 hub/chongwalOps에 그대로 올림.
// chongwal-ops.js·home-ops.js와 같은 Firebase 경로(hub/chongwalOps)를 읽지만, 검사·그리기 코드는 공유하지
// 않는다(2026-11-16·17의 반복 교훈 — "완전히 분리된 자료·코드 경로"라야 한쪽이 깨져도 다른 쪽이 안 깨짐).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}

const STR_MAX=200,SHORT_MAX=60;
function str(v,max){if(typeof v!=='string'||v.length>max)throw Error('format');return v;}
function optStr(v,max){if(v==null)return undefined;return str(v,max);}
function optNum(v){if(v==null)return null;if(typeof v!=='number'||!Number.isFinite(v))throw Error('format');return v;}
function optBool(v){return v===true;}

// 바깥(Firebase)에서 들어오는 값은 모양이 틀리면 거부(throw)한다 — chongwal-ops.js의 validatedOps와 같은
// 태도지만 코드는 공유하지 않는다(이 파일만의 검사).
export function validatedRevenuePlan(x){
  if(x==null)return null;
  if(!Array.isArray(x))throw Error('format');
  return x.slice(0,10).map(b=>{
    if(!b||typeof b!=='object')throw Error('format');
    const steps=Array.isArray(b.steps)?b.steps.slice(0,20).map(s=>{
      if(!s||typeof s!=='object')throw Error('format');
      return {step:str(s.step,STR_MAX),due:optStr(s.due,20)??'',done:optBool(s.done)};
    }):[];
    const targets=Array.isArray(b.targets)?b.targets.slice(0,10).map(t=>{
      if(!t||typeof t!=='object')throw Error('format');
      return {
        label:str(t.label,SHORT_MAX),now:optNum(t.now),goal:optNum(t.goal),
        unit:optStr(t.unit,10)??'',due:optStr(t.due,20)??'',note:optStr(t.note,STR_MAX)??'',
      };
    }):[];
    return {branch:str(b.branch,SHORT_MAX),face:optStr(b.face,20)??'',money:str(b.money,STR_MAX),steps,targets};
  });
}

// 자리 얼굴과 같은 캐릭터 파일 매핑(chongwal-ops.js의 FACE_FILE과 같은 값이지만, 이 파일은 따로 들고
// 있는다 — 공유하면 한쪽을 고치다 다른 쪽을 깨뜨릴 수 있어서, 20261117_0004가 세운 원칙을 그대로 따름).
const FACE_FILE={'도토리':'dotori','밤':'chestnut','땅콩':'peanut','완두콩':'peas','해바라기씨':'sunflower','쌀':'rice','병아리콩':'chickpea'};
function faceNode(name){
  if(!name||!FACE_FILE[name])return null;
  const img=document.createElement('img');
  img.className='rev-face-icon';img.alt=name;img.loading='lazy';
  img.src=`src/character-canon/2d-${FACE_FILE[name]}.png`;
  return img;
}

// due는 '11/17' · '12/1' · '-' 모양(연도 없음, 올해로 본다). 모르는 모양이면 null(지어내지 않음 — 못 비교해도
// 그냥 '지남' 표시를 안 할 뿐 화면이 깨지지는 않는다).
function parseDue(due,year){
  if(!due)return null;
  const m=/^(\d{1,2})\/(\d{1,2})$/.exec(due.trim());
  if(!m)return null;
  const month=Number(m[1]),day=Number(m[2]);
  if(month<1||month>12||day<1||day>31)return null;
  return new Date(year,month-1,day,23,59,59);
}
function isOverdue(due,done,now){
  if(done)return false;
  const d=parseDue(due,now.getFullYear());
  return !!d&&d<now;
}

function stepRow(s,now){
  const li=el('li','rev-step');
  if(s.done)li.classList.add('done');
  else if(isOverdue(s.due,s.done,now))li.classList.add('overdue');
  const mark=el('span','rev-step-mark',s.done?'✓':(isOverdue(s.due,s.done,now)?'!':'·'));
  li.append(mark);
  li.append(el('span','rev-step-text',s.step));
  if(s.due)li.append(el('span','rev-step-due',s.due));
  return li;
}

function targetBlock(t){
  const wrap=el('div','rev-target');
  const head=el('div','rev-target-head');
  head.append(el('span','',t.label));
  if(t.due)head.append(el('span','rev-target-due','기한 '+t.due));
  wrap.append(head);
  if(t.now==null||t.goal==null){
    wrap.append(el('p','note',t.note||'확인 필요'));
    return wrap;
  }
  const bar=el('div','rev-target-bar');
  const fillPct=t.goal>0?Math.max(0,Math.min(100,Math.round(t.now/t.goal*100))):0;
  const fill=el('div','rev-target-fill');fill.style.width=fillPct+'%';
  bar.append(fill);
  wrap.append(bar);
  wrap.append(el('p','rev-target-nums',`${t.now} / ${t.goal} ${t.unit}`));
  if(t.note)wrap.append(el('p','note',t.note));
  return wrap;
}

function branchCard(b,now){
  const card=el('div','rev-card');
  const head=el('div','rev-card-head');
  const f=faceNode(b.face);if(f)head.append(f);
  head.append(el('strong','',b.branch));
  card.append(head);
  card.append(el('p','rev-money',b.money));
  if(b.steps.length){
    const ol=el('ol','rev-steps');
    for(const s of b.steps)ol.append(stepRow(s,now));
    card.append(ol);
  }
  if(b.targets.length){
    const t=el('div','rev-targets');
    for(const tg of b.targets)t.append(targetBlock(tg));
    card.append(t);
  }
  return card;
}

function render(host,state,reload){
  host.replaceChildren();
  if(state.loading){host.append(el('p','note',state.loading));return;}
  if(state.error){
    host.append(el('p','note error',state.error));
    const retry=el('button','','다시 불러오기');retry.type='button';retry.onclick=reload;host.append(retry);
    return;
  }
  const plan=state.data;
  if(!plan||!plan.length){host.append(el('p','note','아직 돈 버는 길 계획이 없어요.'));return;}
  const now=new Date();
  const grid=el('div','rev-grid');
  for(const b of plan)grid.append(branchCard(b,now));
  host.append(grid);
}

export function mountRevenuePlan(host){
  let closed=false,epoch=0,currentAuth=null,currentUser=null,unsubscribe=()=>{};
  const active=v=>!closed&&host.isConnected&&epoch===v;
  const state={loading:'불러오는 중이에요.',error:null,data:null};
  function draw(){render(host,state,load);}
  async function load(){
    const version=++epoch;
    if(!currentUser?.uid){state.loading='로그인하면 보여요.';state.error=null;state.data=null;draw();return;}
    state.loading='불러오는 중이에요.';state.error=null;draw();
    try{
      const url=await currentAuth.dbUrl('hub/chongwalOps/revenuePlan');
      const r=await fetch(url,{method:'GET',cache:'no-store'});
      if(!active(version))return;
      if(r.status===401||r.status===403){state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();return;}
      if(!r.ok)throw Error('load');
      const raw=await r.json();
      state.loading=null;state.error=null;
      state.data=validatedRevenuePlan(raw);
      draw();
    }catch(_){if(active(version)){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';draw();}}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{
    if(closed||!host.isConnected)return;
    unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});
  }).catch(()=>{if(!closed&&host.isConnected){state.loading=null;state.error='로그인 연결을 확인해 주세요.';draw();}});
  return ()=>{closed=true;++epoch;unsubscribe();host.replaceChildren();};
}
