// 재무 '수기 입력' 부품 — 휴대폰(quick.html)과 PC 재무 화면(finance.html)이 같은 칸 · 같은 저장을 쓴다.
// 칸: 날짜 · 금액 · 수단 · 분류 · 거래처 · 메모 · 부가세 · 증빙 · 영수증 사진(+ 들어온 돈). 저장하면 hub/financeV1/entries 한 줄.
// '확인 필요' 목록: 분류가 비어 있는 줄(휴대폰 결제 알림이 채운 초안 · AI 기록 포함) — 분류 버튼 한 번으로 저장.
// 입력 경로(수기 · 알림 · AI)가 달라도 줄 모양은 하나이고 '출처(source)' 칸만 다르다.
import { shrinkPhoto } from './fin-hub.js';

const F = () => window.FinCore;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const won = n => (Number(n) || 0).toLocaleString('ko-KR');
const PREF = 'mumutori-fin-quick-pref';   // 이 브라우저에는 마지막 수단 · 최근 거래처 5곳만 기억(금액은 저장하지 않음)
// 마지막에 고른 수단 기억(이 기기). 시연 모드(src/demo.js)면 메모리에만 둔다.
const prefStore = () => (typeof window !== 'undefined' && window.__MMT_DEMO_STORAGE__) || localStorage;
const pref = (() => { try { return JSON.parse(prefStore().getItem(PREF) || '{}'); } catch { return {}; } })();
const savePref = () => { try { prefStore().setItem(PREF, JSON.stringify(pref)); } catch { /* 저장 공간 없음 */ } };
// 홈 '다음으로 챙길 일'에 보일 확인 필요 건수와 시각만 이 브라우저에 남긴다(금액 · 줄 내용은 남기지 않음, 시연이면 메모리). 홈은 장부를 직접 열지 않는다.
export function rememberNeeds(n) { try { prefStore().setItem('mmt-fin-needs-v1', JSON.stringify({ n, at: new Date().toISOString() })); } catch { /* 저장 공간 없음 */ } }
// 들어온 길 표시: 수기 입력은 표시 안 함
export const SOURCE = s => !s || s === 'phone' || s === 'manual' ? '' : s === 'alert' ? '알림' : s === 'import' ? '가져옴' : s.startsWith('ai') ? 'AI' : s;

// 한 줄: 제목(거래처 · 이동이면 '보낸 곳 → 받는 곳') · 날짜 · 계좌(없으면 수단) · 분류 · 들어온 길. 이동은 ↔(손익 아님).
export function entryRow(e, actions = '') {
  const src = SOURCE(e.source), acct = F().accountOf(e), move = e.kind === 'move';
  const title = move ? `${e.from || acct || '?'} → ${e.to || '받는 통장 확인'}` : (e.vendor || e.category || '분류 필요');
  const where = acct || e.method || '수단 미기록';
  const cat = move ? '내 계좌 이동' : (e.category || '분류 필요') + (e.tag ? ' · ' + e.tag : '');
  return `<div class="q-line${e.status === 'void' ? ' void' : ''}${move ? ' move' : ''}" data-id="${esc(e.id)}"><div><b>${esc(title)}</b><small>${esc(e.date)}${e.time ? ' ' + esc(e.time) : ''} · ${esc(where)} · ${esc(cat)}${src ? ' · ' + esc(src) : ''}</small></div><strong class="amt ${e.kind === 'in' ? 'plus' : move ? 'move' : ''}">${e.kind === 'in' ? '+' : move ? '↔' : '−'}${won(e.amount)}</strong>${actions}</div>`;
}

const FORM = `
  <label class="q-amount"><span class="sr">금액</span><input class="f-amt" inputmode="numeric" pattern="[0-9,]*" placeholder="금액" aria-label="금액(원)"><em>원</em></label>
  <div class="q-row f-methods" role="radiogroup" aria-label="결제 수단"></div>
  <div class="q-row q-cats f-cats" role="radiogroup" aria-label="분류"></div>
  <details class="q-more"><summary>더보기 (날짜 · 거래처 · 메모 · 영수증 · 부가세)</summary>
    <label>날짜 <input class="f-date" type="date"></label>
    <label>거래처 <input class="f-vendor" maxlength="60" placeholder="예: 아이템스카우트" autocomplete="off"></label>
    <label>메모 <input class="f-memo" maxlength="300" autocomplete="off"></label>
    <label>증빙 <select class="f-evid"></select></label>
    <label class="q-check"><input class="f-vat" type="checkbox" checked> 부가세 포함 금액</label>
    <label class="q-check"><input class="f-in" type="checkbox"> 들어온 돈(매출 · 자금 충전 등)</label>
    <label>영수증 사진 <input class="f-photo" type="file" accept="image/*" capture="environment"></label>
  </details>
  <button class="q-btn q-primary q-save f-save" type="submit">저장</button>
  <p class="q-msg f-msg" role="alert"></p>`;

