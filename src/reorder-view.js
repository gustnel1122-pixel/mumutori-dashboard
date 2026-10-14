// 재발주 준비 — 판매 중인 상품의 판매처별 판매량·쿠팡 재고·추천 수량을 한눈에 보는 표(소싱 화면의 탭).
// 자료는 소싱 장부(Firebase sourcing/meta/reorderPrep)에 있고, PC의 mumutori-auto/reorder_prep.py가 채널 일일 수집에서 만들어 넣는다.
// 쿠팡 수량은 새상품 기준이다. 반품 재판매(반품-최상) 옵션의 판매는 스크립트가 섞지 않고 근거 줄(note)에 따로 적어 준다.
// 품절 상품의 수량은 재고가 있던 기간에만 팔린 값이라 '재고 있던 기간 기준'이라고 표시한다.
// 공개 저장소라 판매·재고 숫자는 이 코드에 적지 않는다. 이 화면은 읽기만 한다 — 담기·수량·발주 신청은 '후보'·'장바구니' 탭에서 사장님이.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?'<span class="rp-na" title="아직 읽지 못한 자료">—</span>':esc(v);
const trio=c=>`${num(c?.d30)} · ${num(c?.d60)} · ${num(c?.d90)}`;
const when=v=>{const d=new Date(v);return isNaN(d)?esc(v||''):esc(d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));};

// 스티커 규칙(사장님 2026-10-14 결정): 스티커 완제품은 사지 않고 직접 찍는다 → 추천하지 않고 '스티커 용지·잉크'로만 추천한다.
// 자료를 만드는 reorder_prep.py(is_sticker_goods)가 먼저 거르고, 화면도 같은 낱말로 한 번 더 거른다 — 낱말을 바꾸면 두 곳을 같이.
const STICKER=/스티커|씰|贴纸|不干胶|sticker/i,STICKER_SUPPLY=/용지|라벨지|잉크/;   // 용지·잉크처럼 찍을 재료는 완제품이 아니다
export const isStickerGoods=name=>STICKER.test(String(name??''))&&!STICKER_SUPPLY.test(String(name??''));
const SUPPLY_LIST='https://gustnel1122-pixel.github.io/mumutori-offline-pages/#buylist';   // 준비 페이지 구매 목록의 '프린터 · 스티커 용지 · 잉크' 묶음
const shown=d=>(d?.rows||[]).filter(r=>!isStickerGoods(r.name));

export function reorderCount(tree){return shown(tree?.meta?.reorderPrep).length;}

function ledgerLine(it,yuan){
  if(!it)return '';
  const price=it.priceMin==null?'':(it.priceMax&&it.priceMax!==it.priceMin?`${yuan(it.priceMin)}~${yuan(it.priceMax)}`:yuan(it.priceMin));
  return [it.pid,price,it.moq?`최소 ${it.moq}${it.unit||'개'}`:''].filter(Boolean).map(esc).join(' · ');
}
function productRow(r,items,img,yuan){
  const it=items[r.offer],c=r.coupang||{};
  const recAll=r.rec||[],recs=recAll.filter(x=>!isStickerGoods(x.ko));
  const rec=recs.map(x=>`<span><b>${esc(x.qty)}</b> ${esc(x.ko)}</span>`).join('')+(recs.length<recAll.length?'<span class="rp-swap">스티커는 용지·잉크로</span>':'');
  const stock=c.soldout?'<span class="badge red">품절</span>':`<b>${esc(c.stock)}</b>개`;
  return `<tr class="rp-row ${r.urgent?'rp-urgent':''}"><td class="maincell"><div class="rp-prod">${img(it?.img,120,'rp-img')}<div><b>${esc(r.name)}</b>${it?`<span class="sub">${ledgerLine(it,yuan)}</span>`:''}${r.urgent?`<span class="badge red">급함</span>`:''}${r.weak?`<span class="badge amber">근거 약함</span>`:''}</div></div></td>
    <td class="num">${num(c.d7)} · ${num(c.d30)} · ${num(c.d60)} · ${num(c.d90)}${c.soldout&&(c.d60!=null||c.d90!=null)?'<span class="sub rp-stocked">재고 있던 기간 기준</span>':''}</td><td class="num">${trio(r.smartstore)}</td><td class="num">${trio(r.own)}</td>
    <td>${stock}${c.returnStock?` <span class="sub rp-inline">+반품 재판매 ${esc(c.returnStock)}</span>`:''}<span class="sub">${c.soldout?'품절 중':'소진 예상 '+esc(r.runout||'—')}</span></td>
    <td class="rp-rec">${rec||'—'}</td></tr>
    <tr class="rp-basis"><td colspan="6">${r.urgentText?`<b class="rp-warn">${esc(r.urgentText)}</b> · `:''}${esc(r.basis||'')}${c.hist?` · 그 전 판매: ${esc(c.hist)}`:''}${r.recHigh?` · 최근 속도가 이어지면 ${esc(r.recHigh)}${esc(r.unit||'개')}`:''}${r.note?` · ${esc(r.note)}`:''}</td></tr>`;
}

