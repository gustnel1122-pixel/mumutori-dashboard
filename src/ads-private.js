// 광고 통합 관리 — Firebase hub/adsDaily/<날짜> (사장님 구글 로그인 전용 칸, 보안 규칙은 hub 규칙을 그대로 물려받음 — fin-hub.js·coupang-private.js와 같은 길).
// 날짜 하나 안에 채널별(coupang·naver·meta·kakao·google) 칸이 있고, 각 칸이 어제·7일·30일 합계를 미리 계산해 담고 있다고 가정한다(여기서는 날짜 범위를 다시 더하지 않는다).
// 광고비·매출 같은 원 단위 숫자는 로그인 전에는 아예 요청하지 않는다. 쓰기는 이 화면이 하지 않는다(읽기만).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
const won=v=>v==null?'—':Number(v).toLocaleString('ko-KR')+'원';
const pct=v=>v==null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const count=v=>v==null?'—':Number(v).toLocaleString('ko-KR');
const dateTime=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
// Date.getTime() is always UTC-absolute regardless of the OS's own timezone; shifting it by a
// fixed +9h and reading it back with UTC getters gives KST wall-clock date correctly on every
// machine — mixing in getTimezoneOffset() double-counts the shift when the OS is already KST
// (20261114_1823: 날짜가 하루 더 가 있던 버그, 한국 시간으로 맞춘 PC에서 재현됨).
export function kstToday(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
export function kstWeek(){
  const kst=new Date(Date.now()+9*3600e3);
  const date=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()));
  const dayNum=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-dayNum+3);
  const firstThursday=new Date(Date.UTC(date.getUTCFullYear(),0,4));
  const weekNum=1+Math.round(((date-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7))/7);
  return date.getUTCFullYear()+'-W'+String(weekNum).padStart(2,'0');
}

export const CHANNELS=[['coupang','쿠팡'],['naver','네이버 검색광고'],['meta','메타(인스타·페북)'],['kakao','카카오'],['google','구글']];
export const PERIODS=[['yesterday','어제'],['d7','7일'],['d30','30일']];

function metric(label,value,sub){
  const d=el('div','metric');d.append(el('small','',label));const strong=el('strong','',value);d.append(strong);if(sub)d.append(el('footer','',sub));return d;
}

function validated(x){ if(!x||typeof x!=='object'||Array.isArray(x))throw Error('format'); return x; }

function inflowTable(label,rows){
  const wrap=el('div','tablewrap'),table=el('table','table'),thead=el('thead'),trh=el('tr');
  for(const h of [label,'방문','비중'])trh.append(el('th','',h));
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');
  for(const r of rows){const tr=el('tr');tr.append(el('td','',r.route),el('td','',count(r.visits)),el('td','',r.sharePct!=null?pct(r.sharePct):'—'));tbody.append(tr);}
  table.append(tbody);wrap.append(table);return wrap;
}
function productsTable(rows){
  const wrap=el('div','tablewrap'),table=el('table','table'),thead=el('thead'),trh=el('tr');
  for(const h of ['상품','방문','결제'])trh.append(el('th','',h));
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');
  for(const r of rows){const tr=el('tr');tr.append(el('td','',r.name),el('td','',count(r.visits)),el('td','',count(r.payments)));tbody.append(tr);}
  table.append(tbody);wrap.append(table);return wrap;
}
function keywordTable(rows){
  const wrap=el('div','tablewrap'),table=el('table','table'),thead=el('thead'),trh=el('tr');
  for(const h of ['채널','키워드','노출','클릭','주문','광고비','수익률'])trh.append(el('th','',h));
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');
  for(const r of rows){
    const tr=el('tr');
    tr.append(el('td','',r.channelLabel||r.channel||''),el('td','',r.keyword||''),el('td','',count(r.impressions)),el('td','',count(r.clicks)),el('td','',count(r.orders)),el('td','',won(r.spend)),el('td','',r.roas!=null?pct(r.roas):'—'));
    tbody.append(tr);
  }
  table.append(tbody);wrap.append(table);return wrap;
}

