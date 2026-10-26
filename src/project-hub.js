const {PROJECTS, PROJECT_UPDATED_AT, PROJECT_CHECK_NOTE} = await import(`./project-data.js?v=${document.body.dataset.build || 'operations-20261026-1'}`);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const SHOPPING_KEY = 'mumutori-palsibo-20261026-v1';

function shoppingProgress(){
  try {
    const data = JSON.parse(localStorage.getItem(SHOPPING_KEY) || 'null');
    if (!data || data.version !== 1 || !data.checked || typeof data.checked !== 'object') return '';
    const count = Object.values(data.checked).filter(value => value === true).length;
    return count ? `이 기기에서 체크 ${count}개` : '이 기기에서 아직 체크하지 않았어요';
  } catch { return ''; }
}

export function renderProjectCards(currentId = ''){
  return `<div class="ops-project-grid">${PROJECTS.map((project, index) => `<article class="ops-project-card${currentId === project.id ? ' is-current' : ''}" data-project="${esc(project.id)}"><div class="ops-project-meta"><span>${esc(project.kicker)}</span><span class="ops-project-number">${String(index + 1).padStart(2, '0')}</span></div><h3><a href="${esc(project.href)}">${esc(project.title)}<span aria-hidden="true">↗</span></a></h3><ul class="ops-status-list">${project.status.map(line => `<li>${esc(line)}</li>`).join('')}</ul><div class="ops-next"><span>다음 할 일</span><p>${esc(project.next)}</p></div><a class="ops-project-link" href="${esc(project.href)}">프로젝트 열기 <span aria-hidden="true">→</span></a></article>`).join('')}</div>`;
}

export function renderOperationsEntrance(){
  const today = dateLabel() === '2026-10-26';
  const progress = shoppingProgress();
  return `<section class="ops-entrance" aria-label="프로젝트 입구"><a class="ops-shopping-card" href="palsibo-shopping.html"><div class="ops-shopping-copy"><div class="ops-shopping-kicker"><span class="ops-date-badge">10/26 월</span><span>매장에 가기 전, 이 목록 하나</span></div><h2>${today ? '오늘 팔시보 구매' : '팔시보 구매 목록'}<span aria-hidden="true">↗</span></h2><p>다희 님 배치안과 최신 준비물을 한곳에 모았어요.<br>구역별로 확인하고, 산 물건은 휴대폰에서 체크하세요.</p><span class="ops-shopping-action">구매 목록 열기 <b aria-hidden="true">→</b></span><small class="ops-shopping-progress" data-shopping-progress${progress ? '' : ' hidden'}>${progress ? esc(progress) + ' · 같은 브라우저에만 저장' : ''}</small></div><div class="ops-shopping-art" aria-hidden="true"><span class="ops-note-sheet"><i>✓</i><b></b><i>✓</i><b></b><i>○</i><b></b></span><span class="ops-art-label">11/1 OPEN</span></div></a><div class="ops-section-head"><div><span class="ops-eyebrow">PROJECTS</span><h2>모든 프로젝트, 여기에서</h2></div><p><time datetime="${esc(PROJECT_UPDATED_AT)}">${esc(PROJECT_CHECK_NOTE)}</time><span>확인된 상태와 다음 할 일</span></p></div>${renderProjectCards()}</section>`;
}


function refreshShoppingProgress(){
  const progress = shoppingProgress();
  for (const node of document.querySelectorAll('[data-shopping-progress]')) {
    node.hidden = !progress;
    node.textContent = progress ? `${progress} · 같은 브라우저에만 저장` : '';
  }
}
// 뒤로가기로 돌아온 화면도 현장에서 체크한 상태를 바로 보여 줍니다.
globalThis.addEventListener?.('pageshow', refreshShoppingProgress);
globalThis.addEventListener?.('storage', event => { if (event.key === SHOPPING_KEY || event.key === null) refreshShoppingProgress(); });

function renderProjectPage(){
  const root = document.getElementById('project-content');
  if (!root) return;
  const id = new URLSearchParams(location.search).get('project');
  const project = PROJECTS.find(item => item.id === id);
  if (!project) {
    document.title = '프로젝트 모음 — 무무토리 스튜디오';
    root.innerHTML = `<header class="ops-detail-heading"><div class="ops-eyebrow">MUMUTORI PROJECTS</div><h1>모든 프로젝트</h1><p>${esc(PROJECT_CHECK_NOTE)} · 각 프로젝트의 현재 상태와 다음 할 일을 보세요.</p></header>${renderProjectCards()}`;
    return;
  }
  document.title = `${project.title} — 무무토리 스튜디오`;
  root.innerHTML = `<header class="ops-detail-heading"><div class="ops-eyebrow">${esc(project.kicker)}</div><h1>${esc(project.title)}</h1><p><time datetime="${esc(PROJECT_UPDATED_AT)}">${esc(PROJECT_CHECK_NOTE)}</time> · 운영 홈과 같은 내용이에요.</p></header><div class="ops-detail-grid"><section class="ops-detail-panel"><h2>지금 상태</h2><ol class="ops-detail-status">${project.status.map((line, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${esc(line)}</p></li>`).join('')}</ol><div class="ops-detail-next"><span>다음 할 일</span><p>${esc(project.next)}</p></div></section><section class="ops-detail-panel ops-destinations"><h2>연결된 페이지</h2><p>필요한 화면으로 바로 이동하세요.</p><div class="ops-destination-list">${project.links.map(link => `<a href="${esc(link.href)}"${link.href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}><span>${esc(link.label)}</span><b aria-hidden="true">↗</b></a>`).join('')}</div><a class="ops-back-link" href="index.html#projects">← 운영 홈으로</a></section></div><section class="ops-other-projects"><div class="ops-section-head"><div><span class="ops-eyebrow">KEEP GOING</span><h2>다른 프로젝트</h2></div></div>${renderProjectCards(project.id)}</section>`;
}

renderProjectPage();
