// 브랜딩 도구 — 도장·잉크·포장재를 무엇으로 쓰는지, 고장 나면 같은 판매처·같은 옵션으로 다시 살 정보.
// 자료는 두 군데에서 온다.
//  ① 공개 목록 src/branding-data.js — 판매처 상품 사양·후보/권고·표시 가격·제작 규칙. 공개 저장소에 있으므로 아래 pub()에 적힌 칸만 읽는다.
//  ② 내 기록 — 이 브라우저의 비공개 장부(erp.branding). 주문번호·결제액·도안 원본 위치·시험 결과는 여기에만 있고, 공개 목록에서는 읽지 않는다.
const D=await import(`../branding-data.js?v=${document.body.dataset.build}`);
const won=n=>n==null||n===''?'':Number(n).toLocaleString('ko-KR')+'원';
const text=v=>typeof v==='string'||typeof v==='number'?String(v):'';
const PUBLIC_STATUS=['unregistered','candidate','recommended'];   // 주문 완료·수령·사용 중은 증거(발주일·수령일)가 있는 내 기록에서만 나온다
const KINDS=['도장','잉크','포장재','기타'];
// 공개 목록에서 읽는 칸(허용 목록). 여기에 없는 칸은 공개 자료에 들어 있어도 화면에도 수정 창에도 넘어가지 않는다.
function pub(it){
  const ink=it.ink||{},price=it.price||{},lines=(Array.isArray(price.lines)?price.lines:[]).filter(Array.isArray).map(([k,v])=>`${text(k)} ${won(Number(v)||0)}`);
  return {id:text(it.id),kind:KINDS.includes(it.kind)?it.kind:'기타',name:text(it.name),use:text(it.use),status:PUBLIC_STATUS.includes(it.status)?it.status:'candidate',
    vendor:text(it.vendor),productNo:text(it.productNo),url:text(it.url),model:text(it.model),shape:text(it.form),printSize:text(it.printSize),artSize:text(it.artSize),option:text(it.option),
    inkMaker:text(ink.maker),inkModel:text(ink.model),inkVolume:text(ink.volume),inkCompat:text(ink.compat),
    priceTotal:Number.isFinite(price.total)?price.total:null,priceNote:[lines.join(' + '),text(price.note)].filter(Boolean).join(' · '),priceChecked:text(price.checked),
    artNote:text(it.art?.rule),pending:(Array.isArray(it.pending)?it.pending:[]).map(text).filter(Boolean).join('\n'),caution:text(it.caution)};
}
const CATALOG=(Array.isArray(D.ITEMS)?D.ITEMS:[]).filter(it=>it&&/^[A-Za-z0-9가-힣_-]{1,40}$/.test(text(it.id))).map(pub);
export default function renderPage(ctx){
  const {C,data,state,esc,head,badge,btn,filters,matches,link}=ctx;
  const {BRAND_UPDATED,BRAND_EDITOR,BRAND_BASIS,STATUS_RULE,DONT,MAKER_RULES,ART_PLAN,REORDER_STEPS,PRIVATE_NOTE}=D;
  const LABEL=Object.fromEntries(C.BRAND_STATUS),TONE={candidate:'amber',recommended:'green',ordered:'green',received:'green',inuse:'green'};
  const blank='<span class="br-blank">확인 전</span>',none='<span class="br-blank">기록 없음</span>';
  const val=v=>v==null||v===''?blank:esc(v),mineVal=v=>v==null||v===''?none:esc(v);
  const st=s=>`<span class="badge ${TONE[s]||''}">${esc(LABEL[s]||s)}</span>`;
  const row=(k,v)=>`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  const safeUrl=u=>/^https?:\/\/[^\s"'<>]+$/.test(u||'')?u:'';
  const out=(u,label)=>safeUrl(u)?`<a class="inline-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
  const lines=t=>String(t||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const price=v=>v.priceTotal==null||v.priceTotal===''?(v.priceNote?esc(v.priceNote):blank):`<b>${won(v.priceTotal)}</b>${v.priceNote?`<span class="sub">${esc(v.priceNote)}</span>`:''}${v.priceChecked?`<span class="sub">확인일 ${esc(v.priceChecked)}</span>`:''}`;
  // 내 기록(브라우저 장부) — 취소한 기록은 화면에서 빼고, 공개 목록의 품목이면 공개 내용으로 돌아간다.
  const saved=Array.isArray(data.erp.branding)?data.erp.branding:[];
  const mine=new Map(saved.filter(r=>!r.voided).map(r=>[r.id,r])),voided=saved.filter(r=>r.voided);
  const views=[...CATALOG.map(p=>mine.has(p.id)?{...mine.get(p.id),mine:true,pub:p}:{...p,mine:false,voidedMine:voided.some(r=>r.id===p.id)}),
    ...[...mine.values()].filter(r=>!CATALOG.some(p=>p.id===r.id)).map(r=>({...r,mine:true}))];
  const shown=views.filter(v=>matches(v,['id','name','kind','use','vendor','productNo','model','option','sku']));
  const counts=Object.fromEntries(C.BRAND_STATUS.map(([k])=>[k,views.filter(v=>v.status===k).length]));
  // 공개해도 되는 재주문 정보(판매처 상품 사양)
  const pubGrid=v=>`${row('판매처',val(v.vendor))}${row('상품번호·주소',v.productNo||safeUrl(v.url)?`${esc(v.productNo||'')} ${out(v.url,'상품 화면')}`:blank)}
      ${row('모델',val(v.model))}${row('형태',val(v.shape))}${row('인쇄(인각) 크기',val(v.printSize))}${row('실제 도안 크기',val(v.artSize))}${row('옵션·색',val(v.option))}${v.sku?row('옵션 SKU',esc(v.sku)):''}
      ${v.kind==='도장'||v.kind==='잉크'||v.inkMaker||v.inkModel||v.inkVolume||v.inkCompat?row('잉크 제조사',val(v.inkMaker))+row('잉크 정확한 모델',val(v.inkModel))+row('용량',val(v.inkVolume))+row('호환 근거',val(v.inkCompat)):''}
      ${row('가격·배송비',price(v))}${v.kind==='도장'||v.artNote?row('도안 메모',val(v.artNote)):''}`;
  // 주문·도안·시험 — 내 기록에서만 읽는다(공개 목록의 값은 읽지 않는다).
  const test=r=>[r.testDate,r.testResult,r.testMaterial].filter(Boolean).map(esc).join(' · ')+(r.testNote?`<span class="sub">${esc(r.testNote)}</span>`:'');
  const mineGrid=v=>{const r=v.mine?v:{};return `${row('도안 원본 위치',r.artSource?`${esc(r.artSource)} ${out(r.artSource,'열기')}`:none)}${row('제출한 도안 버전',mineVal(r.artVersion))}${row('좌우 반전(미러링)',mineVal(r.artMirror))}
      ${row('발주일',mineVal(r.orderDate))}${row('주문번호',mineVal(r.orderNo))}${r.orderUrl?row('주문 내역',out(r.orderUrl,'주문 내역 열기')||none):''}${r.qty!=null&&r.qty!==''?row('수량',esc(r.qty)):''}${row('실제 결제액',r.paid==null||r.paid===''?none:won(r.paid))}
      ${row('수령일',mineVal(r.receivedDate))}${r.useEvidence?row('사용 근거',esc(r.useEvidence)):''}${row('수령 후 샘플 시험',test(r)||none)}${r.reorderNote?row('재주문 메모',esc(r.reorderNote)):''}`;};
  const notes=v=>`${lines(v.pending).length?`<p class="br-pending"><b>남은 확인</b> ${lines(v.pending).map(esc).join(' · ')}</p>`:''}${v.caution?`<p class="br-caution">${esc(v.caution)}</p>`:''}`;
  const actions=v=>v.mine?btn('기록 수정','edit',{type:'branding',id:v.id},'text')+btn('기록 취소','void',{type:'branding',id:v.id},'text danger')
    :v.voidedMine?`<span class="sub">취소한 내 기록이 있습니다.</span>${btn('내 기록 복구','void',{type:'branding',id:v.id},'text')}`:btn('기록하기','edit',{type:'branding',id:v.id},'text');
  const card=v=>`<article class="br-card br-${esc(v.status)}" id="${esc(v.id)}"><header><div><code class="br-id">${esc(v.id)}</code>${v.mine?'<span class="br-minetag">내 기록</span>':''}<b>${esc(v.name)}</b><span class="sub">${esc(v.kind)}${v.use?' · '+esc(v.use):''}</span></div>${st(v.status)}</header>
    ${notes(v)}<div class="br-actions">${actions(v)}</div>
    <details><summary>재주문 정보 자세히</summary><dl class="br-grid">${pubGrid(v)}</dl>
      <h3 class="br-sub">주문·도안·시험 <small>이 브라우저에만 저장</small></h3><dl class="br-grid br-mine">${mineGrid(v)}</dl>
      ${v.pub?`<details class="br-pub"><summary>공개 목록의 안내 보기 · ${esc(BRAND_UPDATED)}</summary>${notes(v.pub)}<dl class="br-grid">${pubGrid(v.pub)}</dl></details>`:''}
    </details></article>`;
  const progress=v=>v.mine?[v.orderDate&&'발주 '+v.orderDate,v.receivedDate&&'수령 '+v.receivedDate,v.testResult&&'시험 '+v.testResult].filter(Boolean).map(esc).join(' · ')||'<span class="br-blank">내 기록 있음</span>':'<span class="br-blank">—</span>';
  const kinds=[...new Set(shown.map(v=>v.kind))];
  const list=(items,ordered)=>`<${ordered?'ol':'ul'} class="br-list">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</${ordered?'ol':'ul'}>`;
  const voidedOnly=voided.filter(r=>!CATALOG.some(p=>p.id===r.id));
  return head('브랜딩 도구','도장·잉크·포장재를 무엇으로 쓰는지, 고장 나면 같은 판매처·같은 옵션으로 다시 살 수 있게 적어 둡니다.',btn('+ 품목 추가','edit',{type:'branding'},'primary'))+
  `<div class="org-meta"><span>공개 목록 갱신 <b>${esc(BRAND_UPDATED)}</b> · ${esc(BRAND_EDITOR)}</span><span>${['recommended','candidate','ordered','received','inuse','unregistered'].map(k=>badge(LABEL[k]+' '+counts[k])).join(' ')}${counts.retired?' '+badge(LABEL.retired+' '+counts.retired):''}</span></div>`+
  `<div class="note amber">${esc(STATUS_RULE)}</div>`+
  `<div class="note br-store"><b>저장 위치: 이 브라우저의 장부</b> — ${esc(PRIVATE_NOTE)} ${link('settings','설정·백업')}</div>`+
  filters('품목 ID, 이름, 판매처, 옵션 검색',[],false,true)+
  `<div class="panel section-gap"><div class="panelhead"><h2>한눈에 보기</h2></div><div class="tablewrap"><table class="table br-table"><thead><tr><th>품목 ID</th><th>무엇</th><th>용도</th><th>상태</th><th>판매처 · 상품번호</th><th class="num">확인한 금액</th><th>내 기록</th></tr></thead><tbody>${shown.length?shown.map(v=>`<tr><td><a class="inline-link" href="#${esc(v.id)}"><code class="br-id">${esc(v.id)}</code></a></td><td class="maincell"><b>${esc(v.name)}</b></td><td>${esc(v.use||'')}</td><td>${st(v.status)}</td><td>${v.vendor?`${esc(v.vendor)}${v.productNo?' · '+esc(v.productNo):''}`:blank}</td><td class="num">${v.priceTotal==null||v.priceTotal===''?blank:won(v.priceTotal)}</td><td>${progress(v)}</td></tr>`).join(''):'<tr><td colspan="7"><div class="empty"><b>조건에 맞는 품목이 없습니다.</b></div></td></tr>'}</tbody></table></div></div>`+
  kinds.map(k=>`<div class="section-title"><h2>${esc(k)}</h2></div><div class="br-cards">${shown.filter(v=>v.kind===k).map(card).join('')}</div>`).join('')+
  (state.showVoided&&voidedOnly.length?`<div class="section-title"><h2>취소한 기록</h2></div><div class="br-cards">${voidedOnly.map(r=>`<article class="br-card br-voided"><header><div><code class="br-id">${esc(r.id)}</code><b>${esc(r.name)}</b><span class="sub">${esc(r.kind)} · 취소 사유: ${esc(r.voidReason||'')}</span></div>${badge('취소')}</header><div class="br-actions">${btn('복구','void',{type:'branding',id:r.id},'text')}</div></article>`).join('')}</div>`:'')+
  `<div class="br-two"><section class="panel"><div class="panelhead"><h2>하지 말 것</h2></div><div class="panelbody">${list(DONT)}</div></section>`+
  `<section class="panel"><div class="panelhead"><h2>고장 났을 때 다시 사는 순서</h2></div><div class="panelbody">${list(REORDER_STEPS,true)}</div></section></div>`+
  `<section class="panel"><div class="panelhead"><h2>판매자 제작 규칙 · 도안 준비</h2></div><div class="panelbody">${list(MAKER_RULES)}<p class="br-art">${esc(ART_PLAN)}</p></div></section>`+
  `<div class="note">근거 — ${esc(BRAND_BASIS)}. 가격은 확인일 기준이며 재고·배송일을 약속하지 않습니다.</div>`;
}
// 공개 목록의 품목에 처음 내 기록을 만들 때 수정 창에 채워 줄 값 — 허용 목록(pub)을 거친 공개 칸만 넘긴다.
renderPage.seed=(type,id)=>type==='branding'?CATALOG.find(p=>p.id===id)||null:null;
