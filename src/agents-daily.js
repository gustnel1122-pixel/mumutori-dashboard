// AI 자리 하루 보고 — Firebase hub/agentsDaily/<날짜>/<자리> (사장님 구글 로그인 전용 칸, hub 기존 보안 규칙을 그대로 물려받음 — fin-hub.js·ads-private.js와 같은 길).
// 9개 자리가 매일 17:40 루틴으로 각자 결과 파일(results\하루보고_<날짜>.md)에 적은 내용을, 로그인된 자리 창(같은 "현수(직장)" 프로필)에서
// 이 화면의 '보고 넣기'로 눌러 넣는다(20261114_1655 ②안) — 새 서버·새 키·새 OAuth 범위 없음.
// 2026-11-15 사장님 07:59 "알아들을 수 있게 쉽게 설명하라 그래 · 코멘트 달게 해줘 · 한눈에 보고 분석 가능하게" (20261115_0801):
//  easy{did,found,ask} 쉬운 말 3줄, nums{키:{label,value,unit}} 숫자 타일(어제 대비), agentsComments 코멘트, adsKeywords 키워드 표를 더함.
// 2026-11-15 08:04~08:05 사장님 "원가,마진,고객정보도 다 넣어" · "그런제한된규칙을너맘대로 만들지마" (20261115_0801_v2):
//  총괄이 0801에 적었던 원가·마진·고객정보 제외 규칙을 지우고, productCatalogPrivate/products_v5(원가·판매가·재고)로 원가·마진 표,
//  hub/customers/<판매처>/<id>로 고객 목록(이름·전화·주소 그대로 표시)을 더함. 로그인 구조는 그대로(새 보안 규칙 없음).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
// Date.getTime() is always UTC-absolute; a fixed +9h shift read back with toISOString() gives the
// KST date on every machine. Mixing in getTimezoneOffset() double-counts the shift once the OS
// itself is already KST (20261114_1823: 날짜가 하루 더 가 있던 버그, 한국 시간 PC에서 재현됨).
export function kstToday(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
export function kstWeek(){
  const kst=new Date(Date.now()+9*3600e3);
  const date=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()));
  const dayNum=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-dayNum+3);
  const firstThursday=new Date(Date.UTC(date.getUTCFullYear(),0,4));
  const weekNum=1+Math.round(((date-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7))/7);
  return date.getUTCFullYear()+'-W'+String(weekNum).padStart(2,'0');
}
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
const EASY_MAX=120;
const EASY_FIELDS=[['did','오늘 한 일'],['found','알아낸 것'],['ask','사장님께']];
const NUMS_MAX=8;
// 자리마다 날마다 같은 이름(키)으로 적어야 추이가 나온다 — 자유 입력칸이 아니라 고정 목록(사장님 1단계 목록 그대로, 있는 자리만).
const NUMS_SCHEMA={
  coupang:[['coupangInquiry','쿠팡 문의','건'],['coupangReturn','쿠팡 반품','건']],
  'detail-mall':[['visitors','방문자','명'],['orders','주문','건'],['revenue','매출','원']],
  kakao:[['friends','채널 친구','명'],['newFriends','새 친구','명'],['messagesSent','보낸 메시지','건']],
  purchase:[['openLedger','안 끝난 장부 건','건'],['received','들어온 물건 수','개']],
  sourcing:[['newCandidates','새 후보 상품','개'],['checked1688','1688 확인한 상품','개']],
  video:[['videosMade','만든 영상','개'],['views','조회수','회'],['likes','좋아요','개'],['saves','저장','개']],
  'video-analysis':[['videosMade','만든 영상','개'],['views','조회수','회'],['likes','좋아요','개'],['saves','저장','개']],
  design3d:[],hamili:[],
};
const COMMENT_MAX=500,REPLY_MAX=300;

function optStr(v,max){if(v==null)return undefined;if(typeof v!=='string'||v.length>max)throw Error('format');return v;}

