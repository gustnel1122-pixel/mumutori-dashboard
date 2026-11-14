// 쿠팡 매일 아침 점검 — Firebase hub/coupangDaily/data (사장님 구글 로그인 전용 칸, 보안 규칙은 hub 규칙을 그대로 물려받음 — fin-hub.js와 같은 길).
// 광고비·매출·일예산 같은 원 단위 숫자는 로그인 전에는 아예 요청하지 않는다. 쓰기는 이 화면이 하지 않는다(읽기만).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
const won=v=>v==null?'—':Number(v).toLocaleString('ko-KR')+'원';
const pct=v=>v==null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const count=v=>v==null?'—':Number(v).toLocaleString('ko-KR');
const dateTime=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

function metric(label,value,sub){
  const d=el('div','metric');
  d.append(el('small','',label));
  const strong=el('strong','',value);
  d.append(strong);
  if(sub)d.append(el('footer','',sub));
  return d;
}

function validated(x){
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error('format');
  return x;
}

function renderCard(host,data){
  host.replaceChildren();
  const blocked=data.status==='blocked';
  const status=el('div','note '+(blocked?'amber':''));
  status.textContent=(blocked?'⚠ 오늘 점검 막힘: '+(data.blockedReason||'확인 필요'):'정상')+' · '+dateTime(data.updatedAt)+' 확인';
  host.append(status);
  const ads=data.ads||{},inv=data.inventory||{},inq=data.inquiries||{};
  const metrics=el('div','metrics');
  metrics.append(
    metric('어제 광고 수익률',pct(ads.yesterday?.roas),'전환매출 기준'),
    metric('7일 광고 수익률',pct(ads.d7?.roas),'손익분기 '+pct(ads.breakeven)),
    metric('30일 광고 수익률',pct(ads.d30?.roas),'손익분기 '+pct(ads.breakeven)),
    metric('재고 경보',count((inv.outOfStock||0)+(inv.lowStock||0)+(inv.overstock||0))+'건','품절 '+count(inv.outOfStock)+' · 품절임박 '+count(inv.lowStock)+' · 과잉 '+count(inv.overstock)),
    metric('노출 저조·판매 0',count(inv.lowExposure)+' · '+count(inv.noSales),'광고로 늘리기 전 먼저 확인'),
    metric('문의·반품',count(inq.new)+'건 · '+count(inq.returns)+'건','새 문의 · 반품(접수만, 내용 없음)')
  );
  host.append(metrics);
  if(Array.isArray(ads.campaigns)&&ads.campaigns.length){
    host.append(el('h3','','캠페인'));
    const wrap=el('div','tablewrap'),table=el('table','table'),thead=el('thead'),trh=el('tr');
    for(const h of ['이름','상태','일예산','목표 수익률','진단'])trh.append(el('th','',h));
    thead.append(trh);table.append(thead);
    const tbody=el('tbody');
    for(const c of ads.campaigns){
      const tr=el('tr');
      tr.append(el('td','',c.name||''),el('td','',c.on?'켜짐':'꺼짐'),el('td','',won(c.dailyBudget)),el('td','',pct(c.targetRoas)),el('td','',c.diagnosis||''));
      tbody.append(tr);
    }
    table.append(tbody);wrap.append(table);host.append(wrap);
  }
  if(data.decisions){
    host.append(el('h3','','사장님이 정할 것'));
    const p=el('p','note');p.textContent=data.decisions;host.append(p);
  }
}

export function mountCoupangDaily(host){
  let closed=false,epoch=0,abort=null,unsubscribe=()=>{};
  const active=v=>!closed&&host.isConnected&&epoch===v;
  function message(text,retry,label){
    host.replaceChildren();
    const p=el('p','note',text);p.setAttribute('role','status');host.append(p);
    if(retry){const b=el('button','',label||'다시 불러오기');b.type='button';b.onclick=retry;host.append(b);}
  }
  async function begin(auth,user){
    const version=++epoch;abort?.abort();abort=null;
    if(!user?.uid){
      message('로그인하면 보여요.',()=>{try{Promise.resolve(auth.signIn()).catch(()=>message('로그인 연결을 확인해 주세요.',()=>begin(auth,auth.current())));}catch(_){message('로그인 연결을 확인해 주세요.',()=>begin(auth,auth.current()));}},'로그인');
      return;
    }
    message('불러오는 중이에요.');
    const controller=new AbortController();abort=controller;const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const url=await auth.dbUrl('hub/coupangDaily/data');
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      if(response.status===401||response.status===403){message('이 계정의 접근 권한을 확인해 주세요.');return;}
      if(!response.ok)throw Error('load');
      const raw=await response.json();
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      if(raw==null){message('아직 오늘 점검 자료가 없어요.');return;}
      renderCard(host,validated(raw));
    }catch(_){if(active(version))message('불러오지 못했어요. 연결을 확인해 주세요.',()=>begin(auth,auth.current()));}
    finally{clearTimeout(timer);if(abort===controller)abort=null;}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{if(closed||!host.isConnected)return;unsubscribe=auth.onAuth(user=>begin(auth,user));}).catch(()=>{if(!closed&&host.isConnected)message('로그인 연결을 확인해 주세요.');});
  return ()=>{closed=true;++epoch;abort?.abort();unsubscribe();host.replaceChildren();};
}
