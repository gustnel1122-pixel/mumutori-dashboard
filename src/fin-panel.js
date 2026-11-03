import {createFinSession} from './fin-session.js?v=access20261028';
import {mountBankReviewUI} from './fin-review-ui.js?v=bankpairs20261029';
// PC 재무 화면(finance.html) 맨 위 '수기 입력 · 확인 필요' 패널 — 휴대폰 화면(quick.html)과 같은 부품(fin-form) · 같은 공용 장부(hub/financeV1).
// ERP 화면은 이 PC 저장(localStorage)으로 그려지고 자주 다시 그려지므로, 패널 자리(#fin-hub-panel)가 새로 생길 때마다 다시 붙인다(장부 연결은 하나로 유지).
import { onAuth, signIn } from './fbauth.js?v=access20261028';
import { openFinStore } from './fin-hub.js?v=bankpairs20261029';
import { mountEntryForm, renderLists, bindListActions, rememberNeeds, coupangCalendar, ledgerFilter, glanceView, chatLog, chatOn, chatBusy, esc, won } from './fin-form.js?v=chat20261103';

let store = null, book = { entries: {}, sales: {}, meta: {} }, signedIn = false, host = null, loaded = false, jumped = false;
let activeUid='',reviewUI=null;
// 장부 거르기(계좌 · 수단) — 계좌별 화면의 '이 계좌 줄 보기'는 ?account= 로 온다
const filter = (() => { try { const q = new URLSearchParams(location.search); return { account: q.get('account') || '', method: q.get('method') || '' }; } catch { return { account: '', method: '' }; } })();
let ledgerCount = filter.account || filter.method ? 20 : 8;

