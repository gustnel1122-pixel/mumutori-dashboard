// 재무 공용 장부(hub/financeV1)의 계산 · 검사 — 화면(quick.html)과 시험(node)이 같이 쓴다. 저장 · 통신은 fin-hub.js.
// 자료는 공개 저장소에 두지 않는다: 이 파일에는 금액이 없고, 장부는 사장님 로그인 전용 Firebase 칸에서만 읽는다.
(function (root) {
  'use strict';
  const VERSION = 1;
  const METHODS = ['현대카드', '토스체크', '토스이체', '현금'];
  const OUT_CATEGORIES = ['매입', '매입 부대비', '배송비', '광고비', '수수료', '소모품', '임차료', '기타'];
  const IN_CATEGORIES = ['매출', '자금 충전', '환불 받음', '기타 수입'];
  const EVIDENCE = ['카드', '세금계산서', '현금영수증', '간이영수증', '없음'];
  // 부가세 공제를 셀 수 있는 증빙(일반과세자). 해외 결제 · 간이영수증 · 증빙 없음은 빼고 센다 — 참고용, 신고는 세무 확인.
  const DEDUCTIBLE = new Set(['카드', '세금계산서', '현금영수증']);
  const DEFAULT_EVIDENCE = { '현대카드': '카드', '토스체크': '카드', '토스이체': '없음', '현금': '없음' };
  const NEEDS = 'needs-category';

  const pad = n => String(n).padStart(2, '0');
  // 한국 시간 날짜 'YYYY-MM-DD'
  function kstDate(d = new Date()) {
    const k = new Date(d.getTime() + 9 * 3600e3);
    return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
  }
  function uid(prefix = 'f') {
    const r = Math.random().toString(36).slice(2, 8);
    return `${prefix}${Date.now().toString(36)}${r}`;
  }
  // '12,300원' · '12300' · 12300 → 12300 (정수 원). 이상하면 NaN
  function toWon(v) {
    if (typeof v === 'number') return Math.round(v);
    const s = String(v ?? '').replace(/[,\s원₩]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Math.round(Number(s));
  }
  // 카드번호 모양은 끝 4자리만 남긴다(알림 글 · 메모에 섞여 들어와도)
  function maskCard(text) {
    return String(text ?? '').replace(/\b(?:\d[ -]?){8,15}(\d{4})\b/g, '****$1').replace(/\d{4}[-*]{1,2}\*{2,}[-*]*\*{0,4}[-*]?(\d{4})/g, '****$1');
  }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')); }

  // 화면 · AI · 알림이 넣는 한 줄을 정리한다. 모르는 칸은 버리지 않고 둔다(뒤에 붙는 칸 보존).
  function normEntry(e, now = new Date()) {
    const x = { ...e };
    x.id = x.id || uid();
    x.kind = x.kind === 'in' ? 'in' : 'out';
    x.amount = toWon(x.amount);
    x.date = x.date || kstDate(now);
    x.method = x.method || '';
    x.category = x.category || '';
    x.vendor = maskCard(x.vendor || '').slice(0, 60);
    x.memo = maskCard(x.memo || '').slice(0, 300);
    x.vatIncluded = x.vatIncluded !== false;
    x.evidence = x.evidence || DEFAULT_EVIDENCE[x.method] || '없음';
    x.source = x.source || 'phone';
    x.status = x.status === 'void' ? 'void' : (x.category ? 'ok' : NEEDS);
    x.createdAt = x.createdAt || now.toISOString();
    return x;
  }
  function validateEntry(x) {
    if (!Number.isFinite(x.amount) || x.amount <= 0) throw Error('금액을 1원 이상 숫자로 넣어 주세요.');
    if (x.amount > 100000000) throw Error('금액이 1억 원을 넘습니다. 다시 확인해 주세요.');
    if (!validDate(x.date)) throw Error('날짜가 이상합니다.');
    if (x.method && !METHODS.includes(x.method)) throw Error('결제 수단이 목록에 없습니다.');
    const cats = x.kind === 'in' ? IN_CATEGORIES : OUT_CATEGORIES;
    if (x.category && !cats.includes(x.category)) throw Error('분류가 목록에 없습니다.');
    if (!EVIDENCE.includes(x.evidence)) throw Error('증빙이 목록에 없습니다.');
    return x;
  }
  const live = rows => (rows || []).filter(r => r && r.status !== 'void');

  // 기간: 'today' | 'month' (한국 시간 기준)
  function inPeriod(date, period, now = new Date()) {
    const t = kstDate(now);
    return period === 'today' ? date === t : String(date || '').slice(0, 7) === t.slice(0, 7);
  }
  // sales: { 채널: { 'YYYY-MM-DD': {gross, orders, fee, cancel} } } — 매시간 매출 기록(2단계)이 채운다
  function salesIn(sales, period, now) {
    let gross = 0, fee = 0, orders = 0, feeKnown = true, any = false;
    for (const days of Object.values(sales || {})) for (const [d, s] of Object.entries(days || {})) {
      if (!inPeriod(d, period, now)) continue;
      any = true;
      gross += toWon(s.gross) || 0; orders += Number(s.orders) || 0;
      if (s.fee == null) feeKnown = false; else fee += toWon(s.fee) || 0;
    }
    return { gross, fee, orders, feeKnown: any ? feeKnown : true, connected: Object.keys(sales || {}).length > 0 };
  }
  function summarize(book, period = 'month', now = new Date()) {
    const entries = live(Object.values(book?.entries || {}).map(e => e));
    const rows = entries.filter(e => inPeriod(e.date, period, now));
    const outRows = rows.filter(e => e.kind === 'out');   // 분류 필요 줄도 나간 돈이므로 지출에 센다
    const s = salesIn(book?.sales, period, now);
    const manualSales = rows.filter(e => e.kind === 'in' && e.category === '매출');
    const salesGross = s.gross + manualSales.reduce((a, e) => a + e.amount, 0);
    const spend = outRows.reduce((a, e) => a + e.amount, 0);
    const deductible = outRows.filter(e => DEDUCTIBLE.has(e.evidence) && e.vatIncluded !== false).reduce((a, e) => a + e.amount, 0);
    const vat = Math.round(salesGross / 11) - Math.round(deductible / 11);
    return {
      period, sales: salesGross, salesFromChannels: s.gross, orders: s.orders, salesConnected: s.connected,
      spend, fee: s.fee, feeKnown: s.feeKnown,
      net: salesGross - s.fee - spend,            // 남는 돈(추정): 매출 − 채널 수수료(알려진 만큼) − 지출
      vat, vatSales: Math.round(salesGross / 11), vatDeductible: Math.round(deductible / 11),
      needs: entries.filter(e => e.status === NEEDS).length,
      byCategory: OUT_CATEGORIES.map(c => ({ category: c, amount: outRows.filter(e => e.category === c).reduce((a, e) => a + e.amount, 0) })).filter(r => r.amount),
      count: rows.length
    };
  }
  // 가맹점 규칙표: [{match:'아이템스카우트', category:'매입 부대비'}] — 글자가 들어 있으면 그 분류. 없으면 ''(분류 필요)
  function classify(vendor, rules) {
    const v = String(vendor || '');
    for (const r of rules || []) if (r && r.match && v.includes(r.match) && (!r.and || v.includes(r.and))) return r.category;
    return '';
  }

  // CSV(따옴표 칸 지원) → 줄 배열
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  // 볼트 '재무_임시장부.csv'(날짜,구분,분류,거래처,내용,금액(원),공급가,부가세,결제수단,증빙,근거,기록자,확인) → 장부 줄
  function fromLedgerCSV(text, now = new Date()) {
    const [head, ...body] = parseCSV(text);
    const ix = name => head.findIndex(h => String(h).trim().startsWith(name));
    const get = (r, n) => { const i = ix(n); return i < 0 ? '' : String(r[i] ?? '').trim(); };
    const methodOf = m => METHODS.find(x => m.includes(x.replace('토스', ''))) || (m.includes('현대') ? '현대카드' : m.includes('체크') ? '토스체크' : m.includes('이체') ? '토스이체' : m.includes('현금') ? '현금' : '');
    const byLen = [...OUT_CATEGORIES].sort((a, b) => b.length - a.length);   // '매입 부대비(…)'가 '매입'보다 먼저 맞게
    const outCat = c => byLen.find(x => c.startsWith(x)) || (c.includes('구매') || c.includes('매입') ? '매입' : c.includes('배송') || c.includes('택배') ? '배송비' : c.includes('광고') ? '광고비' : c.includes('수수료') ? '수수료' : c.includes('소모') ? '소모품' : c.includes('임차') || c.includes('월세') ? '임차료' : c ? '기타' : '');
    return body.map((r, i) => {
      const kind = /입금|수입|매출/.test(get(r, '구분')) ? 'in' : 'out';
      const evid = get(r, '증빙');
      const e = normEntry({
        id: 'csv' + (i + 1) + '_' + get(r, '날짜').replace(/-/g, ''),
        kind, date: get(r, '날짜'), amount: get(r, '금액'), method: methodOf(get(r, '결제수단')),
        category: kind === 'in' ? (IN_CATEGORIES.find(x => get(r, '분류').includes(x)) || '기타 수입') : outCat(get(r, '분류')),
        vendor: get(r, '거래처'), memo: get(r, '내용'),
        evidence: EVIDENCE.find(x => evid.includes(x)) || (evid.includes('카드') ? '카드' : undefined),
        source: 'import', createdBy: get(r, '기록자') || ''
      }, now);
      return e;
    });
  }

  const api = { VERSION, METHODS, OUT_CATEGORIES, IN_CATEGORIES, EVIDENCE, NEEDS, kstDate, uid, toWon, maskCard, validDate, normEntry, validateEntry, summarize, classify, parseCSV, fromLedgerCSV, inPeriod };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FinCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