export function reorderTab(tree,{img,yuan}){
  const d=tree?.meta?.reorderPrep;
  if(!d||!(d.rows||[]).length)return `<div class="empty"><b>재발주 준비 자료가 아직 없습니다.</b>채널 판매 자료를 모아 올리면 여기에 표로 나옵니다.</div>`;
  const items=tree.items||{},w=d.windows||{},rows=shown(d),stickers=d.rows.filter(r=>isStickerGoods(r.name)),urgent=rows.filter(r=>r.urgent);
  const excludedCount=(d.excluded||[]).reduce((a,g)=>a+(g.items||[]).length,0);
  return `<div class="rp-top"><div><b>판매 중인 상품 ${rows.length}개 재발주 준비</b>${urgent.length?` · <span class="rp-warn">급한 것 ${urgent.length}개(${urgent.map(r=>esc(r.name)).join(', ')})</span>`:''}<span class="sub">채널 자료 수집 ${when(d.asOf)} · 표 갱신 ${when(d.updatedAt)}</span></div><button type="button" class="primary" data-sx="tab" data-id="items">후보에서 수량 담기 →</button></div>
    <div class="note">${esc(d.rule||'')} 쿠팡에 넣을 수량을 알려 주시면 그만큼 빼서 다시 계산합니다.</div>
    <div class="note rp-sticker"><b>스티커는 사지 않고 직접 찍습니다(10/14 결정).</b> 스티커 완제품은 이 표에서 추천하지 않고, 스티커가 필요할 때는 <b>스티커 용지·잉크</b>만 추천합니다. <a href="${SUPPLY_LIST}" target="_blank" rel="noopener">용지·잉크 살 곳 보기 →</a>${stickers.length?`<span class="sub">추천에서 뺀 스티커 완제품: ${stickers.map(r=>esc(r.name)).join(', ')} — 대신 스티커 용지·잉크</span>`:''}</div>
    <div class="panel section-gap"><div class="tablewrap"><table class="table rp-table"><thead><tr><th>상품</th><th class="num">쿠팡<small>7 · 30 · 60 · 90일</small></th><th class="num">스마트스토어<small>30 · 60 · 90일</small></th><th class="num">자사몰<small>30 · 60 · 90일</small></th><th>쿠팡 창고 재고</th><th>추천 수량</th></tr></thead>
      <tbody>${rows.map(r=>productRow(r,items,img,yuan)).join('')}</tbody></table></div>
      <div class="rp-foot">판매량 기간: 30일 ${esc(w.d30||'')} · 60일 ${esc(w.d60||'')} · 90일 ${esc(w.d90||'')} · '—'는 아직 읽지 못한 자료<br>쿠팡 수량은 새상품 기준입니다. 반품 재판매분이 팔린 상품은 아래 근거 줄에 따로 적고, 품절 상품의 수량은 재고가 있던 기간에만 팔린 값입니다.</div></div>
    ${excludedCount?`<details class="rp-excluded"><summary>재발주에서 뺀 상품 ${excludedCount}건 — 이유 보기</summary>${(d.excluded||[]).map(g=>`<h4>${esc(g.group)}</h4><ul>${(g.items||[]).map(x=>`<li><b>${esc(x.name)}</b><span>${esc(x.why)}</span></li>`).join('')}</ul>`).join('')}</details>`:''}
    <details class="rp-excluded"><summary>계산 기준·자료 출처</summary><ul>${(d.limits||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul><h4>자료 출처</h4><ul>${(d.sources||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul></details>`;
}
