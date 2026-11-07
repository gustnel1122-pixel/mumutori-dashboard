import {calcProduct, calcSet, validateMaterialLinks} from './model.js';
import {createMemoryStore} from './store.js';

// This isolated preview deliberately contains fictional examples only.
// It never fetches or writes an operations ledger.
const exampleProducts = [
  {id:'demo-p1',name:'예시 인형',image:'🧸',batch:'1차',channels:['자사몰','스마트스토어'],kind:'인형',status:'판매 중',stock:62,salePrice:12000,priceStatus:'제안',receipts:[{batch:1,quantity:100,unitCost:4200,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[{materialId:'demo-m1',quantity:1,always:true}]},
  {id:'demo-p2',name:'예시 파우치',image:'👜',batch:'1차',channels:['자사몰'],kind:'생활',status:'판매 준비',stock:35,salePrice:9800,priceStatus:'제안',receipts:[{batch:1,quantity:50,unitCost:3100,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[{materialId:'demo-m2',quantity:1,always:true}]},
  {id:'demo-p3',name:'예시 열쇠고리',image:'🔑',batch:'2차',channels:['스마트스토어'],kind:'소품',status:'판매 중',stock:12,salePrice:7500,priceStatus:'제안',receipts:[{batch:2,quantity:40,unitCost:2600,date:'2026-01-01',supplier:'예시 판매처',url:'',memo:'가상의 입고 기록'}],links:[]},
  {id:'demo-p4',name:'예시 손수건',image:'🧣',batch:'2차',channels:['자사몰','스마트스토어'],kind:'생활',status:'확인 필요',stock:null,salePrice:null,priceStatus:'제안',receipts:[],links:[]},
];
const exampleMaterials = [
  {id:'demo-m1',name:'예시 상품 택',kind:'item',unitCost:80,stock:140,minStock:40},
  {id:'demo-m2',name:'예시 스티커',kind:'item',unitCost:30,stock:25,minStock:50},
  {id:'demo-m3',name:'예시 포장 봉투',kind:'pack',unitCost:120,stock:70,minStock:20},
];
const exampleSets = [{id:'demo-s1',name:'예시 선물 세트',components:[{id:'demo-p1',quantity:1},{id:'demo-p2',quantity:1}],materials:[{materialId:'demo-m3',quantity:1}],salePrice:19500,priceStatus:'제안'}];
const store = createMemoryStore({products:exampleProducts,materials:exampleMaterials,sets:exampleSets});
let {products,materials,sets} = await store.load();
async function reload(){({products,materials,sets}=await store.load());}
const state = {tab:'p',filters:{batch:new Set(),channel:new Set(),kind:new Set(),status:new Set()},sort:'name',includeMaterials:true,channel:'smart',openDetails:new Set(),openLinks:new Set(),editReceipt:new Map(),draft:{items:{},materials:{}}};
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '확인 필요';
const money = v => typeof v === 'number' && Number.isFinite(v) ? fmt(v)+'원' : '확인 필요';
const pct = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v)+'%' : '확인 필요';
const options = () => ({includeMaterials:state.includeMaterials,channel:state.channel});
const calculate = p => calcProduct(p,materials,options());
const byId = id => products.find(p=>p.id===id);
const groups = [
  {key:'batch',label:'입고',values:['1차','2차']},
  {key:'channel',label:'판매처',values:['자사몰','스마트스토어','쿠팡']},
  {key:'kind',label:'종류',values:['인형','생활','소품']},
  {key:'status',label:'상태',values:['판매 중','판매 준비','확인 필요']},
];
function roasClass(v) { return v === null || v === undefined ? 'b' : v <= 250 ? 'g' : v <= 400 ? 'w' : 'b'; }
function renderFilters(){
  $('filters').innerHTML = groups.map(g=>`<div class="frow"><span class="flabel">${esc(g.label)}</span>${g.values.map(v=>`<button type="button" class="chip" data-group="${g.key}" data-value="${esc(v)}" aria-pressed="${state.filters[g.key].has(v)}">${esc(v)}</button>`).join('')}</div>`).join('')+
    `<div class="opts"><label>정렬 <select id="sort"><option value="name">이름</option><option value="roas">최소 ROAS</option><option value="sell">소진율</option><option value="earned">번 돈</option></select></label>
      <span>수수료 기준 <span class="seg"><button type="button" data-channel="smart" aria-pressed="${state.channel==='smart'}">스마트스토어</button><button type="button" data-channel="own" aria-pressed="${state.channel==='own'}">자사몰</button></span></span>
      <label><input type="checkbox" id="material-cost" ${state.includeMaterials?'checked':''}> 부자재 원가 포함</label><button type="button" class="btn" id="clear-filters">초기화</button></div>`;
  $('sort').value=state.sort;
}
function matching(p){return groups.every(g=>{const selected=state.filters[g.key];if(!selected.size)return true;const value=g.key==='channel'?p.channels:p[g.key];return Array.isArray(value)?value.some(v=>selected.has(v)):selected.has(value);});}
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
    <label>날짜 <input type="date" name="date" required value="${esc(current.date??'')}"></label>
    <label>판매처 <input type="text" name="supplier" maxlength="100" required value="${esc(current.supplier??'')}"></label>
    <label>1688 링크 <input type="url" name="url" placeholder="https://...1688.com/..." value="${esc(current.url??'')}"></label>
    <label>개당 단가 <input type="number" name="unitCost" min="0" step="0.01" required value="${esc(current.unitCost??'')}"></label>
    <label>수량 <input type="number" name="quantity" min="1" step="1" required value="${esc(current.quantity??'')}"></label>
    <label>메모 <textarea name="memo" maxlength="500" rows="2">${esc(current.memo??'')}</textarea></label>
    <p class="receipt-error" role="alert"></p><div class="acts"><button type="submit" class="btn pri">기록 저장</button><button type="button" class="btn" data-receipt-cancel>취소</button></div>
    <p class="hint">미리보기에서만 바뀌며 실제 재고는 변경되지 않아요.</p></form>`:'';
  return `<section class="panel"><h4>입고 기록</h4>${receipts.length?`<div class="record-list">${receipts.map((r,i)=>{
    let url='';try{const u=new URL(r.url);if(u.protocol==='https:'&&(u.hostname==='1688.com'||u.hostname.endsWith('.1688.com')))url=u.href;}catch{}
    return `<div class="record"><strong>${esc(r.batch??(i+1))}차 · ${esc(r.date||'날짜 확인 필요')}</strong><small>${esc(r.supplier||'판매처 확인 필요')} · ${fmt(r.quantity)}개 · 개당 ${money(r.unitCost)}</small>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">1688 상품 보기</a>`:'<small>1688 링크 확인 필요</small>'}<small>${esc(r.memo||'')}</small><button type="button" class="btn" data-receipt-edit="${i}">수정</button></div>`;
  }).join('')}</div>`:'<p class="empty">입고 기록을 확인해 주세요.</p>'}<button type="button" class="btn" data-receipt-add>입고 기록 추가</button>${form}</section>`;
}
function linksPanel(p){
  if(!state.openLinks.has(p.id))return '';
  return `<section class="panel"><h4>부자재 연결</h4><p class="hint">등록된 부자재만 고를 수 있어요. 실제 재고는 바뀌지 않습니다.</p>${materials.length?materials.map(m=>{
    const link=(p.links||[]).find(l=>l.materialId===m.id);
    return `<div class="lrow"><span class="nm">${esc(m.name)}<small>${m.kind==='item'?'상품에 붙음':'포장'}</small></span><div class="lctl">${link?`<label>1개당 <input type="number" min="1" max="999" value="${esc(link.quantity)}" data-link-quantity="${esc(m.id)}" aria-label="${esc(m.name)} 1개당 개수"></label><button type="button" class="btn" data-unlink="${esc(m.id)}">연결 해제</button>`:`<button type="button" class="btn" data-link="${esc(m.id)}">연결</button>`}</div></div>`;
  }).join(''):'<p class="empty">먼저 부자재를 등록해 주세요.</p>'}</section>`;
}
function card(p){
  const c=calculate(p),rate=c.sellRate,bar=rate==null?0:Math.max(0,Math.min(100,rate));
  const attached=(p.links||[]).filter(x=>x.always).map(l=>{const m=materials.find(x=>x.id===l.materialId);return m?`${m.name} ×${l.quantity}`:'연결 확인 필요';});
  return `<article class="card" data-product="${esc(p.id)}"><div class="ctop"><div class="cname">${picture(p)}<span>${esc(p.name)}</span></div><div class="tags"><span class="pill t-batch">${esc(p.batch)}</span><span class="pill st-on">${esc(p.status)}</span></div></div>
    <div class="chs">${esc((p.channels||[]).join(' · ')||'판매처 확인 필요')}</div>
    <div class="nums"><div class="num"><div class="k">원가</div><div class="v">${money(c.cost)}</div><div class="s">${state.includeMaterials?'부자재 포함':'부자재 제외'}</div></div>
    <div class="num"><div class="k">판매가 <span class="ps ${p.priceStatus==='확정'?'확정':'제안'}">${esc(p.priceStatus||'제안')}</span></div><div class="v">${money(c.price)}</div></div>
    <div class="num"><div class="k">최소 ROAS</div><div class="roas"><div><span class="c">스스</span><span class="${roasClass(c.roas.smart)}">${pct(c.roas.smart)}</span></div><div><span class="c">자사몰</span><span class="${roasClass(c.roas.own)}">${pct(c.roas.own)}</span></div></div></div></div>
    <div class="sell"><div class="row"><span>소진율 ${pct(rate)}</span><span>입고 ${fmt(c.received)} · 재고 ${fmt(c.stock)}</span></div><div class="bar"><i class="g" style="width:${bar}%"></i></div></div>
    <div class="earn"><span>번 돈</span><b>${money(c.earned)}</b><small>입고와 현재 재고 차이 · ${state.channel==='smart'?'스마트스토어':'자사몰'} 수수료 기준</small></div>
    <div class="mats">${attached.length?attached.map(x=>`<span class="mtag">${esc(x)}</span>`).join(''):'<span class="example-note">연결된 부자재 없음</span>'}</div>
    <div class="acts"><button type="button" class="btn" data-action="details" aria-expanded="${state.openDetails.has(p.id)}">자세히 (입고 기록)</button><button type="button" class="btn" data-action="links" aria-expanded="${state.openLinks.has(p.id)}">부자재 연결</button><label class="btn file-control">누끼 사진 선택<input type="file" data-photo-product="${esc(p.id)}" accept="image/png,image/jpeg,image/webp" aria-label="${esc(p.name)} 누끼 사진 선택"></label></div>${receiptPanel(p)}${linksPanel(p)}</article>`;
}
function renderProducts(){
  const shown=ordered(products.filter(matching));
  $('sum-p').innerHTML=`<span>상품 <b>${shown.length}</b>개</span><span>금액과 상품은 가상의 예시</span>`;
  $('grid-p').innerHTML=shown.length?shown.map(card).join(''):'<div class="empty-card">조건에 맞는 상품이 없어요. 필터를 바꿔 주세요.</div>';
}
function setCard(s){
  const c=calcSet(s,products,materials,options());
  const names=(s.components||[]).map(x=>`${byId(x.id)?.name||'구성품 확인 필요'} ×${x.quantity}`).join(' · ');
  const packaging=(s.materials||[]).map(x=>`${materials.find(m=>m.id===x.materialId)?.name||'부자재 확인 필요'} ×${x.quantity}`).join(' · ');
  return `<article class="card"><div class="ctop"><div class="cname">${esc(s.name)}</div><div class="tags"><span class="pill st-set">세트</span></div></div><div class="chs">${esc(names)}</div><div class="nums"><div class="num"><div class="k">세트 원가</div><div class="v">${money(c.cost)}</div></div><div class="num"><div class="k">판매가</div><div class="v">${money(c.price)}</div></div><div class="num"><div class="k">세트 재고</div><div class="v">${fmt(c.stock)}</div></div></div><div class="chs">포장: ${esc(packaging||'연결 없음')}</div><div class="chs">최소 ROAS · 스스 ${pct(c.roas.smart)} · 자사몰 ${pct(c.roas.own)}</div></article>`;
}
function renderSetForm(){
  $('sf-items').innerHTML='<legend>구성품 고르기</legend>'+products.map(p=>`<div class="pickrow"><label><input type="checkbox" data-pick-product="${esc(p.id)}" ${state.draft.items[p.id]?'checked':''}> ${esc(p.name)}</label>${state.draft.items[p.id]?`<input type="number" min="1" max="999" value="${state.draft.items[p.id]}" data-quantity-product="${esc(p.id)}" aria-label="${esc(p.name)} 개수">`:''}</div>`).join('');
  const packing=materials.filter(m=>m.kind==='pack');
  $('sf-pack').innerHTML='<legend>포장 부자재 고르기</legend>'+(packing.length?packing.map(m=>`<div class="pickrow"><label><input type="checkbox" data-pick-pack="${esc(m.id)}" ${state.draft.materials[m.id]?'checked':''}> ${esc(m.name)}</label>${state.draft.materials[m.id]?`<input type="number" min="1" max="999" value="${state.draft.materials[m.id]}" data-quantity-pack="${esc(m.id)}" aria-label="${esc(m.name)} 개수">`:''}</div>`).join(''):'<p class="empty">등록된 포장 부자재가 없어요.</p>');
  updateSetCalculation();
}
function draftSet(){return {name:$('sf-name').value.trim(),salePrice:$('sf-price').value===''?null:Number($('sf-price').value),components:Object.entries(state.draft.items).map(([id,quantity])=>({id,quantity})),materials:Object.entries(state.draft.materials).map(([materialId,quantity])=>({materialId,quantity}))};}
function updateSetCalculation(){
  const draft=draftSet(); if(!draft.components.length){$('sf-calc').innerHTML='<span class="empty">구성품을 1개 이상 골라 주세요.</span>';return;}
  const c=calcSet(draft,products,materials,options());
  $('sf-calc').innerHTML=`<div class="num"><div class="k">세트 원가</div><div class="v">${money(c.cost)}</div></div><div class="num"><div class="k">최소 ROAS(스스)</div><div class="v">${pct(c.roas.smart)}</div></div><div class="num"><div class="k">만들 수 있는 수</div><div class="v">${fmt(c.stock)}</div></div>`;
}
function renderSets(){ $('sum-s').innerHTML=`<span>세트 <b>${sets.length}</b>개</span><span>세트 재고는 구성품 중 가장 적게 만들 수 있는 수량이에요.</span>`; $('grid-s').innerHTML=sets.map(setCard).join('');renderSetForm(); }
function renderMaterials(){
  const low=materials.filter(m=>m.stock<m.minStock);
  $('sum-m').innerHTML=`<span>부자재 <b>${materials.length}</b>종</span><span>부족 <b>${low.length}</b>종</span>`;
  $('tbl-m').innerHTML='<thead><tr><th>부자재</th><th>종류</th><th>단가</th><th>남은 수량</th><th>부족 기준</th><th>연결된 곳</th></tr></thead><tbody>'+materials.map(m=>{
    const used=products.filter(p=>(p.links||[]).some(l=>l.materialId===m.id)).length+sets.filter(s=>(s.materials||[]).some(l=>l.materialId===m.id)).length;
    return `<tr class="${m.stock<m.minStock?'low':''}"><td>${esc(m.name)} ${m.stock<m.minStock?'<span class="pill st-hold">부족</span>':''}</td><td>${m.kind==='item'?'상품에 붙음':'포장'}</td><td class="n">${money(m.unitCost)}</td><td class="n">${fmt(m.stock)}개</td><td class="n">${fmt(m.minStock)}개</td><td class="n">${used}곳</td></tr>`;
  }).join('')+'</tbody>';
}
function render(){
  for(const t of ['p','s','m']){$('view-'+t).hidden=state.tab!==t;$('tab-'+t).setAttribute('aria-selected',String(state.tab===t));}
  $('cnt-p').textContent=products.length;$('cnt-s').textContent=sets.length;$('cnt-m').textContent=materials.length;
  if(state.tab==='p'){renderFilters();renderProducts();}else if(state.tab==='s')renderSets();else renderMaterials();
}
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.tab){state.tab=t.dataset.tab;render();return;}
  if(t.dataset.group){const s=state.filters[t.dataset.group];s.has(t.dataset.value)?s.delete(t.dataset.value):s.add(t.dataset.value);render();return;}
  if(t.id==='clear-filters'){Object.values(state.filters).forEach(s=>s.clear());render();return;}
  if(t.dataset.channel){state.channel=t.dataset.channel;render();return;}
  const p=byId(t.closest('[data-product]')?.dataset.product);if(!p)return;
  if(t.dataset.action==='details'){state.openDetails.has(p.id)?state.openDetails.delete(p.id):state.openDetails.add(p.id);renderProducts();return;}
  if(t.dataset.action==='links'){state.openLinks.has(p.id)?state.openLinks.delete(p.id):state.openLinks.add(p.id);renderProducts();return;}
  if(t.hasAttribute('data-receipt-add')){state.editReceipt.set(p.id,'new');renderProducts();return;}
  if(t.hasAttribute('data-receipt-edit')){state.editReceipt.set(p.id,Number(t.dataset.receiptEdit));renderProducts();return;}
  if(t.hasAttribute('data-receipt-cancel')){state.editReceipt.delete(p.id);renderProducts();return;}
  if(t.dataset.link){const candidate=[...(p.links||[]),{materialId:t.dataset.link,quantity:1,always:true}];try{if(validateMaterialLinks(candidate,materials).valid){await store.saveProductLinks(p.id,candidate);await reload();$('product-error').textContent='';}}catch(error){$('product-error').textContent=error.message;}renderProducts();return;}
  if(t.dataset.unlink){try{await store.saveProductLinks(p.id,(p.links||[]).filter(l=>l.materialId!==t.dataset.unlink));await reload();$('product-error').textContent='';}catch(error){$('product-error').textContent=error.message;}renderProducts();}
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.dataset.photoProduct){
    const file=t.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){$('product-error').textContent='1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.';t.value='';return;}
    try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽을 수 없어요.'));reader.readAsDataURL(file);});await store.saveImage(t.dataset.photoProduct,data);await reload();$('product-error').textContent='';renderProducts();}
    catch(error){$('product-error').textContent=error.message;}return;
  }
  if(t.id==='sort'){state.sort=t.value;renderProducts();return;}
  if(t.id==='material-cost'){state.includeMaterials=t.checked;render();return;}
  if(t.dataset.linkQuantity){const p=byId(t.closest('[data-product]')?.dataset.product),link=(p?.links||[]).find(l=>l.materialId===t.dataset.linkQuantity);if(link){try{const next=p.links.map(l=>l.materialId===t.dataset.linkQuantity?{...l,quantity:Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)))}:l);await store.saveProductLinks(p.id,next);await reload();$('product-error').textContent='';}catch(error){$('product-error').textContent=error.message;}}renderProducts();return;}
  if(t.dataset.pickProduct){if(t.checked)state.draft.items[t.dataset.pickProduct]=1;else delete state.draft.items[t.dataset.pickProduct];renderSetForm();return;}
  if(t.dataset.pickPack){if(t.checked)state.draft.materials[t.dataset.pickPack]=1;else delete state.draft.materials[t.dataset.pickPack];renderSetForm();return;}
  if(t.dataset.quantityProduct){state.draft.items[t.dataset.quantityProduct]=Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)));updateSetCalculation();return;}
  if(t.dataset.quantityPack){state.draft.materials[t.dataset.quantityPack]=Math.max(1,Math.min(999,Math.floor(Number(t.value)||1)));updateSetCalculation();}
});
document.addEventListener('input',e=>{if(e.target.id==='sf-price'||e.target.id==='sf-name')updateSetCalculation();});
document.addEventListener('submit',async e=>{
  const form=e.target.closest('[data-receipt-form]');if(!form)return;e.preventDefault();
  const values=new FormData(form),receipt={batch:Number(values.get('batch')),date:String(values.get('date')||''),supplier:String(values.get('supplier')||''),url:String(values.get('url')||'').trim(),unitCost:Number(values.get('unitCost')),quantity:Number(values.get('quantity')),memo:String(values.get('memo')||'')};
  try{await store.saveReceipt(form.dataset.receiptForm,form.dataset.index==='new'?null:Number(form.dataset.index),receipt);await reload();state.editReceipt.delete(form.dataset.receiptForm);$('product-error').textContent='';renderProducts();}
  catch(error){form.querySelector('.receipt-error').textContent=error.message;}
});
$('mform').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,name=$('mf-name').value.trim();if(!name)return;try{await store.createMaterial({id:'demo-m-'+Date.now(),name,kind:$('mf-kind').value,unitCost:Number($('mf-price').value),stock:Number($('mf-stock').value),minStock:Number($('mf-min').value)});await reload();form.reset();$('material-error').textContent='';render();}catch(error){$('material-error').textContent=error.message;}});
$('setform').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,draft=draftSet();if(!draft.name||!draft.components.length){$('sf-calc').textContent='세트 이름과 구성품을 확인해 주세요.';return;}try{await store.createSet({...draft,id:'demo-s-'+Date.now(),priceStatus:'제안'});await reload();state.draft={items:{},materials:{}};form.reset();render();}catch(error){$('sf-calc').textContent=error.message;}});
render();
