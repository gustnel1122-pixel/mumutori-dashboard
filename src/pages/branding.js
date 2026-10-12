// 브랜딩 도구 — 도장·잉크·포장재의 현재 사용/도입 후보와, 고장 나면 같은 판매처·같은 옵션으로 다시 살 정보.
// 자료는 src/branding-data.js(공개 가능한 것만). 주문번호·도안 원본 위치 같은 비공개 자료는 이 화면에 없다.
const D=await import(`../branding-data.js?v=${document.body.dataset.build}`);
export default function renderPage(ctx){
  const {esc,head,badge}=ctx;
  const {BRAND_UPDATED,BRAND_EDITOR,BRAND_BASIS,STATUS,STATUS_RULE,ITEMS,DONT,MAKER_RULES,ART_PLAN,REORDER_STEPS,PRIVATE_NOTE}=D;
  const won=n=>n==null?'':Number(n).toLocaleString('ko-KR')+'원';
  const blank='<span class="br-blank">확인 전</span>';
  const val=v=>v==null||v===''?blank:esc(v);
  const st=s=>{const [label,tone]=STATUS[s]||[s,''];return `<span class="badge ${tone}">${esc(label)}</span>`;};
  const row=(k,v)=>`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  const link=it=>it.url?`<a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">상품 화면 ↗</a>`:'';
  const price=p=>p?`${p.lines.map(([k,v])=>`${esc(k)} ${won(v)}`).join(' + ')} = <b>${won(p.total)}</b>${p.note?`<span class="sub">${esc(p.note)}</span>`:''}<span class="sub">확인일 ${esc(p.checked)}</span>`:blank;
  const counts=Object.fromEntries(Object.keys(STATUS).map(k=>[k,ITEMS.filter(i=>i.status===k).length]));
  const card=it=>`<article class="br-card br-${esc(it.status)}" id="${esc(it.id)}"><header><div><code class="br-id">${esc(it.id)}</code><b>${esc(it.name)}</b><span class="sub">${esc(it.kind)} · ${esc(it.use)}</span></div>${st(it.status)}</header>
    ${it.pending?.length?`<p class="br-pending"><b>남은 확인</b> ${it.pending.map(esc).join(' · ')}</p>`:''}${it.caution?`<p class="br-caution">${esc(it.caution)}</p>`:''}
    <details><summary>재주문 정보 자세히</summary><dl class="br-grid">
      ${row('판매처',val(it.vendor))}${row('상품번호·주소',it.productNo?`${esc(it.productNo)} ${link(it)}`:blank)}
      ${row('모델',val(it.model))}${row('형태',val(it.form))}${row('인쇄(인각) 크기',val(it.printSize))}${row('실제 도안 크기',val(it.artSize))}${row('옵션·색',val(it.option))}
      ${it.ink?row('잉크 제조사',val(it.ink.maker))+row('잉크 정확한 모델',val(it.ink.model))+row('용량',val(it.ink.volume))+row('호환 근거',val(it.ink.compat)):''}
      ${row('가격·배송비',price(it.price))}
      ${it.art?row('도안 원본',it.art.source?esc(it.art.source):'<span class="br-blank">아직 없음 — 정해지면 비공개 정본에 기록</span>')+row('도안 버전',val(it.art.version))+row('좌우 반전(미러링)',it.art.mirror==null?'<span class="br-blank">판매자 확인 전</span>':esc(it.art.mirror))+row('도안 메모',val(it.art.rule)):''}
      ${row('발주일',val(it.order.date))}${row('주문번호',it.order.date?'비공개 정본에서 확인':blank)}${row('수령일',val(it.order.received))}${row('수령 후 샘플 테스트',val(it.order.sampleTest))}
    </dl></details></article>`;
  const kinds=[...new Set(ITEMS.map(i=>i.kind))];
  const list=(items,ordered)=>`<${ordered?'ol':'ul'} class="br-list">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</${ordered?'ol':'ul'}>`;
  return head('브랜딩 도구','도장·잉크·포장재를 무엇으로 쓰는지, 고장 나면 같은 판매처·같은 옵션으로 다시 살 수 있게 적어 둡니다.')+
  `<div class="org-meta"><span>마지막 갱신 <b>${esc(BRAND_UPDATED)}</b> · ${esc(BRAND_EDITOR)}</span><span>${badge('권고 '+counts.recommended)} ${badge('후보 '+counts.candidate)} ${badge('주문 완료 '+counts.ordered)} ${badge('사용 중 '+counts.inuse)} ${badge('미등록 '+counts.unregistered)}</span></div>`+
  `<div class="note amber">${esc(STATUS_RULE)}</div>`+
  `<div class="panel section-gap"><div class="panelhead"><h2>한눈에 보기</h2></div><div class="tablewrap"><table class="table br-table"><thead><tr><th>품목 ID</th><th>무엇</th><th>용도</th><th>상태</th><th>판매처 · 상품번호</th><th class="num">확인한 금액</th></tr></thead><tbody>${ITEMS.map(it=>`<tr><td><a class="inline-link" href="#${esc(it.id)}"><code class="br-id">${esc(it.id)}</code></a></td><td class="maincell"><b>${esc(it.name)}</b></td><td>${esc(it.use)}</td><td>${st(it.status)}</td><td>${it.vendor?`${esc(it.vendor)} · ${esc(it.productNo)}`:blank}</td><td class="num">${it.price?won(it.price.total):blank}</td></tr>`).join('')}</tbody></table></div></div>`+
  kinds.map(k=>`<div class="section-title"><h2>${esc(k)}</h2></div><div class="br-cards">${ITEMS.filter(i=>i.kind===k).map(card).join('')}</div>`).join('')+
  `<div class="br-two"><section class="panel"><div class="panelhead"><h2>하지 말 것</h2></div><div class="panelbody">${list(DONT)}</div></section>`+
  `<section class="panel"><div class="panelhead"><h2>고장 났을 때 다시 사는 순서</h2></div><div class="panelbody">${list(REORDER_STEPS,true)}</div></section></div>`+
  `<section class="panel"><div class="panelhead"><h2>판매자 제작 규칙 · 도안 준비</h2></div><div class="panelbody">${list(MAKER_RULES)}<p class="br-art">${esc(ART_PLAN)}</p></div></section>`+
  `<div class="note">${esc(PRIVATE_NOTE)}</div><div class="note">근거 — ${esc(BRAND_BASIS)}. 가격은 확인일 기준이며 재고·배송일을 약속하지 않습니다.</div>`;
}