// root: <form>. ctx: {store(), book(), source:'phone'|'manual'}
export function mountEntryForm(root, ctx) {
  const F_ = F(), $ = s => root.querySelector(s);
  root.innerHTML = FORM;
  let method = pref.method || F_.METHODS[0], category = '', saving = false;
  const chips = (el, list, cur, name) => { el.innerHTML = list.map(v => `<button type="button" role="radio" class="q-chip" data-${name}="${esc(v)}" aria-checked="${v === cur}">${esc(v)}</button>`).join(''); };
  const draw = () => {
    chips($('.f-methods'), F_.METHODS, method, 'method');
    const cats = $('.f-in').checked ? F_.IN_CATEGORIES : F_.OUT_CATEGORIES;
    if (!cats.includes(category)) category = '';
    chips($('.f-cats'), cats, category, 'cat');
  };
  $('.f-evid').innerHTML = '<option value="">자동(수단 따라)</option>' + F_.EVIDENCE.map(v => `<option>${esc(v)}</option>`).join('');
  $('.f-date').value = F_.kstDate();
  const vendors = document.createElement('datalist'); vendors.id = 'fin-vendors-' + Math.random().toString(36).slice(2, 7);
  vendors.innerHTML = (pref.vendors || []).map(v => `<option value="${esc(v)}">`).join(''); root.append(vendors); $('.f-vendor').setAttribute('list', vendors.id);
  draw();
  root.addEventListener('click', ev => {
    const t = ev.target.closest('button'); if (!t || !root.contains(t)) return;
    if (t.dataset.method) { method = t.dataset.method; draw(); }
    else if (t.dataset.cat) { category = t.dataset.cat; draw(); }
  });
  $('.f-in').addEventListener('change', draw);
  $('.f-amt').addEventListener('input', e => { const n = F_.toWon(e.target.value); if (Number.isFinite(n) && n > 0) e.target.value = won(n); });
  root.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (saving) return;
    const msg = $('.f-msg'); msg.textContent = ''; msg.className = 'q-msg f-msg';
    try {
      const amount = F_.toWon($('.f-amt').value);
      if (!(amount > 0)) throw Error('금액을 넣어 주세요.');
      const vendor = $('.f-vendor').value.trim(), book = ctx.book();
      const auto = !category && vendor ? F_.classify(vendor, book.meta?.rules) : '';
      const entry = F_.validateEntry(F_.normEntry({
        kind: $('.f-in').checked ? 'in' : 'out', amount, method, category: category || auto, vendor, memo: $('.f-memo').value.trim(),
        date: $('.f-date').value || F_.kstDate(), vatIncluded: $('.f-vat').checked, evidence: $('.f-evid').value || undefined, source: ctx.source || 'manual'
      }));
      saving = true; $('.f-save').disabled = true; $('.f-save').textContent = '저장 중…';
      const photo = $('.f-photo').files?.[0];
      if (photo) { entry.receiptId = entry.id; await ctx.store().saveReceipt(entry.id, await shrinkPhoto(photo)); }
      await ctx.store().add(entry);   // 저장 → 다시 읽어 같은지 확인한 뒤에 '저장했어요'
      pref.method = method; if (vendor) pref.vendors = [vendor, ...(pref.vendors || []).filter(v => v !== vendor)].slice(0, 5); savePref();
      root.reset(); $('.f-vat').checked = true; $('.f-date').value = F_.kstDate(); category = ''; draw();
      msg.textContent = `저장했어요 · ${entry.category || '분류 필요'} ${won(entry.amount)}원`; msg.className = 'q-msg f-msg ok';
      $('.f-amt').focus();
    } catch (err) { msg.textContent = err.message; }
    finally { saving = false; $('.f-save').disabled = false; $('.f-save').textContent = '저장'; }
  });
  return { focus: () => $('.f-amt').focus() };
}