export function validatedDay(x){
  if(x==null)return {};
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const out={};
  for(const [id] of SEATS){
    const v=x[id];if(v==null)continue;
    if(typeof v!=='object'||Array.isArray(v))throw Error('format');
    const rec={};
    for(const [k] of FIELDS){const s=v[k];if(s!=null){if(typeof s!=='string'||s.length>FIELD_MAX)throw Error('format');rec[k]=s;}}
    if(v.at!=null){if(typeof v.at!=='string'||v.at.length>40)throw Error('format');rec.at=v.at;}
    if(v.easy!=null){
      if(typeof v.easy!=='object'||Array.isArray(v.easy))throw Error('format');
      const easy={};
      for(const [k] of EASY_FIELDS){const s=optStr(v.easy[k],EASY_MAX);if(s!=null)easy[k]=s;}
      rec.easy=easy;
    }
    if(v.nums!=null){
      if(typeof v.nums!=='object'||Array.isArray(v.nums))throw Error('format');
      const keys=Object.keys(v.nums);if(keys.length>NUMS_MAX)throw Error('format');
      const nums={};
      for(const key of keys){
        const n=v.nums[key];if(n==null)continue;
        if(typeof n!=='object'||Array.isArray(n))throw Error('format');
        if(typeof n.label!=='string'||!n.label||n.label.length>30)throw Error('format');
        if(typeof n.value!=='number'||!Number.isFinite(n.value))throw Error('format');
        const unit=optStr(n.unit,10)??'';
        nums[key]={label:n.label,value:n.value,unit};
      }
      rec.nums=nums;
    }
    out[id]=rec;
  }
  return out;
}

export function validatedComments(x){
  if(x==null)return {};
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const out={};
  for(const [id] of SEATS){
    const seat=x[id];if(seat==null)continue;
    if(typeof seat!=='object'||Array.isArray(seat))continue;
    const list={};
    for(const [cid,v] of Object.entries(seat)){
      if(!v||typeof v!=='object'||Array.isArray(v))continue;
      if(typeof v.text!=='string'||!v.text||v.text.length>COMMENT_MAX)continue;
      const rec={
        at:typeof v.at==='string'?v.at:'',
        by:typeof v.by==='string'?v.by.slice(0,60):'',
        date:typeof v.date==='string'?v.date:'',
        text:v.text,
        status:['new','read','done'].includes(v.status)?v.status:'new',
      };
      if(typeof v.readAt==='string')rec.readAt=v.readAt;
      if(v.reply&&typeof v.reply==='object'&&typeof v.reply.text==='string'&&v.reply.text.length<=REPLY_MAX){
        rec.reply={at:typeof v.reply.at==='string'?v.reply.at:'',text:v.reply.text};
      }
      list[cid]=rec;
    }
    out[id]=list;
  }
  return out;
}

const KEYWORD_COMPETE=['낮음','보통','높음'];
export function validatedKeywords(x){
  if(!Array.isArray(x))return [];
  const out=[];
  for(const r of x){
    if(!r||typeof r!=='object'||typeof r.kw!=='string'||!r.kw)continue;
    const row={kw:r.kw.slice(0,80),monthly:typeof r.monthly==='number'&&Number.isFinite(r.monthly)?r.monthly:null,compete:KEYWORD_COMPETE.includes(r.compete)?r.compete:'확인 필요',where:typeof r.where==='string'?r.where.slice(0,20):''};
    if(typeof r.clicks==='number'&&Number.isFinite(r.clicks))row.clicks=r.clicks;
    if(typeof r.orders==='number'&&Number.isFinite(r.orders))row.orders=r.orders;
    if(typeof r.note==='string'&&r.note)row.note=r.note.slice(0,80);
    if(typeof r.group==='string'&&r.group)row.group=r.group.slice(0,20);
    out.push(row);
    if(out.length>=200)break;
  }
  return out;
}

