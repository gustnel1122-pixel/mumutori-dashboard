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

export function entryRow(e, actions = '') {
  const src = SOURCE(e.source);
  return `<div class="q-line${e.status === 'void' ? ' void' : ''}" data-id="${esc(e.id)}"><div><b>${esc(e.vendor || e.category || '분류 필요')}</b><small>${esc(e.date)}${e.time ? ' ' + esc(e.time) : ''} · ${esc(e.method || '수단 미기록')} · ${esc(e.category || '분류 필요')}${src ? ' · ' + esc(src) : ''}</small></div><strong class="amt ${e.kind === 'in' ? 'plus' : ''}">${e.kind === 'in' ? '+' : '−'}${won(e.amount)}</strong>${actions}</div>`;
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

// 취소됨 줄은 기본으로 숨긴다(검수 기준 4: 시험 흔적 없음). '취소 포함 보기'를 누른 화면에서만 보인다.
let showVoid = false;

// '확인 필요' 목록 + 최근 기록. needsRoot · recentRoot 중 하나는 비워도 된다.
export function renderLists({ book, needsRoot, recentRoot, recentCount = 10 }) {
  const F_ = F();
  const every = Object.values(book.entries || {}).sort((a, b) => ((b.date || '') + (b.createdAt || '')).localeCompare((a.date || '') + (a.createdAt || '')));
  const voids = every.filter(e => e.status === 'void').length;
  const all = showVoid ? every : every.filter(e => e.status !== 'void');
  // 확인 필요 = 분류 없음 또는 나간 돈의 수단 없음(fin-core checkReasons). 이유마다 고르는 버튼을 단다.
  const needs = all.filter(e => F_.checkReasons(e).length);
  if (needsRoot) {
    needsRoot.hidden = !needs.length;
    const rows = needsRoot.querySelector('.f-needs-rows') || needsRoot;
    rows.innerHTML = needs.map(e => {
      const why = F_.checkReasons(e);
      const cat = why.includes('분류') ? `<div class="q-row q-fix"><span class="q-why">분류</span>${(e.kind === 'in' ? F_.IN_CATEGORIES : F_.OUT_CATEGORIES).map(c => `<button type="button" class="q-chip" data-fix="${esc(e.id)}" data-fixcat="${esc(c)}">${esc(c)}</button>`).join('')}${e.vendor ? `<label class="q-check"><input type="checkbox" data-rule="${esc(e.id)}"> 앞으로 이 거래처는 항상</label>` : ''}</div>` : '';
      const met = why.includes('수단') ? `<div class="q-row q-fix"><span class="q-why">결제 수단</span>${F_.METHODS.map(m => `<button type="button" class="q-chip" data-fixmethod="${esc(e.id)}" data-method="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : '';
      return entryRow(e, cat + met);
    }).join('');
  }
  if (recentRoot) {
    const toggle = voids ? `<button type="button" class="q-link q-void-toggle" data-togglevoid="1" aria-pressed="${showVoid}">${showVoid ? '취소된 줄 숨기기' : `취소 포함 보기 (${voids})`}</button>` : '';
    recentRoot.innerHTML = (all.slice(0, recentCount).map(e => entryRow(e, e.status === 'void' ? '<span class="q-void">취소됨</span>' : `<button type="button" class="q-link" data-void="${esc(e.id)}">취소</button>`)).join('') || '<p class="q-empty">아직 기록이 없어요. 위에서 첫 줄을 넣어 보세요.</p>') + toggle;
  }
  return needs.length;
}

// 목록 버튼(분류 정하기 · 취소 · 취소 포함 보기)을 한 곳에서 처리. onError(msg), onRedraw() — 목록을 다시 그리는 화면 함수
export function bindListActions(root, { store, book, onError, onRedraw }) {
  root.addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.togglevoid) { showVoid = !showVoid; onRedraw?.(); return; }
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
