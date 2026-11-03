// 재무 맨 위 '돈 한눈에' 계산 시험(사장님 11/3) — 가짜 금액만. 실행: node --test tests/fin-glance.test.js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/fin-core.js');
const NOW=new Date('2026-11-03T03:00:00Z');   // 한국 11/3 12:00
const e=(over={})=>F.normEntry({amount:10000,method:'토스이체',category:'배송비',date:'2026-11-02',...over},NOW);
const T='토스뱅크(정산 통장)',K='카카오뱅크(사업자 통장)';
const book=(rows,checks={})=>({entries:Object.fromEntries(rows.map(r=>[r.id,r])),sales:{},meta:{accountChecks:checks}});

test('통장 잔액: 시작 잔액 + 그 날부터 지금까지(대조 시각 at 뒤 줄도 넣음)',()=>{
  const rows=[
    e({id:'a1',kind:'in',amount:100000,category:'매출',date:'2026-10-20'}),        // 시작 전 — 시작 잔액에 이미 들어 있어 빼야 함
    e({id:'a2',kind:'in',amount:50000,category:'매출',date:'2026-10-23'}),
    e({id:'a3',amount:20000,date:'2026-11-01'}),                                   // 대조 at(10/23) 뒤 — 지금 잔액에는 들어감
    e({id:'a4',amount:7000,method:'토스체크',date:'2026-11-02'}),                  // 토스 체크카드는 토스 통장에서 빠짐
    e({id:'k1',amount:8000,method:'카뱅체크',date:'2026-11-02'}),                  // 카뱅 체크카드 → 카카오 통장에서 빠짐
    e({id:'k2',kind:'in',amount:30000,method:'카뱅이체',category:'매출',date:'2026-10-25'})
  ];
  const g=F.moneyGlance(book(rows,{toss:{account:T,from:'2026-10-22',at:'2026-10-23 23:59',balance:200000,opening:150000},kakao:{account:K,from:'2026-10-22',opening:8430}}),NOW);
  const bal=Object.fromEntries(g.banks.map(b=>[b.account,b.balance]));
  assert.equal(bal[T],150000+50000-20000-7000);
  assert.equal(bal[K],8430+30000-8000);
  assert.equal(g.bankTotal,bal[T]+bal[K]);
});

test('카드: 이번 달만 · 결제 − 취소 · 지난달 줄 제외 · 취소된(void) 줄 제외',()=>{
  const rows=[
    e({id:'h1',amount:33000,method:'현대카드',date:'2026-11-01'}),
    e({id:'h2',kind:'in',amount:3000,method:'현대카드',category:'매출',date:'2026-11-02'}),   // 결제 취소 알림(in)
    e({id:'h3',amount:99000,method:'현대카드',date:'2026-10-31'}),                          // 지난달
    e({id:'t1',amount:4500,method:'토스체크',date:'2026-11-03'}),
    {...e({id:'t2',amount:1000,method:'토스체크',date:'2026-11-03'}),status:'void'}
  ];
  const g=F.moneyGlance(book(rows),NOW);
  const c=Object.fromEntries(g.cards.map(x=>[x.method,x]));
  assert.equal(c['현대카드'].spent,30000); assert.equal(c['현대카드'].back,3000); assert.equal(c['현대카드'].count,1);
  assert.equal(c['토스체크'].spent,4500); assert.equal(c['카뱅체크'].spent,0);
  assert.equal(g.cardTotal,34500); assert.equal(g.month,'2026-11');
});
