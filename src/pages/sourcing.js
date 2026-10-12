// 소싱 보드 — 1688 후보 고르기(💗/👎/💸·한마디)와 발주 장바구니.
// 자료는 ERP 원장(localStorage)과 별개로 Firebase Realtime DB `sourcing/`에 있다(로그인 없이 공유, 2026-10-07 사장님 결정).
// Claude는 mumutori-auto/sourcing_db.py로 같은 경로를 읽고 써서, 표시를 다음 소싱·발주에 반영한다.
import {identity,originalUrl,exclusion,reviewProblems,recommendable,POLICY_VERSION,keyOfSpec,skuSnapshot,skuReviewProblems,orderProblems} from '../sourcing-policy.js';
import {touchedPaths,remember,revertTouched} from '../sourcing-sync.js';
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
// 구글 로그인(2026-10-10 사장님 승인): 보드 읽기·다른 쓰기는 지금처럼 그대로, '선택 옵션 검수 요청'만 운영 계정(구글 로그인) 토큰으로 저장한다.
// 실제 제한은 Firebase 규칙(reviewRequests: 운영 계정만 새로 만들기, 익명·삭제·결과 변경 금지)이 맡는다. 로그인 도구는 src/fbauth.js.
const fbauth=await import(`../fbauth.js?v=${document.body.dataset.build}`);
// 재발주 준비 탭(대시보드 담당 2026-10-12): 표는 src/reorder-view.js, 자료는 장부 meta/reorderPrep. 이 파일에는 탭 연결만 둔다.
const {reorderTab,reorderCount}=await import(`../reorder-view.js?v=${document.body.dataset.build}`);
// 장바구니의 수량 구간·행사가 계산(대시보드 담당 2026-10-12): 계산은 src/sourcing-tiers.js, 자료는 장부 items/<상품>/priceInfo(소싱 담당이 넣음, 읽기만).
const {tierPlan,tierLabel,promoOf,unitAt}=await import(`../sourcing-tiers.js?v=${document.body.dataset.build}`);
// 장바구니의 발주 단계 표시(대시보드 담당 2026-10-12): 읽기는 src/sourcing-orders.js, 자료는 장부 orders/<발주일>·cart/<줄>/orderStage(소싱 담당이 적음).
const {lineStage,orderSummaries}=await import(`../sourcing-orders.js?v=${document.body.dataset.build}`);
const S={tree:null,user:null,status:'connecting',tab:'items',round:'',filter:'전체',cat:'',q:'',draft:{},err:'',quoteOpen:false,showHidden:false};
// 숨긴 상품 보기(2026-10-12 사장님: "부정적인 체크를 하면 추천에서 사라졌으면"): 👎·💸 표시한 상품은 후보 목록에서 가린다. 지우는 것이 아니라 화면에서만 가리고,
// 표시를 풀면 다시 나온다. 장바구니에 담긴 상품은 가리지 않고 경고만 한다. '보기' 상태는 이 브라우저 탭에서만 기억한다(장부에 쓰지 않음).
const HIDDEN_KEY='mmt-sx-show-hidden';
try{S.showHidden=sessionStorage.getItem(HIDDEN_KEY)==='1';}catch(e){}
const negative=r=>!!(r.mark?.design||r.mark?.price);
let ctx=null,started=false,source=null,pollTimer=null,searchTimer=null,rendering=false;
const committing=new Map();   // 저장 중인 수량(줄 → 수량) — 같은 값을 두 번 보내지 않는다
if(new URLSearchParams(location.search).get('tab')==='reorder')S.tab='reorder';   // 구매·원가 화면의 '재발주 준비' 링크로 들어온 경우
const STATUS={connecting:['연결 중','',''],ok:['실시간 연결됨 · 다른 기기·Claude와 같이 봅니다','ok',''],retry:['연결이 끊겨 다시 잇는 중','bad',''],poll:['실시간 연결이 안 돼 20초마다 새로 읽는 중','bad',''],denied:['Firebase 규칙이 아직 열리지 않았습니다','bad','']};
const FILTERS=['전체','안 본 것','💗 좋아요','👎 디자인 별로','💸 가격 별로'];

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const yuan=v=>v==null||v===''?'—':'¥'+(Math.round(num(v)*100)/100).toLocaleString('ko-KR');
const krw=v=>Math.round(v).toLocaleString('ko-KR')+'원';
const list=o=>o&&typeof o==='object'?Object.values(o):[];
const keyOf=s=>{let h=5381;for(const c of String(s))h=((h*33)^c.charCodeAt(0))>>>0;return h.toString(36);};
// 1688 사진은 다른 사이트 주소를 referrer로 보내면 403 → <img referrerpolicy="no-referrer">, 크기 접미사로 썸네일
const thumb=(u,px=310)=>{if(!u)return '';u=u.startsWith('//')?'https:'+u:u.replace(/^http:/,'https:');return /\.(jpe?g|png|webp)_/i.test(u)?u:`${u}_${px}x${px}q90.jpg_.webp`;};
const img=(u,px,cls='')=>u?`<img class="${cls}" src="${esc(thumb(u,px))}" referrerpolicy="no-referrer" loading="lazy" alt="">`:`<span class="${cls} sx-noimg">사진 없음</span>`;
// 사진 크게 보기(사장님 2026-10-08): 사진을 버튼으로 감싸 누르면(Enter 포함) 큰 사진 창. 큰 사진 = 1688 원본(썸네일 크기 접미사 뺌).
const bigUrl=u=>{if(!u)return '';u=u.startsWith('//')?'https:'+u:u.replace(/^http:/,'https:');return u.replace(/(\.(jpe?g|png|webp))_.*$/i,'$1');};
const zoom=(u,inner,{cap='',spec='',rep=false,cls=''}={})=>u?`<button type="button" class="sx-zoom ${cls}" data-sx="zoom" data-src="${esc(bigUrl(u))}" data-cap="${esc(cap)}" data-spec="${esc(spec)}" data-rep="${rep?1:0}" aria-label="사진 크게 보기${cap?': '+esc(cap):''}">${inner}</button>`:inner;
let zoomOpener=null;
function openZoom(el){
  closeZoom();
  const {src,cap,spec,rep}=el.dataset;
  const d=document.createElement('div');d.className='sx-lightbox';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','큰 사진'+(cap?': '+cap:''));
  d.innerHTML=`<figure><button type="button" class="sx-lb-close" aria-label="닫기">×</button><img src="${esc(src)}" referrerpolicy="no-referrer" alt="${esc(cap||'상품 사진')}"><figcaption>${rep==='1'?'<span class="badge red">옵션 사진 없음 · 대표 사진</span>':''}${cap?`<b>${esc(cap)}</b>`:''}${spec?`<small lang="zh">1688 옵션명: ${esc(spec)}</small>`:''}</figcaption></figure>`;
  d.addEventListener('click',e=>{if(e.target===d||e.target.closest('.sx-lb-close'))closeZoom();});
  document.body.appendChild(d);document.body.style.overflow='hidden';zoomOpener=el;d.querySelector('.sx-lb-close').focus();
}
function closeZoom(){const d=document.querySelector('.sx-lightbox');if(!d)return;d.remove();document.body.style.overflow='';if(zoomOpener&&document.contains(zoomOpener))zoomOpener.focus();zoomOpener=null;}
function onKey(e){if(e.key==='Escape'){if(document.querySelector('.sx-lightbox')){e.preventDefault();closeZoom();}else if(reasonDialog){e.preventDefault();closeReasons();}}}
// 1688 옵션명에서 모양·치수 뽑기(사장님 2026-10-08: 옵션 사진이 같아 무엇이 무엇인지 모름). 예: 平口圆形【9*9*邦高10把高23】 → 평평한 원형 / 9×9 · 몸통 높이 10 · 손잡이까지 23
const SHAPES=[['平口圆形','평평한 원형'],['正方形','정사각'],['长方形','직사각'],['方形','사각'],['椭圆形','타원'],['椭圆','타원'],['圆形','원형'],['心形','하트'],['六角形','육각'],['八角形','팔각']];
const DIM_WORDS=[['邦高',' · 몸통 높이 '],['把高',' · 손잡이까지 '],['篮口','입구 '],['含手提','손잡이 포함'],['全长','전체 길이 '],['直径','지름 '],['高度','높이 '],['长度','길이 '],['高','높이 '],['长','길이 '],['宽','폭 '],['厘米','cm'],['公分','cm'],['，',' · '],[',',' · '],['（','('],['）',')'],['小号','소 '],['中号','중 '],['大号','대 ']];
function dimsOf(spec){
  const s=String(spec||''),chips=[];const sh=SHAPES.find(([k])=>s.includes(k));if(sh)chips.push(sh[1]);
  // 괄호【】 안은 치수 표시가 있을 때만(색 번호 【11号-浅黄】 같은 것은 빼고), 없으면 괄호 밖에서 '숫자+단위'·长宽高·直径을 찾는다
  const isDim=x=>/\d\s*[*xX×]\s*\d|\d\s*(?:cm|mm|厘米|公分)|邦高|把高|篮口|[高宽长]\s*\d|直径/i.test(x);
  const br=[...s.matchAll(/[【\[]([^】\]]*)[】\]]/g)].map(m=>m[1]).filter(isDim);
  const re=/长\s*\d+(?:\.\d+)?\s*宽\s*\d+(?:\.\d+)?\s*高\s*\d+(?:\.\d+)?|(?:[大中小]号)?(?:全长|直径|长度|高度)?\s*\d+(?:\.\d+)?(?:\s*[*xX×]\s*\d+(?:\.\d+)?){0,2}\s*(?:cm|mm|厘米|公分)|直径\s*\d+(?:\.\d+)?/gi;
  const parts=br.length?br:(s.replace(/[【\[][^】\]]*[】\]]/g,' ').match(re)||[]);
  for(let p of parts){p=p.replace(/长\s*(\d+(?:\.\d+)?)\s*宽\s*(\d+(?:\.\d+)?)\s*高\s*(\d+(?:\.\d+)?)/,'$1×$2×$3cm');for(const [a,b] of DIM_WORDS)p=p.split(a).join(b);p=p.replace(/\s*[*xX×]\s*·/g,' ·').replace(/\s*[*xX]\s*/g,'×').replace(/\s+/g,' ').replace(/^ · /,'').trim();if((p.match(/\(/g)||[]).length>(p.match(/\)/g)||[]).length)p+=')';if(p)chips.push(p);}
  return [...new Set(chips)].slice(0,3);
}
const rate=()=>{const m=S.tree?.meta||{};return {rate:num(m.rate)||212.2,fee:m.fee==null?0.05:num(m.fee)};};
const toKrw=y=>{const r=rate();return num(y)*r.rate*(1+r.fee);};
// PC 자동 처리(mumutori-auto board_watcher.py)가 meta/watcher에 남기는 신호. 15분마다 갱신 → 20분 넘게 없으면 꺼짐으로 본다.
const REQ_TONE={'요청':'amber','처리중':'amber','작성됨':'green','확인 필요':'red'};
const watcher=()=>{const w=S.tree?.meta?.watcher;const off='PC가 꺼져 있으면 Claude 대화에서 "보드 요청 확인해줘"라고 말해 주세요.';if(!w?.at)return {on:false,text:'PC 자동 처리 신호 없음 — '+off};if(w.version!==POLICY_VERSION)return {on:false,label:'적용 대기',text:'검수 기능 적용 대기 — 담당자가 PC 처리기를 업데이트한 뒤 신청서를 요청할 수 있습니다.'};const t=new Date(w.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});return (Date.now()-new Date(w.at).getTime())/60000<=20?{on:true,text:`PC 자동 처리 켜짐 · 요청하면 1분 안팎으로 신청서를 채웁니다 (마지막 신호 ${t}${w.state==='처리중'?' · 지금 처리 중':''})`}:{on:false,text:`PC 자동 처리 꺼짐 (마지막 신호 ${t}) — ${off}`};};

