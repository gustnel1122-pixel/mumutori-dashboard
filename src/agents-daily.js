// AI 자리 하루 보고 — Firebase hub/agentsDaily/<날짜>/<자리> (사장님 구글 로그인 전용 칸, hub 기존 보안 규칙을 그대로 물려받음 — fin-hub.js·ads-private.js와 같은 길).
// 9개 자리가 매일 17:40 루틴으로 각자 결과 파일(results\하루보고_<날짜>.md)에 적은 내용을, 로그인된 자리 창(같은 "현수(직장)" 프로필)에서
// 이 화면의 '보고 넣기'로 눌러 넣는다(20261114_1655 ②안) — 새 서버·새 키·새 OAuth 범위 없음. 숫자·원가·개인정보는 여기 적지 않는다(글자만).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
// Date.getTime() is always UTC-absolute; a fixed +9h shift read back with toISOString() gives the
// KST date on every machine. Mixing in getTimezoneOffset() double-counts the shift once the OS
// itself is already KST (20261114_1823: 날짜가 하루 더 가 있던 버그, 한국 시간 PC에서 재현됨).
export function kstToday(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
function addDays(ymd,n){const [y,m,d]=ymd.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10);}
function dateLabel(ymd){const [y,m,d]=ymd.split('-').map(Number);return `${y}.${String(m).padStart(2,'0')}.${String(d).padStart(2,'0')}`;}

export const SEATS=[
  ['coupang','광고','소넷'],
  ['detail-mall','자사몰','페이블'],
  ['kakao','카카오','소넷'],
  ['purchase','구매·장부','소넷'],
  ['sourcing','소싱','소넷'],
  ['design3d','디자인·3D','페이블'],
  ['video','영상','소넷'],
  ['video-analysis','영상분석','소넷'],
  ['hamili','해밀리','소넷'],
];
const FIELD_MAX=400;
const FIELDS=[['done','오늘 한 일'],['upgrade','업그레이드'],['blocked','막힘'],['tomorrow','내일'],['bossDecide','사장님 정할 것']];

function validatedDay(x){
  if(x==null)return {};
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const out={};
  for(const [id] of SEATS){
    const v=x[id];if(v==null)continue;
    if(typeof v!=='object'||Array.isArray(v))throw Error('format');
    const rec={};
    for(const [k] of FIELDS){const s=v[k];if(s!=null){if(typeof s!=='string'||s.length>FIELD_MAX)throw Error('format');rec[k]=s;}}
    if(v.at!=null){if(typeof v.at!=='string'||v.at.length>40)throw Error('format');rec.at=v.at;}
    out[id]=rec;
  }
  return out;
}

function seatCard(id,label,model,rec){
  const card=el('div','sx-set');
  const head=el('div','dept-top');
  head.append(el('strong','',label),el('span','badge'+(model==='페이블'?' badge':''),model));
  card.append(head);
  if(!rec){card.append(el('p','note','아직 오늘 보고 안 옴.'));return card;}
  for(const [k,fl] of FIELDS){
    const v=(rec[k]||'').trim();
    if(!v||v==='없음')continue;
    const row=el('p','');row.append(el('b','',fl+': '),document.createTextNode(v));card.append(row);
  }
  if(rec.at)card.append(el('small','sub','마지막 저장: '+new Date(rec.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})));
  return card;
}