// productCatalogPrivate/products_v5는 상품 관리 v5 화면이 쓰는 우리 쪽 비공개 자료라 agentsDaily류 hub 입력값과 달리
// 바깥에서 들어오는 값이 아니다 — 형식을 거부(throw)하지 않고, 읽을 수 없는 칸만 조용히 비워 둔다(지어내지 않기).
export function marginRows(products){
  // Firebase RTDB가 상품 id를 숫자 문자열(0,1,2...)로 매긴 노드는 REST로 받으면 배열이 되어 온다
  // (products_v5가 0020 묶음 나누기 뒤로 그렇게 됨) — object든 array든 Object.values로 똑같이 돈다.
  if(!products||typeof products!=='object')return [];
  const rows=[];
  for(const p of Object.values(products)){
    if(!p||typeof p!=='object')continue;
    const name=typeof p.name==='string'&&p.name?p.name:'(이름 없음)';
    const cost=typeof p.unitCost==='number'&&Number.isFinite(p.unitCost)?p.unitCost:null;
    const price=typeof p.sale?.storePrice==='number'&&Number.isFinite(p.sale.storePrice)?p.sale.storePrice:null;
    const stock=typeof p.stock==='number'&&Number.isFinite(p.stock)?p.stock:null;
    const margin=(cost!=null&&price!=null)?price-cost:null;
    const marginRate=(margin!=null&&price)?Math.round(margin/price*1000)/10:null;
    rows.push({id:typeof p.id==='string'?p.id:name,name,cost,price,stock,margin,marginRate});
  }
  return rows;
}

const CUSTOMER_FIELD_MAX={name:60,phone:30,address:200,items:300,memo:200};
export function validatedCustomers(x){
  if(x==null)return {};
  if(typeof x!=='object'||Array.isArray(x))return {};
  const out={};
  for(const [channel,entries] of Object.entries(x)){
    if(!entries||typeof entries!=='object'||Array.isArray(entries))continue;
    const list={};
    for(const [cid,v] of Object.entries(entries)){
      if(!v||typeof v!=='object'||Array.isArray(v))continue;
      if(typeof v.name!=='string'||!v.name)continue;
      const rec={at:typeof v.at==='string'?v.at:''};
      for(const [k,max] of Object.entries(CUSTOMER_FIELD_MAX))rec[k]=typeof v[k]==='string'?v[k].slice(0,max):'';
      rec.amount=typeof v.amount==='number'&&Number.isFinite(v.amount)?v.amount:null;
      rec.repeat=!!v.repeat;
      list[cid]=rec;
    }
    out[channel]=list;
  }
  return out;
}

function easyBlock(easy){
  const wrap=el('div','agent-easy');
  const rows=[['did','오늘 한 일'],['found','알아낸 것'],['ask','사장님께']];
  let any=false;
  for(const [k,fl] of rows){
    const v=(easy?.[k]||'').trim();
    if(!v)continue;
    any=true;
    const p=el('p','agent-easy-line');p.append(el('b','',fl+': '),document.createTextNode(v));wrap.append(p);
  }
  if(!any)wrap.append(el('p','note','쉬운 말 요약이 아직 없어요.'));
  return wrap;
}

function deltaText(curr,prev,unit){
  if(prev==null||!Number.isFinite(prev))return '(어제 자료 없음)';
  const diff=curr-prev;
  if(diff===0)return '(어제와 같음)';
  const arrow=diff>0?'▲':'▼';
  return `(어제보다 ${arrow}${Math.abs(diff).toLocaleString('ko-KR')}${unit})`;
}
function numTile(label,value,unit,prevValue){
  const d=el('div','metric');
  d.append(el('small','',label),el('strong','',value.toLocaleString('ko-KR')+unit));
  d.append(el('footer','',deltaText(value,prevValue,unit)));
  return d;
}
function numsSection(day,yesterday){
  const groups=[];
  for(const [id,label] of SEATS){
    const nums=day[id]?.nums;if(!nums||!Object.keys(nums).length)continue;
    const prevNums=yesterday?.[id]?.nums||{};
    const tiles=el('div','metrics');
    for(const [key,n] of Object.entries(nums))tiles.append(numTile(n.label,n.value,n.unit,prevNums[key]?.value));
    groups.push([label,tiles]);
  }
  if(!groups.length)return null;
  const wrap=el('div','section-gap');
  wrap.append(el('h3','','오늘 숫자(어제 대비)'));
  for(const [label,tiles] of groups){wrap.append(el('h4','agent-nums-seat',label));wrap.append(tiles);}
  return wrap;
}

