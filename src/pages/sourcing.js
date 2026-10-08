// 소싱 보드 — 1688 후보 고르기(💗/👎/💸·한마디)와 발주 장바구니.
// 자료는 ERP 원장(localStorage)과 별개로 Firebase Realtime DB `sourcing/`에 있다(로그인 없이 공유, 2026-10-07 사장님 결정).
// Claude는 mumutori-auto/sourcing_db.py로 같은 경로를 읽고 써서, 표시를 다음 소싱·발주에 반영한다.
const DB='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing';
const S={tree:null,status:'connecting',tab:'items',round:'',filter:'전체',cat:'',q:'',draft:{},err:''};
let ctx=null,started=false,source=null,pollTimer=null,searchTimer=null;
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
function onKey(e){if(e.key==='Escape'&&document.querySelector('.sx-lightbox')){e.preventDefault();closeZoom();}}
const rate=()=>{const m=S.tree?.meta||{};return {rate:num(m.rate)||212.2,fee:m.fee==null?0.05:num(m.fee)};};
const toKrw=y=>{const r=rate();return num(y)*r.rate*(1+r.fee);};
// PC 자동 처리(mumutori-auto board_watcher.py)가 meta/watcher에 남기는 신호. 15분마다 갱신 → 20분 넘게 없으면 꺼짐으로 본다.
const REQ_TONE={'요청':'amber','처리중':'amber','작성됨':'green','확인 필요':'red'};
const watcher=()=>{const w=S.tree?.meta?.watcher;const off='PC가 꺼져 있으면 Claude 대화에서 "보드 요청 확인해줘"라고 말해 주세요.';if(!w?.at)return {on:false,text:'PC 자동 처리 신호 없음 — '+off};const t=new Date(w.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});return (Date.now()-new Date(w.at).getTime())/60000<=20?{on:true,text:`PC 자동 처리 켜짐 · 요청하면 1분 안팎으로 신청서를 채웁니다 (마지막 신호 ${t}${w.state==='처리중'?' · 지금 처리 중':''})`}:{on:false,text:`PC 자동 처리 꺼짐 (마지막 신호 ${t}) — ${off}`};};

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
async function send(method,path,body){
  if(method!=='GET'){
    if(method==='DELETE')setAt(path,null);
    else if(method==='PATCH')for(const [k,v] of Object.entries(body))setAt(path+'/'+k,v);
    else setAt(path,body);
    refresh();
  }
  const r=await fetch(`${DB}/${path}.json`,{method,headers:{'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)});
  if(!r.ok){readAll().catch(()=>{});throw Error(r.status===401?'Firebase 쓰기 권한이 없습니다. 규칙을 확인해야 합니다.':'저장하지 못했습니다 ('+r.status+').');}
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

function card(r){
  const m=r.mark,st=markState(m),opts=list(r.options),inCart=cartLines().filter(l=>l.offerId===r.id);
  const prices=opts.map(o=>num(o.price)).filter(Boolean),lo=prices.length?Math.min(...prices):num(r.priceMin),hi=prices.length?Math.max(...prices):num(r.priceMax);
  const meta=[r.moq?`최소 ${esc(r.moq)}${esc(r.unit||'개')}`:'',r.weightG?`${esc(r.weightG)}g`:'',r.shop?.years?`판매처 ${esc(r.shop.years)}년`:'',r.shop?.repeat?`재구매 ${esc(r.shop.repeat)}`:''].filter(Boolean).join(' · ');
  const mark=(k,label)=>`<button type="button" class="sx-mark ${m[k]?'on '+k:''}" data-sx="mark" data-id="${esc(r.id)}" data-k="${k}" aria-pressed="${!!m[k]}">${label}</button>`;
  // 옵션 사진이 없으면 대표 사진을 흐리게 + '대표' 표시(옵션 사진처럼 보이지 않게). 1688 원래 옵션명(spec)은 복사해서 1688 페이지에서 찾는다.
  const optImg=o=>zoom(o.img||r.img,o.img?img(o.img,120):`<span class="sx-optfb" title="1688에 이 옵션 사진이 없어 상품 대표 사진을 보여 줍니다">${img(r.img,120)}<em>대표</em></span>`,{cap:o.ko||o.spec,spec:o.spec,rep:!o.img});
  const optRows=m.like&&opts.length?`<div class="sx-opts"><b>옵션·수량 담기</b><a class="sx-optlink" href="${esc(r.url)}" target="_blank" rel="noopener">1688에서 옵션 대조 ↗</a><small class="sx-opthelp">회색 글자 = 1688 옵션명 · '복사' 후 1688 페이지에서 Ctrl+F(휴대폰은 페이지 내 찾기)</small>${opts.map(o=>{const lid=r.id+'~'+keyOf(o.spec),line=S.tree?.cart?.[lid];const dk=lid;return `<div class="sx-opt">${optImg(o)}<span>${esc(o.ko||o.spec)}${o.img?'':'<small class="sx-nofoto">옵션 사진 없음 · 대표 사진</small>'}<small class="sx-spec"><span lang="zh">${esc(o.spec)}</span> <button type="button" class="sx-copy" data-sx="copy" data-text="${esc(o.spec)}" aria-label="1688 옵션명 복사: ${esc(o.spec)}">복사</button></small><small>${yuan(o.price)}${o.weightG?' · '+esc(o.weightG)+'g':''}</small></span><input type="number" min="1" step="1" inputmode="numeric" aria-label="${esc((o.ko||o.spec)+' 수량')}" id="sx-q-${esc(dk)}" data-sx-draft="${esc(dk)}" value="${esc(S.draft[dk]??(line?.qty||r.qty||''))}"><button type="button" class="primary" data-sx="add" data-id="${esc(r.id)}" data-spec="${esc(o.spec)}">${line?'수정':'담기'}</button></div>`;}).join('')}${inCart.length?`<span class="sx-in">장바구니에 ${inCart.map(l=>esc((l.ko||l.spec)+' '+l.qty+'개')).join(', ')}</span>`:''}</div>`:'';
  return `<article class="sx-card ${st}">
    ${r.img?zoom(r.img,img(r.img,310),{cap:r.name,cls:'sx-img'}):`<a class="sx-img" href="${esc(r.url)}" target="_blank" rel="noopener">${img('',310)}</a>`}
    <div class="sx-body">
      <div class="sx-top"><span class="sx-pid">${esc(r.pid||'')}</span>${r.warn?`<span class="badge amber">⚠ ${esc(r.warn)}</span>`:''}${list(r.tags).map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
      <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></h3>
      ${r.desc?`<p class="sx-desc">${esc(r.desc)}</p>`:''}
      <div class="sx-price"><b>${yuan(lo)}${hi>lo?'~'+yuan(hi).slice(1):''}</b> <span>≈ ${krw(toKrw(lo))}${hi>lo?'~':''}/개</span></div>
      ${meta?`<div class="sx-meta">${meta}</div>`:''}
      <div class="sx-marks">${mark('like','💗 좋아요')}${mark('design','👎 디자인 별로')}${mark('price','💸 가격 별로')}</div>
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
  const t=S.tree||{},all=itemRows(),rows=filtered(all),rounds=Object.entries(t.rounds||{}).sort((a,b)=>String(b[1].date||'').localeCompare(String(a[1].date||'')));
  const cats=[...new Set(all.map(r=>r.cat).filter(Boolean))];
  const count=f=>all.filter(f).length;
  const sum=`<div class="sx-summary">${[['후보',all.length],['💗',count(r=>r.mark.like)],['👎',count(r=>r.mark.design)],['💸',count(r=>r.mark.price)],['안 본 것',count(r=>!markState(r.mark))]].map(([a,b])=>`<span class="badge">${a} ${b}</span>`).join('')}</div>`;
  const tools=`<div class="toolbar"><div class="filters"><input id="sx-search" class="search" data-sx-filter="q" aria-label="후보 검색" placeholder="이름·한마디 검색" value="${esc(S.q)}"><select data-sx-filter="round" aria-label="회차"><option value="">모든 회차</option>${rounds.map(([id,r])=>`<option value="${esc(id)}" ${S.round===id?'selected':''}>${esc(r.title||id)}</option>`).join('')}</select><select data-sx-filter="filter" aria-label="표시">${FILTERS.map(f=>`<option ${S.filter===f?'selected':''}>${f}</option>`).join('')}</select><select data-sx-filter="cat" aria-label="분류"><option value="">모든 분류</option>${cats.map(c=>`<option ${S.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div>`;
  const groups=[...new Set(rows.map(r=>r.cat||'기타'))];
  const body=rows.length?groups.map(g=>`<div class="sx-section"><h2>${esc(g)}</h2><span>${rows.filter(r=>(r.cat||'기타')===g).length}개</span></div><div class="sx-grid">${rows.filter(r=>(r.cat||'기타')===g).map(card).join('')}</div>`).join(''):`<div class="note">${all.length?'조건에 맞는 후보가 없습니다.':'아직 후보가 없습니다. Claude가 1688에서 찾으면 여기에 올라옵니다.'}</div>`;
  const shownRounds=S.round?rounds.filter(([id])=>id===S.round):rounds;
  const sets=Object.entries(t.sets||{}).filter(([,s])=>shownRounds.some(([rid])=>rid===s.round));
  const setsHtml=sets.length?`<div class="sx-section"><h2>세트 제안</h2><span>Claude가 후보로 짠 구성 — 마음에 들면 💗</span></div><div class="sx-sets">${sets.map(([id,s])=>setCard(id,s,t.items||{})).join('')}</div>`:'';
  const roundNote=shownRounds.length&&S.round?`<div class="note">${esc(shownRounds[0][1].note||'')}</div>`:'';
  return sum+tools+roundNote+body+setsHtml;
}
function cartTab(){
  const t=S.tree||{},items=t.items||{},lines=cartLines();
  const likedNoCart=itemRows().filter(r=>r.mark.like&&!lines.some(l=>l.offerId===r.id));
  let totalY=0,weight=0,weightKnown=true;
  const rows=lines.map(l=>{const it=items[l.offerId]||{},sub=num(l.price)*num(l.qty);totalY+=sub;if(l.weightG)weight+=num(l.weightG)*num(l.qty);else weightKnown=false;
    return `<tr><td>${zoom(l.img||it.img,img(l.img||it.img,120,'sx-cart-img'),{cap:(it.name||l.offerId)+(l.ko?' · '+l.ko:''),spec:l.spec,rep:!l.img})}</td><td class="maincell"><b><a href="${esc(it.url||'#')}" target="_blank" rel="noopener">${esc(it.name||l.offerId)}</a></b><span class="sub">${esc(l.ko||'')}</span><span class="sub sx-spec"><span lang="zh">${esc(l.spec)}</span> <button type="button" class="sx-copy" data-sx="copy" data-text="${esc(l.spec)}" aria-label="1688 옵션명 복사: ${esc(l.spec)}">복사</button></span></td><td><input type="number" min="1" step="1" class="sx-qty" id="sx-cq-${esc(l.id)}" data-sx-qty="${esc(l.id)}" aria-label="수량" value="${esc(l.qty)}"></td><td class="num">${yuan(l.price)}</td><td class="num"><b>${yuan(sub)}</b></td><td class="num">${krw(toKrw(sub))}</td><td>${`<button type="button" class="text danger" data-sx="remove" data-id="${esc(l.id)}">빼기</button>`}</td></tr>`;}).join('');
  const reqs=Object.entries(t.requests||{}).sort((a,b)=>String(b[1].at||'').localeCompare(String(a[1].at||''))).slice(0,5);
  const r=rate();
  return `${likedNoCart.length?`<div class="note amber">💗만 누르고 수량을 안 담은 상품 ${likedNoCart.length}개: ${likedNoCart.map(x=>`<b>${esc(x.name)}</b>`).join(', ')} — 후보 탭에서 옵션·수량을 담아 주세요.</div>`:''}
    <div class="panel section-gap"><div class="tablewrap"><table class="table"><thead><tr><th>사진</th><th>상품 / 옵션</th><th>수량</th><th class="num">단가</th><th class="num">소계</th><th class="num">≈ 원화</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="7"><div class="empty"><b>장바구니가 비어 있습니다.</b>후보에서 💗 → 옵션·수량 담기</div></td></tr>`}</tbody></table></div>
    <div class="sx-total"><span>상품 ${lines.length}줄 · ${lines.reduce((a,l)=>a+num(l.qty),0)}개</span><span>합계 <b>${yuan(totalY)}</b> ≈ <b>${krw(toKrw(totalY))}</b></span><small>환율 ${r.rate}원 × 구매대행 수수료 ${Math.round(r.fee*100)}% 포함 · 1688 판매자 배송비·국제 배송비·관부가세 별도${weight?` · 무게 약 ${(weight/1000).toFixed(2)}kg${weightKnown?'':'(일부 무게 모름)'}`:''}</small></div></div>
    <div class="sx-request"><div><b>배대지 신청서</b><p>요청하면 PC의 자동 처리 프로그램이 이 장바구니로 아이템스카우트 배대지 신청서를 채우고 캡처합니다. <b>신청하기는 확인을 받은 뒤에</b> 누릅니다.</p><p><span class="badge ${watcher().on?'green':'amber'}">${watcher().on?'켜짐':'꺼짐'}</span> ${esc(watcher().text)}</p></div><button type="button" class="primary" data-sx="request" ${lines.length?'':'disabled'}>Claude에게 신청서 작성 요청</button></div>
    ${reqs.length?`<div class="sx-reqs">${reqs.map(([id,q])=>`<div><span class="badge ${REQ_TONE[q.status]||'amber'}">${esc(q.status||'요청')}</span> ${esc(new Date(q.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · ${esc(q.summary||'')}${q.reply?` — <b>${esc(q.reply)}</b>`:''}</div>`).join('')}<small>'작성됨'이면 PC 크롬의 [작성본] 탭과 드라이브 구매대행/요청작성본에서 확인하고, 신청하려면 Claude에게 "신청해줘"라고 말해 주세요. '확인 필요'는 사유를 보고 Claude에게 맡겨 주세요.</small></div>`:''}`;
}
function tasteTab(){
  const t=S.tree||{},rules=Object.entries(t.taste||{}).sort((a,b)=>String(a[1].at||'').localeCompare(String(b[1].at||''))),all=itemRows();
  const KIND={avoid:['피하기','red'],prefer:['좋아함','green'],price:['가격','amber'],rule:['기준','']};
  const gallery=(title,rows,why)=>`<div class="sx-section"><h2>${title}</h2><span>${why}</span></div><div class="sx-thumbs">${rows.length?rows.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.mark.note||'')}">${img(r.img,120)}<span>${esc(r.name)}</span>${r.mark.note?`<em>${esc(r.mark.note)}</em>`:''}</a>`).join(''):'<p class="sub">아직 없습니다.</p>'}</div>`;
  return `<div class="note">Claude는 다음 소싱 전에 이 규칙과 표시를 읽습니다. 👎 받은 상품과 같은 상품은 다시 제안하지 않고, 💸 받은 종류에는 가격 상한을 둡니다. 규칙이 틀렸으면 끄거나 고쳐 주세요.</div>
    <div class="panel section-gap"><ul class="sx-rules">${rules.map(([id,r])=>`<li class="${r.active===false?'off':''}"><span class="badge ${KIND[r.kind]?.[1]||''}">${KIND[r.kind]?.[0]||'기준'}</span><p>${esc(r.text)}<small>${esc(r.source||'')}${r.by?' · '+esc(r.by):''}</small></p><label class="sx-switch"><input type="checkbox" data-sx-rule="${esc(id)}" ${r.active===false?'':'checked'}> 적용</label></li>`).join('')||'<li><p>아직 규칙이 없습니다.</p></li>'}</ul>
    <form class="sx-addrule" data-sx-form="rule"><select name="kind" aria-label="규칙 종류"><option value="avoid">피하기</option><option value="prefer">좋아함</option><option value="price">가격</option><option value="rule">기준</option></select><input name="text" maxlength="200" required placeholder="예: 반짝이 소재는 빼 줘" aria-label="새 규칙"><button type="submit" class="primary">규칙 추가</button></form></div>
    ${gallery('💗 좋아한 것',all.filter(r=>r.mark.like),'이런 결로 더 찾습니다')}${gallery('👎 디자인 별로',all.filter(r=>r.mark.design),'같은 상품·같은 결은 빼고 찾습니다')}${gallery('💸 가격 별로',all.filter(r=>r.mark.price),'이 가격대는 비싸다고 봅니다')}`;
}
function view(){
  const [label,tone]=STATUS[S.status]||STATUS.connecting,t=S.tree||{};
  const status=`<div class="sx-status ${tone}"><i></i>${esc(label)}${S.err?` · ${esc(S.err)}`:''}${t.meta?.updatedAt?` · Claude 마지막 갱신 ${esc(new Date(t.meta.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}`:''}</div>`;
  if(S.status==='denied')return status+`<div class="note error">소싱 자료를 읽을 권한이 없습니다. Firebase 규칙에 <code>sourcing</code> 칸이 열려 있어야 합니다.</div>`;
  if(!S.tree)return status+`<div class="note">소싱 자료를 불러오는 중입니다.</div>`;
  const nCart=Object.keys(t.cart||{}).length,nRule=Object.values(t.taste||{}).filter(r=>r.active!==false).length;
  const tabs=`<div class="chips">${[['items','후보 '+Object.keys(t.items||{}).length],['cart','장바구니 '+nCart],['taste','취향 규칙 '+nRule]].map(([id,l])=>`<button type="button" class="chip ${S.tab===id?'active':''}" data-sx="tab" data-id="${id}">${esc(l)}</button>`).join('')}</div>`;
  return status+tabs+(S.tab==='cart'?cartTab():S.tab==='taste'?tasteTab():itemsTab());
}
function refresh(){
  const root=document.getElementById('sx-root');if(!root)return;
  const a=document.activeElement,keep=a&&root.contains(a)&&a.id?{id:a.id,value:a.value,s:a.selectionStart,e:a.selectionEnd}:null;
  root.innerHTML=view();
  if(keep){const el=document.getElementById(keep.id);if(el){if('value' in el&&el.type!=='checkbox')el.value=keep.value;el.focus();try{if(keep.s!=null)el.setSelectionRange(keep.s,keep.e);}catch(e){}}}
}

// ---- 조작
const now=()=>new Date().toISOString();
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
    if(sx==='copy'){const ok=await copyText(el.dataset.text||'');notify(ok?'1688 옵션명을 복사했습니다 — 1688 페이지에서 Ctrl+F(휴대폰은 페이지 내 찾기)로 붙여 넣어 찾으세요.':'복사하지 못했습니다 — 회색 글자를 길게 눌러 직접 복사해 주세요.',!ok);return;}
    if(sx==='mark'){
      const m={...(S.tree?.marks?.[id]||{})},on=!m[k];
      const next={like:k==='like'?on:(on?false:!!m.like),design:k==='design'?on:(k==='like'&&on?false:!!m.design),price:k==='price'?on:(k==='like'&&on?false:!!m.price),at:now(),by:'대시보드'};
      await send('PATCH','marks/'+id,next);
    }
    if(sx==='set-mark'){
      const m={...(S.tree?.sets?.[id]?.mark||{})},on=!m[k];
      await send('PATCH','sets/'+id+'/mark',{like:k==='like'?on:(on?false:!!m.like),bad:k==='bad'?on:(on?false:!!m.bad),at:now()});
    }
    if(sx==='add'){
      const it=S.tree.items[id],o=list(it.options).find(x=>x.spec===spec),lid=id+'~'+keyOf(spec);
      const qty=Math.round(num(S.draft[lid]??document.getElementById('sx-q-'+lid)?.value));
      if(qty<1)throw Error('수량을 1개 이상 입력하세요.');
      await send('PUT','cart/'+lid,{offerId:id,spec,ko:o?.ko||'',price:num(o?.price),img:o?.img||it.img||'',weightG:o?.weightG||it.weightG||null,qty,at:S.tree?.cart?.[lid]?.at||now(),updatedAt:now()});
      delete S.draft[lid];notify(`장바구니에 담았습니다 — ${it.name} ${o?.ko||spec} ${qty}개`);
    }
    if(sx==='remove'){await send('DELETE','cart/'+id);notify('장바구니에서 뺐습니다.');}
    if(sx==='request'){
      const lines=cartLines();if(!lines.length)return;
      const total=lines.reduce((a,l)=>a+num(l.price)*num(l.qty),0),rid='r'+Date.now().toString(36);
      await send('PUT','requests/'+rid,{kind:'배대지 신청서',status:'요청',at:now(),summary:`${lines.length}줄 ${lines.reduce((a,l)=>a+num(l.qty),0)}개 · ${yuan(total)}`,lines:Object.fromEntries(lines.map(l=>[l.id,{offerId:l.offerId,spec:l.spec,ko:l.ko||'',qty:l.qty,price:l.price}]))});
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
    if(el.dataset.sxQty!=null){const q=Math.round(num(el.value));if(q<1)throw Error('수량을 1개 이상 입력하세요.');await send('PATCH','cart/'+el.dataset.sxQty,{qty:q,updatedAt:now()});}
    if(el.dataset.sxRule!=null){await send('PATCH','taste/'+el.dataset.sxRule,{active:el.checked,at:now()});}
  }catch(err){notify(err.message,true);}
}
function onInput(e){
  const el=e.target;if(!el.closest('#sx-root'))return;
  if(el.dataset.sxFilter==='q'){S.q=el.value;clearTimeout(searchTimer);searchTimer=setTimeout(refresh,160);}
  if(el.dataset.sxDraft!=null)S.draft[el.dataset.sxDraft]=el.value;
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
    document.addEventListener('click',onClick);document.addEventListener('change',onChange);document.addEventListener('input',onInput);document.addEventListener('submit',onSubmit,true);document.addEventListener('keydown',onKey);
    connect();
  }
  return ctx.head('소싱 보드','Claude가 1688에서 찾은 후보를 보고 💗·👎·💸와 한마디를 남기세요. 표시는 바로 저장되고, Claude가 다음 소싱과 발주에 반영합니다.',`<a class="inline-link" href="purchases.html">매입·원가로 ↗</a>`)+`<div id="sx-root">${view()}</div>`;
}
