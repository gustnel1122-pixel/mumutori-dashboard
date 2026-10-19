// PC 재무 화면(finance.html) 맨 위 '수기 입력 · 확인 필요' 패널 — 휴대폰 화면(quick.html)과 같은 부품(fin-form) · 같은 공용 장부(hub/financeV1).
// ERP 화면은 이 PC 저장(localStorage)으로 그려지고 자주 다시 그려지므로, 패널 자리(#fin-hub-panel)가 새로 생길 때마다 다시 붙인다(장부 연결은 하나로 유지).
import { onAuth, signIn } from './fbauth.js';
import { openFinStore } from './fin-hub.js';
import { mountEntryForm, renderLists, bindListActions } from './fin-form.js';

let store = null, book = { entries: {}, sales: {}, meta: {} }, signedIn = false, host = null;

const SHELL = `<div class="panelhead"><h2>수기 입력 · 확인 필요</h2><span class="section-en">공용 장부 · 폰과 같은 칸</span></div>
<div class="panelbody">
  <div class="fin-login" hidden><p>공용 장부는 사장님 구글 계정으로만 열려요. 휴대폰 입력 · 결제 알림이 같은 장부에 쌓입니다.</p><button type="button" class="q-btn q-primary fin-signin">구글로 로그인</button><p class="q-msg fin-login-msg" role="alert"></p></div>
  <div class="fin-cols" hidden>
    <div><form class="fin-form" autocomplete="off"></form></div>
    <div>
      <div class="fin-needs-box" hidden><h3>확인 필요 <b>0</b>건 <small>— 분류만 고르면 저장돼요</small></h3><div class="f-needs-rows"></div></div>
      <h3 class="fin-recent-h">최근 기록</h3><div class="fin-recent"></div><p class="q-msg fin-list-msg" role="alert"></p>
      <a class="inline-link" href="quick.html">폰 화면으로 열기 <span aria-hidden="true">↗</span></a>
    </div>
  </div>
</div>`;

function draw() {
  if (!host) return;
  const n = renderLists({ book, needsRoot: host.querySelector('.fin-needs-box'), recentRoot: host.querySelector('.fin-recent'), recentCount: 6 });
  host.querySelector('.fin-needs-box h3 b').textContent = n;
}
function showState() {
  if (!host) return;
  const ok = signedIn || !!window.__MMT_TEST_FIN__;
  host.querySelector('.fin-login').hidden = ok;
  host.querySelector('.fin-cols').hidden = !ok;
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
  bindListActions(el, { store: () => store, book: () => book, onError: m => { el.querySelector('.fin-list-msg').textContent = m; } });
  el.querySelector('.fin-signin').addEventListener('click', async () => { try { await signIn(); } catch (err) { el.querySelector('.fin-login-msg').textContent = err.message; } });
  showState(); draw();
}
function scan() { const el = document.getElementById('fin-hub-panel'); if (el && !el.dataset.mounted) mount(el); }

onAuth(user => { signedIn = !!user; showState(); if (signedIn || window.__MMT_TEST_FIN__) ensureStore(); });
new MutationObserver(scan).observe(document.getElementById('root'), { childList: true, subtree: true });
scan();