function keywordSection(keywords){
  if(!keywords||!keywords.length)return null;
  const wrap=el('div','section-gap');
  wrap.append(el('h3','','키워드 표'));
  const controls=el('div','toolbar');
  const search=el('input');search.type='search';search.placeholder='키워드 찾기';search.setAttribute('aria-label','키워드 찾기');
  const groups=[...new Set(keywords.map(r=>r.group).filter(Boolean))];
  const groupSel=el('select');groupSel.setAttribute('aria-label','상품군 걸러보기');
  const allOpt=el('option','','전체 상품군');allOpt.value='';groupSel.append(allOpt);
  for(const g of groups){const o=el('option','',g);o.value=g;groupSel.append(o);}
  controls.append(search,groupSel);wrap.append(controls);
  const tableWrap=el('div','tablewrap');
  const table=el('table','table');
  const thead=el('thead');const trh=el('tr');
  const cols=[['kw','키워드'],['monthly','월 검색량'],['compete','경쟁'],['where','판매처'],['note','메모']];
  let sortKey='monthly',sortDir=-1;
  for(const [key,label] of cols){
    const th=el('th','',label);
    if(key==='monthly'||key==='compete'||key==='kw'){
      th.classList.add('sortable');th.setAttribute('role','button');th.tabIndex=0;
      const activate=()=>{sortDir=sortKey===key?-sortDir:-1;sortKey=key;draw();};
      th.onclick=activate;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};
    }
    trh.append(th);
  }
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');table.append(tbody);
  tableWrap.append(table);wrap.append(tableWrap);
  const COMPETE_ORDER={'낮음':0,'보통':1,'높음':2,'확인 필요':3};
  function draw(){
    const q=search.value.trim();
    const g=groupSel.value;
    let rows=keywords.filter(r=>(!q||r.kw.includes(q))&&(!g||r.group===g));
    rows=rows.slice().sort((a,b)=>{
      let av=a[sortKey],bv=b[sortKey];
      if(sortKey==='compete'){av=COMPETE_ORDER[av]??9;bv=COMPETE_ORDER[bv]??9;}
      if(av==null)av=sortKey==='monthly'?-1:'';
      if(bv==null)bv=sortKey==='monthly'?-1:'';
      if(av<bv)return -1*sortDir;if(av>bv)return 1*sortDir;return 0;
    });
    tbody.replaceChildren();
    for(const r of rows.slice(0,200)){
      const tr=el('tr');
      tr.append(
        el('td','',r.kw),
        el('td','',r.monthly!=null?r.monthly.toLocaleString('ko-KR'):'—'),
        el('td','',r.compete),
        el('td','',r.where||'—'),
        el('td','',r.note||r.group||''),
      );
      tbody.append(tr);
    }
    if(!rows.length){const tr=el('tr');const td=el('td','note','조건에 맞는 키워드가 없어요.');td.colSpan=cols.length;tr.append(td);tbody.append(tr);}
  }
  search.oninput=draw;groupSel.onchange=draw;
  draw();
  return wrap;
}