function renderBoard(host,auth,date,day,setDate,reload){
  host.replaceChildren();
  const isToday=date===kstToday();

  const nav=el('div','toolbar');
  const prev=el('button','',`◀ ${dateLabel(addDays(date,-1))}`);prev.type='button';prev.onclick=()=>setDate(addDays(date,-1));
  const todayBtn=el('button','',isToday?'오늘':`오늘로(${dateLabel(kstToday())})`);todayBtn.type='button';todayBtn.onclick=()=>setDate(kstToday());
  const next=el('button','',`${dateLabel(addDays(date,1))} ▶`);next.type='button';if(addDays(date,1)>kstToday())next.disabled=true;next.onclick=()=>setDate(addDays(date,1));
  const title=el('strong','',dateLabel(date)+(isToday?' (오늘)':''));
  nav.append(prev,title,todayBtn,next);host.append(nav);

  const reported=SEATS.filter(([id])=>day[id]&&Object.keys(day[id]).length).length;
  const blocked=SEATS.filter(([id])=>{const b=day[id]?.blocked?.trim();return b&&b!=='없음';}).length;
  const bossCount=SEATS.filter(([id])=>{const b=day[id]?.bossDecide?.trim();return b&&b!=='없음';}).length;
  const metrics=el('div','metrics');
  metrics.append(
    (()=>{const d=el('div','metric');d.append(el('small','','보고 온 자리'),el('strong','',`${reported}/9`));return d;})(),
    (()=>{const d=el('div','metric');d.append(el('small','','막힘'),el('strong','',String(blocked)));return d;})(),
    (()=>{const d=el('div','metric');d.append(el('small','','사장님 정할 것'),el('strong','',String(bossCount)));return d;})(),
  );
  host.append(metrics);

  const cardsWrap=el('div','sx-sets');
  for(const [id,label,model] of SEATS)cardsWrap.append(seatCard(id,label,model,day[id]));
  host.append(cardsWrap);

  const upgrades=SEATS.map(([id,label])=>{const u=day[id]?.upgrade?.trim();return u&&u!=='없음'?[label,u]:null;}).filter(Boolean);
  if(upgrades.length){
    host.append(el('h3','','오늘 업그레이드 모음'));
    for(const [label,text] of upgrades){const p=el('p','note');p.textContent=label+' — '+text;host.append(p);}
  }
  const decisions=SEATS.map(([id,label])=>{const b=day[id]?.bossDecide?.trim();return b&&b!=='없음'?[label,b]:null;}).filter(Boolean);
  if(decisions.length){
    host.append(el('h3','','사장님이 정할 것 모음'));
    for(const [label,text] of decisions){const p=el('p','note amber');p.textContent=label+' — '+text;host.append(p);}
  }

  if(isToday){
    const details=el('details','section-gap');
    const summary=el('summary','','보고 넣기(자리 창에서 하루 한 번)');details.append(summary);
    const panel=el('div','panel');
    const body=el('div','panelbody');
    const grid=el('div','formgrid');
    const seatField=el('label','field');seatField.append(el('span','','자리'));
    const select=el('select');for(const [id,label] of SEATS){const o=el('option','',label);o.value=id;select.append(o);}
    seatField.append(select);grid.append(seatField);
    const areas={};
    for(const [k,label] of FIELDS){
      const f=el('label','field full');f.append(el('span','',label));
      const ta=el('textarea');ta.rows=2;ta.maxLength=FIELD_MAX;f.append(ta);areas[k]=ta;grid.append(f);
    }
    body.append(grid);
    const err=el('p','form-error');body.append(err);
    const submit=el('button','primary','넣기');submit.type='button';
    submit.onclick=async()=>{
      err.textContent='';submit.disabled=true;
      try{
        const seat=select.value;
        const fields={};for(const [k] of FIELDS){const v=areas[k].value.trim();if(v)fields[k]=v;}
        if(!fields.done)throw Error('오늘 한 일을 적어 주세요.');
        fields.at=new Date().toISOString();
        const url=await auth.dbUrl(`hub/agentsDaily/${date}/${seat}`);
        const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
        if(!r.ok)throw Error('저장하지 못했습니다.');
        for(const ta of Object.values(areas))ta.value='';
        reload();
      }catch(e){err.textContent=e.message||'넣지 못했습니다.';}
      finally{submit.disabled=false;}
    };
    body.append(submit);
    panel.append(body);details.append(panel);host.append(details);
  }
}

export function mountAgentsDaily(host){
  let closed=false,epoch=0,abort=null,unsubscribe=()=>{},currentAuth=null,currentUser=null,date=kstToday();
  const active=v=>!closed&&host.isConnected&&epoch===v;
  function message(text,retry,label){
    host.replaceChildren();
    const p=el('p','note',text);p.setAttribute('role','status');host.append(p);
    if(retry){const b=el('button','',label||'다시 불러오기');b.type='button';b.onclick=retry;host.append(b);}
  }
  async function load(){
    const version=++epoch;abort?.abort();abort=null;
    if(!currentUser?.uid){
      message('로그인하면 보여요.',()=>{try{Promise.resolve(currentAuth.signIn()).catch(()=>message('로그인 연결을 확인해 주세요.',load));}catch(_){message('로그인 연결을 확인해 주세요.',load);}},'로그인');
      return;
    }
    const test=typeof window!=='undefined'&&window.__MMT_TEST_AGENTS_DAILY__;
    if(test){renderBoard(host,currentAuth,date,validatedDay(test),setDate,load);return;}
    message('불러오는 중이에요.');
    const controller=new AbortController();abort=controller;const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const url=await currentAuth.dbUrl('hub/agentsDaily/'+date);
      if(!active(version)||currentAuth.current()?.uid!==currentUser.uid)return;
      const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!active(version)||currentAuth.current()?.uid!==currentUser.uid)return;
      if(response.status===401||response.status===403){message('이 계정의 접근 권한을 확인해 주세요.');return;}
      if(!response.ok)throw Error('load');
      const raw=await response.json();
      if(!active(version)||currentAuth.current()?.uid!==currentUser.uid)return;
      renderBoard(host,currentAuth,date,validatedDay(raw),setDate,load);
    }catch(_){if(active(version))message('불러오지 못했어요. 연결을 확인해 주세요.',load);}
    finally{clearTimeout(timer);if(abort===controller)abort=null;}
  }
  function setDate(next){date=next;load();}
  import('./fbauth.js?v=access20261028').then(auth=>{if(closed||!host.isConnected)return;unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});}).catch(()=>{if(!closed&&host.isConnected)message('로그인 연결을 확인해 주세요.');});
  return ()=>{closed=true;++epoch;abort?.abort();unsubscribe();host.replaceChildren();};
}