// 쿠팡 정산 예정 칸 — 쿠팡 담당이 매일 아침 읽는 윙 정산현황(rg_settle_7d)을 AI 기록(fin_hub settle)이 meta/coupangSettle에 둔다.
// 사장님 질문 "팔리는데 왜 돈이 안 들어와?"의 답: 다음 정산일 · 예상 지급액 · 0원이면 이유(이번 주 비용 > 매출).
export function settleCard(meta) {
  const c = meta && meta.coupangSettle;
  if (!c) return `<div class="f-settle"><div class="f-settle-top"><b>쿠팡 정산 예정</b></div><p>쿠팡 담당이 매일 아침 읽는 정산 값이 아직 장부에 연결되지 않았어요.</p></div>`;
  const md = d => { const m = String(d || '').match(/\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : esc(d); };
  const zero = !(Number(c.nextAmount) > 0);
  const why = !zero ? '판매대금에서 광고 · 물류 · 수수료를 먼저 뺀 금액이에요.'
    : Number(c.cost) > Number(c.revenue)
      ? `이번 주 비용 ${won(c.cost)}원(광고 ${won(c.ads)} · 물류 ${won(c.fulfillment)} · 수수료 ${won(c.fee)})이 매출 ${won(c.revenue)}원보다 커서, 남는 돈이 없어 0원이에요.`
      : '이번 정산에 들어갈 남는 돈이 없어 0원이에요.';
  return `<div class="f-settle${zero ? ' zero' : ''}"><div class="f-settle-top"><b>쿠팡 정산 예정</b><strong class="amt">${md(c.nextDate)} · ${won(c.nextAmount)}원</strong></div><p>${why}</p><small>${esc(c.period)} 윙 정산현황 · ${esc(c.readAt)} 읽음 · 팔고 첫 지급까지 약 4~5주(화면 일정 기준)</small></div>`;
}

// 쿠팡 돈 달력(사장님 21:43 "어떻게 관리해야 할까") — 판매 주마다 팔린 돈 · 빠지는 돈 · 받을 돈 · 70% / 30% 받는 날 · 실제 입금.
// 값: 장부 meta/coupangCal(AI 기록 fin_hub settle — 쿠팡 담당 매일 아침 값 + 윙 '정산 일정 확인'). 모르는 칸은 0이 아니라 '확인 필요'.
// 실제 입금 ✓: 장부의 들어온 돈 중 '쿠팡'이 들어간 줄(토스 입금 알림 · 수기)이 받는 날 −1 ~ +5일 안에 있으면.
export function coupangCalendar(meta, entries) {
  const cal = meta && meta.coupangCal;
  const list = cal && (Array.isArray(cal.weeks) ? cal.weeks : Object.values(cal.weeks || {}));
  if (!list || !list.length) return settleCard(meta);
  const F_ = F(), today = F_.kstDate();
  const unk = '<span class="cc-unk">확인 필요</span>';
  const md = d => { const m = String(d || '').match(/\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };
  const has = v => v !== null && v !== undefined && v !== '';
  const amt = v => has(v) ? `${won(v)}원` : unk;
  const shift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const ins = Object.values(entries || {}).filter(e => e && e.kind === 'in' && e.status !== 'void' && /쿠팡/.test(`${e.vendor || ''} ${e.memo || ''}`));
  const payCell = p => p && p.date ? `${md(p.date)}<small>${has(p.amount) ? `약 ${won(p.amount)}원` : '금액 확인 필요'}</small>` : unk;
  const paidCell = w => {
    if (has(w.payout) && Number(w.payout) <= 0) return '<span class="cc-none">받을 돈 없음</span>';
    const pays = [['70%', w.pay70], ['30%', w.pay30]].filter(([, p]) => p && p.date);
    if (!pays.length) return unk;
    return pays.map(([k, p]) => {
      const got = ins.filter(e => e.date >= shift(p.date, -1) && e.date <= shift(p.date, 5));
      if (got.length) return `<span class="cc-ok">✓ ${k} ${md(got[0].date)} ${won(got[0].amount)}원</span>`;
      return p.date > today ? `<span class="cc-wait">${k} 기다리는 중</span>` : `<span class="cc-unk">${k} 입금 확인 필요</span>`;
    }).join('<br>');
  };
  const rows = list.slice().sort((a, b) => String(b.start).localeCompare(String(a.start))).slice(0, 8).map(w => {
    const minus = has(w.payout) && Number(w.payout) <= 0;
    const cost = has(w.cost) ? `${won(w.cost)}원` : unk;
    const parts = [['광고', w.ads], ['물류', w.fulfillment], ['수수료', w.fee]].filter(([, v]) => has(v)).map(([k, v]) => `${k} ${won(v)}`).join(' · ');
    return `<tr class="${minus ? 'cc-minus' : ''}"><th scope="row">${md(w.start)}~${md(w.end)}${w.label || w.note ? `<small>${esc([w.label, w.note].filter(Boolean).join(' · '))}</small>` : ''}</th><td>${amt(w.sales)}</td><td>${cost}${parts ? `<small>${parts}</small>` : ''}</td>`
      + `<td class="cc-pay">${has(w.payout) ? `${won(w.payout)}원` : unk}${minus ? '<small>광고 · 물류비가 매출보다 큼</small>' : ''}</td><td>${payCell(w.pay70)}</td><td>${payCell(w.pay30)}</td><td>${paidCell(w)}</td></tr>`;
  }).join('');
  const n = cal.next || (meta.coupangSettle && { date: meta.coupangSettle.nextDate, amount: meta.coupangSettle.nextAmount });
  const head = !n || !n.date ? '다음 입금: 확인 필요'
    : has(n.amount) && Number(n.amount) > 0 ? `다음 입금: ${md(n.date)} · 약 ${won(n.amount)}원`
      : `다음 정산 ${md(n.date)} · ${has(n.amount) ? '0원 — 이번엔 들어올 돈이 없어요' : '금액 확인 필요'}`;
  return `<div class="f-settle cc"><div class="f-settle-top"><b>쿠팡 돈 달력</b><strong>${head}</strong></div>`
    + `<p class="cc-lead">쿠팡 돈은 판매 약 4~5주 뒤에 들어와요. 광고 · 물류 · 수수료를 먼저 빼고, 한 주 판매분의 70%를 먼저 · 30%는 1주쯤 뒤에 줘요.</p>`
    + `<div class="cc-wrap"><table class="cc-table"><thead><tr><th scope="col">판매 주</th><th scope="col">팔린 돈</th><th scope="col">빠지는 돈</th><th scope="col">받을 돈</th><th scope="col">70% 받는 날</th><th scope="col">30% 받는 날</th><th scope="col">실제 입금</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<small>${esc(cal.source || '윙 정산현황')} · ${esc(cal.readAt || '')} 읽음 · 받는 날 · 70/30 금액은 윙 '정산 일정 확인' 화면 값(모르면 '확인 필요')</small></div>`;
}

// 취소됨 줄은 기본으로 숨긴다(검수 기준 4: 시험 흔적 없음). '취소 포함 보기'를 누른 화면에서만 보인다.
let showVoid = false;

// '확인 필요' 목록 + 장부(최근 기록). needsRoot · recentRoot 중 하나는 비워도 된다.
// filter: {account, method} — 장부 목록만 거른다(계좌별 '이 계좌 줄 보기'). 반환: 확인 필요 건수.
export function renderLists({ book, needsRoot, recentRoot, recentCount = 10, filter = {} }) {
  const F_ = F();
  const every = Object.values(book.entries || {}).sort((a, b) => ((b.date || '') + (b.time || '') + (b.createdAt || '')).localeCompare((a.date || '') + (a.time || '') + (a.createdAt || '')));
  const voids = every.filter(e => e.status === 'void').length;
  const all = showVoid ? every : every.filter(e => e.status !== 'void');
  const shown = all.filter(e => (!filter.account || (F_.accountOf(e) || '계좌 모름') === filter.account || e.from === filter.account || e.to === filter.account) && (!filter.method || e.method === filter.method));
  // 확인 필요 = 분류 없음 또는 나간 돈의 수단 없음(fin-core checkReasons). 이유마다 고르는 버튼을 단다.
  const needs = all.filter(e => F_.checkReasons(e).length);
  if (needsRoot) {
    needsRoot.hidden = !needs.length;
    const rows = needsRoot.querySelector('.f-needs-rows') || needsRoot;
    rows.innerHTML = needs.map(e => {
      const why = F_.checkReasons(e);
      const cat = why.includes('분류') ? `<div class="q-row q-fix"><span class="q-why">분류</span>${(e.kind === 'in' ? F_.IN_CATEGORIES : F_.OUT_CATEGORIES).map(c => `<button type="button" class="q-chip" data-fix="${esc(e.id)}" data-fixcat="${esc(c)}">${esc(c)}</button>`).join('')}${e.vendor ? `<label class="q-check"><input type="checkbox" data-rule="${esc(e.id)}"> 앞으로 이 거래처는 항상</label>` : ''}</div>` : '';
      const met = why.includes('수단') ? `<div class="q-row q-fix"><span class="q-why">결제 수단</span>${F_.METHODS.map(m => `<button type="button" class="q-chip" data-fixmethod="${esc(e.id)}" data-method="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : '';
      // 가져올 때 적어 둔 '확인할 것'(받는 통장 등) — 확인했으면 '확인함'으로 지운다(줄 내용은 그대로)
      const chk = why.includes('확인') ? `<div class="q-row q-fix"><span class="q-why">확인</span><span class="q-checktext">${esc(e.check)}</span><button type="button" class="q-chip" data-checkdone="${esc(e.id)}">확인함</button></div>` : '';
      return entryRow(e, cat + met + chk);
    }).join('');
  }
  if (recentRoot) {
    const toggle = voids ? `<button type="button" class="q-link q-void-toggle" data-togglevoid="1" aria-pressed="${showVoid}">${showVoid ? '취소된 줄 숨기기' : `취소 포함 보기 (${voids})`}</button>` : '';
    const more = shown.length > recentCount ? `<p class="q-more-line">${won(shown.length)}줄 중 ${won(recentCount)}줄 <button type="button" class="q-link" data-more="1">더 보기</button></p>` : '';
    recentRoot.innerHTML = (shown.slice(0, recentCount).map(e => entryRow(e, e.status === 'void' ? '<span class="q-void">취소됨</span>' : `<button type="button" class="q-link" data-void="${esc(e.id)}">취소</button>`)).join('') || `<p class="q-empty">${filter.account || filter.method ? '고른 계좌 · 수단의 줄이 없어요.' : '아직 기록이 없어요. 위에서 첫 줄을 넣어 보세요.'}</p>`) + more + toggle;
  }
  return needs.length;
}

// 장부 거르기(계좌 · 수단) — PC 재무 '장부' 위. 고른 값은 onChange({account, method})로.
export function ledgerFilter(cur = {}) {
  const F_ = F();
  const opt = (v, label, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`;
  return `<div class="fin-filter" role="group" aria-label="장부 거르기"><label>계좌 <select data-ledger="account">${opt('', '전체', cur.account || '')}${F_.ACCOUNTS.map(a => opt(a.name, a.name, cur.account)).join('')}${opt('계좌 모름', '계좌 모름', cur.account)}</select></label>`
    + `<label>수단 <select data-ledger="method">${opt('', '전체', cur.method || '')}${F_.ALL_METHODS.map(m => opt(m, m, cur.method)).join('')}</select></label></div>`;
}

// 계좌별(같은 장부에서) + '사장님 돈' 표 — 재무 '계좌별'(bank.html)과 폰 빠른 장부가 같이 쓴다. 금액은 장부에서만 읽어 그린다.
const TYPE_LABEL = { bank: '통장', debit: '체크카드', credit: '신용카드', wallet: '쿠팡 정산(통장 밖)', cash: '현금' };
export function accountsView(book, { compact = false } = {}) {
  const F_ = F();
  const checks = Object.values(book?.meta?.accountChecks || {});
  const totals = F_.accountTotals(book);
  const md = s => { const m = String(s || '').match(/\d{4}-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/); return m ? `${+m[1]}/${+m[2]}${m[3] ? ' ' + m[3] : ''}` : esc(s); };
  const cards = totals.filter(a => a.count || a.cardOut || checks.some(c => c.account === a.account)).map(a => {
    const chk = checks.find(c => c.account === a.account);
    const r = chk ? F_.accountCheck(book, chk) : null;
    const value = a.balance == null ? a.out : r ? r.got : a.balance;
    const label = a.type === 'credit' || a.type === 'debit' ? '쓴 돈' : r ? `잔액(${md(chk.from)}부터 장부 계산)` : '잔액(장부 계산)';
    const check = !r ? '' : r.ok
      ? `<p class="acct-check ok">✓ ${md(r.at)} 파일 잔액 ${won(r.balance)}원과 같음</p>`
      : `<p class="acct-check diff">⚠ ${md(r.at)} 파일 잔액 ${won(r.balance)}원 · 장부 계산 ${won(r.got)}원 · 차이 ${won(r.diff)}원${chk.note ? ' — ' + esc(chk.note) : ''}</p>`;
    const parts = [['들어온', a.in], ['나간', a.out], ['이동 받음', a.moveIn], ['이동 보냄', a.moveOut], ['체크카드', a.cardOut]].filter(([, v]) => v).map(([k, v]) => `<span>${k} ${won(v)}</span>`).join('');
    return `<div class="acct-card t-${a.type}"><div class="acct-top"><b>${esc(a.account)}</b><small>${TYPE_LABEL[a.type] || '통장'}${a.type === 'debit' ? ' · 연결 통장에서 빠짐' : a.type === 'credit' ? ' · 카드값은 결제일에 통장에서' : ''}</small></div>`
      + `<strong class="amt${value < 0 ? ' minus' : ''}">${won(value)}<em>원</em></strong><small class="acct-label">${label}</small>`
      + (compact ? '' : `<p class="acct-parts">${parts || '<span>줄 없음</span>'}</p>`) + check
      + (compact ? '' : `<a class="inline-link" href="finance.html?account=${encodeURIComponent(a.account)}#fin-ledger">이 계좌 줄 보기 ↗</a>`) + '</div>';
  }).join('');
  const om = F_.ownerMoney(book);
  const omRows = om.months.map(x => `<tr><th scope="row">${esc(x.month.replace('-', '년 '))}월</th><td>${won(x.in)}</td><td>${won(x.out)}</td><td class="${x.diff < 0 ? 'minus' : ''}">${won(x.diff)}</td>${om.total.outside ? `<td>${x.outside ? won(x.outside) : ''}</td>` : ''}</tr>`).join('');
  const owner = !om.months.length ? '' : `<section class="owner-money"><h3>사장님 돈 <small>넣은 돈(자금 충전) · 뺀 돈(사장님 인출) — 사장님이 돈을 빼서 따로 쓴 게 아님을 보이는 표</small></h3>`
    + `<div class="cc-wrap"><table class="cc-table om-table"><thead><tr><th scope="col">달</th><th scope="col">넣은 돈</th><th scope="col">뺀 돈</th><th scope="col">차이(넣은 − 뺀)</th>${om.total.outside ? '<th scope="col">외주 매출(따로)</th>' : ''}</tr></thead>`
    + `<tbody>${omRows}</tbody><tfoot><tr><th scope="row">합계</th><td>${won(om.total.in)}</td><td>${won(om.total.out)}</td><td class="${om.total.diff < 0 ? 'minus' : ''}">${won(om.total.diff)}</td>${om.total.outside ? `<td>${won(om.total.outside)}</td>` : ''}</tr></tfoot></table></div>`
    + `<small>외주 매출은 무무토리 상품 매출과 따로 봅니다(세금계산서 발행 · 부가세 신고는 세무 확인). '사장님 인출'은 비용이 아니라 지출 · 손익에서 빠집니다.</small></section>`;
  return `<div class="acct-grid">${cards || '<p class="q-empty">아직 계좌별로 볼 줄이 없어요.</p>'}</div>${compact ? '' : owner}`;
}

// 목록 버튼(분류 정하기 · 취소 · 취소 포함 보기 · 확인함 · 더 보기)을 한 곳에서 처리. onError(msg), onRedraw() — 목록을 다시 그리는 화면 함수, onMore() — 더 보기
export function bindListActions(root, { store, book, onError, onRedraw, onMore }) {
  root.addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.more) { onMore?.(); return; }   // 장부 '더 보기'
      if (t.dataset.togglevoid) { showVoid = !showVoid; onRedraw?.(); return; }
      if (t.dataset.checkdone) { await store().patch(t.dataset.checkdone, { check: null }); return; }   // '확인할 것' 지우기(null = 그 칸 지움)
      if (t.dataset.fixmethod) {   // 수단 정하기 — 증빙이 '없음'이면 그 수단의 기본 증빙으로(카드 → 카드)
        const e = book().entries[t.dataset.fixmethod];
        await store().patch(e.id, { method: t.dataset.method, evidence: e.evidence && e.evidence !== '없음' ? e.evidence : F().defaultEvidence(t.dataset.method) });
        return;
      }
      if (t.dataset.fix) {
        const e = book().entries[t.dataset.fix];
        // '앞으로 항상' 체크는 저장 전에 읽는다(저장하면 목록이 다시 그려져 체크가 사라짐)
        const always = root.querySelector(`[data-rule="${CSS.escape(e.id)}"]`)?.checked;
        await store().patch(e.id, { category: t.dataset.fixcat, status: 'ok' });
        if (always && e.vendor) await store().addRule({ match: e.vendor, category: t.dataset.fixcat });
      } else if (t.dataset.void) {
        if (confirm('이 줄을 취소할까요? (지우지 않고 \'취소됨\'으로 남겨요)')) await store().patch(t.dataset.void, { status: 'void' });
      }
    } catch (err) { onError?.(err.message); }
  });
}
