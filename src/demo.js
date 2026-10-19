// 보기 전용 시연 모드(총괄 검수 dash-review 8): 주소 끝 ?demo=1 → 이 탭 동안 시연, ?demo=0 → 끝.
// - 공용 장부 칸은 아래 가짜 줄만 메모리에 둔다(장부 주소로 요청을 보내지 않음, 로그인은 흉내 내지 않음 → 진짜 장부는 열리지 않는다).
// - 옛 장부(이 브라우저 저장)는 메모리 저장소로 바꿔, 이 브라우저의 진짜 자료를 읽지도 쓰지도 않는다(erp-app.js LS).
// - 무엇을 눌러도 새로고침하면 사라진다. 화면 맨 위에 '시연 모드' 띠를 단다.
(function () {
  var on = false;
  try {
    var q = new URLSearchParams(location.search).get('demo');
    if (q === '1') sessionStorage.setItem('mmt-demo', '1');
    if (q === '0') sessionStorage.removeItem('mmt-demo');
    on = sessionStorage.getItem('mmt-demo') === '1';
  } catch (e) { on = false; }
  if (!on) return;
  window.__MMT_DEMO__ = true;

  // 이번 달(한국 날짜) 안의 가짜 줄 — 수기 · 알림 · 가져옴 · AI · 확인 필요 · 취소됨을 한 번씩 보이게
  var kst = new Date(Date.now() + 9 * 3600e3).toISOString();
  var ym = kst.slice(0, 7), today = Number(kst.slice(8, 10));
  var day = function (n) { return ym + '-' + String(Math.max(1, Math.min(today, n))).padStart(2, '0'); };
  var row = function (id, o) {
    return Object.assign({ id: id, kind: 'out', method: '', category: '', vendor: '', memo: '시연용 가짜 줄', evidence: '없음', source: 'manual', status: 'ok', vatIncluded: true, createdAt: kst }, o);
  };
  var rows = [
    row('demo1', { date: day(2), amount: 120000, method: '현대카드', category: '매입 부대비', vendor: '시연 · 배송대행', evidence: '카드', source: 'import' }),
    row('demo2', { date: day(5), amount: 33000, method: '쿠팡 정산 차감', category: '광고비', vendor: '시연 · 쿠팡 광고', memo: '시연용 가짜 줄 · 판매대금에서 먼저 빠지는 비용', source: 'ai-ads' }),
    row('demo3', { date: day(8), amount: 4000, method: '현금', category: '배송비', vendor: '시연 · 택배', source: 'phone' }),
    row('demo4', { date: day(today), amount: 7700, method: '토스체크', vendor: '시연 · 문구점', status: 'needs-category', evidence: '카드', source: 'alert' }),
    row('demo5', { date: day(10), amount: 5000, method: '토스체크', category: '소모품', vendor: '시연 · 생활용품점', evidence: '카드', source: 'phone' }),
    row('demo6', { kind: 'in', date: day(12), amount: 250000, method: '토스이체', category: '매출', vendor: '시연 · 오프라인 판매', source: 'manual' }),
    row('demo7', { date: day(3), amount: 1, category: '기타', vendor: '시연 · 취소된 시험 줄', status: 'void', source: 'ai-dashboard' })
  ];
  var entries = {};
  rows.forEach(function (r) { entries[r.id] = r; });
  // 쿠팡 정산 예정 칸(가짜 값) — 이번 주 비용이 매출보다 커서 0원인 모습
  var settle = { nextDate: ym + '-' + String(Math.min(28, today + 3)).padStart(2, '0'), nextAmount: 0, period: '시연용 7일', revenue: 50000, cost: 62000, profit: -12000,
    ads: 30000, fulfillment: 26000, fee: 6000, readAt: '시연 자료', source: '시연' };
  window.__MMT_TEST_FIN__ = { entries: entries, sales: {}, meta: { rules: [], coupangSettle: settle } };

  var mem = {};
  window.__MMT_DEMO_STORAGE__ = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.className = 'demo-banner';
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;justify-content:center;padding:9px 16px;background:#fbe8c8;color:#5a3a0c;font-size:13px;line-height:1.5;border-bottom:1px solid #eccb94;text-align:center';
    b.innerHTML = '<b>시연 모드</b><span>가짜 자료로 보는 화면이에요. 무엇을 눌러도 저장되지 않아요.</span><a href="?demo=0" style="color:#5a3a0c;font-weight:700">시연 끝내기</a>';
    document.body.insertBefore(b, document.body.firstChild);
  });
})();
