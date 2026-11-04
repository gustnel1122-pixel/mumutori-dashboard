// QR 현황 (사장님 11/4 "현재 큐알 랜딩 현황을 운영홈 어디다 따로 만들어둬야할것같아")
// 매장 · 화면 · 인쇄물에 들어간 QR마다: 어디에 붙었나 · QR 주소 · 지금 가는 곳 · 상태 · 바꿀 계획.
// go/ 주소(레터 사이트의 넘김 페이지)는 그 파일을 직접 읽어 '지금 실제로 가는 곳'을 보여 준다(읽기만).
const build = document.body.dataset.build || 'qr-20261104';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { printed: ['인쇄됨', 'is-printed'], draft: ['시안', 'is-draft'], screen: ['화면', 'is-screen'], text: ['글자', 'is-text'], plan: ['기획', 'is-plan'] };
const LETTER = 'https://letter.mumutori.com/';
const short = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

// 넘김 페이지에서 가는 곳 읽기: var GO = '…' (없으면 meta refresh)
export function readGo(html) {
  const s = String(html || '');
  const m = s.match(/var\s+GO\s*=\s*'([^']+)'/) || s.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i);
  if (!m) return '';
  try { const u = new URL(m[1]); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

function card(it) {
  const [kindLabel, kindCls] = KIND[it.kind] || ['', ''];
  const qr = it.qr ? `<a href="${esc(it.qr)}" target="_blank" rel="noopener noreferrer">${esc(short(it.qr))}</a>` : '<span class="qr-none">없음</span>';
  const dest = it.dest ? `<a href="${esc(it.dest)}" target="_blank" rel="noopener noreferrer">${esc(it.destName || short(it.dest))}</a><small>${esc(short(it.dest))}</small>` : '<span class="qr-none">정해지지 않음</span>';
  const changeable = it.go ? '<span class="qr-tag ok">가는 곳만 바꿀 수 있음</span>' : it.qr && it.kind === 'printed' ? '<span class="qr-tag warn">인쇄 뒤엔 못 바꿈</span>' : '';
  const live = it.go ? `<div class="qr-live" data-go="${esc(it.go)}" data-expect="${esc(it.dest || '')}"><span class="qr-live-dot" aria-hidden="true"></span><span class="qr-live-text">지금 실제로 가는 곳 확인 중…</span></div>` : '';
  const hist = Array.isArray(it.history) && it.history.length ? `<details class="qr-hist"><summary>바꾼 기록 ${it.history.length}</summary><ul>${it.history.map(([d, t]) => `<li><b>${esc(d)}</b> ${esc(t)}</li>`).join('')}</ul></details>` : '';
  return `<article class="qr-card ${kindCls}" id="qr-${esc(it.id)}">
    <div class="qr-top"><span class="qr-kind">${esc(kindLabel)}</span>${changeable}</div>
    <h2>${esc(it.place)}</h2>${it.caption ? `<p class="qr-cap">${esc(it.caption)}</p>` : ''}
    <dl class="qr-dl"><div><dt>QR 주소</dt><dd>${qr}</dd></div><div><dt>지금 가는 곳</dt><dd>${dest}</dd></div><div><dt>상태</dt><dd>${esc(it.status || '')}</dd></div></dl>
    ${live}
    ${it.plan ? `<div class="qr-plan"><span>다음</span><p>${esc(it.plan)}</p></div>` : ''}
    ${hist}
  </article>`;
}

async function checkLive(el) {
  const text = el.querySelector('.qr-live-text');
  try {
    const r = await fetch(LETTER + el.dataset.go, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const go = readGo(await r.text());
    if (!go) throw new Error('no target');
    const same = el.dataset.expect && go.replace(/\/$/, '') === el.dataset.expect.replace(/\/$/, '');
    el.classList.add(same ? 'is-same' : 'is-diff');
    text.innerHTML = same ? `방금 확인: 기록대로 <b>${esc(short(go))}</b> 로 가요` : `방금 확인: 실제로는 <b>${esc(short(go))}</b> 로 가요 — 이 표의 기록과 달라요(총괄에게 알려 주세요)`;
  } catch {
    el.classList.add('is-unknown');
    text.textContent = '지금은 확인하지 못했어요 (인터넷 · 사이트 상태를 확인해 주세요). 표의 기록을 보세요.';
  }
}

async function main() {
  const root = document.getElementById('qr-content');
  let data;
  try { const r = await fetch('src/qr-data.json?v=' + encodeURIComponent(build), { cache: 'no-store' }); data = await r.json(); }
  catch { root.innerHTML = '<p class="ops-loading">QR 목록을 불러오지 못했어요. 새로 고침해 주세요.</p>'; return; }
  const items = Array.isArray(data.items) ? data.items : [];
  const live = items.filter((i) => i.qr && i.kind !== 'plan').length;
  root.innerHTML = `<header class="ops-detail-heading"><div class="ops-eyebrow">매장 · 화면 · 인쇄물</div><h1>QR 현황</h1><p>QR ${live}개 · 기획 ${items.filter((i) => i.kind === 'plan').length}개 · ${esc(String(data.checkedAt || '').slice(5).replace('-', '/'))} 기록 · go/ 주소는 이 화면이 직접 확인해요</p></header>
  <div class="qr-rule"><b>규칙</b><p>${esc(data.rule || '')}</p><p class="qr-how">${esc(data.howToChange || '')}</p></div>
  <div class="qr-grid">${items.map(card).join('')}</div>`;
  root.querySelectorAll('.qr-live').forEach(checkLive);
}
if (document.getElementById('qr-content')) main();
