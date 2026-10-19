// PC 재무 화면(finance.html) 맨 위 '수기 입력 · 확인 필요' 패널 — 휴대폰 화면(quick.html)과 같은 부품(fin-form) · 같은 공용 장부(hub/financeV1).
// ERP 화면은 이 PC 저장(localStorage)으로 그려지고 자주 다시 그려지므로, 패널 자리(#fin-hub-panel)가 새로 생길 때마다 다시 붙인다(장부 연결은 하나로 유지).
import { onAuth, signIn } from './fbauth.js';
import { openFinStore } from './fin-hub.js';
import { mountEntryForm, renderLists, bindListActions, esc, won } from './fin-form.js';

let store = null, book = { entries: {}, sales: {}, meta: {} }, signedIn = false, host = null;

const SHELL = `<div class="panelhead"><h2>이번 달 장부 · 수기 입력</h2><span class="section-en">공용 장부 · 폰과 같은 칸</span></div>
<div class="panelbody">
  <div class="metrics fin-sum" hidden></div>
  <div class="fin-login" hidden><p>공용 장부는 사장님 구글 계정으로만 열려요. 휴대폰 입력 · 결제 알림이 같은 장부에 쌓입니다.</p><button type="button" class="q-btn q-primary fin-signin">구글로 로그인</button><p class="q-msg fin-login-msg" role="alert"></p></div>
  <div class="fin-cols" hidden>
    <div><form class="fin-form" autocomplete="off"></form></div>
    <div>
      <div class="fin-needs-box" id="fin-needs" hidden><h3>확인 필요 <b>0</b>건 <small>— 분류 · 결제 수단만 고르면 저장돼요</small></h3><div class="f-needs-rows"></div></div>
      <h3 class="fin-recent-h">최근 기록</h3><div class="fin-recent"></div><p class="q-msg fin-list-msg" role="alert"></p>
      <a class="inline-link" href="quick.html">폰 화면으로 열기 <span aria-hidden="true">↗</span></a>
    </div>
  </div>
</div>`;

// 이번 달 요약(공용 장부 기준 — 검수 기준 3 '장부는 하나'). 아래 옛 장부(이 브라우저) 숫자와 섞지 않는다.
function metric(label, value, note, cls = '', href = '') {
  const inner = `<small>${esc(label)}</small><strong class="amt">${won(value)}<em>${label.startsWith('확인') ? '건' : '원'}</em></strong><footer>${esc(note)}</footer>`;
  return href ? `<a class="metric metric-link ${cls}" href="${href}">${inner}</a>` : `<div class="metric ${cls}">${inner}</div>`;
}
// 채널 매출이 아직 안 붙었으면 '남는 돈'(손익) 대신 '돈 흐름'을 보인다 — 매출 없이 지출만 보이면 적자로 오해(검수 9)
function moneyCard(s) {
  if (!s.salesConnected) {
    const note = '들어온 돈 − 나간 돈 · 채널 매출 연결 전이라 실제 손익 아님' + (s.stockBuy ? ' · 상품 매입은 재고로 남는 돈(손익 아님)' : '');
    return metric('이번 달 돈 흐름', s.cashFlow, note, 'neutral');
  }
  return metric('남는 돈(추정)', s.net, (s.feeKnown ? '매출 − 수수료 − 지출' : '수수료 정산 전 · 추정') + (s.stockBuy ? ' · 상품 매입 포함(재고로 남는 돈)' : ''), s.net < 0 ? 'minus' : '');
}
function drawSummary(needs) {
  const el = host.querySelector('.fin-sum');
  const s = window.FinCore.summarize(book, 'month');
  el.innerHTML = metric('이번 달 매출', s.sales, s.salesConnected ? '채널 매출 + 수기 입력' : '채널 매출 연결 전 · 수기 입력만') +
    metric('이번 달 지출', s.spend, s.byCategory.slice(0, 3).map(r => r.category).join(' · ') || '기록 없음') +
    moneyCard(s) +
    metric('확인 필요', needs, needs ? '누르면 그 줄로 · 분류 · 수단만 고르면 끝' : '지금 없음', needs ? 'attention' : '', needs ? '#fin-needs' : '');
}
function draw() {
  if (!host) return;
  const n = renderLists({ book, needsRoot: host.querySelector('.fin-needs-box'), recentRoot: host.querySelector('.fin-recent'), recentCount: 6 });
  host.querySelector('.fin-needs-box h3 b').textContent = n;
  drawSummary(n);
}
function showState() {
  if (!host) return;
  const ok = signedIn || !!window.__MMT_TEST_FIN__;
  host.querySelector('.fin-login').hidden = ok;
  host.querySelector('.fin-cols').hidden = !ok;
  host.querySelector('.fin-sum').hidden = !ok;
}
function ensureStore() {
  if (store) return;
  store = openFinStore({ onChange: b => { book = b; draw(); } });
  store.load().then(() => store.processInbox()).catch(err => { const m = host?.querySelector('.fin-list-msg'); if (m) m.textContent = err.message; });
  store.watch();
}
function mount(el) {
  host = el; el.dataset.mounted = '1'; el.classList.add('fin-scope', 'fin-panel');
  el.innerHTML = SHELL;
  mountEntryForm(el.querySelector('.fin-form'), { store: () => store, book: () => book, source: 'manual' });
  bindListActions(el, { store: () => store, book: () => book, onError: m => { el.querySelector('.fin-list-msg').textContent = m; }, onRedraw: draw });
  el.querySelector('.fin-signin').addEventListener('click', async () => { try { await signIn(); } catch (err) { el.querySelector('.fin-login-msg').textContent = err.message; } });
  showState(); draw();
}
function scan() { const el = document.getElementById('fin-hub-panel'); if (el && !el.dataset.mounted) mount(el); }

onAuth(user => { signedIn = !!user; showState(); if (signedIn || window.__MMT_TEST_FIN__) ensureStore(); });
// 옛 장부 접힘 칸: ERP가 화면을 다시 그려도 연 상태를 유지(이 탭 동안만)
document.addEventListener('toggle', e => { if (e.target.classList?.contains('legacy-ledger')) { try { sessionStorage.setItem('mmt-fin-legacy-open', e.target.open ? '1' : '0'); } catch { /* 저장소 없음 */ } } }, true);
new MutationObserver(scan).observe(document.getElementById('root'), { childList: true, subtree: true });
scan();