function renderCard(host,data,keywords){
  host.replaceChildren();
  let period='d7';
  const breakeven=CHANNELS.map(([id])=>data[id]?.breakeven).find(v=>v!=null)??null;
  const updatedAt=CHANNELS.map(([id])=>data[id]?.updatedAt).filter(Boolean).sort().at(-1);
  const blocked=CHANNELS.some(([id])=>data[id]?.status==='blocked');
  const blockedReason=CHANNELS.map(([id])=>data[id]?.status==='blocked'?data[id].blockedReason:null).find(Boolean);

  const status=el('div','note '+(blocked?'amber':''));
  status.textContent=(blocked?'⚠ 오늘 점검 막힘: '+(blockedReason||'확인 필요'):'정상')+' · '+dateTime(updatedAt)+' 확인';
  host.append(status);

  const tabs=el('div','sub-tabs');
  const periodBtns=PERIODS.map(([key,label])=>{
    const b=el('button','sub-tab'+(key===period?' active':''),label);b.type='button';b.onclick=()=>{period=key;draw();};return b;
  });
  periodBtns.forEach(b=>tabs.append(b));
  host.append(tabs);

  const body=el('div');
  host.append(body);

  function totalsFor(key){
    let spend=0,revenue=0,any=false;
    for(const [id] of CHANNELS){const p=data[id]?.[key];if(p){any=true;spend+=Number(p.spend)||0;revenue+=Number(p.revenue)||0;}}
    return any?{spend,revenue,roas:spend>0?(revenue/spend*100):null}:null;
  }
  function draw(){
    body.replaceChildren();
    periodBtns.forEach((b,i)=>b.classList.toggle('active',PERIODS[i][0]===period));
    const totals=totalsFor(period);
    const metrics=el('div','metrics');
    metrics.append(
      metric('광고비 합계',totals?won(totals.spend):'—',PERIODS.find(p=>p[0]===period)[1]+' · 전체 채널'),
      metric('광고 매출 합계',totals?won(totals.revenue):'—','전환 매출 기준'),
      metric('수익률',totals?pct(totals.roas):'—','손익분기 '+(breakeven!=null?pct(breakeven):'—'))
    );
    body.append(metrics);

    body.append(el('h3','','채널'));
    const cards=el('div','metrics');
    for(const [id,label] of CHANNELS){
      const ch=data[id];
      if(!ch){const d=el('div','metric is-muted');d.append(el('small','',label),el('strong','','아직 연결 전'));cards.append(d);continue;}
      const p=ch[period];
      const d=el('div','metric');d.append(el('small','',label),el('strong','',p?pct(p.roas):'—'),el('footer','',ch.campaigns?.some(c=>c.on)?'캠페인 켜짐':'전부 꺼짐'));
      cards.append(d);
    }
    body.append(cards);

    const allCampaigns=CHANNELS.flatMap(([id,label])=>(data[id]?.campaigns||[]).map(c=>({...c,channelLabel:label})));
    if(allCampaigns.length){
      body.append(el('h3','','캠페인'));
      const wrap=el('div','tablewrap'),table=el('table','table'),thead=el('thead'),trh=el('tr');
      for(const h of ['채널','이름','상태','일예산','목표 수익률','진단'])trh.append(el('th','',h));
      thead.append(trh);table.append(thead);
      const tbody=el('tbody');
      for(const c of allCampaigns){
        const tr=el('tr');
        tr.append(el('td','',c.channelLabel),el('td','',c.name||''),el('td','',c.on?'켜짐':'꺼짐'),el('td','',won(c.dailyBudget)),el('td','',pct(c.targetRoas)),el('td','',c.diagnosis||''));
        tbody.append(tr);
      }
      table.append(tbody);wrap.append(table);body.append(wrap);
    }

    const inflowRows=CHANNELS.flatMap(([id])=>data[id]?.topInflowRoutes30d||[]);
    if(inflowRows.length){body.append(el('h3','','유입 경로(30일)'));body.append(inflowTable('경로',inflowRows));}

    const productRows=CHANNELS.flatMap(([id])=>data[id]?.topProducts30d||[]);
    if(productRows.length){body.append(el('h3','','상품별 유입(30일)'));body.append(productsTable(productRows));}

    if(keywords?.length){body.append(el('h3','','키워드 통합'));body.append(keywordTable(keywords));}

    const decisions=CHANNELS.map(([id,label])=>data[id]?.decisions?[label,data[id].decisions]:null).filter(Boolean);
    if(decisions.length){
      body.append(el('h3','','사장님이 정할 것'));
      for(const [label,text] of decisions){const p=el('p','note');p.textContent=label+' — '+text;body.append(p);}
    }
  }
  draw();
}

export function mountAdsHub(host){
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
    // 시험용 가짜 자료(QA 전용 · 화면 모양만 · 실제 자료 안 건드림): ?testads=1 일 때만, 로그인은 그대로 해야 보인다.
    const test=typeof window!=='undefined'&&window.__MMT_TEST_ADS__;
    if(test){renderCard(host,validated(test),Array.isArray(window.__MMT_TEST_ADS_KEYWORDS__)?window.__MMT_TEST_ADS_KEYWORDS__:null);return;}
    message('불러오는 중이에요.');
    const controller=new AbortController();abort=controller;const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const url=await auth.dbUrl('hub/adsDaily/'+kstToday());
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      if(response.status===401||response.status===403){message('이 계정의 접근 권한을 확인해 주세요.');return;}
      if(!response.ok)throw Error('load');
      const raw=await response.json();
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      if(raw==null){message('아직 오늘 점검 자료가 없어요.');return;}
      // 키워드 통합(hub/adsKeywords/<주>)은 아직 비어 있을 수 있음 — 없으면 조용히 생략(화면은 그대로 뜸).
      let keywords=null;
      try{
        const kurl=await auth.dbUrl('hub/adsKeywords/'+kstWeek());
        const kresp=await fetch(kurl,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
        if(kresp.ok){const kraw=await kresp.json();if(Array.isArray(kraw))keywords=kraw;}
      }catch(_){/* 키워드는 있으면 좋은 자료라 실패해도 전체 화면을 막지 않음 */}
      if(!active(version)||auth.current()?.uid!==user.uid)return;
      renderCard(host,validated(raw),keywords);
    }catch(_){if(active(version))message('불러오지 못했어요. 연결을 확인해 주세요.',()=>begin(auth,auth.current()));}
    finally{clearTimeout(timer);if(abort===controller)abort=null;}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{if(closed||!host.isConnected)return;unsubscribe=auth.onAuth(user=>begin(auth,user));}).catch(()=>{if(!closed&&host.isConnected)message('로그인 연결을 확인해 주세요.');});
  return ()=>{closed=true;++epoch;abort?.abort();unsubscribe();host.replaceChildren();};
}
