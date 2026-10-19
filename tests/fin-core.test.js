// 재무 빠른 장부 계산 시험 — 가짜 금액만 쓴다(공개 저장소). 실행: node tests/fin-core.test.js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/fin-core.js');
const NOW=new Date('2026-10-19T05:00:00Z');   // 한국 시간 10/19 14:00
const e=(over={})=>F.normEntry({amount:11000,method:'현대카드',category:'배송비',date:'2026-10-19',...over},NOW);
const book=rows=>({entries:Object.fromEntries(rows.map(r=>[r.id,r])),sales:{},meta:{}});

test('normEntry: 기본값 · 분류 없으면 분류 필요 · 카드번호는 끝 4자리만',()=>{
  const x=F.normEntry({amount:'12,300원',method:'현대카드',vendor:'쿠팡 1234-5678-9012-3456',memo:'카드 1234567890123456'},NOW);
  assert.equal(x.amount,12300);assert.equal(x.kind,'out');assert.equal(x.date,'2026-10-19');assert.equal(x.status,F.NEEDS);
  assert.equal(x.evidence,'카드');assert.equal(x.vatIncluded,true);
  assert(!/5678/.test(x.vendor)&&x.vendor.includes('3456'));assert(!/56789012/.test(x.memo)&&x.memo.includes('3456'));
});
test('validateEntry: 금액 · 날짜 · 목록 검사',()=>{
  assert.throws(()=>F.validateEntry(e({amount:0})),/금액/);
  assert.throws(()=>F.validateEntry(e({amount:'abc'})),/금액/);
  assert.throws(()=>F.validateEntry(e({date:'2026-13-40'})),/날짜/);
  assert.throws(()=>F.validateEntry(e({method:'다른카드'})),/수단/);
  assert.throws(()=>F.validateEntry(e({category:'없는분류'})),/분류/);
  assert.equal(F.validateEntry(e()).amount,11000);
});
test('summarize: 오늘 · 이번 달 지출, 부가세(카드 공제), 분류 필요, 취소 줄 제외',()=>{
  const rows=[e({id:'a'}),e({id:'b',date:'2026-10-02',amount:22000,method:'토스이체',category:'매입'}),e({id:'c',category:''}),e({id:'d',status:'void'}),e({id:'e',date:'2026-09-30'}),
    e({id:'s',kind:'in',category:'매출',amount:33000,method:'토스이체'})];
  const t=F.summarize(book(rows),'today',NOW),m=F.summarize(book(rows),'month',NOW);
  assert.equal(t.spend,22000);   // a + c(분류 필요도 나간 돈)
  assert.equal(m.spend,44000);   // a + b + c (d 취소 · e 지난달 제외)
  assert.equal(m.sales,33000);assert.equal(m.needs,1);
  assert.equal(m.vatDeductible,2000);   // 카드 a·c 22000/11 — 토스이체(증빙 없음) b는 공제에서 뺌
  assert.equal(m.vat,3000-2000);
  assert.equal(m.net,33000-44000);
});
test('summarize: 채널 매출(2단계 칸)과 수수료 반영, 수수료 모르면 추정 표시',()=>{
  const b=book([e({id:'a'})]);b.sales={coupang:{'2026-10-19':{gross:55000,orders:3,fee:5000}},smartstore:{'2026-10-18':{gross:11000,orders:1}}};
  const t=F.summarize(b,'today',NOW),m=F.summarize(b,'month',NOW);
  assert.equal(t.sales,55000);assert.equal(t.fee,5000);assert.equal(t.feeKnown,true);assert.equal(t.net,55000-5000-11000);
  assert.equal(m.sales,66000);assert.equal(m.feeKnown,false);assert.equal(m.salesConnected,true);
});
test('classify: 가맹점 규칙표',()=>{
  const rules=[{match:'아이템스카우트',category:'매입 부대비'},{match:'쿠팡',and:'광고',category:'광고비'}];
  assert.equal(F.classify('(주)아이템스카우트',rules),'매입 부대비');assert.equal(F.classify('쿠팡 광고센터',rules),'광고비');
  assert.equal(F.classify('쿠팡',rules),'');assert.equal(F.classify('',rules),'');
});
test('fromLedgerCSV: 볼트 임시 장부 칸 → 장부 줄(가짜 값)',()=>{
  const csv='﻿날짜,구분,분류,거래처,내용,금액(원),공급가,부가세,결제수단,증빙,근거,기록자,확인\n2026-10-01,지출,구매비,가짜상점,"시험, 따옴표",10000,,,현대카드 사업자,카드,,AI,\n2026-10-02,지출,택배 배송비,가짜택배,시험,4000,,,토스 체크카드,카드,,AI,\n2026-10-03,지출,매입 부대비(국제배송·통관),가짜배대지,시험,3000,,,계좌 입금(확인 필요),확인 필요,,AI,\n';
  const rows=F.fromLedgerCSV(csv,NOW);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(r=>[r.date,r.category,r.method,r.amount,r.source,r.evidence]),[['2026-10-01','매입','현대카드',10000,'import','카드'],['2026-10-02','배송비','토스체크',4000,'import','카드'],['2026-10-03','매입 부대비','',3000,'import','없음']]);
  assert.equal(rows[0].memo,'시험, 따옴표');
  rows.forEach(r=>F.validateEntry(r));
});