function marginSection(rows){
  if(!rows.length)return null;
  const withRate=rows.filter(r=>r.marginRate!=null);
  const avgRate=withRate.length?Math.round(withRate.reduce((s,r)=>s+r.marginRate,0)/withRate.length*10)/10:null;
  const LOW_RATE=20; // 마진율 20% 미만을 "낮음"으로 봄 — 사장님이 숫자를 정하지 않아 총괄이 정한 기준(바꿀 수 있음, 결과 파일에 적어 둠).
  const lowCount=withRate.filter(r=>r.marginRate<LOW_RATE).length;

  const wrap=el('div','section-gap');
  wrap.append(el('h3','','원가·마진 표'));
  const tiles=el('div','metrics');
  tiles.append(
    (()=>{const d=el('div','metric');d.append(el('small','','평균 마진율'),el('strong','',avgRate!=null?avgRate+'%':'—'));return d;})(),
    (()=>{const d=el('div','metric'+(lowCount?' amber':''));d.append(el('small','',`마진율 ${LOW_RATE}% 미만 상품`),el('strong','',String(lowCount)));return d;})(),
  );
  wrap.append(tiles);

  const search=el('input');search.type='search';search.placeholder='상품 이름 찾기';search.setAttribute('aria-label','상품 이름 찾기');
  const controls=el('div','toolbar');controls.append(search);wrap.append(controls);
  const tableWrap=el('div','tablewrap');
  const table=el('table','table');
  const thead=el('thead');const trh=el('tr');
  const cols=[['name','상품명'],['price','판매가'],['cost','개당 원가'],['margin','마진(원)'],['marginRate','마진율'],['stock','재고']];
  let sortKey='marginRate',sortDir=1;
  for(const [key,label] of cols){
    const th=el('th','',label);
    if(key!=='name'){
      th.classList.add('sortable');th.setAttribute('role','button');th.tabIndex=0;
      const activate=()=>{sortDir=sortKey===key?-sortDir:1;sortKey=key;draw();};
      th.onclick=activate;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};
    }
    trh.append(th);
  }
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');table.append(tbody);
  tableWrap.append(table);wrap.append(tableWrap);
  function draw(){
    const q=search.value.trim();
    let list=rows.filter(r=>!q||r.name.includes(q));
    list=list.slice().sort((a,b)=>{
      let av=a[sortKey],bv=b[sortKey];
      if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return -1;
      if(av<bv)return -1*sortDir;if(av>bv)return 1*sortDir;return 0;
    });
    tbody.replaceChildren();
    for(const r of list){
      const tr=el('tr');
      tr.append(
        el('td','',r.name),
        el('td','',r.price!=null?r.price.toLocaleString('ko-KR')+'원':'판매가 없음'),
        el('td','',r.cost!=null?r.cost.toLocaleString('ko-KR')+'원':'원가 없음'),
        el('td','',r.margin!=null?r.margin.toLocaleString('ko-KR')+'원':'—'),
        el('td','',r.marginRate!=null?r.marginRate+'%':'—'),
        el('td','',r.stock!=null?String(r.stock):'—'),
      );
      tbody.append(tr);
    }
    if(!list.length){const tr=el('tr');const td=el('td','note','조건에 맞는 상품이 없어요.');td.colSpan=cols.length;tr.append(td);tbody.append(tr);}
  }
  search.oninput=draw;
  draw();
  return wrap;
}

const CUSTOMER_CHANNELS=[['own','자사몰'],['smartstore','스마트스토어'],['coupang','쿠팡'],['kakao','카카오']];
function customersSection(customers){
  const wrap=el('div','section-gap');
  wrap.append(el('h3','','고객 목록(최근 주문 순)'));
  const rows=[];
  for(const [ch,label] of CUSTOMER_CHANNELS){
    const entries=customers?.[ch];
    if(!entries||!Object.keys(entries).length)continue;
    for(const c of Object.values(entries))rows.push({...c,channel:label});
  }
  const connected=CUSTOMER_CHANNELS.filter(([ch])=>customers?.[ch]&&Object.keys(customers[ch]).length).map(([,l])=>l);
  const notConnected=CUSTOMER_CHANNELS.filter(([ch])=>!customers?.[ch]||!Object.keys(customers[ch]).length).map(([,l])=>l);
  if(notConnected.length)wrap.append(el('p','note',notConnected.join('·')+' — 아직 연결 전.'));
  if(!rows.length){
    wrap.append(el('p','note','고객 자료가 아직 없어요.'));
    return wrap;
  }
  rows.sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  const repeatCount=rows.filter(r=>r.repeat).length;
  const regions=new Map();
  for(const r of rows){const region=(r.address||'').trim().split(/\s+/)[0]||'확인 필요';regions.set(region,(regions.get(region)||0)+1);}
  const tiles=el('div','metrics');
  tiles.append(
    (()=>{const d=el('div','metric');d.append(el('small','','연결된 판매처'),el('strong','',connected.length?connected.join('·'):'없음'));return d;})(),
    (()=>{const d=el('div','metric');d.append(el('small','','재구매 고객'),el('strong','',String(repeatCount)));return d;})(),
  );
  wrap.append(tiles);
  if(regions.size){
    const regionP=el('p','note');
    regionP.textContent='지역별: '+[...regions.entries()].sort((a,b)=>b[1]-a[1]).map(([r,n])=>`${r} ${n}`).join(' · ');
    wrap.append(regionP);
  }
  const tableWrap=el('div','tablewrap');
  const table=el('table','table');
  const thead=el('thead');const trh=el('tr');
  for(const h of ['판매처','이름','전화','주소','산 것','금액','재구매','메모'])trh.append(el('th','',h));
  thead.append(trh);table.append(thead);
  const tbody=el('tbody');
  for(const r of rows.slice(0,200)){
    const tr=el('tr');
    tr.append(
      el('td','',r.channel),
      el('td','',r.name),
      el('td','',r.phone||'—'),
      el('td','',r.address||'—'),
      el('td','',r.items||'—'),
      el('td','',r.amount!=null?r.amount.toLocaleString('ko-KR')+'원':'—'),
      el('td','',r.repeat?'예':'아니오'),
      el('td','',r.memo||''),
    );
    tbody.append(tr);
  }
  table.append(tbody);tableWrap.append(table);wrap.append(tableWrap);
  return wrap;
}

