// 재무 '계좌별'(bank.html) — 같은 공용 장부(hub/financeV1)에서 계좌마다 들어온 · 나간 · 이동 · 잔액과 파일 잔액 대조, '사장님 돈' 표(총괄 #15 · #17).
// 읽기만 한다(입력은 재무 '장부 · 요약'의 수기 입력). ERP가 화면을 자주 다시 그리므로 자리(#fin-accounts-panel)가 새로 생길 때마다 다시 붙인다.
import { onAuth, signIn } from './fbauth.js?v=access20261028';
import { openFinStore } from './fin-hub.js?v=classify-undo-20261027';
import { accountsView } from './fin-form.js';

let store = null, book = { entries: {}, sales: {}, meta: {} }, signedIn = false, host = null, loaded = false;

const SHELL = `<div class="panelhead"><h2>계좌별</h2><span class="section-en">공용 장부 하나에서 계좌마다 · 폰과 같은 장부</span></div>
<div class="panelbody">
  <div class="fin-login" hidden><p>공용 장부는 사장님 구글 계정으로만 열려요.</p><button type="button" class="q-btn q-primary fin-signin">구글로 로그인</button><p class="q-msg fin-login-msg" role="alert"></p></div>
  <div class="fin-acct-body" hidden><p class="q-empty">장부를 불러오는 중이에요.</p></div>
  <p class="q-msg fin-list-msg" role="alert"></p>
</div>`;

function draw() {
  if (!host || !loaded) return;
  host.querySelector('.fin-acct-body').innerHTML = accountsView(book)
    + '<p class="acct-help">잔액은 이 장부에 들어온 줄로 계산해요. 파일 잔액과 다르면 그 통장 내역이 시작되기 전의 돈이 장부에 없어서일 수 있어요. 내 계좌 사이 이동은 손익 · 돈 흐름에서 빼고 여기에만 보여요.</p>';
}
function showState() {
  if (!host) return;
  const ok = signedIn || !!window.__MMT_TEST_FIN__;
  host.querySelector('.fin-login').hidden = ok;
  host.querySelector('.fin-acct-body').hidden = !ok;
}
function ensureStore() {
  if (store) return;
  store = openFinStore({ onChange: b => { book = b; loaded = true; draw(); } });
  store.load().catch(err => { const m = host?.querySelector('.fin-list-msg'); if (m) m.textContent = err.message; });
  store.watch();
}
function mount(el) {
  host = el; el.dataset.mounted = '1'; el.classList.add('fin-scope', 'fin-accounts');
  el.innerHTML = SHELL;
  el.querySelector('.fin-signin').addEventListener('click', async () => { try { await signIn(); } catch (err) { el.querySelector('.fin-login-msg').textContent = err.message; } });
  showState(); draw();
}
function scan() { const el = document.getElementById('fin-accounts-panel'); if (el && !el.dataset.mounted) mount(el); }

onAuth(user => { signedIn = !!user; showState(); if (signedIn || window.__MMT_TEST_FIN__) ensureStore(); });
new MutationObserver(scan).observe(document.getElementById('root'), { childList: true, subtree: true });
scan();
