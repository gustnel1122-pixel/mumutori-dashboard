const D=await import(`../agents-data.js?v=${document.body.dataset.build}`);
export default function renderPage(ctx){
  const {esc,head,badge}=ctx;
  const {ORG_UPDATED,ORG_EDITOR,OWNER,HUB,AGENTS,PROJECTS,STATUS,PAIRING,LOOP=[]}=D;
  const st=s=>{const [label,tone]=STATUS[s]||[s,''];return `<span class="org-status ${tone}"><i></i>${esc(label)}</span>`;};
  const list=(items,cls='')=>items.length?`<ul class="org-list ${cls}">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'';
  const nameOf=id=>id==='hub'?HUB.name:(AGENTS.find(a=>a.id===id)?.name||id);
  const card=a=>`<article class="org-card org-${a.status}" id="agent-${esc(a.id)}"><header><div><b>${esc(a.name)}</b><small>${esc(a.kind)}</small><code class="org-seat">${esc(a.seat||'')}</code></div>${st(a.status)}</header><p class="org-role">${esc(a.role)}</p>${list(a.scope)}${a.out?.length?`<p class="org-out">맡지 않는 일</p>${list(a.out,'muted')}`:''}<footer><span>연결 · ${esc(a.channel)}</span>${a.checked?`<span>확인 ${esc(a.checked)}</span>`:''}${a.note?`<span>${esc(a.note)}</span>`:''}</footer></article>`;
  const teams=[...new Set(AGENTS.map(a=>a.team))];
  const counts=Object.fromEntries(Object.keys(STATUS).map(k=>[k,AGENTS.filter(a=>a.status===k).length]));
  return head('AI 조직도','무무토리 일을 나눠 맡은 AI 담당과 연결 상태입니다. 담당이 바뀌면 총괄 Claude가 이 화면과 기록을 함께 고칩니다.')+
  `<div class="org-meta"><span>마지막 갱신 <b>${esc(ORG_UPDATED)}</b> · ${esc(ORG_EDITOR)}</span><span>${badge('연결됨 '+counts.active)} ${counts.ready?badge('준비됨 '+counts.ready)+' ':''}${badge('연결 시험 전 '+counts.pending)} ${badge('쉬는 중 '+counts.idle)}</span></div>`+
  `<section class="org-tree" aria-label="조직도"><div class="org-node org-owner"><small>결정권자</small><b>${esc(OWNER.name)}</b><span>${esc(OWNER.role)}</span></div><div class="org-line" aria-hidden="true"></div>`+
  `<div class="org-node org-hub"><small>${esc(HUB.kind)}</small><b>${esc(HUB.name)}</b><code class="org-seat">${esc(HUB.seat||'')}</code><span>${esc(HUB.role)}</span>${st(HUB.status)}${list(HUB.scope,'inline')}</div><div class="org-line" aria-hidden="true"></div>`+
  `<div class="org-teams">${teams.map(t=>`<div class="org-team"><h3>${esc(t)}</h3>${AGENTS.filter(a=>a.team===t).map(card).join('')}</div>`).join('')}</div></section>`+
  `<div class="panel"><div class="panelhead"><h2>프로젝트별 책임</h2></div><div class="tablewrap"><table class="table"><thead><tr><th>프로젝트</th><th>책임</th><th>도움</th><th>메모</th></tr></thead><tbody>${PROJECTS.map(p=>`<tr><td class="maincell"><b>${esc(p.name)}</b></td><td>${esc(nameOf(p.lead))}</td><td>${esc(p.helpers.map(nameOf).join(', ')||'—')}</td><td>${esc(p.note)}</td></tr>`).join('')}</tbody></table></div></div>`+
  `<div class="note org-pair"><b>코드 작업 2인조</b> — ${esc(PAIRING||'')}</div>`+
  (LOOP.length?`<div class="note org-loop"><b>학습 루프</b> — 일하면서 배운 것을 담당별 플레이북에 쌓아 다음 일에 씁니다.${list(LOOP)}</div>`:'')+
  `<div class="note">일하는 방식 — 사장님은 총괄 Claude에게만 말하면 됩니다. 총괄이 담당에게 "[총괄 Claude 전달]"로 지시하고, 받았는지·했는지·결과를 확인해 보고합니다. 발주·결제·삭제·보안 변경은 사장님이 직접 승인한 것만 전달합니다. 모든 작업은 옵시디언 볼트(AI 인계 로그·각 프로젝트 정본)에 남깁니다. 로그인은 사장님이 직접 합니다(AI는 저장된 비밀번호·자동완성으로 로그인하지 않음). 로그인된 것이 감지되면 담당이 알아서 이어서 일하고, API 키는 키 넣는 창에 사장님이 직접 넣습니다.</div>`;
}
