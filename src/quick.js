// 재무 빠른 장부(quick.html) — 휴대폰에서 3번 탭으로 넣기(금액 → 분류 → 저장, 수단은 지난번 값이 미리 골라짐) + 오늘 · 이번 달 요약.
// 장부는 Firebase hub/financeV1(사장님 로그인 전용). 이 브라우저에는 '마지막 수단 · 최근 거래처'만 기억한다(금액은 저장하지 않음).
import { onAuth, signIn } from './fbauth.js';
import { openFinStore, shrinkPhoto } from './fin-hub.js';

const F = window.FinCore;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = n => (Number(n) || 0).toLocaleString('ko-KR');
const PREF = 'mumutori-fin-quick-pref';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; } })();
const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch { /* 저장 공간 없음 — 무시 */ } };

let store = null, book = { entries: {}, sales: {}, meta: {} }, period = 'month', method = pref.method || F.METHODS[0], category = '', saving = false;
const CONN = { loading: '불러오는 중', ok: '연결됨', offline: '연결 끊김 · 다시 시도', denied: '권한 없음' };

function chips(el, list, current, name) {
  el.innerHTML = list.map(v => `<button type="button" role="radio" class="q-chip" data-${name}="${esc(v)}" aria-checked="${v === current}">${esc(v)}</button>`).join('');
}
function drawChips() {
  const inMode = $('#q-in').checked;
  chips($('#q-methods'), F.METHODS, method, 'method');
  const cats = inMode ? F.IN_CATEGORIES : F.OUT_CATEGORIES;
  if (!cats.includes(category)) category = '';
  chips($('#q-cats'), cats, category, 'cat');
}
function card(label, value, note, cls = '') {
  return `<div class="q-stat ${cls}"><span>${esc(label)}</span><strong class="amt">${won(value)}<em>원</em></strong><small>${esc(note)}</small></div>`;
}
function drawSummary() {
  const s = F.summarize(book, period);
  $('#q-sum').innerHTML =
    card('매출', s.sales, s.salesConnected ? `채널 ${won(s.orders)}건 + 직접 입력` : '채널 매출 연결 전(직접 입력만)') +
    card('지출', s.spend, s.byCategory.slice(0, 3).map(r => r.category).join(' · ') || '기록 없음') +
    card('남는 돈(추정)', s.net, s.feeKnown ? '매출 − 수수료 − 지출' : '수수료 정산 전 · 추정', s.net < 0 ? 'minus' : '') +
    card('부가세 예상', s.vat, '참고용 · 신고는 세무 확인', s.vat < 0 ? 'minus' : '');
  const n = $('#q-needs'); n.hidden = !s.needs; n.querySelector('b').textContent = s.needs;
  document.querySelectorAll('.q-tabs [data-period]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.period === period)));
}
// 들어온 길 표시: 폰 입력은 표시 안 함, 결제 알림 · AI · 가져옴만
const SOURCE = s => !s || s === 'phone' ? '' : s === 'alert' ? '알림' : s === 'import' ? '가져옴' : s.startsWith('ai') ? 'AI' : s;
function row(e, actions = '') {
  return `<div class="q-line${e.status === 'void' ? ' void' : ''}" data-id="${esc(e.id)}"><div><b>${esc(e.vendor || e.category || '분류 필요')}</b><small>${esc(e.date)} · ${esc(e.method || '수단 미기록')} · ${esc(e.category || '분류 필요')}${SOURCE(e.source) ? ' · ' + esc(SOURCE(e.source)) : ''}</small></div><strong class="amt ${e.kind === 'in' ? 'plus' : ''}">${e.kind === 'in' ? '+' : '−'}${won(e.amount)}</strong>${actions}</div>`;
}
function drawLists() {
  const all = Object.values(book.entries || {}).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const needs = all.filter(e => e.status === F.NEEDS);
  $('#q-needs-list').hidden = !needs.length;
  $('#q-needs-rows').innerHTML = needs.map(e => row(e, `<div class="q-row q-fix">${F.OUT_CATEGORIES.map(c => `<button type="button" class="q-chip" data-fix="${esc(e.id)}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}<label class="q-check"><input type="checkbox" data-rule="${esc(e.id)}"> 앞으로 이 거래처는 항상</label></div>`)).join('');
  $('#q-recent').innerHTML = all.slice(0, 10).map(e => row(e, e.status === 'void' ? '<span class="q-void">취소됨</span>' : `<button type="button" class="q-link" data-void="${esc(e.id)}">취소</button>`)).join('') || '<p class="q-empty">아직 기록이 없어요. 위에서 첫 줄을 넣어 보세요.</p>';
  $('#q-vendors').innerHTML = (pref.vendors || []).map(v => `<option value="${esc(v)}">`).join('');
}
function draw() { drawSummary(); drawLists(); }

async function save(ev) {
  ev.preventDefault();
  if (saving) return;
  const msg = $('#q-form-msg'); msg.textContent = '';
  const inMode = $('#q-in').checked;
  try {
    const amount = F.toWon($('#q-amt').value);
    if (!(amount > 0)) throw Error('금액을 넣어 주세요.');
    const vendor = $('#q-vendor').value.trim();
    const auto = !category && vendor ? F.classify(vendor, book.meta.rules) : '';
    const entry = F.validateEntry(F.normEntry({
      kind: inMode ? 'in' : 'out', amount, method, category: category || auto, vendor, memo: $('#q-memo').value.trim(),
      date: $('#q-date').value || F.kstDate(), vatIncluded: $('#q-vat').checked, evidence: $('#q-evid').value || undefined, source: 'phone'
    }));
    saving = true; $('#q-save').disabled = true; $('#q-save').textContent = '저장 중…';
    const photo = $('#q-photo').files?.[0];
    if (photo) { entry.receiptId = entry.id; await store.saveReceipt(entry.id, await shrinkPhoto(photo)); }
    await store.add(entry);   // 저장 → 다시 읽어 같은지 확인한 뒤에 '저장됨'
    pref.method = method; if (vendor) pref.vendors = [vendor, ...(pref.vendors || []).filter(v => v !== vendor)].slice(0, 5); savePref();
    $('#q-form').reset(); $('#q-vat').checked = true; $('#q-date').value = F.kstDate(); category = ''; drawChips();
    msg.textContent = `저장했어요 · ${entry.category || '분류 필요'} ${won(entry.amount)}원`; msg.className = 'q-msg ok';
    $('#q-amt').focus();
  } catch (err) { msg.textContent = err.message; msg.className = 'q-msg'; }
  finally { saving = false; $('#q-save').disabled = false; $('#q-save').textContent = '저장'; }
}

async function onClick(ev) {
  const t = ev.target.closest('button'); if (!t) return;
  try {
    if (t.dataset.method) { method = t.dataset.method; drawChips(); }
    else if (t.dataset.cat && !t.dataset.fix) { category = t.dataset.cat; drawChips(); }
    else if (t.dataset.period) { period = t.dataset.period; drawSummary(); }
    else if (t.dataset.fix) {
      const e = book.entries[t.dataset.fix];
      // '앞으로 항상' 체크는 저장 전에 읽는다(저장하면 목록이 다시 그려져 체크가 사라짐)
      const always = document.querySelector(`[data-rule="${CSS.escape(e.id)}"]`)?.checked;
      await store.patch(e.id, { category: t.dataset.cat, status: 'ok' });
      if (always && e.vendor) await store.addRule({ match: e.vendor, category: t.dataset.cat });
    } else if (t.dataset.void) {
      if (confirm('이 줄을 취소할까요? (지우지 않고 \'취소됨\'으로 남겨요)')) await store.patch(t.dataset.void, { status: 'void' });
    } else if (t.id === 'q-signin') {
      $('#q-login-msg').textContent = ''; await signIn();
    }
  } catch (err) { ($('#q-app').hidden ? $('#q-login-msg') : $('#q-form-msg')).textContent = err.message; }
}

function start() {
  $('#q-evid').innerHTML = '<option value="">자동(수단 따라)</option>' + F.EVIDENCE.map(v => `<option>${esc(v)}</option>`).join('');
  $('#q-date').value = F.kstDate();
  drawChips();
  document.addEventListener('click', onClick);
  $('#q-form').addEventListener('submit', save);
  $('#q-in').addEventListener('change', drawChips);
  $('#q-amt').addEventListener('input', e => { const n = F.toWon(e.target.value); if (Number.isFinite(n) && n > 0) e.target.value = won(n); });
  onAuth(user => {
    const test = !!window.__MMT_TEST_FIN__;
    $('#q-login').hidden = !!user || test; $('#q-app').hidden = !(user || test);
    if (!(user || test)) { $('#q-conn').textContent = '로그인 필요'; return; }
    if (store) return;
    store = openFinStore({ onChange: b => { book = b; draw(); }, onStatus: s => { $('#q-conn').textContent = CONN[s] || s; $('#q-conn').dataset.state = s; } });
    store.load().catch(err => { $('#q-form-msg').textContent = err.message; });
    store.watch();
    $('#q-amt').focus();
  });
}
start();