const SHELL = `<div class="panelhead"><h2>이번 달 장부 · 수기 입력</h2><span class="section-en">공용 장부 · 폰과 같은 칸</span></div>
<div class="panelbody">
  <div class="fin-glance" hidden></div>
  <section class="fin-chat" hidden aria-label="AI에게 말하기"><h3>AI에게 말하기 <small>"이건 이런 거야" 하면 맞는 거래를 찾아 분류해요</small></h3>
    <div class="fc-log" aria-live="polite"></div>
    <form class="fc-form" autocomplete="off"><textarea rows="2" maxlength="300" placeholder="예: 11/2 다이소 12,000원은 포장 상자야 (날짜 · 금액 · 가게를 같이 적으면 잘 찾아요)"></textarea><button type="submit" class="q-btn q-primary">보내기</button></form>
    <p class="fc-note">Claude에는 보낸 말과 후보 거래의 날짜 · 금액만 가요(카드번호 · 이름은 지우고) · 확실한 것만 바로 분류하고, 애매하면 되물어요 · 줄마다 되돌리기 가능</p><p class="q-msg fc-err" role="alert"></p>
  </section>
  <div class="metrics fin-sum" hidden></div>
  <div class="fin-settle" hidden></div>
  <div class="fin-login" hidden><p>공용 장부는 공동 운영 Google 계정으로만 열려요. 휴대폰 입력 · 결제 알림이 같은 장부에 쌓입니다.</p><button type="button" class="q-btn q-primary fin-signin">구글로 로그인</button><p class="q-msg fin-login-msg" role="alert"></p></div>
  <div class="fin-cols" hidden>
    <div><form class="fin-form" autocomplete="off"></form></div>
    <div>
    <div class="fin-needs-box" id="fin-needs" hidden><h3>확인 필요 <b>0</b>건 <small>— 은행 알림과 장부 분류를 확인해 주세요</small></h3><div class="f-needs-rows"></div></div>
      <h3 class="fin-recent-h" id="fin-ledger">장부 <small>모든 돈 · 계좌 · 수단으로 거르기</small></h3><div class="fin-filter-box"></div><div class="fin-recent"></div><p class="q-msg fin-list-msg" role="alert"></p>
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
    const note = window.FinCore.flowNote(s) + ' · 채널 매출 연결 전이라 실제 손익 아님' + (s.stockBuy ? ' · 상품 매입은 재고로 남는 돈(손익 아님)' : '');   // 검수 14
    return metric('이번 달 돈 흐름', s.cashFlow, note, 'neutral');
  }
  return metric('남는 돈(추정)', s.net, (s.feeKnown ? '매출 − 수수료 − 지출' : '수수료 정산 전 · 추정') + (s.stockBuy ? ' · 상품 매입 포함(재고로 남는 돈)' : ''), s.net < 0 ? 'minus' : '');
}
function drawSummary(needs) {
  const el = host.querySelector('.fin-sum');
  const s = window.FinCore.summarize(book, 'month');
  el.innerHTML = metric('이번 달 매출', s.sales, (s.salesConnected ? '채널 매출 + 수기 입력' : '채널 매출 연결 전 · 수기 입력만')
      + (s.outsideSales ? ` · 외주 매출 ${won(s.outsideSales)}원 포함(상품 매출과 따로 · 세무 확인)` : '')) +
    metric('이번 달 지출', s.spend, (s.byCategory.slice(0, 3).map(r => r.category).join(' · ') || '기록 없음')
      + (s.ownerMeal ? ` · 식비(본인) ${won(s.ownerMeal)}원 포함 — 신고 때 세무 확인` : '')) +   // 대표 본인 식사는 경비 인정이 안 될 수 있어 따로 보인다
    moneyCard(s) +
      metric('확인 필요', needs, needs ? '누르면 확인할 기록으로 이동' : '지금 없음', needs ? 'attention' : '', needs ? '#fin-needs' : '');
}
function draw() {
  if (!host) return;
  const fb = host.querySelector('.fin-filter-box');
  if (!fb.firstChild) fb.innerHTML = ledgerFilter(filter);
  let n = renderLists({ book, needsRoot: host.querySelector('.fin-needs-box'), recentRoot: host.querySelector('.fin-recent'), recentCount: ledgerCount, filter, chatBox: true });
  n+=reviewUI?.decorate(host.querySelector('.fin-needs-box'),host.querySelector('.fin-recent'))||0;
  host.querySelector('.fin-needs-box h3 b').textContent = n;
  drawSummary(n);
  host.querySelector('.fin-glance').innerHTML = glanceView(book);   // 맨 위 '돈 한눈에'(사장님 11/3)
  drawChat();
  host.querySelector('.fin-settle').innerHTML = coupangCalendar(book.meta, book.entries);   // 쿠팡 돈 달력(주차표가 없으면 한 줄 칸)
  if (!loaded) return;
  rememberNeeds(n);
  // 홈 '챙길 일'에서 finance.html#fin-needs로 왔으면, 장부를 읽은 뒤 그 줄로 한 번 내려간다
  if (!jumped && location.hash === '#fin-needs' && n) { jumped = true; host.querySelector('#fin-needs')?.scrollIntoView({ block: 'center' }); }
  if (!jumped && location.hash === '#fin-ledger') { jumped = true; host.querySelector('#fin-ledger')?.scrollIntoView({ block: 'start' }); }
}
// 위 채팅창: 켜졌을 때만(Apps Script가 meta/aiChat.on 을 켬) 보이고, 대화 줄만 다시 그린다 — 쓰던 글은 그대로.
function drawChat() {
  if (!host) return;
  const box = host.querySelector('.fin-chat'), log = box.querySelector('.fc-log'), html = chatLog(book);
  box.hidden = !session.allowed || !chatOn(book);
  if (log.dataset.html !== html) { log.dataset.html = html; log.innerHTML = html; log.scrollTop = log.scrollHeight; }
  if (chatBusy(book) && !chatTimer) chatPoll();
}
// 보낸 뒤 답이 올 때까지 5초마다 대화 칸만 다시 읽음(최대 3분) → 답이 오면 장부 전체를 한 번 새로 읽어 바뀐 분류를 보인다.
// 바로 답하기 요청이 끝나면(보통 5~10초) 기다리지 않고 바로 한 번 읽는다.
let chatTimer = 0;
function chatPoll(n = 0, wait = 5000) {
  clearTimeout(chatTimer); chatTimer = 0;
  if (!store || n > 36) return;
  chatTimer = setTimeout(async () => {
    chatTimer = 0;
    try { await store.chatRefresh(); if (chatBusy(book)) chatPoll(n + 1); else await store.load(); }
    catch { chatPoll(n + 1); }
  }, wait);
}
function showState() {
  if (!host) return;
  const ok = session.allowed;
  host.querySelector('.fin-login').hidden = ok;
  host.querySelector('.fin-cols').hidden = !ok;
  host.querySelector('.fin-sum').hidden = !ok;
  host.querySelector('.fin-glance').hidden = !ok;
  host.querySelector('.fin-chat').hidden = !ok || !chatOn(book);
  host.querySelector('.fin-settle').hidden = !ok;
}
const session=createFinSession({open:openFinStore,processInbox:true,onBook:b=>{book=b||{entries:{},sales:{},meta:{}};loaded=!!b;draw();if(!b&&host){const old=host.querySelector('.fin-form'),fresh=old.cloneNode(false);old.replaceWith(fresh);mountEntryForm(fresh,{store:()=>store,book:()=>book,source:'manual'});}showState();},onState:(state)=>{showState();const m=host?.querySelector('.fin-login-msg');if(m)m.textContent=state==='loading'?'서버 권한을 확인하고 있어요.':state==='denied'?'이 계정의 공용 장부 접근을 확인하지 못했어요.':'';}});
function mount(el) {
  host = el; el.dataset.mounted = '1'; el.classList.add('fin-scope', 'fin-panel');
  el.innerHTML = SHELL;
  reviewUI=mountBankReviewUI({host:el,getBook:()=>book,getStore:()=>store,getUid:()=>activeUid,onSuccess:(type,action)=>{const m=host?.querySelector('.fin-list-msg');if(m)m.textContent=type==='bank'?'은행 알림을 장부에 확인했어요.':type==='collector'?(action==='keep'?'기존 자료를 유지했어요.':'새 제안을 적용했어요.'):type==='transfer'?(action==='keep'?'기존 짝을 유지했어요. 늦은 후보는 확인 대기에 남아요.':'선택한 계좌 이동 짝을 반영했어요.'):'확인한 내용을 장부에 반영했어요.';}});
  mountEntryForm(el.querySelector('.fin-form'), { store: () => store, book: () => book, source: 'manual' });
  bindListActions(el, { store: () => store, book: () => book, onError: m => { el.querySelector('.fin-list-msg').textContent = m; }, onRedraw: draw, onMore: () => { ledgerCount += 20; draw(); } });
  el.addEventListener('change', ev => { const k = ev.target.dataset?.ledger; if (!k) return; filter[k] = ev.target.value; ledgerCount = filter.account || filter.method ? 20 : 8; draw(); });
  const chatForm = el.querySelector('.fc-form'), chatInput = chatForm.querySelector('textarea');
  chatForm.addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = chatForm.querySelector('button'), err = el.querySelector('.fc-err'), text = chatInput.value.trim();
    if (!text || !store) return;
    btn.disabled = true; err.textContent = '';
    try { const id = await store.chatSend(text); chatInput.value = ''; chatPoll(); store.chatPing(id).then(r => { if (r) chatPoll(0, 0); }).catch(() => {}); }
    catch (e) { err.textContent = e.message; }
    finally { btn.disabled = false; }
  });
  // Enter = 보내기 · Shift+Enter = 줄 바꿈(한글 조합 중 Enter는 무시)
  chatInput.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); chatForm.requestSubmit(); } });
  el.querySelector('.fin-signin').addEventListener('click', async () => { try { await signIn(); } catch (err) { el.querySelector('.fin-login-msg').textContent = err.message; } });
  showState(); draw();
}
function scan() { const el = document.getElementById('fin-hub-panel'); if (el && !el.dataset.mounted) mount(el); }

onAuth(user=>{const uid=user?.uid||'';if(uid!==activeUid)reviewUI?.accountChanged();activeUid=uid;signedIn=!!user;store=session.setUser(user,!!window.__MMT_TEST_FIN__);showState();});
// 옛 장부 접힘 칸: ERP가 화면을 다시 그려도 연 상태를 유지(이 탭 동안만)
document.addEventListener('toggle', e => { if (e.target.classList?.contains('legacy-ledger')) { try { sessionStorage.setItem('mmt-fin-legacy-open', e.target.open ? '1' : '0'); } catch { /* 저장소 없음 */ } } }, true);
// '옛 기록' 탭(finance.html#legacy)을 같은 화면에서 누르면 주소 뒤만 바뀌어 다시 그려지지 않는다 → 접힌 칸을 직접 열고 그 자리로
function openLegacy() {
  if (!/^#legacy/.test(location.hash)) return;
  const d = document.getElementById('legacy');
  if (d && !d.open) d.open = true;
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', openLegacy);
new MutationObserver(scan).observe(document.getElementById('root'), { childList: true, subtree: true });
scan();
