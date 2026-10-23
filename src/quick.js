// 재무 빠른 장부(quick.html) — 휴대폰 화면. 위: 오늘 · 이번 달 요약, 가운데: 수기 입력(공용 부품 fin-form), 아래: 확인 필요 · 최근 기록.
// 장부는 Firebase hub/financeV1(사장님 로그인 전용). PC 재무 화면(fin-panel.js)과 같은 부품 · 같은 줄 모양을 쓴다.
import { onAuth, signIn } from './fbauth.js';
import { openFinStore } from './fin-hub.js';
import { mountEntryForm, renderLists, bindListActions, rememberNeeds, coupangCalendar, accountsView, esc, won } from './fin-form.js';

const F = window.FinCore;
const $ = s => document.querySelector(s);
let store = null, book = { entries: {}, sales: {}, meta: {} }, period = 'month', form = null, loaded = false, recentCount = 10;
const CONN = { loading: '불러오는 중', ok: '연결됨', offline: '연결 끊김 · 다시 시도', denied: '권한 없음' };

function card(label, value, note, cls = '') {
  return `<div class="q-stat ${cls}"><span>${esc(label)}</span><strong class="amt">${won(value)}<em>원</em></strong><small>${esc(note)}</small></div>`;
}
function drawSummary() {
  const s = F.summarize(book, period);
  $('#q-sum').innerHTML =
    card('매출', s.sales, (s.salesConnected ? `채널 ${won(s.orders)}건 + 수기 입력` : '채널 매출 연결 전(수기 입력만)') + (s.outsideSales ? ` · 외주 매출 ${won(s.outsideSales)}원 포함` : '')) +
    card('지출', s.spend, s.byCategory.slice(0, 3).map(r => r.category).join(' · ') || '기록 없음') +
    // 채널 매출 연결 전에는 손익 대신 돈 흐름(매출 없이 지출만 보여 적자로 오해하지 않게 — 검수 9)
    (s.salesConnected
      ? card('남는 돈(추정)', s.net, (s.feeKnown ? '매출 − 수수료 − 지출' : '수수료 정산 전 · 추정') + (s.stockBuy ? ' · 매입 포함' : ''), s.net < 0 ? 'minus' : '')
      : card('돈 흐름', s.cashFlow, F.flowNote(s) + ' · 매출 연결 전이라 손익 아님' + (s.stockBuy ? ' · 상품 매입은 재고로 남는 돈' : ''))) +   // 검수 14
    card('부가세 예상', s.vat, '참고용 · 신고는 세무 확인', s.vat < 0 ? 'minus' : '');
  document.querySelectorAll('.q-tabs [data-period]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.period === period)));
}
function draw() {
  drawSummary();
  $('#q-settle').innerHTML = coupangCalendar(book.meta, book.entries);   // 쿠팡 돈 달력(왜 0원인지 · 언제 들어오는지)
  const n = renderLists({ book, needsRoot: $('#q-needs-list'), recentRoot: $('#q-recent'), recentCount });
  if ($('#q-accounts-body')) $('#q-accounts-body').innerHTML = accountsView(book);   // 계좌별(PC '계좌별'과 같은 말 — 총괄 #15)
  $('#q-needs').hidden = !n; $('#q-needs b').textContent = n;
  if (loaded) rememberNeeds(n);   // 홈 '챙길 일' 건수(건수 · 시각만)
}

function start() {
  document.addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.period) { period = t.dataset.period; drawSummary(); }
    else if (t.id === 'q-signin') { $('#q-login-msg').textContent = ''; try { await signIn(); } catch (err) { $('#q-login-msg').textContent = err.message; } }
  });
  onAuth(user => {
    const test = !!window.__MMT_TEST_FIN__;
    $('#q-login').hidden = !!user || test; $('#q-app').hidden = !(user || test);
    if (!(user || test)) { $('#q-conn').textContent = '로그인 필요'; return; }
    if (store) return;
    store = openFinStore({ onChange: b => { book = b; loaded = true; draw(); }, onStatus: s => { $('#q-conn').textContent = CONN[s] || s; $('#q-conn').dataset.state = s; } });
    form = mountEntryForm($('#q-form'), { store: () => store, book: () => book, source: 'phone' });
    bindListActions($('#q-app'), { store: () => store, book: () => book, onError: m => { $('#q-list-msg').textContent = m; }, onRedraw: draw, onMore: () => { recentCount += 20; draw(); } });
    store.load().then(() => store.processInbox?.()).catch(err => { $('#q-list-msg').textContent = err.message; });
    store.watch();
    form.focus();
  });
}
start();