function commentStatusLabel(status){return status==='done'?'반영함':status==='read'?'읽음':'새 글';}

function commentsBlock(seatId,allComments,byLabel,auth,date,reload){
  const wrap=el('div','agent-comments');
  wrap.append(el('h4','','코멘트'));
  const list=Object.entries(allComments?.[seatId]||{}).sort((a,b)=>(b[1].at||'').localeCompare(a[1].at||'')).slice(0,5);
  if(!list.length)wrap.append(el('p','note','아직 코멘트 없음.'));
  for(const [,c] of list){
    const item=el('div','agent-comment-item');
    const head=el('div','agent-comment-head');
    head.append(el('span','agent-comment-badge agent-comment-'+c.status,commentStatusLabel(c.status)),el('span','agent-comment-by',c.by||'로그인 계정'));
    item.append(head);
    item.append(el('p','',c.text));
    if(c.reply?.text)item.append(el('p','note','자리 답: '+c.reply.text));
    wrap.append(item);
  }
  const form=el('div','agent-comment-form');
  const ta=el('textarea');ta.rows=2;ta.maxLength=COMMENT_MAX;ta.placeholder='이 자리에 한 줄 남기기';
  const err=el('p','form-error');
  const submit=el('button','','남기기');submit.type='button';
  submit.onclick=async()=>{
    const text=ta.value.trim();
    err.textContent='';
    if(!text){err.textContent='내용을 적어 주세요.';return;}
    submit.disabled=true;
    try{
      const id='c'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
      const url=await auth.dbUrl(`hub/agentsComments/${seatId}/${id}`);
      const body={at:new Date().toISOString(),by:byLabel,date,text,status:'new'};
      const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw Error('저장하지 못했습니다.');
      ta.value='';reload();
    }catch(e){err.textContent=e.message||'남기지 못했습니다.';}
    finally{submit.disabled=false;}
  };
  form.append(ta,submit,err);wrap.append(form);
  return wrap;
}

function seatCard(id,label,model,rec,comments,byLabel,auth,date,reload){
  const card=el('div','sx-set');
  const head=el('div','dept-top');
  head.append(el('strong','',label),el('span','badge'+(model==='페이블'?' badge':''),model));
  card.append(head);
  if(!rec){
    card.append(el('p','note','아직 오늘 보고 안 옴.'));
  }else{
    card.append(easyBlock(rec.easy));
    const details=el('details','');
    details.append(el('summary','','자세히'));
    const body=el('div','');
    for(const [k,fl] of FIELDS){
      const v=(rec[k]||'').trim();
      if(!v||v==='없음')continue;
      const row=el('p','');row.append(el('b','',fl+': '),document.createTextNode(v));body.append(row);
    }
    if(rec.at)body.append(el('small','sub','마지막 저장: '+new Date(rec.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})));
    details.append(body);card.append(details);
  }
  card.append(commentsBlock(id,comments,byLabel,auth,date,reload));
  return card;
}

