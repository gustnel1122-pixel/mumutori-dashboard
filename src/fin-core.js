// 재무 공용 장부(hub/financeV1)의 계산 · 검사 — 화면(quick.html)과 시험(node)이 같이 쓴다. 저장 · 통신은 fin-hub.js.
// 자료는 공개 저장소에 두지 않는다: 이 파일에는 금액이 없고, 장부는 사장님 로그인 전용 Firebase 칸에서만 읽는다.
(function (root) {
  'use strict';
  const VERSION = 1;
  // 사람이 고르는 결제 수단(입력 버튼). 카뱅(카카오뱅크 사업자 통장 · 체크카드) · 하나(쿠팡 셀러 통장) — 사장님 10/22
  const METHODS = ['현대카드', '토스체크', '토스이체', '카뱅체크', '카뱅이체', '하나이체', '현금'];
  // 쿠팡 정산 차감(상계): 광고비 · 물류비 등이 판매대금에서 먼저 빠지는 돈. 비용(손익)에는 넣고, 통장 · 돈 흐름과 '확인 필요'에서는 뺀다.
  const OFFSET_METHOD = '쿠팡 정산 차감';
  const COUPANG_METHOD = '쿠팡 정산';   // 쿠팡 정산(월렛) 안에서 생긴 매출 · 월렛 → 셀러 통장 지급(입력 버튼에는 없음)
  const ALL_METHODS = [...METHODS, COUPANG_METHOD, OFFSET_METHOD];
  // 대표 본인 식사는 '식비(본인)'으로 따로 둔다: 장부 · 지출에는 넣고, 신고 때 거를 수 있게 따로 센다(세무 확인 필요). 새 칸 없이 분류 값만.
  const OWNER_MEAL = '식비(본인)';
  // '사장님 인출'은 비용이 아니다(사장님 개인 통장으로 간 돈) — 돈 흐름의 나간 돈에는 넣고 지출 · 손익에서는 뺀다. '사장님 돈' 표에 따로.
  const OWNER_OUT = '사장님 인출', OWNER_IN = '자금 충전';
  const OUT_CATEGORIES = ['매입', '매입 부대비', '배송비', '광고비', '수수료', '소모품', '식비', OWNER_MEAL, '차량(주유·주차)', '세금·공과', '임차료', '기타', OWNER_OUT];
  const IN_CATEGORIES = ['매출', OWNER_IN, '환불 받음', '기타 수입'];
  const MOVE_CATEGORY = '내 계좌 이동';   // kind 'move': 내 계좌 사이 이동 — 손익 · 돈 흐름 · 확인 필요에서 빼고 계좌별 잔액에만
  const NOT_EXPENSE = new Set([OWNER_OUT]);
  const EVIDENCE = ['카드', '세금계산서', '현금영수증', '간이영수증', '없음'];
  // 부가세 공제를 셀 수 있는 증빙(일반과세자). 해외 결제 · 간이영수증 · 증빙 없음은 빼고 센다 — 참고용, 신고는 세무 확인.
  const DEDUCTIBLE = new Set(['카드', '세금계산서', '현금영수증']);
  const DEFAULT_EVIDENCE = { '현대카드': '카드', '토스체크': '카드', '토스이체': '없음', '카뱅체크': '카드', '카뱅이체': '없음', '하나이체': '없음', '현금': '없음', [COUPANG_METHOD]: '없음' };
  const NEEDS = 'needs-category';
  // 계좌(돈이 있는 곳). 이름만 — 계좌번호 · 잔액은 이 공개 파일에 두지 않는다(잔액 대조 값은 장부 meta/accountChecks).
  // type: bank 통장 · debit 체크카드(연결 통장에서 빠짐) · credit 신용카드(쓴 돈만) · wallet 쿠팡 정산(통장 밖) · cash 현금
  const ACCOUNTS = [
    { name: '토스뱅크(정산 통장)', type: 'bank' },
    { name: '카카오뱅크(사업자 통장)', type: 'bank' },
    { name: '카카오뱅크 체크카드', type: 'debit', link: '카카오뱅크(사업자 통장)' },
    { name: '쿠팡 셀러 통장(하나은행)', type: 'bank' },
    { name: '현대카드(사업자 신용)', type: 'credit' },
    { name: '쿠팡 정산', type: 'wallet' },
    { name: '현금', type: 'cash' }
  ];
  const METHOD_ACCOUNT = { '현대카드': '현대카드(사업자 신용)', '토스체크': '토스뱅크(정산 통장)', '토스이체': '토스뱅크(정산 통장)', '카뱅체크': '카카오뱅크 체크카드',
    '카뱅이체': '카카오뱅크(사업자 통장)', '하나이체': '쿠팡 셀러 통장(하나은행)', '현금': '현금', [COUPANG_METHOD]: '쿠팡 정산', [OFFSET_METHOD]: '쿠팡 정산' };
  const accountOf = e => (e && (e.account || METHOD_ACCOUNT[e.method])) || '';   // 계좌 칸이 없으면 수단으로 정함(옛 줄도 그대로 계좌별에 들어감)
  const accountType = name => (ACCOUNTS.find(a => a.name === name) || {}).type || 'bank';   // 모르는 계좌는 통장으로 본다
  const isWallet = e => accountType(accountOf(e)) === 'wallet';

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
    x.kind = x.kind === 'in' || x.kind === 'move' ? x.kind : 'out';
    x.amount = toWon(x.amount);
    x.date = x.date || kstDate(now);
    x.method = x.method || '';
    x.category = x.kind === 'move' ? MOVE_CATEGORY : (x.category || '');
    x.vendor = maskCard(x.vendor || '').slice(0, 60);
    x.memo = maskCard(x.memo || '').slice(0, 300);
    x.vatIncluded = x.vatIncluded !== false;
    x.evidence = x.evidence || DEFAULT_EVIDENCE[x.method] || '없음';
    x.source = x.source || 'phone';
    x.status = x.status === 'void' ? 'void' : (x.category ? 'ok' : NEEDS);
    if (x.check != null) { x.check = maskCard(x.check).slice(0, 200); if (!x.check) delete x.check; }   // 확인할 것 한 줄(있으면 '확인 필요'에 보임)
    x.createdAt = x.createdAt || now.toISOString();
    return x;
  }
  function validateEntry(x) {
    if (!Number.isFinite(x.amount) || x.amount <= 0) throw Error('금액을 1원 이상 숫자로 넣어 주세요.');
    if (x.amount > 100000000) throw Error('금액이 1억 원을 넘습니다. 다시 확인해 주세요.');
    if (!validDate(x.date)) throw Error('날짜가 이상합니다.');
    if (x.method && !ALL_METHODS.includes(x.method)) throw Error('결제 수단이 목록에 없습니다.');
    const cats = x.kind === 'in' ? IN_CATEGORIES : x.kind === 'move' ? [MOVE_CATEGORY] : OUT_CATEGORIES;
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
  // '확인 필요' 이유(검수 기준 · dash-review 10): 분류 없음 · 나간 돈의 수단 없음. 증빙 '없음'은 현금 · 계좌이체의 정상 값이라 세지 않는다.
  function checkReasons(e) {
    if (!e || e.status === 'void') return [];
    const r = [];
    if (e.kind !== 'move' && (e.status === NEEDS || !e.category)) r.push('분류');
    if (e.kind === 'out' && !e.method) r.push('수단');
    if (e.check) r.push('확인');   // 가져올 때 적어 둔 '확인할 것'(받는 통장 등) — '확인함'을 누르면 빠짐
    return r;
  }
  // 수단을 정할 때 증빙이 '없음'이면 그 수단의 기본 증빙(카드 → 카드)으로
  const defaultEvidence = method => DEFAULT_EVIDENCE[method] || '없음';
  const sum = (rows, f = e => e.amount) => rows.reduce((a, e) => a + (Number(f(e)) || 0), 0);
  // 이동 줄이 이 계좌에서 나간 것인지(from) 들어온 것인지(to). 둘 다 아니면 나간 것으로 본다.
  const moveIn = e => e.kind === 'move' && !!e.to && e.to === accountOf(e) && e.from !== accountOf(e);
  function summarize(book, period = 'month', now = new Date()) {
    const entries = live(Object.values(book?.entries || {}).map(e => e));
    const rows = entries.filter(e => inPeriod(e.date, period, now));
    const outAll = rows.filter(e => e.kind === 'out');
    const outRows = outAll.filter(e => !NOT_EXPENSE.has(e.category));   // 지출(비용) — 분류 필요 줄도 나간 돈이므로 센다. 사장님 인출은 비용 아님
    const s = salesIn(book?.sales, period, now);
    const manualSales = rows.filter(e => e.kind === 'in' && e.category === '매출');
    const salesGross = s.gross + sum(manualSales);
    const spend = sum(outRows);
    const deductible = sum(outRows.filter(e => DEDUCTIBLE.has(e.evidence) && e.vatIncluded !== false));
    const vat = Math.round(salesGross / 11) - Math.round(deductible / 11);
    // 돈 흐름은 실제 통장 · 카드 · 현금 기준: 쿠팡 정산(월렛) 안의 매출 · 차감은 빼고, 월렛에서 통장으로 온 돈(이동)만 들어온 돈에 넣는다.
    const real = rows.filter(e => !isWallet(e));
    const inReal = real.filter(e => e.kind === 'in');
    const fromWallet = sum(real.filter(e => moveIn(e) && accountType(e.from) === 'wallet'));
    const inflow = sum(inReal) + s.gross + fromWallet;
    const outReal = sum(real.filter(e => e.kind === 'out'));
    const offset = sum(outRows.filter(e => e.method === OFFSET_METHOD));   // 쿠팡 정산에서 먼저 빠진 비용(통장으로 안 나감)
    const walletSales = sum(rows.filter(e => isWallet(e) && e.kind === 'in' && e.category === '매출'));
    const walletOut = sum(rows.filter(e => isWallet(e) && e.kind === 'out' && !NOT_EXPENSE.has(e.category)));
    const ownerOut = sum(outAll.filter(e => e.category === OWNER_OUT));
    const otherIn = sum(inReal.filter(e => e.category !== '매출'));   // 매출 외 입금(자금 충전 · 환불 · 기타 수입)
    const outside = sum(manualSales.filter(e => e.tag === '외주 매출'));
    return {
      period, sales: salesGross, salesFromChannels: s.gross, orders: s.orders, salesConnected: s.connected,
      inflow, cashFlow: inflow - outReal, offset, otherIn, ownerOut, outReal,
      // 쿠팡 정산에 남은 돈(이 기간 월렛 매출 − 월렛 차감 − 통장으로 온 돈). 음수면 차감이 이 기간 기록된 월렛 매출보다 큼(통장으로 안 나간 비용)
      walletNet: walletSales - walletOut - fromWallet,
      ownerIn: sum(rows.filter(e => e.kind === 'in' && e.category === OWNER_IN)),
      outsideSales: outside,   // 매출 중 외주 매출(무무토리 상품 손익과 따로 · 세무 확인)
      stockBuy: sum(outRows.filter(e => e.category === '매입')),   // 상품 매입(재고로 남는 돈)
      spend, fee: s.fee, feeKnown: s.feeKnown,
      net: salesGross - s.fee - spend,            // 남는 돈(추정): 매출 − 채널 수수료(알려진 만큼) − 지출
      vat, vatSales: Math.round(salesGross / 11), vatDeductible: Math.round(deductible / 11),
      needs: entries.filter(e => checkReasons(e).length).length,
      byCategory: OUT_CATEGORIES.filter(c => !NOT_EXPENSE.has(c)).map(c => ({ category: c, amount: sum(outRows.filter(e => e.category === c)) })).filter(r => r.amount),
      ownerMeal: sum(outRows.filter(e => e.category === OWNER_MEAL)),   // 지출에 들어 있음 — 신고 때 거를 후보(세무 확인)
      count: rows.length
    };
  }
  // 돈 흐름이 '매출 − 지출'과 다른 까닭 한 줄(검수 14). 식: 돈 흐름 = 매출 − 지출 + 매출 외 입금 − 쿠팡 정산에 남은 돈 − 사장님 인출
  function flowNote(s) {
    const won = n => Number(n || 0).toLocaleString('ko-KR');
    const parts = [
      s.otherIn ? ` + 매출 외 입금 ${won(s.otherIn)}원` : '',
      s.walletNet < 0 ? ` + 쿠팡 정산 차감 ${won(-s.walletNet)}원(통장으로 안 나감)` : s.walletNet > 0 ? ` − 쿠팡 정산에 남은 돈 ${won(s.walletNet)}원(아직 통장으로 안 옴)` : '',
      s.ownerOut ? ` − 사장님 인출 ${won(s.ownerOut)}원(지출 아님)` : ''
    ];
    return '매출 − 지출' + parts.join('');
  }
  // 계좌별(같은 장부에서): 들어온 · 나간 · 이동 · 잔액. 체크카드는 연결 통장에서 빠진다. 신용카드는 쓴 돈만(카드값 결제 줄이 오면 통장에서 빠짐).
  // range: {from:'YYYY-MM-DD', at:'YYYY-MM-DD HH:MM'} — 그 사이 줄만(잔액 대조용). 시각 없는 줄은 날짜로.
  function accountTotals(book, range) {
    const when = e => `${e.date} ${e.time || '00:00'}`;
    const rows = live(Object.values(book?.entries || {})).filter(e => !range || ((!range.from || e.date >= range.from) && (!range.at || when(e) <= range.at)));
    const out = {};
    const get = name => (out[name] = out[name] || { account: name, type: accountType(name), in: 0, out: 0, moveIn: 0, moveOut: 0, cardOut: 0, count: 0 });
    ACCOUNTS.forEach(a => get(a.name));
    for (const e of rows) {
      const a = get(accountOf(e) || '계좌 모름');
      a.count++;
      if (e.kind === 'in') a.in += e.amount;
      else if (e.kind === 'out') a.out += e.amount;
      else if (moveIn(e)) a.moveIn += e.amount; else a.moveOut += e.amount;
      const link = (ACCOUNTS.find(x => x.name === a.account) || {}).link;
      if (link && e.kind === 'out') get(link).cardOut += e.amount;
    }
    return Object.values(out).map(a => ({ ...a, balance: a.type === 'credit' || a.type === 'debit' ? null : a.in - a.out - a.cardOut + a.moveIn - a.moveOut }));
  }
  // 파일 잔액과 대조: check = {account, from, at, balance, note} (장부 meta/accountChecks). from 시작 잔액은 0으로 본다.
  function accountCheck(book, check) {
    const a = accountTotals(book, { from: check.from, at: check.at }).find(x => x.account === check.account);
    const got = a ? a.balance : 0;
    return { ...check, got, diff: (Number(check.balance) || 0) - got, ok: got === (Number(check.balance) || 0) };
  }
  // '사장님 돈': 넣은 돈(자금 충전) · 뺀 돈(사장님 인출) · 차이 — 달마다. "빼가서 따로 쓴 게 아니라는 증명"용. 외주 매출은 따로 한 줄.
  function ownerMoney(book) {
    const rows = live(Object.values(book?.entries || {}));
    const months = {};
    const m = e => (months[e.date.slice(0, 7)] = months[e.date.slice(0, 7)] || { month: e.date.slice(0, 7), in: 0, out: 0, outside: 0 });
    for (const e of rows) {
      if (e.kind === 'in' && e.category === OWNER_IN) m(e).in += e.amount;
      if (e.kind === 'out' && e.category === OWNER_OUT) m(e).out += e.amount;
      if (e.kind === 'in' && e.category === '매출' && e.tag === '외주 매출') m(e).outside += e.amount;
    }
    const list = Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({ ...x, diff: x.in - x.out }));
    const total = { in: sum(list, x => x.in), out: sum(list, x => x.out), outside: sum(list, x => x.outside) };
    return { months: list, total: { ...total, diff: total.in - total.out } };
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
    // 카카오뱅크 · 하나를 먼저 본다('카카오뱅크 체크카드'가 '체크'에 걸려 토스체크로 가던 것 — 총괄 #14)
    const methodOf = m => (/카카오|카뱅/.test(m) ? (/이체|입금|송금|출금|통장/.test(m) ? '카뱅이체' : '카뱅체크') : '') || (/하나/.test(m) ? '하나이체' : '')
      || ['현대카드', '토스체크', '토스이체', '현금'].find(x => m.includes(x.replace('토스', ''))) || (m.includes('현대') ? '현대카드' : m.includes('체크') ? '토스체크' : m.includes('이체') ? '토스이체' : m.includes('현금') ? '현금' : '');
    const byLen = [...OUT_CATEGORIES].sort((a, b) => b.length - a.length);   // '매입 부대비(…)'가 '매입'보다 먼저 맞게
    const outCat = c => (/^(식비|식대|식사)/.test(c) && c.includes('본인') ? OWNER_MEAL : '') || byLen.find(x => c.startsWith(x)) || (/식대|식사/.test(c) ? '식비' : '') || (c.includes('구매') || c.includes('매입') ? '매입' : c.includes('배송') || c.includes('택배') ? '배송비' : c.includes('광고') ? '광고비' : c.includes('수수료') ? '수수료' : c.includes('소모') ? '소모품' : c.includes('임차') || c.includes('월세') ? '임차료' : c ? '기타' : '');
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

  // 휴대폰 결제 알림 글 → '확인 필요' 초안(수기 입력과 같은 줄 모양, 출처 'alert').
  // 일반 규칙: 금액(…원) · 날짜(MM/DD HH:MM) · 승인/취소 · 수단(글 · 보낸 앱 이름) · 가맹점(금액 뒤 글). 카드사별 견본이 오면 PATTERNS에 더한다.
  // 원문은 입구(hub/financeInbox)에만 남고, 장부 줄에는 다듬은 값만 둔다(이름 · 누적 · 잔액 · 카드번호 앞자리는 넣지 않음).
  // 휴대폰이 보내는 칸: text(접힌 글 = 제목 + 글), big(펼친 긴 글, MacroDroid {not_text_big} — 가맹점은 여기에만 있는 카드사가 있음), src(앱 이름), ts.
  // 현대카드 = 사업용 등록 카드: 쓴 것은 전부 업무용으로 장부에 넣는다(사장님 규칙). 개인 사용을 거르지 않고, 분류는 가맹점 규칙표 → 없으면 '확인 필요'.
  const PATTERNS = [
    // 현대카드(10/20 견본 모양, 값은 가짜): '○○○ 님, 현대 MY BUSINESS 승인 / 12,300원 일시불, MM/DD HH:MM / 가맹점 / 누적…원' — 가맹점은 펼친 글 3번째 줄
    { name: '현대카드', when: /현대/, vendor: /원\s*(?:일시불|할부\s*\d*\s*개?월?)\s*,\s*\d{1,2}[\/.]\d{1,2}\s+\d{1,2}:\d{2}\s+(.+?)\s*(?:누적|잔액|$)/ }
  ];
  function draftFromAlert(item, rules, now = new Date()) {
    // 펼친 글(big)에 금액이 있으면 그걸 읽는다(접힌 글엔 가맹점이 없을 수 있음). 이름('홍길동 님,' · '김*수님')은 지운다.
    const body = /원/.test(String(item?.big || '')) ? item.big : item?.text;
    const raw = maskCard(String(body || '')).replace(/[가-힣]\*[가-힣]?님?/g, '').replace(/[가-힣○●*]{2,5}\s?님\s*,?/g, '').replace(/\s+/g, ' ').trim();
    const src = String(item?.src || '') + ' ' + String(item?.text || '').slice(0, 40);
    const am = raw.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/);
    if (!am) return null;
    const ts = Number(item?.ts) || now.getTime();
    const when = new Date(ts);
    const dm = raw.match(/(\d{1,2})[\/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    let date = kstDate(when), time = '';
    if (dm) {
      const got = kstDate(when), y = Number(got.slice(0, 4));
      date = `${y}-${pad(dm[1])}-${pad(dm[2])}`; time = `${pad(dm[3])}:${dm[4]}`;
      if (date > got) date = `${y - 1}-${pad(dm[1])}-${pad(dm[2])}`;   // 1월에 받은 12/31 알림 → 작년
      if (!validDate(date)) date = got;
    }
    const both = raw + ' ' + src;
    const transfer = /(입금|출금|이체|송금)/.test(raw);
    const method = /현대/.test(both) ? '현대카드' : /카카오|카뱅/.test(both) ? (transfer ? '카뱅이체' : '카뱅체크')   // 카카오뱅크(견본 아직 없음 — 일반 판정만, 총괄 #14)
      : /토스/.test(both) && transfer ? '토스이체' : /토스/.test(both) ? '토스체크' : '';
    const cancel = /취소/.test(raw);
    // 가맹점: 금액 뒤에서 할부 · 승인 같은 말을 빼고 남은 앞부분(누적 · 잔액 앞까지)
    let vendor = raw.slice(am.index + am[0].length).replace(/^(\s*(일시불|할부\s*\d*\s*개?월?|승인|취소|사용|결제|체크|출금|입금)\s*,?)+/g, '')
      .replace(/^[,\s]*\d{1,2}[\/.]\d{1,2}\s+\d{1,2}:\d{2}\s*/, '').split(/누적|잔액|\[|\(누/)[0].replace(/^[,\s]+/, '').trim().slice(0, 40);
    for (const p of PATTERNS) if (p.when.test(both) && p.vendor) { const m = raw.match(p.vendor); if (m) vendor = m[1].trim().slice(0, 40); }
    const category = cancel ? '' : classify(vendor, rules);
    const memo = [cancel ? '결제 취소 알림 — 원래 결제 줄과 맞춰 주세요' : '', vendor ? '' : '가맹점 확인 필요(알림에 가맹점이 없음)'].filter(Boolean).join(' · ');
    return normEntry({
      id: 'al_' + String(item?.id || ts).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), kind: cancel ? 'in' : 'out', amount: am[1], date, time, method,
      category, vendor, memo, source: 'alert', inboxId: item?.id || ''
    }, now);
  }
  // 같은 결제가 두 번 왔는지(카드사 알림 + 지갑 앱 알림 등): 같은 방향 · 같은 금액 · 같은 날 · 같은 분(시각이 있을 때)
  function sameMoment(a, b) {
    if (!a || !b || a.status === 'void' || b.status === 'void') return false;
    if (a.kind !== b.kind || a.amount !== b.amount || a.date !== b.date) return false;
    return !!a.time && !!b.time && a.time === b.time;
  }

  const api = { VERSION, METHODS, OFFSET_METHOD, COUPANG_METHOD, ALL_METHODS, OUT_CATEGORIES, IN_CATEGORIES, MOVE_CATEGORY, OWNER_MEAL, OWNER_OUT, OWNER_IN, EVIDENCE, NEEDS,
    ACCOUNTS, METHOD_ACCOUNT, accountOf, accountType, accountTotals, accountCheck, ownerMoney, kstDate, uid, toWon, maskCard, validDate, normEntry, validateEntry, summarize, flowNote, checkReasons, defaultEvidence, classify, parseCSV, fromLedgerCSV, inPeriod, draftFromAlert, sameMoment, PATTERNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FinCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