function notify(text,error=false){const t=document.getElementById('toast');if(!t)return;t.className='toast'+(error?' error':'');t.textContent=text;t.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.hidden=true,4000);}

// ---- Firebase REST + 실시간(EventSource). SDK 없이 같은 경로를 읽고 쓴다.
function setAt(path,value){
  const keys=path.split('/').filter(Boolean);
  if(!keys.length){S.tree=value&&typeof value==='object'?value:{};return;}
  S.tree=S.tree||{};let o=S.tree;
  for(const k of keys.slice(0,-1)){if(!o[k]||typeof o[k]!=='object')o[k]={};o=o[k];}
  const last=keys.at(-1);if(value===null)delete o[last];else o[last]=value;
}
function apply(event,payload){
  const {path,data}=payload;
  if(event==='put')setAt(path,data);
  else for(const [k,v] of Object.entries(data||{}))setAt(path.replace(/\/$/,'')+'/'+k,v);
}
async function readAll(){
  const r=await fetch(DB+'.json',{cache:'no-store'});
  if(r.status===401){S.status='denied';refresh();return;}
  if(!r.ok)throw Error('읽기 실패 '+r.status);
  S.tree=(await r.json())||{};refresh();
}
function poll(){S.status='poll';clearInterval(pollTimer);readAll().catch(e=>{S.err=e.message;refresh();});pollTimer=setInterval(()=>readAll().catch(()=>{}),20000);}
function connect(){
  if(!window.EventSource){poll();return;}
  let failures=0;
  source=new EventSource(DB+'.json');
  for(const ev of ['put','patch'])source.addEventListener(ev,e=>{failures=0;S.status='ok';try{apply(ev,JSON.parse(e.data));}catch(err){S.err=err.message;}refresh();});
  source.addEventListener('cancel',()=>{source.close();S.status='denied';refresh();});
  source.onerror=()=>{if(++failures>=3){source.close();poll();return;}S.status='retry';refresh();};
}
async function send(method,path,body,opts={}){
 const touched=touchedPaths(method,path,body),prior=remember(S.tree,touched);
 if(touched.length){for(const [p,v] of touched)setAt(p,v);refresh();}
 try{const target=opts.auth?await fbauth.dbUrl('sourcing/'+path):`${DB}/${path}.json`;const r=await fetch(target,{method,headers:{'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)});if(!r.ok)throw Error(r.status===401?(opts.auth?'이 계정은 검수 요청 권한이 없습니다 — 운영 계정(구글)으로 로그인해 주세요.':'Firebase 쓰기 권한이 없습니다.'):'저장하지 못했습니다 ('+r.status+').');}
 catch(err){S.tree=revertTouched(S.tree,touched,prior);refresh();await readAll().catch(()=>{});throw err;}   // 실패 시 이번에 바꾼 칸만 되돌림(그 사이 실시간 변경 보존)
}

// ---- 화면
function markState(m){if(!m)return '';if(m.like)return 'like';if(m.design||m.price)return 'bad';return '';}
function itemRows(){
  const t=S.tree||{},marks=t.marks||{};
  return Object.entries(t.items||{}).map(([id,it])=>({...it,id,mark:marks[id]||{}}))
    .sort((a,b)=>(a.order??999)-(b.order??999)||String(a.pid||'').localeCompare(String(b.pid||''),'ko',{numeric:true}));
}
function filtered(rows){
  const q=S.q.trim().toLowerCase();
  return rows.filter(r=>(!S.round||r.rounds?.[S.round])&&(!S.cat||r.cat===S.cat)
    &&(S.filter==='전체'||(S.filter==='안 본 것'&&!markState(r.mark))||(S.filter==='💗 좋아요'&&r.mark.like)||(S.filter==='👎 디자인 별로'&&r.mark.design)||(S.filter==='💸 가격 별로'&&r.mark.price))
    &&(!q||[r.pid,r.name,r.desc,r.nameCn,r.cat,r.mark.note].join(' ').toLowerCase().includes(q)));
}
function cartLines(){return Object.entries(S.tree?.cart||{}).map(([id,l])=>({...l,id})).sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));}


// Resolve the chosen SKU first; old cart lines may have stored the representative image in img.
function chosenPhoto(l,it={}){
 const o=list(it.options).find(o=>o.spec===l.spec),selected=o?.img||(l.imageSource==='option'?l.img:'');
 return {url:selected||it.img||l.img||'',rep:!selected,label:selected?'선택 옵션 사진':(it.img?'옵션 사진 없음 · 대표 사진':l.img?'저장된 사진 · 옵션 확인 필요':'사진 없음')};
}
function chosenVisual(l,it={},cls='sx-cart-img'){
 const f=chosenPhoto(l,it),cap=(it.name||l.offerId)+(l.ko?' · '+l.ko:'');
 return `<div class="sx-chosen-photo">${zoom(f.url,img(f.url,120,cls),{cap,spec:l.spec,rep:f.rep})}<small>${esc(f.label)}</small></div>`;
}
const isAdmitted=r=>recommendable(r.id,r,S.tree?.marks||{});
function excludedTab(){
 const t=S.tree||{},rows=Object.entries(t.marks||{}).filter(([,m])=>m.exclusion).sort((a,b)=>String(b[1].exclusion.at||'').localeCompare(String(a[1].exclusion.at||'')));
 return `<div class="note">추천에서만 제외합니다. 기존 상품·표시·장바구니·신청 이력은 보존합니다. 복구해도 검수 요건은 다시 확인하며, 기존 👎 표시는 그대로입니다.</div><div class="sx-review-list">${rows.map(([mid,m])=>{const x=m.exclusion,it=t.items?.[mid]||Object.values(t.items||{}).find(it=>identity('',it.url)===x.identity)||{};return `<article class="sx-review-card"><b>${esc(it.name||x.name||mid)}</b><span class="badge ${x.active?'red':'green'}">${x.active?'추천 제외':'복구됨'}</span><p>${esc(x.memo||x.reason||'사유 미기록 · 상품만 제외')}</p><p>${list(x.reasons).map(r=>esc(r.label||r.dimension)).join(' · ')}</p><small>${x.active&&x.applyNext?'구체 선호를 다음 후보에도 적용':'상품만 제외 · 선호 자동 확대 없음'}</small><button type="button" data-sx="exclude" data-id="${esc(mid)}">사유·범위 수정</button><small>${x.restoredAt?'복구 '+esc(x.restoredAt)+' · ':''}${esc(x.at||'')} · ${esc(x.by||'')} · ${esc(x.identity||'')}</small><p>${list(m.exclusionEvents).map(e=>esc((e.action==='restore'?'복구':'제외')+' · '+e.at+' · '+e.by)).join('<br>')}</p><a href="${esc(x.sourceUrl||originalUrl(mid,it.url))}" target="_blank" rel="noopener">원본 상품</a>${x.active?`<button type="button" data-sx="restore" data-id="${esc(mid)}">추천 제외 복구</button>`:''}</article>`;}).join('')||'<p>추천 제외 내역이 없습니다.</p>'}</div>`;
}
// 검토 대기 — 사장님용 기본 모습은 사진·이름·가격·버튼만, 정할 것은 묶음 제목 한 줄(2026-10-11 사장님: "사람이 보고 판단할 수 있다고 생각하는 거야? 텍스트가 너무 많아").
// 같은 판단이 필요한 상품(같은 warn)은 한 묶음으로 모으고, 내부 검수 문구는 '자세히'에 접는다. 정할 것이 없는(아직 검수 전) 상품은 맨 아래에 접어 둔다.
// warn은 "정할 것 한 줄 — 이유" 꼴로 쓴다(' — ' 앞이 묶음 제목, 뒤가 작은 글씨 이유).
function reviewDetail(r){
 return `<span class="badge amber">${esc(({approved:'승인 기록 있음 · 재검수 필요',hold:'보류',in_review:'검수 중',unreviewed:'미검수'})[r.review?.status]||'미검수')}</span><p>${reviewProblems(r.id,r).map(esc).join(' · ')}</p><p>${list(r.options).map(o=>esc((o.ko||'')+' · '+o.spec)).join(' / ')}</p><div class="sx-review-images">${[...new Set([r.img,...list(r.sourceImages),...list(r.options).map(o=>o.img)].filter(Boolean))].map(u=>zoom(u,img(u,120,'sx-cart-img'),{cap:r.name+' · 검토 대상 사진'})).join('')}</div><p>${esc(r.warn||'')} ${list(r.review?.flags).map(f=>esc(f.note||f)).join(' · ')}</p><small>검수자 ${esc(r.review?.by||'미기록')} · ${esc(r.review?.at||'시각 미기록')}</small>${r.review?.classification?`<p>분류: ${Object.entries(r.review.classification).map(([k,v])=>esc(k)+': '+esc(v)).join(' · ')}</p>`:''}${Object.entries(r.review?.checks||{}).map(([k,c])=>`<p>${esc(k)} (${esc(c.status||'미기록')}): ${esc(c.note||'근거 미기록')} ${list(c.evidence).map(u=>`<a href="${esc(/^https:\/\//.test(u)?u:'#')}" target="_blank" rel="noopener">검토 근거</a>`).join(' ')}</p>`).join('')}`;
}
function reviewCard(r){
 const prices=list(r.options).map(o=>num(o.price)).filter(Boolean),lo=prices.length?Math.min(...prices):num(r.priceMin),hi=prices.length?Math.max(...prices):num(r.priceMax);
 return `<article class="sx-review-card"><div class="sx-rv-main">${zoom(r.img,img(r.img,120,'sx-cart-img'),{cap:r.name})}<div><h3>${esc(r.name)}</h3><div class="sx-price">${lo?`<b>${yuan(lo)}${hi>lo?'~'+yuan(hi).slice(1):''}</b> <span>≈ ${krw(toKrw(lo))}${hi>lo?'~':''}/개</span>`:'<span>가격 확인 전</span>'}</div></div></div><div class="sx-rv-actions"><a class="sx-rv-btn" href="${esc(r.url)}" target="_blank" rel="noopener">1688 원본 ↗</a><button type="button" class="sx-rv-btn" data-sx="exclude" data-id="${esc(r.id)}">추천에서 제외</button></div><details class="sx-rv-more"><summary>자세히</summary>${reviewDetail(r)}</details></article>`;
}
function reviewTab(){
 const rows=itemRows().filter(r=>!exclusion(r.id,r,S.tree?.marks||{})&&!isAdmitted(r));
 const groups=new Map(),rest=[];
 rows.forEach(r=>{const w=String(r.warn||'').trim();if(!w)return rest.push(r);if(!groups.has(w))groups.set(w,[]);groups.get(w).push(r);});
 const ask=w=>{const i=w.indexOf(' — ');return i<0?[w,'']:[w.slice(0,i),w.slice(i+3)];};
 return `<div class="note amber">여기 상품은 아직 담을 수 없어요. <b>정할 것</b>이 적힌 묶음만 보시면 됩니다(답은 총괄 보고판이나 Claude에게).<br><small>KC 기준: 14세 이상 성인용으로 팔면 KC 의무가 없지만 '14세 이상' 표기만으로 정해지지는 않아요 — 모양·광고·주 사용 대상을 함께 봅니다. 검수 기록은 판매 적법성이나 무위험 보증이 아닙니다.</small></div><div class="sx-review-list sx-rv">${[...groups].map(([w,g])=>{const [q,why]=ask(w);return `<section class="sx-rv-group"><header><span class="badge amber">정할 것</span><b>${esc(q)}</b><small>${g.length}개${why?' · '+esc(why):''}</small></header><div class="sx-rv-grid">${g.map(reviewCard).join('')}</div></section>`;}).join('')}${rest.length?`<details class="sx-rv-rest"${groups.size?'':' open'}><summary>아직 검수 전 ${rest.length}개 — Claude가 원문·사진을 확인할 차례(사장님이 하실 일 없음)</summary><div class="sx-rv-grid">${rest.map(reviewCard).join('')}</div></details>`:''}${rows.length?'':'<p>검토 대기 상품이 없습니다.</p>'}</div>`;
}

function hiddenRows(all){const cartIds=new Set(cartLines().map(l=>l.offerId));return {cartIds,hidden:all.filter(r=>negative(r)&&!cartIds.has(r.id))};}
function card(r){
  const m=r.mark,st=markState(m),opts=list(r.options),inCart=cartLines().filter(l=>l.offerId===r.id);
  const cartWarn=negative(r)&&inCart.length?`<p class="sx-cartwarn">⚠ 별로라고 표시했지만 장바구니에 ${inCart.length}줄 담겨 있어 숨기지 않았어요. 장바구니에서 빼면 추천에서 숨겨집니다.</p>`:'';
  const prices=opts.map(o=>num(o.price)).filter(Boolean),lo=prices.length?Math.min(...prices):num(r.priceMin),hi=prices.length?Math.max(...prices):num(r.priceMax);
  const meta=[r.moq?`최소 ${esc(r.moq)}${esc(r.unit||'개')}`:'',r.weightG?`${esc(r.weightG)}g`:'',r.shop?.years?`판매처 ${esc(r.shop.years)}년`:'',r.shop?.repeat?`재구매 ${esc(r.shop.repeat)}`:''].filter(Boolean).join(' · ');
  const mark=(k,label)=>`<button type="button" class="sx-mark ${m[k]?'on '+k:''}" data-sx="mark" data-id="${esc(r.id)}" data-k="${k}" aria-pressed="${!!m[k]}">${label}</button>`;
  // 옵션 사진이 없으면 대표 사진을 흐리게 + '대표' 표시(옵션 사진처럼 보이지 않게). 1688 원래 옵션명(spec)은 복사해서 1688 페이지에서 찾는다.
  // 같은 상품 안에서 옵션 사진이 같은 옵션 → '같은 사진 n개' 표시(사진으로는 구분 불가, 치수·모양으로 구분)
  const sameN={};opts.forEach(o=>{if(o.img)sameN[o.img]=(sameN[o.img]||0)+1;});
  const sameAny=opts.some(o=>o.img&&sameN[o.img]>1);
  const optImg=o=>zoom(o.img||r.img,o.img?img(o.img,120):`<span class="sx-optfb" title="1688에 이 옵션 사진이 없어 상품 대표 사진을 보여 줍니다">${img(r.img,120)}<em>대표</em></span>`,{cap:o.ko||o.spec,spec:o.spec,rep:!o.img,cls:o.img&&sameN[o.img]>1?'sx-sameimg':''});
  const optRows=m.like&&opts.length?`<div class="sx-opts"><b>옵션·수량 담기</b><a class="sx-optlink" href="${esc(r.url)}" target="_blank" rel="noopener">1688에서 옵션 대조 ↗</a><small class="sx-opthelp">회색 글자 = 1688 옵션명 · '복사' 후 1688 페이지에서 Ctrl+F(휴대폰은 페이지 내 찾기)</small>${sameAny?`<small class="sx-samehint">⚠ 사진이 같은 옵션이 있어요 — 초록 글씨 치수·모양${list(r.sizeImgs).length?'과 크기·모양 안내':''}로 구분하세요</small>`:''}${opts.map(o=>{const lid=r.id+'~'+keyOf(o.spec),line=S.tree?.cart?.[lid];const dk=lid;const dims=dimsOf(o.spec);return `<div class="sx-opt">${optImg(o)}<span>${esc(o.ko||o.spec)}${dims.length?`<span class="sx-dims">${dims.map(d=>`<i>${esc(d)}</i>`).join('')}</span>`:''}${o.img&&sameN[o.img]>1?`<small class="sx-same">같은 사진 ${sameN[o.img]}개 · 모양·크기만 다름</small>`:''}${o.img?'':'<small class="sx-nofoto">옵션 사진 없음 · 대표 사진</small>'}<small class="sx-spec"><span lang="zh">${esc(o.spec)}</span> <button type="button" class="sx-copy" data-sx="copy" data-text="${esc(o.spec)}" aria-label="1688 옵션명 복사: ${esc(o.spec)}">복사</button></small><small>${yuan(o.price)}${o.weightG?' · '+esc(o.weightG)+'g':''}</small></span><input type="number" min="1" step="1" inputmode="numeric" aria-label="${esc((o.ko||o.spec)+' 수량')}" id="sx-q-${esc(dk)}" data-sx-draft="${esc(dk)}" value="${esc(S.draft[dk]??(line?.qty||r.qty||''))}"><button type="button" class="primary" data-sx="add" data-id="${esc(r.id)}" data-spec="${esc(o.spec)}">${line?'수정':'담기'}</button></div>`;}).join('')}${inCart.length?`<span class="sx-in">장바구니에 ${inCart.map(l=>esc((l.ko||l.spec)+' '+l.qty+'개')).join(', ')}</span>`:''}</div>`:'';
  return `<article class="sx-card ${st}">
    ${r.img?zoom(r.img,img(r.img,310),{cap:r.name,cls:'sx-img'}):`<a class="sx-img" href="${esc(r.url)}" target="_blank" rel="noopener">${img('',310)}</a>`}
    <div class="sx-body">
      <div class="sx-top"><span class="sx-pid">${esc(r.pid||'')}</span>${r.warn?`<span class="badge amber">⚠ ${esc(r.warn)}</span>`:''}${list(r.tags).map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
      <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></h3>
      ${r.desc?`<p class="sx-desc">${esc(r.desc)}</p>`:''}
      <div class="sx-price"><b>${yuan(lo)}${hi>lo?'~'+yuan(hi).slice(1):''}</b> <span>≈ ${krw(toKrw(lo))}${hi>lo?'~':''}/개</span></div>
      ${meta?`<div class="sx-meta">${meta}</div>`:''}
      ${list(r.sizeImgs).length?`<div class="sx-sizes">${list(r.sizeImgs).map((s,i,a)=>zoom(s.url,`📏 크기·모양 안내${a.length>1?' '+(i+1):' 보기'}`,{cap:s.cap||'크기·모양 안내 (1688 상세페이지)',cls:'sx-sizebtn'})).join('')}</div>`:''}
      <div class="sx-marks">${mark('like','💗 좋아요')}${mark('design','👎 디자인 별로')}${mark('price','💸 가격 별로')}</div>${cartWarn}<button type="button" class="sx-exclude" data-sx="exclude" data-id="${esc(r.id)}">추천에서 제외</button>
      <input class="sx-note" id="sx-n-${esc(r.id)}" data-sx-note="${esc(r.id)}" maxlength="300" placeholder="한마디 (예: 링크 사진이 더 좋아)" value="${esc(m.note||'')}">
      ${optRows}
      <a class="sx-link" href="${esc(r.url)}" target="_blank" rel="noopener">1688에서 보기 ↗ <small>${esc(r.url)}</small></a>
    </div></article>`;
}
function setCard(id,s,items){
  // parts: [{offerId, spec(세트에 쓰는 옵션), qty}]
  const parts=list(s.parts).map(p=>{const it=items[p.offerId],o=list(it?.options).find(x=>x.spec===p.spec);return {...p,it,o,q:num(p.qty)||1};});
  const total=parts.reduce((a,p)=>a+num(p.o?.price??p.it?.priceMin)*p.q,0);
  const mk=s.mark||{};
  return `<article class="sx-set ${mk.like?'like':mk.bad?'bad':''}"><h3>${esc(s.name||id)}</h3>${s.desc?`<p class="sx-desc">${esc(s.desc)}</p>`:''}
    <div class="sx-parts">${parts.map(p=>`<div class="sx-part">${zoom(p.o?.img||p.it?.img,img(p.o?.img||p.it?.img,120),{cap:(p.it?.name||p.offerId)+(p.o?.ko?' · '+p.o.ko:''),spec:p.spec,rep:!!(p.o&&!p.o.img)})}<a href="${esc(p.it?.url||'#')}" target="_blank" rel="noopener" title="${esc((p.o?.ko?p.o.ko+' · ':'')+p.spec+(p.o&&!p.o.img?' (옵션 사진 없음 · 대표 사진)':''))}">${esc(p.it?.name||p.offerId)}${p.q>1?' ×'+p.q:''}</a>${p.it&&S.tree?.marks?.[p.offerId]?.design?'<em>👎</em>':''}</div>`).join('')}</div>
    <div class="sx-price"><b>${yuan(total)}</b> <span>≈ ${krw(toKrw(total))} · 세트 1개 상품가${s.defaultCount?` · 제안 ${esc(s.defaultCount)}세트`:''}</span></div>
    <div class="sx-marks two"><button type="button" class="sx-mark ${mk.like?'on like':''}" data-sx="set-mark" data-id="${esc(id)}" data-k="like">💗 이 세트 좋아요</button><button type="button" class="sx-mark ${mk.bad?'on design':''}" data-sx="set-mark" data-id="${esc(id)}" data-k="bad">👎 별로</button></div>
    <input class="sx-note" id="sx-sn-${esc(id)}" data-sx-setnote="${esc(id)}" maxlength="300" placeholder="세트에 한마디" value="${esc(mk.note||'')}"></article>`;
}
function itemsTab(){
  const t=S.tree||{},all=itemRows().filter(isAdmitted),{hidden,cartIds}=hiddenRows(all),wantNeg=S.filter==='👎 디자인 별로'||S.filter==='💸 가격 별로';
  const rows=filtered(wantNeg?all:all.filter(r=>!hidden.includes(r))),hiddenShown=S.showHidden&&!wantNeg?filtered(hidden):[],rounds=Object.entries(t.rounds||{}).sort((a,b)=>String(b[1].date||'').localeCompare(String(a[1].date||'')));
  const cats=[...new Set(all.map(r=>r.cat).filter(Boolean))];
  const count=f=>all.filter(f).length;
  const sum=`<div class="sx-summary">${[['후보',all.length-(S.showHidden?0:hidden.length)],['💗',count(r=>r.mark.like)],['👎',count(r=>r.mark.design)],['💸',count(r=>r.mark.price)],['안 본 것',count(r=>!markState(r.mark))]].map(([a,b])=>`<span class="badge">${a} ${b}</span>`).join('')}</div>`;
  const tools=`<div class="toolbar"><div class="filters"><input id="sx-search" class="search" data-sx-filter="q" aria-label="후보 검색" placeholder="이름·한마디 검색" value="${esc(S.q)}"><select data-sx-filter="round" aria-label="회차"><option value="">모든 회차</option>${rounds.map(([id,r])=>`<option value="${esc(id)}" ${S.round===id?'selected':''}>${esc(r.title||id)}</option>`).join('')}</select><select data-sx-filter="filter" aria-label="표시">${FILTERS.map(f=>`<option ${S.filter===f?'selected':''}>${f}</option>`).join('')}</select><select data-sx-filter="cat" aria-label="분류"><option value="">모든 분류</option>${cats.map(c=>`<option ${S.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div>`;
  const hiddenBar=hidden.length?`<div class="sx-hiddenbar"><span>${S.showHidden?`👎·💸 표시해서 숨긴 상품 <b>${hidden.length}개</b>를 아래 '숨긴 상품'에 펼쳐 놓았어요. 표시를 풀면 추천으로 돌아갑니다.`:`👎·💸 표시한 상품 <b>${hidden.length}개</b>는 추천에서 숨겼어요. 표시를 풀면 다시 나옵니다.`}</span><button type="button" data-sx="toggle-hidden" aria-pressed="${S.showHidden}">${S.showHidden?'숨긴 상품 다시 숨기기':`숨긴 상품 ${hidden.length}개 보기`}</button></div>`:'';
  const hiddenHtml=hiddenShown.length?`<div class="sx-section sx-hidden-head"><h2>숨긴 상품</h2><span>${hiddenShown.length}개 · 👎·💸 표시를 풀면 다시 추천에 나옵니다</span></div><div class="sx-grid sx-hidden-grid">${hiddenShown.map(card).join('')}</div>`:'';
  const cardOf=r=>card(r,cartIds);
  const groups=[...new Set(rows.map(r=>r.cat||'기타'))];
  const body=rows.length?groups.map(g=>`<div class="sx-section"><h2>${esc(g)}</h2><span>${rows.filter(r=>(r.cat||'기타')===g).length}개</span></div><div class="sx-grid">${rows.filter(r=>(r.cat||'기타')===g).map(cardOf).join('')}</div>`).join(''):`<div class="note">${all.length?(hidden.length&&!S.showHidden&&S.filter==='전체'&&!S.q&&!S.cat&&!S.round?'보이는 후보가 없습니다. 👎·💸 표시한 상품은 위의 \'숨긴 상품 보기\'에서 볼 수 있어요.':'조건에 맞는 후보가 없습니다.'):'아직 후보가 없습니다. Claude가 1688에서 찾으면 여기에 올라옵니다.'}</div>`;
  const shownRounds=S.round?rounds.filter(([id])=>id===S.round):rounds;
  const sets=Object.entries(t.sets||{}).filter(([,s])=>shownRounds.some(([rid])=>rid===s.round)&&list(s.parts).every(p=>t.items?.[p.offerId]&&recommendable(p.offerId,t.items[p.offerId],t.marks||{})&&(S.showHidden||!hidden.some(h=>h.id===p.offerId))));
  const setsHtml=sets.length?`<div class="sx-section"><h2>세트 제안</h2><span>Claude가 후보로 짠 구성 — 마음에 들면 💗</span></div><div class="sx-sets">${sets.map(([id,s])=>setCard(id,s,t.items||{})).join('')}</div>`:'';
  const roundNote=shownRounds.length&&S.round?`<div class="note">${esc(shownRounds[0][1].note||'')}</div>`:'';
  return sum+tools+hiddenBar+roundNote+body+hiddenHtml+setsHtml;
}
// ---- 수량 구간·행사가(2026-10-12 사장님: "장바구니에 다 담았는데 여기서 수량별 할인을 확인하라고 했잖아").
// 자료는 소싱 담당이 넣은 items/<상품>/priceInfo — 이 화면은 읽기만 한다. 구간은 같은 판매글에서 담은 옵션 수량의 합계로 정해진다.
// 수량 칸에 입력하는 즉시(저장 전) 그 판매글의 줄들을 다시 계산해 보여 준다(liveTier). 단가와 장부는 여기서 고치지 않는다.
const signed=(v,f)=>(v<0?'−':'+')+f(Math.abs(v));
function tierBox(l,qtyOf=x=>num(x.qty),typing=false){
  const info=S.tree?.items?.[l.offerId]?.priceInfo,attrs=`data-sx-tier="${esc(l.offerId)}" data-line="${esc(l.id)}"`;
  if(!info||typeof info!=='object')return l.tierNote?`<div class="sx-tier sx-tier-flat" ${attrs}>💰 ${esc(l.tierNote)}</div>`:'';
  const group=cartLines().filter(x=>x.offerId===l.offerId),total=group.reduce((a,x)=>a+qtyOf(x),0),qty=qtyOf(l),key=keyOfSpec(l.spec);
  const plan=tierPlan(info,total),promo=promoOf(info,key,qty),unit=unitAt(info,key,total),parts=[];
  const draft=typing?' <em>입력한 수량 기준 · 저장 전</em>':'',many=group.length>1?`이 판매글 ${group.length}줄 합계 `:'지금 ';
  if(plan.kind==='tier'){
    parts.push(`<div class="sx-tier-chips"><b>💰 수량 할인</b>${plan.tiers.map((t,i)=>`<span class="sx-tier-chip ${i===plan.index?'on':''}">${tierLabel(plan.tiers,i)} ${yuan(t.price)}</span>`).join('')}</div>`);
    if(plan.below)parts.push(`<p class="sx-tier-now sx-tier-warn">${many}<b>${total.toLocaleString('ko-KR')}개</b> — 최소 ${plan.tiers[0].min.toLocaleString('ko-KR')}개부터 살 수 있어요(${plan.need.toLocaleString('ko-KR')}개 부족).${draft}</p>`);
    else{
      parts.push(`<p class="sx-tier-now">${many}<b>${total.toLocaleString('ko-KR')}개</b> → 개당 <b>${yuan(plan.current.price)}</b>${plan.next?'':' · 가장 싼 구간입니다'}${draft}</p>`);
      if(plan.next)parts.push(`<p class="sx-tier-next ${plan.diff<=0?'good':''}">👉 <b>${plan.more.toLocaleString('ko-KR')}개 더 사면</b>(합계 ${plan.next.min.toLocaleString('ko-KR')}개) 개당 ${yuan(plan.current.price)} → <b>${yuan(plan.next.price)}</b> · 총액 <b>${signed(plan.diff,yuan)} ≈ ${signed(toKrw(plan.diff),krw)}</b>${plan.diff<=0?' — 더 사는 쪽이 총액도 쌉니다':''}${total===num(info.cartQty)&&info.next?.verdict&&num(info.next.at)===plan.next.min?` <span class="badge amber">소싱 담당 의견: ${esc(info.next.verdict)}</span>`:''}</p>`);
      if(plan.keepMin&&plan.index>0)parts.push(`<p class="sx-tier-keep">${plan.keepMin.toLocaleString('ko-KR')}개까지 줄여도 개당 ${yuan(plan.current.price)} 그대로 · ${(plan.keepMin-1).toLocaleString('ko-KR')}개 이하면 ${yuan(plan.tiers[plan.index-1].price)}</p>`);   // 가장 낮은 구간에서는 줄여도 달라질 것이 없어 적지 않는다
    }
  }else if(!promo)parts.push(`<p class="sx-tier-now">💰 수량 할인 없음 · 몇 개를 사도 개당 <b>${yuan(unit??l.price)}</b></p>`);
  if(promo?.kind==='limited')parts.push(`<p class="sx-tier-promo">⚠ 행사가 <b>${yuan(promo.promo)}</b>는 <b>${promo.limit.toLocaleString('ko-KR')}개까지만</b> — ${promo.within?`지금 ${qty.toLocaleString('ko-KR')}개는 행사가 대상일 수 있어요(소싱 담당 확인 필요)`:`지금 ${qty.toLocaleString('ko-KR')}개는 정가 ${yuan(promo.regular??l.price)}`}.${plan.kind==='tier'?'':' 수량 할인은 없습니다.'}${plan.kind==='tier'?'':draft}</p>`);
  if(promo?.kind==='sale')parts.push(`<p class="sx-tier-promo">🏷 지금은 행사가 <b>${yuan(promo.price)}</b> (정가 ${yuan(promo.list)}) — 행사가 끝나면 오릅니다.${plan.kind==='tier'?'':' 수량 할인은 없습니다.'}</p>`);
  if(unit!=null&&Math.abs(unit-num(l.price))>0.0005)parts.push(`<p class="sx-tier-warn">⚠ 이 수량이면 개당 ${yuan(unit)}인데 장바구니에는 ${yuan(l.price)}로 적혀 있어요. 아래 합계는 ${yuan(l.price)} 기준이라 실제와 다를 수 있고, 발주 전에 소싱 담당이 단가를 다시 맞춥니다.</p>`);
  const flat=plan.kind!=='tier'&&!promo&&parts.length===1;
  return `<div class="sx-tier ${flat?'sx-tier-flat':''}" ${attrs}>${parts.join('')}${info.readAt?`<small>1688 가격 확인 ${esc(new Date(info.readAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</small>`:''}</div>`;
}
// 수량 칸에 입력하는 중: 같은 판매글의 줄들을 입력한 수량으로 다시 계산해 바꿔 끼운다(화면만 — 저장은 칸을 벗어날 때 기존처럼 수량만).
function liveTier(el){
  const root=document.getElementById('sx-root'),cart=S.tree?.cart||{},line=cart[el.dataset.sxQty];if(!root||!line)return;
  const typed={};for(const i of root.querySelectorAll('input.sx-qty[data-sx-qty]')){const v=Math.round(num(i.value)),id=i.dataset.sxQty;if(cart[id]&&v>0&&v!==num(cart[id].qty))typed[id]=v;}
  const qtyOf=x=>typed[x.id]??num(x.qty),lines=cartLines(),changed=lines.some(x=>x.offerId===line.offerId&&typed[x.id]!=null);
  for(const box of [...root.querySelectorAll('[data-sx-tier]')]){const l=lines.find(x=>x.id===box.dataset.line);if(l&&l.offerId===line.offerId)box.outerHTML=tierBox(l,qtyOf,changed);}
  const me=lines.find(x=>x.id===el.dataset.sxQty),row=el.closest('tr');
  if(me&&row){const sub=num(me.price)*qtyOf(me),a=row.querySelector('[data-sx-sub]'),b=row.querySelector('[data-sx-krw]');if(a)a.innerHTML=`<b>${yuan(sub)}</b>`;if(b)b.textContent=krw(toKrw(sub));}
}
// ---- 발주 단계(2026-10-12 사장님: "발주접수니까 표시해둬야지 그리고 발주단계도 기록해놔야해"). 자료는 소싱 담당이 장부에 적는다 — 읽기만.
// 원가·신청 번호는 공개 화면에 내지 않는다: src/sourcing-orders.js 가 단계·날짜·수량 칸만 읽는다.
function stageBadge(s){
  return s?`<span class="sx-stage ${s.done?'done':''}" title="${esc(s.history.map(([name,d])=>name+' '+d).join(' → '))}">📦 ${esc(s.label)} · <b>${esc(s.stage)}</b>${s.date?` ${esc(s.date)}`:''}${s.next?`<small>다음 ${esc(s.next)}</small>`:''}</span>`:'';
}
function orderBar(lines){
  const orders=S.tree?.orders,list=orderSummaries(orders);if(!list.length)return '';
  const waiting=lines.filter(l=>!lineStage(l,orders)).length;
  return `<div class="sx-orders">${list.map(o=>`<section class="sx-orderbar ${o.done?'done':''}" data-order="${esc(o.key)}"><div class="sx-order-head"><b>📦 ${esc(o.label)}</b><span>${o.lines.toLocaleString('ko-KR')}줄 · ${o.qty.toLocaleString('ko-KR')}개</span></div>
    <ol class="sx-order-steps">${o.steps.map(s=>`<li class="${s.count?'on':s.date?'passed':''}"><span>${esc(s.stage)}</span><b>${s.count.toLocaleString('ko-KR')}줄</b><small>${s.date?esc(s.date):'—'}</small></li>`).join('')}</ol></section>`).join('')}
    <p class="sx-order-note">${waiting?`장바구니 ${waiting}줄은 아직 발주에 들어가지 않았습니다. `:''}단계는 소싱 담당이 진행될 때마다 적습니다. 원가·신청 번호는 이 화면에 표시하지 않습니다.</p></div>`;
}
function cartTab(){
  const t=S.tree||{},items=t.items||{},lines=cartLines();
  const likedNoCart=itemRows().filter(r=>r.mark.like&&!lines.some(l=>l.offerId===r.id));
  const badInCart=itemRows().filter(r=>negative(r)&&lines.some(l=>l.offerId===r.id));
  let totalY=0,weight=0,weightKnown=true;
  const rows=lines.map(l=>{const it=items[l.offerId]||{},sub=num(l.price)*num(l.qty),stage=lineStage(l,t.orders),optName=String(l.koBase||l.ko||'').replace(stage?/^✅\s*\d{1,2}\/\d{1,2}\s*발주\s*접수\s*·\s*/:/$^/,'');totalY+=sub;if(l.weightG)weight+=num(l.weightG)*num(l.qty);else weightKnown=false;
    return `<tr><td>${chosenVisual(l,it)}</td><td class="maincell"><b><a href="${esc(it.url||'#')}" target="_blank" rel="noopener">${esc(it.name||l.offerId)}</a></b><span class="sub">${esc(optName)}</span>${stageBadge(stage)}${tierBox(l)}${skuStatus(l,it)}<span class="sub sx-spec"><span lang="zh">${esc(l.spec)}</span> <button type="button" class="sx-copy" data-sx="copy" data-text="${esc(l.spec)}" aria-label="1688 옵션명 복사: ${esc(l.spec)}">복사</button></span></td><td><input type="number" min="1" step="1" class="sx-qty" id="sx-cq-${esc(l.id)}" data-sx-qty="${esc(l.id)}" aria-label="수량" value="${esc(l.qty)}"></td><td class="num">${yuan(l.price)}</td><td class="num" data-sx-sub="${esc(l.id)}"><b>${yuan(sub)}</b></td><td class="num" data-sx-krw="${esc(l.id)}">${krw(toKrw(sub))}</td><td>${`<button type="button" class="text danger" data-sx="remove" data-id="${esc(l.id)}">빼기</button>`}</td></tr>`;}).join('');
  const reqs=Object.entries(t.requests||{}).sort((a,b)=>String(b[1].at||'').localeCompare(String(a[1].at||''))).slice(0,5);
  const r=rate();
  return `${orderBar(lines)}${badInCart.length?`<div class="note amber sx-badcart">👎·💸 표시한 상품 ${badInCart.length}개가 장바구니에 담겨 있어요: ${badInCart.map(x=>`<b>${esc(x.name)}</b>`).join(', ')} — 그대로 두었으니 뺄지 확인해 주세요.</div>`:''}${likedNoCart.length?`<div class="note amber">💗만 누르고 수량을 안 담은 상품 ${likedNoCart.length}개: ${likedNoCart.map(x=>`<b>${esc(x.name)}</b>`).join(', ')} — 후보 탭에서 옵션·수량을 담아 주세요.</div>`:''}
    <div class="panel section-gap"><div class="tablewrap"><table class="table"><thead><tr><th>사진</th><th>상품 / 옵션</th><th>수량</th><th class="num">단가</th><th class="num">소계</th><th class="num">≈ 원화</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="7"><div class="empty"><b>장바구니가 비어 있습니다.</b>후보에서 💗 → 옵션·수량 담기</div></td></tr>`}</tbody></table></div>
    <div class="sx-total"><span>상품 ${lines.length}줄 · ${lines.reduce((a,l)=>a+num(l.qty),0)}개</span><span>합계 <b>${yuan(totalY)}</b> ≈ <b>${krw(toKrw(totalY))}</b></span><small>환율 ${r.rate}원 × 구매대행 수수료 ${Math.round(r.fee*100)}% 포함 · 1688 판매자 배송비·국제 배송비·관부가세 별도(배송비 포함 예상은 아래 견적 줄)${weight?` · 무게 약 ${(weight/1000).toFixed(2)}kg${weightKnown?'':'(일부 무게 모름)'}`:''}</small></div></div>
    <div class="sx-request"><div><b>배대지 신청서</b><p>선택 옵션 정밀검수 완료와 새 감시기 버전 확인 후 요청하면 PC의 자동 처리 프로그램이 이 장바구니로 아이템스카우트 배대지 신청서를 채우고 캡처합니다. <b>신청하기는 확인을 받은 뒤에</b> 누릅니다.</p><p><span class="badge ${watcher().on?'green':'amber'}">${watcher().label||(watcher().on?'켜짐':'꺼짐')}</span> ${esc(watcher().text)}</p></div><button type="button" class="primary" data-sx="request" ${lines.length?'':'disabled'}>검수 확인 후 신청서 작성 요청</button></div>
    ${reqs.length?`<div class="sx-reqs">${reqs.map(([id,q])=>`<div><span class="badge ${REQ_TONE[q.status]||'amber'}">${esc(q.status||'요청')}</span> ${esc(new Date(q.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · ${esc(q.summary||'')}${q.reply?` — <b>${esc(q.reply)}</b>`:''}</div>`).join('')}<small>'작성됨'이면 PC 크롬의 [작성본] 탭과 드라이브 구매대행/요청작성본에서 확인하고, 신청하려면 Claude에게 "신청해줘"라고 말해 주세요. '확인 필요'는 사유를 보고 Claude에게 맡겨 주세요.</small></div>`:''}`;
}
function tasteTab(){
  const t=S.tree||{},rules=Object.entries(t.taste||{}).sort((a,b)=>String(a[1].at||'').localeCompare(String(b[1].at||''))),all=itemRows();
  const KIND={avoid:['피하기','red'],prefer:['좋아함','green'],price:['가격','amber'],rule:['기준','']};
  const gallery=(title,rows,why)=>`<div class="sx-section"><h2>${title}</h2><span>${why}</span></div><div class="sx-thumbs">${rows.length?rows.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.mark.note||'')}">${img(r.img,120)}<span>${esc(r.name)}</span>${r.mark.note?`<em>${esc(r.mark.note)}</em>`:''}</a>`).join(''):'<p class="sub">아직 없습니다.</p>'}</div>`;
  return `<div class="note">수집기와 게시 도우미는 최신 활성 규칙과 제외 사유를 평가하고 결과를 기록합니다. 자유문장 규칙·미기록 속성은 담당 확인 대기로 남깁니다. 한 상품의 취향을 종류 전체로 확대하지 않습니다.</div>
    <div class="panel section-gap"><ul class="sx-rules">${rules.map(([id,r])=>`<li class="${r.active===false?'off':''}"><span class="badge ${KIND[r.kind]?.[1]||''}">${KIND[r.kind]?.[0]||'기준'}</span><p>${esc(r.text)}<small>${esc(r.source||'')}${r.by?' · '+esc(r.by):''}</small></p><label class="sx-switch"><input type="checkbox" data-sx-rule="${esc(id)}" ${r.active===false?'':'checked'}> 적용</label></li>`).join('')||'<li><p>아직 규칙이 없습니다.</p></li>'}</ul>
    <form class="sx-addrule" data-sx-form="rule"><select name="kind" aria-label="규칙 종류"><option value="avoid">피하기</option><option value="prefer">좋아함</option><option value="price">가격</option><option value="rule">기준</option></select><input name="text" maxlength="200" required placeholder="예: 반짝이 소재는 빼 줘" aria-label="새 규칙"><button type="submit" class="primary">규칙 추가</button></form></div>
    ${gallery('💗 좋아한 것',all.filter(r=>r.mark.like),'이런 결로 더 찾습니다')}${gallery('👎 디자인 별로',all.filter(r=>r.mark.design),'같은 상품 제외 · 구체 선호는 명시한 범위만 적용')}${gallery('💸 가격 별로',all.filter(r=>r.mark.price),'이 가격대는 비싸다고 봅니다')}`;
}
// ---- 실시간 예상 견적(사장님 2026-10-08: "담은 거 실시간으로 아래 견적"). 요율은 장부 meta/ship, 없으면 아래 기본값.
// 기본값 근거: 배대지 웨이하이 항공 요금표 Gold(사업자) 0.5kg 5,990원·0.5kg당 +1,820원(guide_08.php?tr_no=28, 2026-10-08 확인),
// 통관·포장·부피·작업 항목은 실제 견적에서 달라질 수 있으며 상세 근거는 내부 업무 기록에서 관리한다.
// 배송비 부가세·관부가세는 실제 견적 확인 후 별도로 반영한다.
const SHIP_DEFAULT={mode:'항공',grade:'Gold(사업자)',base05:5990,per05:1820,fixed:19500,boxPack:3000,cjMid:3900,cjLarge:4900,midMaxKg:5,boxMaxKg:15,multiBox:2000,originPer:60,originCap:30000,packRate:0.1,boxKg:0.5};
const shipCfg=()=>({...SHIP_DEFAULT,...(S.tree?.meta?.ship||{})});
function quote(){
  const t=S.tree||{},items=t.items||{},lines=cartLines();if(!lines.length)return null;
  const r=rate(),c=shipCfg(),sellers={},perOffer={};let goods=0,qty=0,weightG=0,unknownW=0;
  for(const l of lines){
    const it=items[l.offerId]||{},q=num(l.qty),sub=num(l.price)*q;goods+=sub;qty+=q;perOffer[l.offerId]=(perOffer[l.offerId]||0)+q;
    const w=num(l.weightG)||num(list(it.options).find(o=>o.spec===l.spec)?.weightG)||num(it.weightG);if(w)weightG+=w*q;else unknownW++;
    const sk=it.shop?.company||it.name||l.offerId,s=sellers[sk]=sellers[sk]||{shop:sk,offers:{},lines:[],goods:0};
    s.lines.push({...l,name:it.name||l.offerId,it,sub});s.goods+=sub;s.offers[l.offerId]=it;
  }
  let freight=0;for(const s of Object.values(sellers)){s.freight=Object.values(s.offers).reduce((a,it)=>a+num(it.freight),0);freight+=s.freight;}
  const moq=Object.entries(perOffer).map(([oid,q])=>{const it=items[oid]||{},m=num(it.moq);return m&&q<m?{name:it.name||oid,m,q}:null;}).filter(Boolean); // board_watcher.ledger_check와 같은 규칙: 상품별 옵션 수량 합 < 최소 주문
  const fee=(goods+freight)*r.fee,purchaseCny=goods+freight+fee,purchaseKrw=purchaseCny*r.rate;
  const estKg=weightG/1000*(1+c.packRate)+c.boxKg,billKg=Math.max(0.5,Math.ceil(estKg/0.5-1e-9)*0.5),boxes=Math.max(1,Math.ceil(billKg/c.boxMaxKg));
  const base=c.base05+c.per05*(billKg/0.5-1),boxCost=boxes*(c.boxPack+(billKg<=c.midMaxKg?c.cjMid:c.cjLarge)),multi=(boxes-1)*c.multiBox,origin=Math.min(c.originPer*qty,c.originCap);
  const ship=base+c.fixed+boxCost+multi+origin;
  return {n:lines.length,qty,goods,freight,fee,purchaseCny,purchaseKrw,weightG,unknownW,estKg,billKg,boxes,base,boxCost,multi,origin,ship,total:purchaseKrw+ship,moq,sellers:Object.values(sellers),r,c};
}
function quoteBar(){
  const q=quote();if(!q)return '';
  const warns=[q.moq.length?`<span class="sx-q-warn bad">⚠ 최소 주문 미달 — ${esc(q.moq[0].name)} ${q.moq[0].q}/${q.moq[0].m}개${q.moq.length>1?` 외 ${q.moq.length-1}곳`:''}</span>`:'',q.unknownW?`<span class="sx-q-warn">무게 모름 ${q.unknownW}개 — 배송비 더 나올 수 있음</span>`:''].filter(Boolean).join('');
  const head=`<button type="button" class="sx-q-head" data-sx="quote" aria-expanded="${!!S.quoteOpen}" aria-controls="sx-q-detail"><span class="sx-q-title">🧾 예상 견적</span><span>${q.n}줄 ${q.qty.toLocaleString('ko-KR')}개</span><span>구매 ${yuan(q.purchaseCny)} ≈ ${krw(q.purchaseKrw)}</span><span>국제배송 ≈ ${krw(q.ship)} <small>(${q.billKg}kg)</small></span><b>합계 ≈ ${krw(q.total)}</b><em>${S.quoteOpen?'접기 ▴':'자세히 ▾'}</em></button>`;
  const row=(th,td,cls='')=>`<tr class="${cls}"><th>${th}</th><td>${td}</td></tr>`;
  const detail=S.quoteOpen?`<div class="sx-q-detail" id="sx-q-detail">
    <div class="sx-q-sellers">${q.sellers.map(s=>`<div class="sx-q-seller"><b>${esc(s.shop)}</b>${s.lines.map(l=>`<div class="sx-q-line sx-q-item">${chosenVisual(l,l.it,'sx-cart-img')}<div class="sx-q-item-body"><b>${esc(l.name)} · ${esc(l.koBase||l.ko||l.spec)}</b><small lang="zh">${esc(l.spec)}</small><span>${num(l.qty).toLocaleString('ko-KR')}개 × ${yuan(l.price)}</span><label>수량 <input class="sx-q-qty" type="number" min="1" step="1" id="sx-qq-${esc(l.id)}" data-sx-qty="${esc(l.id)}" aria-label="${esc(l.name+' '+(l.koBase||l.ko||l.spec)+' 견적 수량')}" value="${esc(l.qty)}"></label><button type="button" class="text danger" data-sx="remove" data-id="${esc(l.id)}">장바구니에서 빼기</button></div><b>${yuan(l.sub)}</b></div>`).join('')}<div class="sx-q-line sub"><span>판매자 배송비</span><span></span><span>${yuan(s.freight)}</span></div></div>`).join('')}</div>
    <table class="sx-q-table"><tbody>
      ${row('상품 합계',yuan(q.goods))}${row(`1688 판매자 배송비 (${q.sellers.length}곳)`,yuan(q.freight))}${row(`구매대행 수수료 ${Math.round(q.r.fee*100)}%`,yuan(q.fee))}
      ${row('구매비 (예치금 결제)',`${yuan(q.purchaseCny)} ≈ ${krw(q.purchaseKrw)}<small>환율 ${q.r.rate}원</small>`,'sum')}
      ${row(`국제 배송 기본 (${esc(q.c.mode)}·웨이하이, ${q.billKg}kg)`,krw(q.base))}${row('사업자통관 수수료 + 간이통관',krw(q.c.fixed))}
      ${row(`상자 ${q.boxes}개 포장·CJ 부피 추가`,krw(q.boxCost))}${q.multi?row('멀티박스',krw(q.multi)):''}${row(`원산지 표기·작업 (개당 약 ${q.c.originPer}원, 최대 ${krw(q.c.originCap)})`,krw(q.origin))}
      ${row('국제 배송비 (입고·무게 측정 후 따로 결제)',`≈ ${krw(q.ship)}`,'sum')}${row('합계 (예상)',`≈ ${krw(q.total)}`,'total')}
    </tbody></table>
    <ul class="sx-q-notes">
      <li>무게: 상품 무게 합 ${(q.weightG/1000).toFixed(2)}kg + 포장 ${Math.round(q.c.packRate*100)}%·상자 ${q.c.boxKg}kg ≈ ${q.estKg.toFixed(2)}kg → 0.5kg 단위 올림 ${q.billKg}kg${q.unknownW?` · 무게 모르는 품목 ${q.unknownW}개는 빠져 있어 더 나올 수 있음`:''}.</li>
      ${q.moq.map(m=>`<li class="bad">⚠ 최소 주문 미달 — ${esc(m.name)}: 최소 주문 ${m.m}개인데 ${m.q}개</li>`).join('')}
      <li>관부가세 별도 — 지난 배송 2건은 배대지 청구에 없었지만 품목·금액에 따라 세관이 따로 부과할 수 있습니다. 바구니·상자처럼 부피 큰 물건은 부피무게로 배송비가 더 나올 수 있습니다.</li>
      <li>기준: 배대지 웨이하이 항공 요금표 ${esc(q.c.grade)} + 지난 배송 2건 실제 청구 항목. 모든 숫자는 예상이며 실제 금액은 배대지 견적·무게 측정 후 확정됩니다.</li>
    </ul>
    <button type="button" class="sx-q-cart" data-sx="tab" data-id="cart">장바구니에서 수량 바꾸기</button></div>`:'';
  return `<div class="sx-quote" role="region" aria-label="실시간 예상 견적">${head}${warns?`<div class="sx-q-warns">${warns}</div>`:''}${detail}</div>`;
}
function visibleCount(){const all=itemRows().filter(isAdmitted);return all.length-(S.showHidden?0:hiddenRows(all).hidden.length);}
function view(){
  const [label,tone]=STATUS[S.status]||STATUS.connecting,t=S.tree||{};
  const who=S.user?`<span class="sx-who">검수 요청 계정 ${esc(S.user.email)} · <button type="button" class="text" data-sx="logout">로그아웃</button></span>`:`<span class="sx-who"><button type="button" class="text" data-sx="login">구글 로그인(검수 요청용)</button></span>`;
  const status=`<div class="sx-status ${tone}"><i></i>${esc(label)}${who}${S.err?` · ${esc(S.err)}`:''}${t.meta?.updatedAt?` · Claude 마지막 갱신 ${esc(new Date(t.meta.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}`:''}</div>`;
  if(S.status==='denied')return status+`<div class="note error">소싱 자료를 읽을 권한이 없습니다. Firebase 규칙에 <code>sourcing</code> 칸이 열려 있어야 합니다.</div>`;
  if(!S.tree)return status+`<div class="note">소싱 자료를 불러오는 중입니다.</div>`;
  const nCart=Object.keys(t.cart||{}).length,nRule=Object.values(t.taste||{}).filter(r=>r.active!==false).length;
  const tabs=`<div class="chips">${[['items','후보 '+visibleCount()],['cart','장바구니 '+nCart],['reorder','재발주 준비 '+reorderCount(t)],['taste','취향 규칙 '+nRule],['review','검토 대기 '+itemRows().filter(r=>!exclusion(r.id,r,t.marks||{})&&!isAdmitted(r)).length],['excluded','삭제 내역 '+Object.values(t.marks||{}).filter(m=>m.exclusion?.active).length]].map(([id,l])=>`<button type="button" class="chip ${S.tab===id?'active':''}" data-sx="tab" data-id="${id}">${esc(l)}</button>`).join('')}</div>`;
  return status+tabs+(S.tab==='cart'?cartTab():S.tab==='taste'?tasteTab():S.tab==='review'?reviewTab():S.tab==='excluded'?excludedTab():S.tab==='reorder'?reorderTab(t,{img,yuan}):itemsTab())+quoteBar();
}
function refresh(){
  const root=document.getElementById('sx-root');if(!root)return;
  const a=document.activeElement,keep=a&&root.contains(a)&&a.id?{id:a.id,value:a.value,s:a.selectionStart,e:a.selectionEnd}:null;
  rendering=true;try{root.innerHTML=view();}finally{rendering=false;}   // 입력 중인 칸이 지워질 때 브라우저가 내는 change·focusout 은 저장으로 받지 않는다(아래 commitQty)
  if(keep){const el=document.getElementById(keep.id);if(el){if('value' in el&&el.type!=='checkbox')el.value=keep.value;el.focus();try{if(keep.s!=null)el.setSelectionRange(keep.s,keep.e);}catch(e){}
    if(el.dataset.sxQty!=null){   // 수량 칸: 다른 줄 저장·소싱 담당의 장부 갱신으로 다시 그려져도 입력 흐름을 잇는다
      if(el.value===String(S.tree?.cart?.[el.dataset.sxQty]?.qty??''))el.select();   // 아직 손대지 않은 칸은 전체 선택(탭으로 들어온 것처럼 — 바로 치면 숫자가 바뀐다)
      else if(el.classList.contains('sx-qty'))liveTier(el);}}}                        // 입력 중인 칸은 입력한 수량 기준 계산을 유지
}

// ---- 조작
const now=()=>new Date().toISOString();

const REASONS=[['expression','design','표정'],['color','design','색감'],['shape','design','형태'],['materialFeel','design','재질감'],['brandMood','design','브랜드 분위기'],['price','purchase','가격'],['moq','purchase','MOQ'],['size','purchase','크기'],['quality','purchase','품질'],['imitation','risk','모방 의심'],['certification','risk','인증 확인 필요']];
let reasonDialog=null,reasonOpener=null;
const pendingActions=new Set();
function closeReasons(){if(!reasonDialog||reasonDialog.dataset.busy==='1')return;reasonDialog.remove();reasonDialog=null;document.body.style.overflow='';if(reasonOpener&&document.contains(reasonOpener))reasonOpener.focus();reasonOpener=null;}
function openReasons(id,opener){closeReasons();const it=S.tree.items[id]||{},old=S.tree.marks?.[id]?.exclusion||{};reasonOpener=opener;
 const d=document.createElement('div');d.className='sx-reason-modal';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','추천 제외 사유');d.dataset.item=id;d.dataset.event='e'+crypto.randomUUID();d.dataset.at=now();
 d.innerHTML=`<form><h2>${esc(it.name||id)} · 추천 제외 사유</h2><p>여러 이유를 선택할 수 있습니다. 이 상품만 제외가 기본입니다.</p><fieldset><legend>디자인 · 구매 조건 · 판매위험</legend>${REASONS.map(([key,kind,label])=>'<label class="sx-reason-row"><input type="checkbox" name="'+key+'" '+(list(old.reasons).some(r=>r.dimension===key)?'checked':'')+'>'+esc(label)+' ('+({design:'디자인',purchase:'구매 조건',risk:'판매위험'})[kind]+')'+(kind==='risk'?'':'<input name="v-'+key+'" aria-label="'+esc(label)+' 다음 후보 조건" placeholder="'+(['price','moq'].includes(key)?'허용 상한 숫자':'다음에 피할 구체 속성')+'" value="'+esc(list(old.preferences).find(p=>p.dimension===key)?.value||'')+'">')+'</label>').join('')}</fieldset><label>메모<textarea name="memo" maxlength="1000">${esc(old.memo||old.reason||'')}</textarea></label><fieldset><legend>적용 범위</legend><label><input type="radio" name="scope" value="item" ${old.applyNext?'':'checked'}>이 상품만 제외</label><label><input type="radio" name="scope" value="next" ${old.applyNext?'checked':''}>이 선호를 다음 후보 선정에도 적용</label><label>다음 후보 분류 범위<input name="category" value="${esc(list(old.preferences)[0]?.scope??it.cat??'')}" placeholder="빈칸이면 모든 분류"></label><small>구체 속성만 반영합니다. 한 펭귄 제외를 모든 펭귄 기피로 확대하지 않습니다. 모방·인증은 별도 검수합니다.</small></fieldset><p role="status"></p><div class="sx-reason-actions"><button type="button" data-reason-cancel>취소</button><button type="submit" class="primary">사유 저장</button></div></form>`;
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-reason-cancel]'))closeReasons();});d.addEventListener('submit',saveReasons);document.body.appendChild(d);reasonDialog=d;document.body.style.overflow='hidden';d.querySelector('textarea').focus();
}
async function saveReasons(e){e.preventDefault();const d=reasonDialog;if(!d||d.dataset.busy==='1')return;const f=new FormData(e.target),id=d.dataset.item,it=S.tree.items[id]||{},old=S.tree.marks?.[id]?.exclusion||{},reasons=REASONS.filter(([key])=>f.has(key)).map(([dimension,kind,label])=>({dimension,kind,label})),applyNext=f.get('scope')==='next',preferences=reasons.filter(r=>r.kind!=='risk'&&String(f.get('v-'+r.dimension)||'').trim()).map(r=>({...r,value:String(f.get('v-'+r.dimension)).trim(),scope:String(f.get('category')||'').trim()}));
 if(applyNext&&(!preferences.length||reasons.filter(r=>r.kind!=='risk').some(r=>!preferences.some(p=>p.dimension===r.dimension)))){d.querySelector('[role="status"]').textContent='다음 후보에 적용할 구체 속성·상한을 입력하세요. 판매위험은 취향으로 확대하지 않습니다.';return;}
 const at=d.dataset.at,x={...old,active:true,identity:identity(id,it.url),offerId:id,sourceUrl:originalUrl(id,it.url),name:it.name||id,reasons,memo:String(f.get('memo')||'').trim(),reason:String(f.get('memo')||'').trim(),applyNext,preferences:applyNext?preferences:[],at,by:'사장님 보드',restoredAt:null};d.dataset.busy='1';d.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
 try{await send('PATCH','marks/'+id,{exclusion:x,['exclusionEvents/'+d.dataset.event]:{action:old.active?'edit':'exclude',at,by:x.by,identity:x.identity,reasons,memo:x.memo,applyNext,preferences:x.preferences}});d.dataset.busy='0';closeReasons();notify('추천 제외 사유를 저장했습니다. 다음 소싱 적용 범위를 구분해 기록했습니다.');}
 catch(err){d.dataset.busy='0';d.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);d.querySelector('[role="status"]').textContent=err.message;}
}
function skuStatus(l,it){const r=it.skuReviews?.[keyOfSpec(l.spec)]||{},problems=skuReviewProblems(l.offerId,it,l.spec),requests=Object.values(S.tree.reviewRequests||{}).filter(q=>q.offerId===l.offerId&&q.spec===l.spec&&q.fingerprint===skuSnapshot(l.offerId,it,l.spec));const pending=requests.find(q=>['manual_pending','in_review'].includes(q.status));if(pending)problems.unshift('수동 정밀검수 대기·진행 중');const disp=pending?.status==='manual_pending'?dispatchText(pending.dispatch):'';return `<div class="sx-sku-status"><span class="badge ${problems.length?'amber':'green'}">${esc(problems.length?({in_review:'검수 중',need_info:'추가 정보 필요',not_recommended:'권장하지 않음'})[r.status]||'선택 옵션 미검수·재검수':'확인 범위 내 진행 검토 가능')}</span><small>${esc(problems.join(' · '))}</small>${disp?'<small class="sx-dispatch">'+esc(disp)+'</small>':''}${r.by?'<small>검수자 '+esc(r.by)+' · '+esc(r.at||'')+' · 유효 '+esc(r.expiresAt||'')+'</small>':''}${Object.values(r.checks||{}).map(c=>'<p>'+esc(c.note||'')+' '+list(c.evidence).map(u=>'<a href="'+esc(/^https:\/\//.test(u)?u:'#')+'" target="_blank" rel="noopener">근거</a>').join(' ')+'</p>').join('')}<button type="button" data-sx="sku-review" data-id="${esc(l.id)}">${pending?'수동 검수 대기':'선택 옵션 검수 요청'}</button><small>Claude 전달은 검수 요청을 넘기는 것일 뿐 자동 승인이 아닙니다 · 담기는 주문 승인이 아닙니다.</small></div>`;}
// 검수 요청 전달 상태(PC 감시기 → 소싱 담당 Claude 대화, 2026-10-09). 결과는 담당이 원문·사진을 본 뒤 기록한다.
function dispatchText(d){const w=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';const t=w(d?.at);if(!d)return '전달 대기 — PC 감시기가 소싱 담당 Claude에게 보냅니다';if(d.status==='sending')return 'Claude에게 보내는 중';if(d.status==='sent')return `전송함 ${t} · 담당 수신 확인 전 · 검수 결과 대기`;if(d.status==='received')return `소싱 담당 Claude가 받음 ${w(d.receivedAt||d.at)} · 검수 중`;if(d.status==='held')return '수신 보류 — 받는 Claude 대화에서 허락이 필요해요(전송 완료 아님)';if(d.status==='refused')return '받는 Claude 대화가 거절 — 수동 검수 대기';if(d.status==='stale')return '요청 뒤 상품 정보가 바뀌어 전달하지 않았어요 — 다시 요청해 주세요';if(d.status==='delivery_unknown')return '전달 여부 모름 — 담당이 받은 대화를 확인한 뒤 기록합니다(자동으로 다시 보내지 않음)';return '전달 못 함('+(d.note||d.status)+') — 수동 검수 대기';}
async function requestSku(lid){if(pendingActions.has('review:'+lid))return;const l=S.tree.cart[lid],it=S.tree.items[l.offerId]||{},fingerprint=skuSnapshot(l.offerId,it,l.spec);if(!fingerprint)throw Error('장부에 없는 선택 옵션입니다.');const prior=Object.values(S.tree.reviewRequests||{}).find(q=>q.offerId===l.offerId&&q.spec===l.spec&&q.fingerprint===fingerprint&&['manual_pending','in_review'].includes(q.status));if(prior){notify('이미 검수 대기 중입니다.');return;}if(!S.user){try{await fbauth.signIn();}catch(e){throw Error('검수 요청은 운영 계정(구글)으로 로그인해야 합니다 — '+(e.message||'로그인 실패'));}if(!S.user)S.user=fbauth.current();if(!S.user)throw Error('검수 요청은 운영 계정(구글)으로 로그인해야 합니다.');}
pendingActions.add('review:'+lid);try{const rid='v'+crypto.randomUUID();await send('PUT','reviewRequests/'+rid,{offerId:l.offerId,spec:l.spec,fingerprint,policyVersion:POLICY_VERSION,status:'manual_pending',operator:'수동 담당 검수',at:now(),image:list(it.options).find(o=>o.spec===l.spec)?.img||'',by:S.user.email.slice(0,100)},{auth:true});notify('검수 요청 저장 · PC가 소싱 담당 Claude에게 전달합니다. 결과는 담당이 원문·사진을 확인한 뒤 기록합니다.');}finally{pendingActions.delete('review:'+lid);}}

async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true;}catch(e){}
  const a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;opacity:0;top:0;left:0';document.body.appendChild(a);a.select();
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}a.remove();return ok;
}
async function onClick(e){
  const el=e.target.closest('[data-sx]');if(!el||!el.closest('#sx-root'))return;
  const {sx,id,k,spec}=el.dataset;
  try{
    if(sx==='tab'){S.tab=id;refresh();window.scrollTo({top:0});return;}
    if(sx==='zoom'){openZoom(el);return;}
    if(sx==='login'){try{await fbauth.signIn();}catch(e){throw Error('로그인하지 못했습니다 — '+(e.message||''));}return;}
    if(sx==='logout'){await fbauth.signOut();return;}
    if(sx==='quote'){S.quoteOpen=!S.quoteOpen;refresh();return;}
    if(sx==='toggle-hidden'){S.showHidden=!S.showHidden;try{sessionStorage.setItem(HIDDEN_KEY,S.showHidden?'1':'0');}catch(e){}refresh();return;}
    if(sx==='copy'){const ok=await copyText(el.dataset.text||'');notify(ok?'1688 옵션명을 복사했습니다 — 1688 페이지에서 Ctrl+F(휴대폰은 페이지 내 찾기)로 붙여 넣어 찾으세요.':'복사하지 못했습니다 — 회색 글자를 길게 눌러 직접 복사해 주세요.',!ok);return;}
    if(sx==='sku-review'){await requestSku(id);return;}
    if(sx==='exclude'){openReasons(id,el);return;}
    if(sx==='restore'){
      const old=S.tree.marks?.[id]?.exclusion;if(!old)return;
      if(pendingActions.has('restore:'+id))return;pendingActions.add('restore:'+id);
      const eventId='e'+crypto.randomUUID();
      try{await send('PATCH','marks/'+id,{['exclusionEvents/'+eventId]:{action:'restore',at:now(),by:'사장님 보드',identity:old.identity},exclusion:{...old,active:false,restoredAt:now(),restoredBy:'사장님 보드',applyNext:false}});}finally{pendingActions.delete('restore:'+id);}
      notify('추천 제외를 복구했습니다. 검수 상태와 기존 표시는 유지됩니다.');return;
    }
    if(sx==='mark'){
      const m={...(S.tree?.marks?.[id]||{})},on=!m[k];
      const next={like:k==='like'?on:(on?false:!!m.like),design:k==='design'?on:(k==='like'&&on?false:!!m.design),price:k==='price'?on:(k==='like'&&on?false:!!m.price),at:now(),by:'대시보드'};
      await send('PATCH','marks/'+id,next);
      if(on&&k!=='like'&&!S.showHidden)notify(cartLines().some(l=>l.offerId===id)?'표시했습니다. 장바구니에 담겨 있어 숨기지 않았어요.':'추천에서 숨겼습니다. 위의 \'숨긴 상품 보기\'에서 표시를 풀면 다시 나옵니다.');
    }
    if(sx==='set-mark'){
      const m={...(S.tree?.sets?.[id]?.mark||{})},on=!m[k];
      await send('PATCH','sets/'+id+'/mark',{like:k==='like'?on:(on?false:!!m.like),bad:k==='bad'?on:(on?false:!!m.bad),at:now()});
    }
    if(sx==='add'){
      if(!recommendable(id,S.tree.items[id]||{},S.tree.marks||{}))throw Error('추천 제외 또는 검수 대기 상품은 새로 담을 수 없습니다.');
      const it=S.tree.items[id],o=list(it.options).find(x=>x.spec===spec),lid=id+'~'+keyOf(spec);
      const qty=Math.round(num(S.draft[lid]??document.getElementById('sx-q-'+lid)?.value));
      if(qty<1)throw Error('수량을 1개 이상 입력하세요.');
      await send('PUT','cart/'+lid,{offerId:id,spec,ko:o?.ko||'',price:num(o?.price),img:o?.img||'',imageSource:o?.img?'option':it.img?'representative':'none',weightG:o?.weightG||it.weightG||null,qty,at:S.tree?.cart?.[lid]?.at||now(),updatedAt:now()});
      delete S.draft[lid];notify(`장바구니에 담았습니다 — ${it.name} ${o?.ko||spec} ${qty}개`);
    }
    if(sx==='remove'){await send('DELETE','cart/'+id);notify('장바구니에서 뺐습니다.');}
    if(sx==='request'){
      const lines=cartLines();if(!lines.length)return;
      if(pendingActions.has('order'))return;
      const issues=orderProblems(lines,S.tree.items||{},S.tree.marks||{},S.tree.meta?.watcher||{},S.tree.reviewRequests||{});if(issues.length)throw Error('검수 대기: '+issues.join(' · '));pendingActions.add('order');
      const duplicate=Object.values(S.tree.requests||{}).find(q=>['요청','처리중'].includes(q.status)&&JSON.stringify(Object.values(q.lines||{}).map(l=>[l.offerId,l.spec,l.qty,l.fingerprint,l.reviewResultId]).sort())===JSON.stringify(lines.map(l=>[l.offerId,l.spec,l.qty,skuSnapshot(l.offerId,S.tree.items[l.offerId],l.spec),S.tree.items[l.offerId].skuReviews[keyOfSpec(l.spec)].resultId]).sort()));
      if(duplicate){pendingActions.delete('order');notify('같은 장바구니 신청서 요청이 이미 대기·처리 중입니다.');return;}
      const total=lines.reduce((a,l)=>a+num(l.price)*num(l.qty),0),rid='r'+Date.now().toString(36);
      try{await send('PUT','requests/'+rid,{policyVersion:POLICY_VERSION,kind:'배대지 신청서',status:'요청',at:now(),summary:`${lines.length}줄 ${lines.reduce((a,l)=>a+num(l.qty),0)}개 · ${yuan(total)}`,lines:Object.fromEntries(lines.map(l=>[l.id,{offerId:l.offerId,spec:l.spec,ko:l.ko||'',qty:l.qty,price:l.price,fingerprint:skuSnapshot(l.offerId,S.tree.items[l.offerId],l.spec),reviewResultId:S.tree.items[l.offerId].skuReviews[keyOfSpec(l.spec)].resultId}]))});}finally{pendingActions.delete('order');}
      notify('요청을 남겼습니다. Claude가 확인하면 신청서를 채웁니다.');
    }
  }catch(err){notify(err.message,true);}
}
async function onChange(e){
  const el=e.target;if(!el.closest('#sx-root'))return;
  try{
    if(el.dataset.sxFilter&&el.dataset.sxFilter!=='q'){S[el.dataset.sxFilter]=el.value;refresh();return;}
    if(el.dataset.sxNote!=null){await send('PATCH','marks/'+el.dataset.sxNote,{note:el.value.trim(),at:now(),by:'대시보드'});notify('한마디를 저장했습니다.');}
    if(el.dataset.sxSetnote!=null){await send('PATCH','sets/'+el.dataset.sxSetnote+'/mark',{note:el.value.trim(),at:now()});notify('세트 한마디를 저장했습니다.');}
    if(el.dataset.sxQty!=null){if(!rendering)await commitQty(el.dataset.sxQty,el.value);return;}
    if(el.dataset.sxRule!=null){await send('PATCH','taste/'+el.dataset.sxRule,{active:el.checked,at:now()});}
  }catch(err){notify(err.message,true);}
}
// 수량 저장(장부에는 예전처럼 수량 한 칸만). 칸을 벗어나거나 Enter 를 누르면 저장한다.
//  - 값이 장부와 같으면 보내지 않는다. 같은 값을 저장하는 중이면 다시 보내지 않는다.
//  - 한 박자 늦춰 보낸다: 다음 칸으로 포커스가 넘어간 뒤에 다시 그려야 수량을 이어서 고칠 때 다음 칸의 포커스와 입력이 지워지지 않는다.
//  - 화면이 다시 그려지며 입력 중인 칸이 바뀌면 브라우저가 change 를 내지 않을 수 있어 focusout 에서도 확인한다.
async function commitQty(id,value){
  const q=Math.round(num(value));if(q<1)throw Error('수량을 1개 이상 입력하세요.');
  if(!S.tree?.cart?.[id]||q===num(S.tree.cart[id].qty)||committing.get(id)===q)return;
  committing.set(id,q);
  try{await new Promise(r=>setTimeout(r));if(S.tree?.cart?.[id])await send('PATCH','cart/'+id,{qty:q,updatedAt:now()});}finally{committing.delete(id);}
}
function onFocusOut(e){
  const el=e.target;if(rendering||!el?.dataset||el.dataset.sxQty==null||!el.closest('#sx-root'))return;
  commitQty(el.dataset.sxQty,el.value).catch(err=>{if(!/1개 이상/.test(err.message))notify(err.message,true);});   // 잘못된 수량 안내는 change 쪽에서 이미 했다
}
function onInput(e){
  const el=e.target;if(!el.closest('#sx-root'))return;
  if(el.dataset.sxFilter==='q'){S.q=el.value;clearTimeout(searchTimer);searchTimer=setTimeout(refresh,160);}
  if(el.dataset.sxDraft!=null)S.draft[el.dataset.sxDraft]=el.value;
  if(el.dataset.sxQty!=null&&el.classList.contains('sx-qty'))liveTier(el);
}
async function onSubmit(e){
  const form=e.target.closest('[data-sx-form]');if(!form)return;e.preventDefault();
  try{const f=new FormData(form),text=String(f.get('text')||'').trim();if(!text)return;
    await send('PUT','taste/t'+Date.now().toString(36),{kind:f.get('kind'),text,active:true,source:'사장님 직접',by:'대시보드',at:now()});notify('규칙을 추가했습니다.');
  }catch(err){notify(err.message,true);}
}

export default function renderPage(c){
  ctx=c;
  if(!started){
    started=true;
    document.addEventListener('click',onClick);document.addEventListener('change',onChange);document.addEventListener('focusout',onFocusOut);document.addEventListener('input',onInput);document.addEventListener('submit',onSubmit,true);document.addEventListener('keydown',onKey);
    connect();
    fbauth.onAuth(u=>{S.user=u;refresh();});   // 로그인 상태만 표시·검수 요청에 쓴다(읽기 연결은 그대로)
  }
  return ctx.head('소싱 보드','Claude가 1688에서 찾은 후보를 보고 💗·👎·💸와 한마디를 남기세요. 표시는 바로 저장되고, Claude가 다음 소싱과 발주에 반영합니다.',`<a class="inline-link" href="purchases.html">매입·원가로 ↗</a>`)+`<div id="sx-root">${view()}</div>`;
}