function renderBoard(host,auth,user,date,day,yesterday,comments,keywords,products,customers,setDate,reload){
  host.replaceChildren();
  const isToday=date===kstToday();
  const byLabel=(user?.name||'').trim()||(user?.email||'').trim()||'로그인 계정';

  const nav=el('div','toolbar');
  const prev=el('button','',`◀ ${dateLabel(addDays(date,-1))}`);prev.type='button';prev.onclick=()=>setDate(addDays(date,-1));
  const todayBtn=el('button','',isToday?'오늘':`오늘로(${dateLabel(kstToday())})`);todayBtn.type='button';todayBtn.onclick=()=>setDate(kstToday());
  const next=el('button','',`${dateLabel(addDays(date,1))} ▶`);next.type='button';if(addDays(date,1)>kstToday())next.disabled=true;next.onclick=()=>setDate(addDays(date,1));
  const title=el('strong','',dateLabel(date)+(isToday?' (오늘)':''));
  nav.append(prev,title,todayBtn,next);host.append(nav);

  const decisions=SEATS.map(([id,label])=>{const b=day[id]?.bossDecide?.trim();return b&&b!=='없음'?[label,b]:null;}).filter(Boolean);
  if(decisions.length){
    const box=el('div','section-gap');
    box.append(el('h3','','사장님이 정할 것 모음'));
    for(const [label,text] of decisions){const p=el('p','note amber');p.textContent=label+' — '+text;box.append(p);}
    host.append(box);
  }

  const pendingComments=SEATS.reduce((n,[id])=>n+Object.values(comments?.[id]||{}).filter(c=>c.status==='new').length,0);
  const reported=SEATS.filter(([id])=>day[id]&&Object.keys(day[id]).length).length;
  const blocked=SEATS.filter(([id])=>{const b=day[id]?.blocked?.trim();return b&&b!=='없음';}).length;
  const metrics=el('div','metrics');
  metrics.append(
    (()=>{const d=el('div','metric');d.append(el('small','','보고 온 자리'),el('strong','',`${reported}/9`));return d;})(),
    (()=>{const d=el('div','metric');d.append(el('small','','막힘'),el('strong','',String(blocked)));return d;})(),
    (()=>{const d=el('div','metric'+(pendingComments?' amber':''));d.append(el('small','','답 기다리는 코멘트'),el('strong','',String(pendingComments)));return d;})(),
  );
  host.append(metrics);

  const nums=numsSection(day,yesterday);if(nums)host.append(nums);
  const margin=marginSection(marginRows(products));if(margin)host.append(margin);
  host.append(customersSection(customers));
  const kw=keywordSection(keywords);if(kw)host.append(kw);

  const cardsWrap=el('div','sx-sets');
  for(const [id,label,model] of SEATS)cardsWrap.append(seatCard(id,label,model,day[id],comments,byLabel,auth,date,reload));
  host.append(cardsWrap);

  const upgrades=SEATS.map(([id,label])=>{const u=day[id]?.upgrade?.trim();return u&&u!=='없음'?[label,u]:null;}).filter(Boolean);
  if(upgrades.length){
    host.append(el('h3','','오늘 업그레이드 모음'));
    for(const [label,text] of upgrades){const p=el('p','note');p.textContent=label+' — '+text;host.append(p);}
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
    const easyAreas={};
    for(const [k,label] of EASY_FIELDS){
      const f=el('label','field full');f.append(el('span','','쉬운 말 — '+label+'(중학생도 알 말로, 120자)'));
      const ta=el('textarea');ta.rows=2;ta.maxLength=EASY_MAX;f.append(ta);easyAreas[k]=ta;grid.append(f);
    }
    const areas={};
    for(const [k,label] of FIELDS){
      const f=el('label','field full');f.append(el('span','',label));
      const ta=el('textarea');ta.rows=2;ta.maxLength=FIELD_MAX;f.append(ta);areas[k]=ta;grid.append(f);
    }
    const numsField=el('div','field full');
    numsField.append(el('span','','숫자(있으면, 자리마다 정해진 항목만)'));
    const numsInputs={};
    const numsRow=el('div','agent-nums-inputs');
    numsField.append(numsRow);grid.append(numsField);
    function drawNumsInputs(){
      numsRow.replaceChildren();Object.keys(numsInputs).forEach(k=>delete numsInputs[k]);
      for(const [key,label,unit] of (NUMS_SCHEMA[select.value]||[])){
        const f=el('label','field');f.append(el('span','',label+`(${unit})`));
        const input=el('input');input.type='number';input.step='any';f.append(input);numsInputs[key]={input,label,unit};numsRow.append(f);
      }
    }
    select.onchange=drawNumsInputs;drawNumsInputs();
    body.append(grid);
    const err=el('p','form-error');body.append(err);
    const submit=el('button','primary','넣기');submit.type='button';
    submit.onclick=async()=>{
      err.textContent='';submit.disabled=true;
      try{
        const seat=select.value;
        const fields={};for(const [k] of FIELDS){const v=areas[k].value.trim();if(v)fields[k]=v;}
        if(!fields.done)throw Error('오늘 한 일을 적어 주세요.');
        const easy={};for(const [k] of EASY_FIELDS){const v=easyAreas[k].value.trim();if(v)easy[k]=v;}
        if(Object.keys(easy).length)fields.easy=easy;
        const nums={};for(const [key,{input,label,unit}] of Object.entries(numsInputs)){const v=input.value.trim();if(v!==''&&Number.isFinite(Number(v)))nums[key]={label,value:Number(v),unit};}
        if(Object.keys(nums).length)fields.nums=nums;
        fields.at=new Date().toISOString();
        const url=await auth.dbUrl(`hub/agentsDaily/${date}/${seat}`);
        const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
        if(!r.ok)throw Error('저장하지 못했습니다.');
        for(const ta of Object.values(areas))ta.value='';
        for(const ta of Object.values(easyAreas))ta.value='';
        drawNumsInputs();
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
    if(test){
      const yesterday=validatedDay(window.__MMT_TEST_AGENTS_YESTERDAY__||null);
      const comments=validatedComments(window.__MMT_TEST_AGENTS_COMMENTS__||null);
      const keywords=validatedKeywords(window.__MMT_TEST_AGENTS_KEYWORDS__||null);
      const products=window.__MMT_TEST_AGENTS_PRODUCTS__||null;
      const customers=validatedCustomers(window.__MMT_TEST_AGENTS_CUSTOMERS__||null);
      renderBoard(host,currentAuth,currentUser,date,validatedDay(test),yesterday,comments,keywords,products,customers,setDate,load);
      return;
    }
    message('불러오는 중이에요.');
    const controller=new AbortController();abort=controller;const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const [dayRaw,yRaw,cRaw,kRaw,pRaw,cuRaw]=await Promise.all([
        fetchJson(currentAuth,`hub/agentsDaily/${date}`,controller),
        fetchJson(currentAuth,`hub/agentsDaily/${addDays(date,-1)}`,controller).catch(()=>null),
        fetchJson(currentAuth,'hub/agentsComments',controller).catch(()=>null),
        fetchJson(currentAuth,'hub/adsKeywords/'+kstWeek(),controller).catch(()=>null),
        fetchJson(currentAuth,'productCatalogPrivate/products_v5/products',controller).catch(()=>null),
        fetchJson(currentAuth,'hub/customers',controller).catch(()=>null),
      ]);
      if(!active(version)||currentAuth.current()?.uid!==currentUser.uid)return;
      if(dayRaw==='unauthorized'){message('이 계정의 접근 권한을 확인해 주세요.');return;}
      const products=pRaw==='unauthorized'?null:pRaw;
      const customers=cuRaw==='unauthorized'?{}:validatedCustomers(cuRaw);
      renderBoard(host,currentAuth,currentUser,date,validatedDay(dayRaw),validatedDay(yRaw),validatedComments(cRaw),validatedKeywords(kRaw),products,customers,setDate,load);
    }catch(_){if(active(version))message('불러오지 못했어요. 연결을 확인해 주세요.',load);}
    finally{clearTimeout(timer);if(abort===controller)abort=null;}
  }
  async function fetchJson(auth,path,controller){
    const url=await auth.dbUrl(path);
    const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
    if(response.status===401||response.status===403)return 'unauthorized';
    if(!response.ok)throw Error('load');
    return response.json();
  }
  function setDate(next){date=next;load();}
  import('./fbauth.js?v=access20261028').then(auth=>{if(closed||!host.isConnected)return;unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});}).catch(()=>{if(!closed&&host.isConnected)message('로그인 연결을 확인해 주세요.');});
  return ()=>{closed=true;++epoch;abort?.abort();unsubscribe();host.replaceChildren();};
}
