const buildVersion = new URL(import.meta.url).searchParams.get('v');
const buildQuery = buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : '';
const {calcProduct, calcSet, validateMaterialLinks, validateMaterialLinkUpdate, receiptAllocation, receiptCurrency, minimumRoas, FEES} = await import('./model.js' + buildQuery);
const {createMemoryStore} = await import('./store.js' + buildQuery);
const {normalizeSale, saleStatus, saleMargin} = await import('./sale-model.js' + buildQuery);

// This isolated preview deliberately contains fictional examples only.
// It never fetches or writes an operations ledger.
const exampleProducts = [
  {id:'demo-p1',name:'예시 인형',image:'🧸',batch:'1차',channels:['자사몰','스마트스토어'],kind:'인형',status:'판매 중',stock:62,salePrice:12000,priceStatus:'제안',receipts:[{batch:1,quantity:100,saleQuantity:100,eventQuantity:0,unitCost:4200,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[{materialId:'demo-m1',quantity:1,always:true}]},
  {id:'demo-p2',name:'예시 파우치',image:'👜',batch:'1차',channels:['자사몰'],kind:'생활',status:'판매 준비',stock:35,salePrice:9800,priceStatus:'제안',receipts:[{batch:1,quantity:50,saleQuantity:50,eventQuantity:0,unitCost:3100,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[{materialId:'demo-m2',quantity:1,always:true}]},
  {id:'demo-p3',name:'예시 열쇠고리',image:'🔑',batch:'2차',channels:['스마트스토어'],kind:'소품',status:'판매 중',stock:12,salePrice:7500,priceStatus:'제안',receipts:[{batch:2,quantity:40,saleQuantity:40,eventQuantity:0,unitCost:2600,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[]},
  {id:'demo-p4',name:'예시 손수건',image:'🧣',batch:'2차',channels:['자사몰','스마트스토어'],kind:'생활',status:'확인 필요',stock:null,salePrice:null,priceStatus:'제안',receipts:[],links:[]},
];
const exampleMaterials = [
  {id:'demo-m1',name:'예시 상품 택',kind:'item',unitCost:80,stock:140,minStock:40},
  {id:'demo-m2',name:'예시 스티커',kind:'item',unitCost:30,stock:25,minStock:50,imageData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg=='},
  {id:'demo-m3',name:'예시 포장 봉투',kind:'pack',unitCost:120,stock:70,minStock:20},
];
const exampleSets = [{id:'demo-s1',name:'예시 선물 세트',components:[{id:'demo-p1',quantity:1},{id:'demo-p2',quantity:1}],materials:[{materialId:'demo-m3',quantity:1}],salePrice:19500,priceStatus:'제안'}];
const isLive = Boolean(window.__MMT_V5_FRESH_STORE__);
const store = window.__MMT_V5_FRESH_STORE__ || createMemoryStore({products:exampleProducts,materials:exampleMaterials,sets:exampleSets});
let {products,materials,sets} = await store.load();
async function reload(){({products,materials,sets}=await store.load());}
const state = {tab:'p',filters:{batch:new Set(),channel:new Set(),kind:new Set(),status:new Set()},saleFilter:'전체',saleBusy:false,openProduct:null,openSale:new Set(),saleMessages:new Map(),saleDrafts:new Map(),saleUncertain:new Set(),sort:'name',includeMaterials:true,channel:'smart',openDetails:new Set(),openLinks:new Set(),linkMessage:'',editReceipt:new Map(),editReceiptRevision:new Map(),editMaterial:null,editMaterialRevision:null,editMaterialCurrency:null,draft:{items:{},materials:{}}};
const saleEditRevision = new WeakMap();
const revision = () => typeof store.revision === 'function' ? store.revision() : undefined;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '확인 필요';
const money = v => typeof v === 'number' && Number.isFinite(v) ? fmt(v)+'원' : '확인 필요';
const receiptMoney = (v,currency) => typeof v === 'number' && Number.isFinite(v) && currency === 'CNY' ? `${v.toLocaleString('ko-KR',{maximumFractionDigits:2})}위안` : currency === 'KRW' ? money(v) : typeof v === 'number' && Number.isFinite(v) ? '통화 확인 필요' : '확인 필요';
const pct = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v)+'%' : '확인 필요';
const productCostText = (calc, field='unitCost') => typeof calc?.[field] === 'number' && Number.isFinite(calc[field]) ? money(calc[field]) : `원가 없음 — ${calc?.costReason || '구성 원가 기록 없음'}`;
const pendingCostText = calc => [...(Array.isArray(calc?.costBases) ? calc.costBases : []), ...(Array.isArray(calc?.costNotes) ? calc.costNotes : []), calc?.pendingExpenses ? `${calc.costBatch ? `${calc.costBatch}차 ` : ''}남은 비용 대기` : ''].filter(Boolean).join(' · ');
const options = () => ({includeMaterials:state.includeMaterials,channel:state.channel});
const calculate = p => calcProduct(p,materials,options());
const canViewCost = () => typeof store.canViewMargin==='function' && store.canViewMargin();
const byId = id => products.find(p=>p.id===id);
const groups = [
  {key:'batch',label:'입고',values:['1차','2차']},
  {key:'channel',label:'판매처',values:['자사몰','스마트스토어','쿠팡']},
  {key:'kind',label:'종류',values:['인형','생활','소품','기타']},
  {key:'status',label:'상태',values:['판매 중','판매 준비','배송 중','배대지 창고','구매취소','확인 필요']},
];
const saleFilters = ['전체','미정','판매 확정 미등록','등록 완료','보류/안 팜'];
const saleChannels = [['own','자사몰'],['smart','스마트스토어'],['coupang','쿠팡']];
function roasClass(v) { return v === null || v === undefined ? 'b' : v <= 250 ? 'g' : v <= 400 ? 'w' : 'b'; }
function renderSaleFilters(){
  const batch=state.filters.batch;
  const base=products.filter(p=>!batch.size || (Array.isArray(p.batch)?p.batch:[p.batch]).some(x=>batch.has(x)));
  const counts=Object.fromEntries(saleFilters.map(label=>[label,label==='전체'?base.length:base.filter(p=>saleStatus(p.sale)===label).length]));
  $('sale-filters').innerHTML=`<div class="sale-filter-heading"><h2>판매 준비</h2><span>판매할 상품을 고르고 등록 상태를 기록해요</span></div><div class="sale-filter-tabs" role="group" aria-label="판매 준비 상태">${saleFilters.map(label=>`<button type="button" class="sale-filter" data-sale-filter="${esc(label)}" aria-pressed="${state.saleFilter===label}">${esc(label)} <span>${counts[label]}</span></button>`).join('')}</div>`;
}
function renderFilters(){
  $('filters').innerHTML = groups.map(g=>`<div class="frow"><span class="flabel">${esc(g.label)}</span>${g.values.map(v=>`<button type="button" class="chip" data-group="${g.key}" data-value="${esc(v)}" aria-pressed="${state.filters[g.key].has(v)}">${esc(v)}</button>`).join('')}</div>`).join('')+
    `<div class="opts"><label>정렬 <select id="sort"><option value="name">이름</option>${canViewCost()?'<option value="roas">최소 ROAS</option>':''}<option value="sell">소진율</option>${canViewCost()?'<option value="earned">번 돈</option>':''}</select></label>
      <span>수수료 기준 <span class="seg"><button type="button" data-channel="smart" aria-pressed="${state.channel==='smart'}">스마트스토어</button><button type="button" data-channel="own" aria-pressed="${state.channel==='own'}">자사몰</button></span></span>
      <label><input type="checkbox" id="material-cost" ${state.includeMaterials?'checked':''}> 부자재 원가 포함</label><button type="button" class="btn" id="clear-filters">초기화</button></div>`;
  $('sort').value=state.sort;
}
function matching(p){return (state.saleFilter==='전체'||saleStatus(p.sale)===state.saleFilter)&&groups.every(g=>{const selected=state.filters[g.key];if(!selected.size)return true;if(g.key==='status')return selected.has(p.status)||(p.receipts||[]).some(r=>selected.has(r.status));const value=g.key==='channel'?p.channels:p[g.key];return Array.isArray(value)?value.some(v=>selected.has(v)):selected.has(value);});}
function ordered(list){
  return [...list].sort((a,b)=>{
    if(state.sort==='name')return a.name.localeCompare(b.name,'ko');
    const ma=calculate(a),mb=calculate(b);
    const va=state.sort==='roas'?ma.roas[state.channel]:state.sort==='sell'?ma.sellRate:ma.earned;
    const vb=state.sort==='roas'?mb.roas[state.channel]:state.sort==='sell'?mb.sellRate:mb.earned;
    if(va==null)return vb==null?a.name.localeCompare(b.name,'ko'):1;
    if(vb==null)return -1;
    return state.sort==='roas'?va-vb:vb-va;
  });
}
function picture(p){
  const image = typeof p.imageData==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(p.imageData) ? `<img alt="" src="${esc(p.imageData)}">` : `<span class="preview-image" aria-hidden="true">${esc(p.image||'◇')}</span>`;
  return `<div class="thumb" aria-hidden="true">${image}</div>`;
}
function receiptPanel(p){
  if(!state.openDetails.has(p.id))return '';
  const receipts=Array.isArray(p.receipts)?p.receipts:[];
  const edit=state.editReceipt.get(p.id);
  const current=edit==='new'?{batch:receipts.length+1}:Number.isInteger(edit)?receipts[edit]:null;
  const form=current?`<form class="receipt-form" data-receipt-form="${esc(p.id)}" data-index="${edit==='new'?'new':edit}"><h4>${edit==='new'?'입고 기록 추가':'입고 기록 수정'}</h4>
    <label>차수 <input type="number" name="batch" min="1" max="999" step="1" required value="${esc(current.batch??'')}"></label>
    <label>입고일 <input type="date" name="date" value="${esc(current.date??'')}"></label><label>발주일 <input type="date" name="orderDate" value="${esc(current.orderDate??'')}"></label>
    <label>상태 <select name="status">${['','입고 완료','배송 중','배대지 창고','구매취소','확인 필요'].map(s=>`<option value="${esc(s)}" ${s===(current.status||'')?'selected':''}>${esc(s||'선택 안 함')}</option>`).join('')}</select></label>
    <label>판매처 <input type="text" name="supplier" maxlength="100" value="${esc(current.supplier??'')}"></label>
    <label>1688 링크 <input type="url" name="url" placeholder="https://...1688.com/..." value="${esc(current.url??'')}"></label>
    <label>단가 통화 <select name="currency" required>${receiptCurrency(current)===null?'<option value="" selected disabled>통화 확인 필요</option>':''}<option value="KRW" ${receiptCurrency(current)==='KRW'?'selected':''}>원 (KRW)</option><option value="CNY" ${receiptCurrency(current)==='CNY'?'selected':''}>위안 (CNY)</option></select></label><label>개당 단가 <input type="number" name="unitCost" min="0" step="0.01" value="${esc(current.unitCost??'')}"></label>
    <label>원화 결제액 <input type="number" name="settlementKrw" min="0" step="1" value="${esc(current.settlementKrw??'')}"></label>
    <label>들어온 수 <input type="number" name="quantity" min="0" step="1" required value="${esc(current.quantity??'')}"></label>
    <label>판매용 <input type="number" name="saleQuantity" min="0" step="1" required value="${esc(current.saleQuantity??'')}"></label>
    <label>이벤트/불량용 <input type="number" name="eventQuantity" min="0" step="1" required value="${esc(current.eventQuantity??'')}"></label>
    <label>메모 <textarea name="memo" maxlength="500" rows="2">${esc(current.memo??'')}</textarea></label>
    <p class="receipt-error" role="alert"></p><div class="acts"><button type="submit" class="btn pri">기록 저장</button><button type="button" class="btn" data-receipt-cancel>취소</button></div>
    <p class="hint">${isLive?'새 상품 장부에 저장되며 판매 수량은 바뀌지 않아요.':'미리보기에서만 바뀌며 실제 재고는 변경되지 않아요.'}</p></form>`:'';
  return `<section class="panel"><h4>입고 기록</h4>${receipts.length?`<div class="record-list">${receipts.map((r,i)=>{
    let url='';try{const u=new URL(r.url);if(u.protocol==='https:'&&(u.hostname==='1688.com'||u.hostname.endsWith('.1688.com')))url=u.href;}catch{}
    const allocation=receiptAllocation(r), currency=receiptCurrency(r);
    const eventCost=allocation&&typeof r.unitCost==='number'&&Number.isFinite(r.unitCost)&&r.unitCost>=0?allocation.eventQuantity*r.unitCost:null;
    return `<div class="record"><strong>${esc(r.batch??(i+1))}차 · 입고일 ${esc(r.date||'확인 필요')} · ${esc(r.status||'상태 확인 필요')}</strong><small>발주일 ${esc(r.orderDate||'확인 필요')} · ${esc(r.supplier||'-')} · 개당 ${r.unitCost==null?'-':receiptMoney(r.unitCost,currency)}</small><small>원화 결제액 ${money(r.settlementKrw)}</small>${r.orderedQuantity==null?'':`<small>주문 수 ${fmt(r.orderedQuantity)}</small>`}<small>들어온 수 ${fmt(r.quantity)} · 판매용 ${fmt(r.saleQuantity)} · 이벤트/불량용 ${fmt(r.eventQuantity)}</small><small>이벤트에 쓴 원가 ${eventCost===null?'확인 필요':receiptMoney(eventCost,currency)}</small>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">1688 상품 보기</a>`:'<small>1688 링크 -</small>'}<small>${esc(r.memo||'')}</small><button type="button" class="btn" data-receipt-edit="${i}">수정</button></div>`;
  }).join('')}</div>`:'<p class="empty">입고 기록을 확인해 주세요.</p>'}<button type="button" class="btn" data-receipt-add>입고 기록 추가</button>${form}</section>`;
}
function materialThumb(m){
  const has=typeof m?.imageData==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(m.imageData);
  return {has,html:`<span class="product-row-photo" aria-hidden="true">${has?`<img src="${esc(m.imageData)}" alt="">`:''}</span>`};
}
function linksPanel(p){
  if(!state.openLinks.has(p.id))return '';
  const links=Array.isArray(p.links)?p.links:[];
  const linked=links.map((link,index)=>{
    const material=materials.find(m=>m.id===link?.materialId);
    const valid=validateMaterialLinks([link],materials).valid;
    const label=material?.name||'연결 정보 없음';
    const kind=['item','상품에 붙음'].includes(material?.kind)?'상품에 붙음':['pack','포장'].includes(material?.kind)?'포장':material?.kind==='부자재'?'부자재':'종류 확인 필요 · 합계 제외';
    const thumb=materialThumb(material);
    return `<div class="lrow">${thumb.html}<span class="nm">${esc(label)}<small>${esc(valid?kind:'종류 확인 필요 · 합계 제외')}${thumb.has?'':' · 사진 없음'}</small></span><div class="lctl">${valid?`<label>1개당 <input type="number" min="1" max="999" value="${esc(link.quantity)}" data-link-quantity="${esc(material.id)}" aria-label="${esc(label)} 1개당 개수"></label>`:''}<button type="button" class="btn" data-unlink="${esc(link?.materialId||'')}" data-unlink-index="${index}">연결 해제</button></div></div>`;
  });
  const available=materials.filter(m=>!links.some(l=>l?.materialId===m.id)&&validateMaterialLinks([{materialId:m.id,quantity:1,always:true}],materials).valid);
  const choices=available.map(m=>{
    const thumb=materialThumb(m);
    return `<div class="lrow">${thumb.html}<span class="nm">${esc(m.name)}<small>${['item','상품에 붙음'].includes(m.kind)?'상품에 붙음':['pack','포장'].includes(m.kind)?'포장':'부자재'}${thumb.has?'':' · 사진 없음'}</small></span><div class="lctl"><button type="button" class="btn" data-link="${esc(m.id)}">연결</button></div></div>`;
  });
  return `<dialog class="panel links-dialog" aria-labelledby="links-title"><div class="links-head"><h3 id="links-title">부자재 연결</h3><button type="button" class="btn" data-links-close>닫기</button></div><p class="hint">등록된 부자재만 고를 수 있어요. 실제 재고는 바뀌지 않습니다.</p><p role="alert" class="links-error">${esc(state.linkMessage)}</p>${linked.length?`<h4>연결됨</h4>${linked.join('')}`:''}${choices.length?`<h4>연결할 부자재</h4>${choices.join('')}`:!linked.length?'<p class="empty">연결할 부자재가 없어요 — 부자재 탭에서 종류를 부자재로 설정해 주세요.</p>':''}</dialog>`;
}
function saleMarginRows(p,sale){
  if (!canViewCost()) return '<p class="sale-margin-note">마진 표시 설정 확인 필요</p>';
  const costResult=calculate(p),cost=costResult.partialCost?null:costResult.cost;
  return `<div class="sale-margins"><strong>마진 보기</strong><small>판매가 − ${costResult.provisional?'잠정 원가':'확인된 원가'} · 수수료 제외</small>${saleChannels.map(([key,label])=>{
    const result=saleMargin(sale,key,cost,true);
    return `<div><span>${esc(label)}</span><span>${result.margin===null?'확인 필요':`${money(result.margin)} · ${pct(result.marginRate)}`}</span></div>`;
  }).join('')}</div>`;
}
function salePanel(p){
  const sale=normalizeSale(p.sale), status=state.saleMessages.get(p.id)||'';
  return `<section class="sale-prep" aria-label="${esc(p.name)} 판매 준비">
    <div class="sale-prep-head"><div><strong>판매 준비</strong><span class="sale-step">${esc(saleStatus(sale))}</span></div><span class="sale-save-status" role="status" aria-live="polite" data-sale-save-status>${esc(status)}</span></div>
    <div class="sale-decision"><span>판매 결정</span><div class="sale-decisions" role="group" aria-label="${esc(p.name)} 판매 결정">${['미정','판매','보류','안 팜'].map(v=>`<button type="button" data-sale-decision="${v}" aria-pressed="${v===sale.decision}">${v}</button>`).join('')}</div></div>
    <details data-sale-details ${state.openSale.has(p.id)?'open':''}><summary>판매가 · 온라인 등록</summary>
      <div class="sale-fields"><p class="sale-field-hint">스마트스토어·쿠팡 가격을 비우면 자사몰 가격과 같아요.</p>
      ${saleChannels.map(([key,label])=>`<label>${label} 판매가 <span class="sale-input"><input type="number" inputmode="numeric" min="0" step="1" data-sale-price="${key}" aria-label="${esc(p.name)} ${label} 판매가" placeholder="${key==='own'?'가격 입력':'자사몰과 같음'}" value="${sale.prices[key]??''}"><span>원</span></span></label>`).join('')}
      ${saleMarginRows(p,sale)}
      <div class="sale-listings"><h4>온라인 등록</h4>${saleChannels.map(([key,label])=>{const l=sale.listings[key];return `<div class="sale-listing"><label class="sale-check"><input type="checkbox" data-sale-registered="${key}" aria-label="${esc(p.name)} ${label} 등록" ${l.registered?'checked':''}> ${label} 등록</label><label>${label} 상품 주소 <input type="url" inputmode="url" data-sale-url="${key}" aria-label="${esc(p.name)} ${label} 상품 주소" placeholder="https://" value="${esc(l.url)}"></label><label>상세 준비 <select data-sale-detail="${key}" aria-label="${esc(p.name)} ${label} 상세 준비">${['없음','만드는 중','완료'].map(v=>`<option value="${v}" ${l.detail===v?'selected':''}>${v}</option>`).join('')}</select></label></div>`;}).join('')}</div></div>
    </details></section>`;
}
const decisionClass = value => ({'미정':'undecided','판매':'sell','보류':'hold','안 팜':'no-sale'}[value] || 'undecided');
function rowSummary(p){
  const sale=normalizeSale(p.sale);
  const img=typeof p.imageData==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(p.imageData)
    ? `<img src="${esc(p.imageData)}" alt="">` : '';
  const batch=Array.isArray(p.batch)?p.batch.join(' · '):p.batch||'';
  const shortBatch=Array.isArray(p.batch)&&p.batch.length>1&&p.batch.every(x=>/^\d+차$/.test(x))?p.batch.map(x=>x.slice(0,-1)).join('·')+'차':batch;
  const channel=sale.prices.own!==null?'own':sale.prices.smart!==null?'smart':null;
  const price=channel===null?null:sale.prices[channel];
  const showCost=canViewCost();
  const calc=showCost?calculate(p):null;
  const cost=calc?.unitCost ?? null;
  const roas=showCost && channel!==null&&!calc.partialCost?minimumRoas(price,calc.cost,FEES[channel]):null;
  const colour=roasClass(roas), colourLabel=roas===null?'확인 필요':colour==='g'?'초록':colour==='w'?'주황':'빨강';
  const marks=[['own','자','자사몰'],['smart','스','스마트스토어'],['coupang','쿠','쿠팡']].map(([key,short,label])=>{
    const on=sale.listings[key].registered;
    return `<span class="market-mark ${on?'is-on':''}" data-market="${key}" role="img" aria-label="${label} ${on?'등록됨':'등록 표시 없음'}">${short}</span>`;
  }).join('');
  const costCell=showCost?`<span class="product-row-cost" aria-label="${esc(productCostText(calc))}${pendingCostText(calc)?` · ${esc(pendingCostText(calc))}`:''}" title="${esc(productCostText(calc))}${pendingCostText(calc)?` · ${esc(pendingCostText(calc))}`:''}"><small>${cost===null&&calc.costReason==='통화 확인 필요'?'통화 확인 필요':calc.provisional?'원가 · 잠정':'원가'}</small><span>${esc(cost===null?'—':money(cost))}</span>${calc.partialCost?`<small class="product-cost-note">${calc.issues.includes('부자재 통화 확인 필요')?'통화 확인 필요':'부자재 확인 필요'}</small>`:calc.costNotes?.length?`<small class="product-cost-note">${calc.costNotes.some(note=>note.includes('추가'))?'추가비용 확인':'비용 확인'}</small>`:''}</span>`:'<span class="product-row-cost-placeholder" aria-hidden="true"></span>';
  const roasCell=showCost?`<span class="product-row-roas ${colour}" role="img" aria-label="최소 ROAS ${colourLabel}" title="최소 ROAS ${colourLabel}"></span>`:'<span class="product-row-roas-placeholder" aria-hidden="true"></span>';
  return `<span class="product-row-photo" aria-hidden="true">${img}</span><span class="product-row-name" title="${esc(p.name)}">${esc(p.name)}</span><span class="product-row-batch" aria-label="${esc(batch||'차수 미확인')}">${esc(shortBatch||'–')}</span><span class="product-row-decision ${decisionClass(sale.decision)}">${esc(sale.decision)}</span>${costCell}<span class="product-row-price" aria-label="${channel==='own'?'자사몰':channel==='smart'?'스마트스토어':''} 판매가 ${esc(price===null?'없음':money(price))}"><small>${channel==='own'?'자사몰':channel==='smart'?'스스':'판매가'}</small><span>${esc(price===null?'판매가 없음':money(price))}</span></span>${roasCell}<span class="product-row-market">${marks}</span><span class="product-row-arrow" aria-hidden="true">⌄</span>`;
}
function updateRowSummary(card,p){
  const button=card?.querySelector('[data-product-toggle]');
  if(button)button.innerHTML=rowSummary(p);
}
function card(p){
  const c=calculate(p),rate=c.sellRate,bar=rate==null?0:Math.max(0,Math.min(100,rate));
  const showCost=canViewCost();
  const attached=(p.links||[]).filter(x=>x.always).map(l=>{const m=materials.find(x=>x.id===l.materialId);return m?`${m.name} ×${l.quantity}`:'연결 확인 필요';});
  const open=state.openProduct===p.id, detailId=`product-detail-${p.id}`;
  return `<article class="card product-row" data-product="${esc(p.id)}"><button type="button" class="product-row-toggle" data-product-toggle aria-expanded="${open}" aria-controls="${esc(detailId)}">${rowSummary(p)}</button><div class="product-detail" id="${esc(detailId)}" ${open?'':'hidden'}><div class="ctop"><div class="cname">${picture(p)}<span>${esc(p.name)}</span></div><div class="tags"><span class="pill t-batch">${esc(Array.isArray(p.batch)?p.batch.join(' · '):p.batch)}</span><span class="pill st-on">${esc(p.status)}</span>${(p.receipts||[]).some(r=>r.status==='확인 필요')?'<span class="pill st-hold">입고 확인 필요</span>':''}</div></div>
    <div class="chs">${esc((p.channels||[]).join(' · ')||'판매처 확인 필요')}</div>
    <div class="nums">${showCost?`<div class="num"><div class="k">원가${c.provisional?' · 잠정':''}</div><div class="v">${c.cost===null?esc(c.costReason||'확인 필요'):money(c.cost)}</div><div class="s">${state.includeMaterials?'부자재 포함':'부자재 제외'}${c.partialCost?(c.issues.includes('부자재 통화 확인 필요')?' · 부자재 통화 확인 필요':' · 일부 부자재 제외 · 확인 필요'):''}${pendingCostText(c)?` · 원가 기준: ${esc(pendingCostText(c))}`:''}</div></div>`:''}
    <div class="num"><div class="k">기존 계산 기준가 <span class="ps ${p.priceStatus==='확정'?'확정':'제안'}">${esc(p.priceStatus||'제안')}</span></div><div class="v">${money(c.price)}</div></div>
    ${showCost?`<div class="num"><div class="k">기존 기준 최소 ROAS</div><div class="roas"><div><span class="c">스스</span><span class="${roasClass(c.roas.smart)}">${pct(c.roas.smart)}</span></div><div><span class="c">자사몰</span><span class="${roasClass(c.roas.own)}">${pct(c.roas.own)}</span></div></div></div>`:''}</div><p class="sale-legacy-note">기존 계산 기준가는 아래 판매 준비 가격과 별도예요.</p>
    <div class="sell"><div class="row"><span>소진율 ${pct(rate)}</span><span>판매용 ${fmt(c.saleReceived)} · 재고 ${fmt(c.stock)}</span></div><div class="bar"><i class="g" style="width:${bar}%"></i></div></div>
    ${showCost?`<div class="earn"><span>기존 기준 번 돈</span><b>${money(c.earned)}</b><small>판매용과 현재 재고 차이 · ${state.channel==='smart'?'스마트스토어':'자사몰'} 수수료 기준</small></div>`:''}
    ${salePanel(p)}<div class="mats">${attached.length?attached.map(x=>`<span class="mtag">${esc(x)}</span>`).join(''):'<span class="example-note">연결된 부자재 없음</span>'}</div>
    <div class="acts">${showCost?`<button type="button" class="btn" data-action="details" aria-expanded="${state.openDetails.has(p.id)}">자세히 (입고 기록)</button>`:''}<button type="button" class="btn" data-action="links" aria-expanded="${state.openLinks.has(p.id)}">부자재 연결</button><label class="btn file-control">누끼 사진 선택<input type="file" data-photo-product="${esc(p.id)}" accept="image/png,image/jpeg,image/webp" aria-label="${esc(p.name)} 누끼 사진 선택"></label></div>${showCost?receiptPanel(p):''}${linksPanel(p)}</div></article>`;
}
function renderProducts(){
  const shown=ordered(products.filter(matching));
  $('sum-p').innerHTML=`<span>상품 <b>${shown.length}</b>개</span><span>${isLive?'새 상품 장부':'금액과 상품은 가상의 예시'}</span>`;
  $('grid-p').innerHTML=shown.length?shown.map(card).join(''):'<div class="empty-card">조건에 맞는 상품이 없어요. 필터를 바꿔 주세요.</div>';
  if(state.editReceipt.size)for(const control of $('grid-p').querySelectorAll('[data-sale-decision],[data-sale-price],[data-sale-registered],[data-sale-url],[data-sale-detail],[data-photo-product],[data-link-quantity]'))control.disabled=true;
  const dialog=$('grid-p').querySelector('.links-dialog');
  if(dialog){
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeLinks();});
    dialog.showModal();
  }
}
function closeLinks(){
  const id=state.openProduct;
  state.openLinks.clear();state.linkMessage='';renderProducts();
  if(id)document.querySelector(`#grid-p [data-product="${CSS.escape(id)}"] [data-action="links"]`)?.focus({preventScroll:true});
}
function setCard(s){
  const c=calcSet(s,products,materials,options());
  const showCost=canViewCost();
  const names=(s.components||[]).map(x=>`${byId(x.id)?.name||'구성품 확인 필요'} ×${x.quantity}`).join(' · ');
  const packaging=(s.materials||[]).map(x=>`${materials.find(m=>m.id===x.materialId)?.name||'부자재 확인 필요'} ×${x.quantity}`).join(' · ');
  return `<article class="card"><div class="ctop"><div class="cname">${esc(s.name)}</div><div class="tags"><span class="pill st-set">세트</span></div></div><div class="chs">${esc(names)}</div><div class="nums">${showCost?`<div class="num"><div class="k">세트 원가</div><div class="v">${money(c.cost)}</div>${c.partialCost?`<div class="s">${c.issues.includes('부자재 통화 확인 필요')?'부자재 통화 확인 필요':'일부 부자재 제외 · 확인 필요'}</div>`:''}</div>`:''}<div class="num"><div class="k">판매가</div><div class="v">${money(c.price)}</div></div><div class="num"><div class="k">세트 재고</div><div class="v">${fmt(c.stock)}</div></div></div><div class="chs">포장: ${esc(packaging||'연결 없음')}</div>${showCost?`<div class="chs">최소 ROAS · 스스 ${pct(c.roas.smart)} · 자사몰 ${pct(c.roas.own)}</div>`:''}</article>`;
}
function renderSetForm(){
  $('sf-items').innerHTML='<legend>구성품 고르기</legend>'+products.map(p=>`<div class="pickrow"><label><input type="checkbox" data-pick-product="${esc(p.id)}" ${state.draft.items[p.id]?'checked':''}> ${esc(p.name)}</label>${state.draft.items[p.id]?`<input type="number" min="1" max="999" value="${state.draft.items[p.id]}" data-quantity-product="${esc(p.id)}" aria-label="${esc(p.name)} 개수">`:''}</div>`).join('');
  const packing=materials.filter(m=>m.kind==='pack'||m.kind==='부자재');
  $('sf-pack').innerHTML='<legend>세트 부자재 고르기</legend>'+(packing.length?packing.map(m=>`<div class="pickrow"><label><input type="checkbox" data-pick-pack="${esc(m.id)}" ${state.draft.materials[m.id]?'checked':''}> ${esc(m.name)}</label>${state.draft.materials[m.id]?`<input type="number" min="1" max="999" value="${state.draft.materials[m.id]}" data-quantity-pack="${esc(m.id)}" aria-label="${esc(m.name)} 개수">`:''}</div>`).join(''):'<p class="empty">등록된 포장 부자재가 없어요.</p>');
  updateSetCalculation();
}
function draftSet(){return {name:$('sf-name').value.trim(),salePrice:$('sf-price').value===''?null:Number($('sf-price').value),components:Object.entries(state.draft.items).map(([id,quantity])=>({id,quantity})),materials:Object.entries(state.draft.materials).map(([materialId,quantity])=>({materialId,quantity}))};}
function updateSetCalculation(){
  const draft=draftSet(); if(!draft.components.length){$('sf-calc').innerHTML='<span class="empty">구성품을 1개 이상 골라 주세요.</span>';return;}
  const c=calcSet(draft,products,materials,options());
  $('sf-calc').innerHTML=`${canViewCost()?`<div class="num"><div class="k">세트 원가</div><div class="v">${money(c.cost)}</div>${c.partialCost?`<div class="s">${c.issues.includes('부자재 통화 확인 필요')?'부자재 통화 확인 필요':'일부 부자재 제외 · 확인 필요'}</div>`:''}</div><div class="num"><div class="k">최소 ROAS(스스)</div><div class="v">${pct(c.roas.smart)}</div></div>`:''}<div class="num"><div class="k">만들 수 있는 수</div><div class="v">${fmt(c.stock)}</div></div>`;
}
function renderSets(){ $('sum-s').innerHTML=`<span>세트 <b>${sets.length}</b>개</span><span>세트 재고는 구성품 중 가장 적게 만들 수 있는 수량이에요.</span>`; $('grid-s').innerHTML=sets.map(setCard).join('');renderSetForm(); }
function materialPurchaseLink(value){
  let url='';
  try{const u=new URL(value);if(u.protocol==='https:'&&(u.hostname==='1688.com'||u.hostname.endsWith('.1688.com'))&&!u.username&&!u.password&&!u.port)url=u.href;}catch{}
  return url?` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">1688 상품 보기</a>`:'';
}
function renderMaterials(){
  const showCost=canViewCost();
  const isLow=m=>Number.isFinite(m.stock)&&Number.isFinite(m.minStock)&&m.stock<m.minStock;
  const low=materials.filter(isLow);
  $('mform').hidden=!showCost;
  $('sum-m').innerHTML=`<span>부자재 <b>${materials.length}</b>종</span><span>부족 <b>${low.length}</b>종</span>`;
  $('tbl-m').innerHTML='<thead><tr><th>사진</th><th>부자재</th><th>종류</th><th>단가</th><th>남은 수량</th><th>부족 기준</th><th>연결된 곳</th></tr></thead><tbody>'+materials.map(m=>{
    const used=products.filter(p=>(p.links||[]).some(l=>l.materialId===m.id)).length+sets.filter(s=>(s.materials||[]).some(l=>l.materialId===m.id)).length;
    const entries=Array.isArray(m.receipts)?m.receipts:[];
    const history=entries.length?`<details><summary>입고 기록 ${entries.length}건</summary>${entries.map(r=>`<p>${esc(r.batch)}차 · ${esc(r.status||'상태 확인 필요')} · 입고일 ${esc(r.date||'확인 필요')}${showCost?` · 원화 결제액 ${money(r.settlementKrw)}`:''}${r.orderedQuantity==null?'':` · 주문 ${fmt(r.orderedQuantity)}개`} ${showCost?esc(r.memo||''):''}${materialPurchaseLink(r.url)}</p>`).join('')}</details>`:'';
    const photo=typeof m.imageData==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(m.imageData)?`<img src="${esc(m.imageData)}" alt="">`:'';
    return `<tr class="${isLow(m)?'low':''}"><td><span class="product-row-photo" aria-hidden="true">${photo}</span></td><td>${esc(m.name)} ${isLow(m)?'<span class="pill st-hold">부족</span>':''}${history}</td><td>${m.kind==='item'?'상품에 붙음':m.kind==='pack'?'포장':m.kind==='부자재'?'부자재':m.kind==='상품'?'상품':'확인 필요'}</td><td class="n">${showCost?receiptMoney(m.unitCost,receiptCurrency(m)):'–'}</td><td class="n">${m.stock==null?'확인 필요':fmt(m.stock)+'개'}</td><td class="n">${m.minStock==null?'확인 필요':fmt(m.minStock)+'개'}</td><td class="n">${used}곳 ${showCost?`<button type="button" class="btn" data-edit-material="${esc(m.id)}" aria-label="${esc(m.name)} 수정">수정</button>`:''}</td></tr>`;
  }).join('')+'</tbody>';
}
function render(){
  for(const t of ['p','s','m']){$('view-'+t).hidden=state.tab!==t;$('tab-'+t).setAttribute('aria-selected',String(state.tab===t));}
  $('cnt-p').textContent=products.length;$('cnt-s').textContent=sets.length;$('cnt-m').textContent=materials.length;
  if(state.tab==='p'){renderSaleFilters();renderFilters();renderProducts();}else if(state.tab==='s')renderSets();else renderMaterials();
}
const saleInputs='[data-sale-decision],[data-sale-price],[data-sale-registered],[data-sale-url],[data-sale-detail]';
function saleMessage(card,text,isError=false){
  const el=card?.querySelector('[data-sale-save-status]');
  if(el){el.textContent=text;el.classList.toggle('is-error',isError);}
}
function syncSaleLocks(){
  const draft=state.saleDrafts.values().next().value;
  for(const control of document.querySelectorAll(saleInputs+', [data-sale-filter]')) control.disabled=state.saleBusy||Boolean(draft&&control!==draft);
}
function saleFailure(t,text,uncertain=false){
  const card=t.closest('[data-product]'),id=card?.dataset.product;
  uncertain=uncertain||state.saleUncertain.has(id);
  const message=(uncertain?'저장 여부 확인 필요: ':'저장되지 않음: ')+text;
  state.saleMessages.set(id,message);saleMessage(card,message,true);
  if(uncertain)state.saleUncertain.add(id);
  if(t.matches('button'))return;
  state.saleDrafts.set(id,t);t.setAttribute('aria-invalid','true');
  const el=card?.querySelector('[data-sale-save-status]');
  if(el){const cancel=document.createElement('button');cancel.type='button';cancel.dataset.saleDiscard='';cancel.textContent='입력 취소';el.append(' ',cancel);}
  syncSaleLocks();
}
function discardSaleDraft(id){
  const target=state.saleDrafts.get(id),p=byId(id);if(!target||!p)return;
  const sale=normalizeSale(p.sale);
  if(target.dataset.salePrice)target.value=sale.prices[target.dataset.salePrice]??'';
  else if(target.dataset.saleRegistered)target.checked=sale.listings[target.dataset.saleRegistered].registered;
  else if(target.dataset.saleUrl)target.value=sale.listings[target.dataset.saleUrl].url;
  else if(target.dataset.saleDetail)target.value=sale.listings[target.dataset.saleDetail].detail;
  const message=state.saleUncertain.has(id)?'입력을 취소했어요. 저장 여부는 다시 불러와 확인해 주세요.':'입력을 취소했어요.';
  target.removeAttribute('aria-invalid');state.saleDrafts.delete(id);state.saleUncertain.delete(id);state.saleMessages.set(id,message);
  saleMessage(target.closest('[data-product]'),message);syncSaleLocks();
}
async function persistSale(t,patch,expected){
  const card=t.closest('[data-product]'),id=card?.dataset.product,p=byId(id);
  if(!p||state.saleBusy)return;
  state.saleBusy=true;
  syncSaleLocks();let written=false;
  saleMessage(card,'저장 중…');
  try{
    await store.saveSale(id,patch,expected);written=true;await reload();
    const saved=byId(id);state.saleMessages.set(id,isLive?'저장됨':'미리보기에서 저장됨');
    state.saleDrafts.delete(id);state.saleUncertain.delete(id);t.removeAttribute('aria-invalid');
    saleMessage(card,state.saleMessages.get(id));
    updateRowSummary(card,saved);
    const step=card.querySelector('.sale-step');if(step)step.textContent=saleStatus(saved.sale);
    for(const button of card.querySelectorAll('[data-sale-decision]'))button.setAttribute('aria-pressed',String(button.dataset.saleDecision===normalizeSale(saved.sale).decision));
    const margin=card.querySelector('.sale-margins,.sale-margin-note');if(margin)margin.outerHTML=saleMarginRows(saved,normalizeSale(saved.sale));
    renderSaleFilters();
    if(!matching(saved)){card.hidden=true;const count=document.querySelectorAll('#grid-p [data-product]:not([hidden])').length;$('sum-p').innerHTML=`<span>상품 <b>${count}</b>개</span><span>${isLive?'새 상품 장부':'금액과 상품은 가상의 예시'}</span>`;}
  }catch(error){
    const message=error?.message||'저장하지 못했어요. 다시 확인해 주세요.';
    saleFailure(t,message,written||/저장 결과|저장 후/.test(message));
  }finally{state.saleBusy=false;syncSaleLocks();}
}
document.addEventListener('focusin',e=>{
  if(e.target.matches?.(saleInputs))saleEditRevision.set(e.target,revision());
});
document.addEventListener('toggle',e=>{
  if(!e.target.matches?.('[data-sale-details]'))return;
  const id=e.target.closest('[data-product]')?.dataset.product;
  if(id){if(e.target.open)state.openSale.add(id);else state.openSale.delete(id);}
},true);
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(state.saleBusy)return;
  if(t.hasAttribute('data-sale-discard')){discardSaleDraft(t.closest('[data-product]')?.dataset.product);return;}
  if(state.saleDrafts.size){const draft=state.saleDrafts.values().next().value;saleFailure(draft,'입력을 고치거나 취소한 뒤 계속해 주세요.');return;}
  const isReceiptAction=t.hasAttribute('data-receipt-cancel')||(t.type==='submit'&&t.closest('[data-receipt-form]'));
  if(state.editReceipt.size&&!isReceiptAction&&(t.closest('[data-product]')||t.dataset.tab||t.dataset.saleFilter||t.dataset.group||t.id==='clear-filters'||t.dataset.channel)){
    e.preventDefault();$('product-error').textContent='입고 기록을 저장하거나 취소한 뒤 계속해 주세요.';return;
  }
  if(t.hasAttribute('data-product-toggle')){
    const id=t.closest('[data-product]')?.dataset.product;
    if(!id)return;
    if(state.editReceipt.size){$('product-error').textContent='입고 기록을 저장하거나 취소한 뒤 다른 상품을 열어 주세요.';return;}
    $('product-error').textContent='';
    state.openProduct=state.openProduct===id?null:id;
    state.openDetails.clear();state.openLinks.clear();state.openSale.clear();
    if(state.openProduct)state.openSale.add(state.openProduct);
    renderProducts();
    document.querySelector(`#grid-p [data-product="${CSS.escape(id)}"] [data-product-toggle]`)?.focus({preventScroll:true});
    return;
  }
  if(t.dataset.saleDecision){const expected=saleEditRevision.has(t)?saleEditRevision.get(t):revision();saleEditRevision.delete(t);await persistSale(t,{decision:t.dataset.saleDecision},expected);return;}
  if(t.dataset.tab){state.tab=t.dataset.tab;render();return;}
  if(t.dataset.saleFilter){state.saleFilter=t.dataset.saleFilter;render();return;}
  if(t.dataset.group){const s=state.filters[t.dataset.group];s.has(t.dataset.value)?s.delete(t.dataset.value):s.add(t.dataset.value);render();return;}
  if(t.id==='clear-filters'){Object.values(state.filters).forEach(s=>s.clear());state.saleFilter='전체';render();return;}
  if(t.dataset.channel){state.channel=t.dataset.channel;render();return;}
  if(t.id==='material-cancel'){state.editMaterial=null;state.editMaterialCurrency=null;$('mform').reset();$('mf-photo-preview').innerHTML='';$('material-title').textContent='새 부자재 등록';$('material-submit').textContent='등록';t.hidden=true;$('material-error').textContent='';return;}
  if(t.dataset.editMaterial){
    const material=materials.find(m=>m.id===t.dataset.editMaterial);if(!material)return;
    state.editMaterial=material.id;state.editMaterialRevision=revision();state.editMaterialCurrency=receiptCurrency(material)||'';$('mf-name').value=material.name;$('mf-kind').value=material.kind;
    $('mf-price').value=material.unitCost;$('mf-currency').value=state.editMaterialCurrency;
    $('mf-stock').value=material.stock??'';$('mf-min').value=material.minStock??'';
    $('mf-photo').value='';$('mf-photo-preview').innerHTML=typeof material.imageData==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(material.imageData)?`<img alt="" src="${esc(material.imageData)}">`:'';
    $('material-title').textContent='부자재 수정';$('material-submit').textContent='수정 저장';$('material-cancel').hidden=false;$('material-error').textContent='';
    $('mf-name').focus();return;
  }
  const p=byId(t.closest('[data-product]')?.dataset.product);if(!p)return;
  if(t.dataset.action==='details'){state.openDetails.has(p.id)?state.openDetails.delete(p.id):state.openDetails.add(p.id);renderProducts();return;}
  if(t.hasAttribute('data-links-close')){closeLinks();return;}
  if(t.dataset.action==='links'){state.linkMessage='';state.openLinks.has(p.id)?state.openLinks.delete(p.id):state.openLinks.add(p.id);renderProducts();return;}
  if(t.hasAttribute('data-receipt-add')){state.editReceipt.set(p.id,'new');state.editReceiptRevision.set(p.id,revision());renderProducts();return;}
  if(t.hasAttribute('data-receipt-edit')){state.editReceipt.set(p.id,Number(t.dataset.receiptEdit));state.editReceiptRevision.set(p.id,revision());renderProducts();return;}
  if(t.hasAttribute('data-receipt-cancel')){state.editReceipt.delete(p.id);state.editReceiptRevision.delete(p.id);renderProducts();return;}
  if(t.dataset.link){const candidate=[...(p.links||[]),{materialId:t.dataset.link,quantity:1,always:true}];try{const result=validateMaterialLinkUpdate(candidate,Array.isArray(p.links)?p.links:[],materials);if(!result.valid)throw Error(result.errors[0]||'부자재를 확인해 주세요.');await store.saveProductLinks(p.id,candidate);await reload();state.linkMessage='';}catch(error){state.linkMessage=error.message||'부자재를 연결하지 못했어요.';}renderProducts();return;}
  if(t.hasAttribute('data-unlink-index')){try{const index=Number(t.dataset.unlinkIndex),next=(p.links||[]).filter((_,i)=>i!==index);await store.saveProductLinks(p.id,next);await reload();state.linkMessage='';}catch(error){state.linkMessage=error.message||'부자재 연결을 해제하지 못했어요.';}renderProducts();}
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(state.saleDrafts.size&&state.saleDrafts.values().next().value!==t)return;
  if(state.editReceipt.size&&(t.id==='sort'||t.id==='material-cost')){
    if(t.id==='sort')t.value=state.sort;else t.checked=state.includeMaterials;
    $('product-error').textContent='입고 기록을 저장하거나 취소한 뒤 계속해 주세요.';return;
  }
  if(t.matches?.(saleInputs)){
    const card=t.closest('[data-product]'),id=card?.dataset.product,p=byId(id);
    if(!p||state.saleBusy)return;
    let patch;
    if(t.dataset.salePrice){
      const raw=t.value.trim(),value=raw===''?null:Number(raw);
      if(value!==null&&(!Number.isSafeInteger(value)||value<0)){saleFailure(t,'0 이상의 정수 금액을 입력해 주세요.');return;}
      patch={prices:{[t.dataset.salePrice]:value}};
    }else if(t.dataset.saleRegistered)patch={listings:{[t.dataset.saleRegistered]:{registered:t.checked}}};
    else if(t.dataset.saleUrl){
      const value=t.value.trim();
      if(value&&!/^https:\/\//i.test(value)){saleFailure(t,'https://로 시작하는 상품 주소를 입력해 주세요.');return;}
      patch={listings:{[t.dataset.saleUrl]:{url:value}}};
    }else patch={listings:{[t.dataset.saleDetail]:{detail:t.value}}};
    const expected=saleEditRevision.has(t)?saleEditRevision.get(t):revision();
    saleEditRevision.delete(t);await persistSale(t,patch,expected);
    return;
  }
  if(t.dataset.photoProduct){
    const file=t.files?.[0];if(!file)return;
    const startRevision=revision();
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){$('product-error').textContent='1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.';t.value='';return;}
    try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽을 수 없어요.'));reader.readAsDataURL(file);});await store.saveImage(t.dataset.photoProduct,data,startRevision);await reload();$('product-error').textContent='';renderProducts();}
    catch(error){$('product-error').textContent=error.message;}return;
  }
  if(t.id==='sort'){state.sort=t.value;renderProducts();return;}
  if(t.id==='material-cost'){state.includeMaterials=t.checked;render();return;}
  if(t.dataset.linkQuantity){const p=byId(t.closest('[data-product]')?.dataset.product),link=(p?.links||[]).find(l=>l.materialId===t.dataset.linkQuantity);if(link){try{const next=p.links.map(l=>l.materialId===t.dataset.linkQuantity?{...l,quantity:Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)))}:l);await store.saveProductLinks(p.id,next);await reload();state.linkMessage='';}catch(error){state.linkMessage=error.message||'부자재 개수를 저장하지 못했어요.';}}renderProducts();return;}
  if(t.dataset.pickProduct){if(t.checked)state.draft.items[t.dataset.pickProduct]=1;else delete state.draft.items[t.dataset.pickProduct];renderSetForm();return;}
  if(t.dataset.pickPack){if(t.checked)state.draft.materials[t.dataset.pickPack]=1;else delete state.draft.materials[t.dataset.pickPack];renderSetForm();return;}
  if(t.dataset.quantityProduct){state.draft.items[t.dataset.quantityProduct]=Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)));updateSetCalculation();return;}
  if(t.dataset.quantityPack){state.draft.materials[t.dataset.quantityPack]=Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)));updateSetCalculation();}
});
document.addEventListener('input',e=>{if(e.target.id==='sf-price'||e.target.id==='sf-name')updateSetCalculation();});
document.addEventListener('submit',async e=>{
  if(state.saleDrafts.size){e.preventDefault();return;}
  const form=e.target.closest('[data-receipt-form]');if(!form)return;e.preventDefault();
  const values=new FormData(form),rawUnitCost=String(values.get('unitCost')||'').trim(),rawSettlement=String(values.get('settlementKrw')||'').trim(),receipt={batch:Number(values.get('batch')),date:String(values.get('date')||''),orderDate:String(values.get('orderDate')||''),status:String(values.get('status')||''),currency:String(values.get('currency')||''),supplier:String(values.get('supplier')||''),url:String(values.get('url')||'').trim(),unitCost:rawUnitCost===''?null:Number(rawUnitCost),settlementKrw:rawSettlement===''?null:Number(rawSettlement),quantity:Number(values.get('quantity')),saleQuantity:Number(values.get('saleQuantity')),eventQuantity:Number(values.get('eventQuantity')),memo:String(values.get('memo')||'')};
  try{await store.saveReceipt(form.dataset.receiptForm,form.dataset.index==='new'?null:Number(form.dataset.index),receipt,state.editReceiptRevision.get(form.dataset.receiptForm));await reload();state.editReceipt.delete(form.dataset.receiptForm);state.editReceiptRevision.delete(form.dataset.receiptForm);$('product-error').textContent='';renderProducts();}
  catch(error){form.querySelector('.receipt-error').textContent=error.message;}
});
$('mform').addEventListener('submit',async e=>{
  e.preventDefault();if(state.saleDrafts.size)return;
  const form=e.currentTarget,name=$('mf-name').value.trim();if(!name)return;
  const photoFile=$('mf-photo').files?.[0];
  if(photoFile&&(!['image/png','image/jpeg','image/webp'].includes(photoFile.type)||photoFile.size>1024*1024)){$('material-error').textContent='1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.';return;}
  const priceRaw=$('mf-price').value.trim(),currencyVal=$('mf-currency').value;
  const stockRaw=$('mf-stock').value.trim(),minRaw=$('mf-min').value.trim();
  const fields={name,kind:$('mf-kind').value};
  if(state.editMaterial){
    if(priceRaw!=='')fields.unitCost=Number(priceRaw);
    if(currencyVal!==''&&currencyVal!==state.editMaterialCurrency)fields.currency=currencyVal;
    if(stockRaw!=='')fields.stock=Number(stockRaw);
    if(minRaw!=='')fields.minStock=Number(minRaw);
  }else{
    if(priceRaw===''){$('material-error').textContent='단가를 입력해 주세요.';return;}
    fields.unitCost=Number(priceRaw);fields.currency=currencyVal;
    fields.stock=stockRaw===''?null:Number(stockRaw);
    fields.minStock=minRaw===''?null:Number(minRaw);
  }
  try{
    let id;
    if(state.editMaterial){id=state.editMaterial;await store.saveMaterial(id,fields,state.editMaterialRevision);}
    else{id='demo-m-'+Date.now();await store.createMaterial({id,...fields});}
    await reload();
    if(photoFile){
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽을 수 없어요.'));reader.readAsDataURL(photoFile);});
      await store.saveMaterialImage(id,data,revision());await reload();
    }
    state.editMaterial=null;state.editMaterialRevision=null;state.editMaterialCurrency=null;form.reset();$('mf-photo-preview').innerHTML='';$('material-title').textContent='새 부자재 등록';$('material-submit').textContent='등록';$('material-cancel').hidden=true;$('material-error').textContent='';render();
  }catch(error){$('material-error').textContent=error.message;}
});
$('setform').addEventListener('submit',async e=>{e.preventDefault();if(state.saleDrafts.size)return;const form=e.currentTarget,draft=draftSet();if(!draft.name||!draft.components.length){$('sf-calc').textContent='세트 이름과 구성품을 확인해 주세요.';return;}try{await store.createSet({...draft,id:'demo-s-'+Date.now(),priceStatus:'제안'});await reload();state.draft={items:{},materials:{}};form.reset();render();}catch(error){$('sf-calc').textContent=error.message;}});
render();
