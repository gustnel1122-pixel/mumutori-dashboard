// 운영 홈 '다음으로 챙길 일 · 이번 달'을 공용 장부 기준으로(총괄 검수 2번 — 장부 여는 방식은 구글 로그인으로 정해짐, 사장님 10/20 01:17 폰 로그인).
// 로그인돼 있으면 재무 화면과 같은 공용 장부(hub/financeV1)를 읽기만 해서 이번 달 매출 · 지출 · 돈 흐름(매출 연결 뒤엔 남는 돈)과
// 확인 필요 건수를 #home-need-line · #home-month-body에 넣는다. 로그인 전이면 overview.js의 기본 글 아래에 '구글로 로그인' 버튼.
// ERP가 홈을 자주 다시 그리므로, 계산한 글을 기억했다가 자리가 새로 생길 때마다 다시 넣는다(fin-panel.js와 같은 방식).
import { onAuth, signIn } from './fbauth.js';
import { openFinStore } from './fin-hub.js';
import { rememberNeeds, esc, won } from './fin-form.js';

let view = null, store = null, signedIn = false;

function compute(book) {
  const F = window.FinCore;
  const s = F.summarize(book, 'month'), n = s.needs;
  rememberNeeds(n);
  const key = [s.sales, s.spend, s.cashFlow, s.net, n].join('|');
  const [label, value] = s.salesConnected ? ['남는 돈(추정)', s.net] : ['돈 흐름(들어온 돈 − 나간 돈)', s.cashFlow];
  const basis = window.__MMT_DEMO__ ? '시연 자료' : '공용 장부 · 지금';
  view = {
    key,
    need: `<a class="task-link${n ? ' task-hot' : ''}" id="home-need-line" data-live="${esc(key)}" href="finance.html${n ? '#fin-needs' : ''}"><span class="task-dept tone-blue">재무</span>`
      + `<b>${n ? '확인 필요 결제 · 분류 · 수단 빈칸' : '확인 필요 없음'}<small class="task-basis">${basis}</small></b><strong>${won(n)}<em>건</em></strong><span class="task-arrow">↗</span></a>`,
    month: `<div class="mini-row"><span>매출</span><strong>${won(s.sales)}원</strong></div><div class="mini-row"><span>지출</span><strong>${won(s.spend)}원</strong></div>`
      + `<div class="mini-row"><span>${label}</span><strong>${won(value)}원</strong></div>`
      + (s.salesConnected ? '' : `<p class="flow-note">= ${esc(F.flowNote(s))}</p>`)   // 검수 14: 매출 − 지출과 다른 까닭
      + `<p>${s.salesConnected ? '채널 매출 · 수수료 반영 추정' : '채널 매출 연결 전이라 실제 손익 아님'} · ${window.__MMT_DEMO__ ? '시연 자료' : '공용 장부(폰 · PC 같은 장부)'}</p>`
      + `<a class="inline-link" href="finance.html">재무에서 자세히 <span aria-hidden="true">↗</span></a>`
  };
  render();
}

function render() {
  const need = document.getElementById('home-need-line'), month = document.getElementById('home-month-body');
  if (!need || !month) return;
  if (view) {
    if (need.dataset.live !== view.key) need.outerHTML = view.need;
    if (month.dataset.live !== view.key) { month.innerHTML = view.month; month.dataset.live = view.key; }
  } else if (!signedIn && !window.__MMT_TEST_FIN__ && !month.querySelector('#home-signin')) {
    month.insertAdjacentHTML('beforeend', '<button type="button" class="btn primary" id="home-signin">구글로 로그인하면 여기 바로 보여요</button><p class="home-signin-msg" role="alert"></p>');
  }
}

document.addEventListener('click', async ev => {
  if (!ev.target.closest('#home-signin')) return;
  const msg = document.querySelector('.home-signin-msg');
  try { await signIn(); } catch (err) { if (msg) msg.textContent = err.message; }
});
onAuth(user => {
  signedIn = !!user;
  if ((signedIn || window.__MMT_TEST_FIN__) && !store) {
    store = openFinStore({ onChange: compute });
    store.load().catch(() => {});   // 못 읽으면 기본 글 그대로(틀린 숫자보다 빈칸)
    store.watch();
  }
  render();
});
new MutationObserver(render).observe(document.getElementById('root'), { childList: true, subtree: true });
render();
