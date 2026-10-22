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
test('확인 필요: 분류 없음 · 나간 돈의 수단 없음(증빙 없음은 세지 않음) · 돈 흐름(들어온 돈 − 나간 돈)',()=>{
  const rows=[e({id:'a'}),e({id:'b',method:'',category:'매입',amount:20000}),e({id:'c',method:'',category:''}),e({id:'d',method:'현금',evidence:'없음'}),
    e({id:'v',method:'',status:'void'}),e({id:'f',kind:'in',category:'자금 충전',method:'',amount:50000})];
  assert.deepEqual(rows.map(r=>F.checkReasons(r)),[[],['수단'],['분류','수단'],[],[],[]]);
  const m=F.summarize(book(rows),'month',NOW);
  assert.equal(m.needs,2);                         // b(수단) · c(분류+수단) — 취소 v · 들어온 돈 f · 증빙 없음 d는 아님
  assert.equal(m.inflow,50000);assert.equal(m.cashFlow,50000-(11000+20000+11000+11000));
  assert.equal(m.stockBuy,20000);assert.equal(m.salesConnected,false);
  assert.equal(F.defaultEvidence('현대카드'),'카드');assert.equal(F.defaultEvidence('토스이체'),'없음');
});
test('쿠팡 정산 차감(상계): 비용에는 넣고 돈 흐름 · 확인 필요에서는 뺌',()=>{
  const rows=[e({id:'a',amount:11000}),e({id:'ad',method:F.OFFSET_METHOD,category:'광고비',amount:4400,evidence:'없음'}),e({id:'in',kind:'in',category:'자금 충전',method:'토스이체',amount:20000})];
  assert.equal(F.validateEntry(rows[1]).method,'쿠팡 정산 차감');
  assert(!F.METHODS.includes(F.OFFSET_METHOD));          // 입력 버튼에는 없음
  const m=F.summarize(book(rows),'month',NOW);
  assert.equal(m.spend,15400);assert.equal(m.offset,4400);
  assert.equal(m.cashFlow,20000-11000);                  // 정산 차감 4,400은 통장으로 안 나감
  assert.equal(m.needs,0);assert.deepEqual(F.checkReasons(rows[1]),[]);
});
test('classify: 가맹점 규칙표',()=>{
  const rules=[{match:'아이템스카우트',category:'매입 부대비'},{match:'쿠팡',and:'광고',category:'광고비'}];
  assert.equal(F.classify('(주)아이템스카우트',rules),'매입 부대비');assert.equal(F.classify('쿠팡 광고센터',rules),'광고비');
  assert.equal(F.classify('쿠팡',rules),'');assert.equal(F.classify('',rules),'');
});
test('draftFromAlert: 알림 글 → 수기 입력과 같은 줄 모양(출처 alert) · 개인정보 빼기 · 규칙이면 바로 분류',()=>{
  const rules=[{match:'가짜배송',category:'배송비'}];
  const a=F.draftFromAlert({id:'-Nx1',src:'android-현대카드',ts:Date.parse('2026-10-19T05:00:00Z'),text:'[현대카드] 김*수님 1234-5678-9012-3456 10/19 13:05 12,300원 일시불 승인 가짜배송센터 누적 999,000원'},rules,NOW);
  assert.equal(a.amount,12300);assert.equal(a.date,'2026-10-19');assert.equal(a.time,'13:05');assert.equal(a.method,'현대카드');
  assert.equal(a.source,'alert');assert.equal(a.kind,'out');assert.equal(a.category,'배송비');assert.equal(a.status,'ok');
  assert(a.vendor.startsWith('가짜배송센터'));assert(!/김|999,000|5678/.test(JSON.stringify(a)));
  const b=F.draftFromAlert({id:'-Nx2',src:'iphone-sms',text:'토스뱅크 체크카드 4,500원 결제 가짜카페 잔액 10,000원'},rules,NOW);
  assert.equal(b.method,'토스체크');assert.equal(b.status,F.NEEDS);assert.equal(b.vendor,'가짜카페');
  const c=F.draftFromAlert({id:'-Nx3',text:'[현대카드] 10/18 09:00 12,300원 취소 가짜배송센터'},rules,NOW);
  assert.equal(c.kind,'in');assert.equal(c.status,F.NEEDS);assert(c.memo.includes('취소'));
  assert.equal(F.draftFromAlert({text:'광고 문자입니다'},rules,NOW),null);
  const y=F.draftFromAlert({id:'-Nx4',ts:Date.parse('2027-01-01T01:00:00Z'),text:'[현대카드] 12/31 23:50 1,000원 일시불 승인 가짜상점'},rules,NOW);
  assert.equal(y.date,'2026-12-31');   // 1월에 받은 12/31 알림은 작년
  [a,b,c].forEach(x=>F.validateEntry(x));
});
test('현대카드 알림(10/20 견본 모양, 가짜 값): 펼친 글에서 가맹점 · 이름 지움 · 접힌 글만이면 가맹점 확인 필요 · 같은 결제 두 번은 하나',()=>{
  const NOW2=new Date('2026-10-19T15:00:00Z');   // 한국 10/20 00:00
  const text='현대카드 홍길동 님, 현대 MY BUSINESS 승인 12,300원 일시불, 10/19 23:58';
  const big='홍길동 님, 현대 MY BUSINESS 승인\n12,300원 일시불, 10/19 23:58\n가짜편의점가짜점\n누적111,111원';
  const a=F.draftFromAlert({id:'-H1',src:'현대카드',ts:Date.parse('2026-10-19T14:58:30Z'),text,big},[],NOW2);
  assert.deepEqual([a.date,a.time,a.amount,a.method,a.vendor,a.status,a.evidence,a.source,a.kind],['2026-10-19','23:58',12300,'현대카드','가짜편의점가짜점',F.NEEDS,'카드','alert','out']);
  assert(!/홍길동|111,111/.test(JSON.stringify(a)));
  const f=F.draftFromAlert({id:'-H2',src:'현대카드',ts:Date.parse('2026-10-19T14:58:30Z'),text},[],NOW2);   // 접힌 글만
  assert.equal(f.vendor,'');assert(f.memo.includes('가맹점 확인 필요'));assert.equal(f.amount,12300);
  assert(!/홍길동/.test(JSON.stringify(f)));
  assert(F.sameMoment(a,f));                                    // 같은 결제(같은 금액 · 같은 분) → 하나만
  assert(!F.sameMoment(a,{...f,time:'23:57'}));
  assert.equal(F.draftFromAlert({id:'-W1',src:'지갑',text:'₩12,300 결제 완료 가짜편의점가짜점'},[],NOW2),null);   // 지갑 앱 '₩' 알림은 초안을 안 만듦
  F.validateEntry(a);F.validateEntry(f);
});
test('돈 흐름 한 줄(검수 14): 매출 − 지출 + 매출 외 입금 + 쿠팡 정산 차감 = 돈 흐름',()=>{
  const rows=[e({id:'s',kind:'in',category:'매출',amount:250000,method:'토스이체'}),e({id:'o',amount:176200-33000}),e({id:'ad',method:F.OFFSET_METHOD,category:'광고비',amount:33000,evidence:'없음'}),
    e({id:'cp',kind:'in',category:'기타 수입',amount:35000,method:'토스이체',vendor:'쿠팡 정산'})];
  const m=F.summarize(book(rows),'month',NOW);
  assert.deepEqual([m.sales,m.spend,m.otherIn,m.offset,m.cashFlow],[250000,176200,35000,33000,141800]);   // 시연 숫자 그대로
  assert.equal(m.sales-m.spend+m.otherIn+m.offset,m.cashFlow);
  assert.equal(F.flowNote(m),'매출 − 지출 + 매출 외 입금 35,000원 + 쿠팡 정산 차감 33,000원(통장으로 안 나감)');
  const plain=F.summarize(book([e({id:'a'})]),'month',NOW);
  assert.equal(plain.otherIn,0);assert.equal(F.flowNote(plain),'매출 − 지출');assert.equal(plain.cashFlow,plain.sales-plain.spend);
});
test('식비 · 식비(본인): 분류 목록에 있음 · 지출에 넣고 본인 식사는 따로 셈 · 현대카드 알림은 규칙 없으면 확인 필요',()=>{
  assert(F.OUT_CATEGORIES.includes('식비')&&F.OUT_CATEGORIES.includes(F.OWNER_MEAL));
  assert.equal(F.OUT_CATEGORIES.indexOf(F.OWNER_MEAL),F.OUT_CATEGORIES.indexOf('식비')+1);   // 버튼이 나란히
  const rows=[e({id:'a',category:'식비',amount:9000}),e({id:'b',category:F.OWNER_MEAL,amount:6500}),e({id:'c',category:F.OWNER_MEAL,amount:1000,status:'void'})];
  rows.forEach(r=>F.validateEntry(r));
  const m=F.summarize(book(rows),'month',NOW);
  assert.equal(m.spend,15500);assert.equal(m.ownerMeal,6500);   // 취소 줄은 빼고
  assert.deepEqual(m.byCategory.map(r=>[r.category,r.amount]),[['식비',9000],[F.OWNER_MEAL,6500]]);
  assert.equal(F.summarize(book([e()]),'month',NOW).ownerMeal,0);
  const big='홍길동 님, 현대 MY BUSINESS 승인\n6,500원 일시불, 10/19 12:10\n가짜편의점가짜점\n누적111,111원';
  const d=F.draftFromAlert({id:'-H9',src:'현대카드',text:'현대카드 승인',big},[],NOW);
  assert.deepEqual([d.method,d.evidence,d.status,d.kind],['현대카드','카드',F.NEEDS,'out']);   // 업무용으로 들어오고 분류는 사람이
  const r=F.draftFromAlert({id:'-H10',src:'현대카드',text:'현대카드 승인',big},[{match:'가짜편의점',category:F.OWNER_MEAL}],NOW);
  assert.equal(r.category,F.OWNER_MEAL);assert.equal(r.status,'ok');F.validateEntry(r);   // '앞으로 이 거래처는 항상' 규칙이면 바로
  const csv='날짜,구분,분류,거래처,내용,금액(원)\n2026-10-05,지출,식비(본인),가짜식당,시험,8000\n2026-10-06,지출,식대,가짜식당,시험,7000\n';
  assert.deepEqual(F.fromLedgerCSV(csv,NOW).map(x=>x.category),[F.OWNER_MEAL,'식비']);
});
test('fromLedgerCSV: 볼트 임시 장부 칸 → 장부 줄(가짜 값)',()=>{
  const csv='﻿날짜,구분,분류,거래처,내용,금액(원),공급가,부가세,결제수단,증빙,근거,기록자,확인\n2026-10-01,지출,구매비,가짜상점,"시험, 따옴표",10000,,,현대카드 사업자,카드,,AI,\n2026-10-02,지출,택배 배송비,가짜택배,시험,4000,,,토스 체크카드,카드,,AI,\n2026-10-03,지출,매입 부대비(국제배송·통관),가짜배대지,시험,3000,,,계좌 입금(확인 필요),확인 필요,,AI,\n';
  const rows=F.fromLedgerCSV(csv,NOW);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(r=>[r.date,r.category,r.method,r.amount,r.source,r.evidence]),[['2026-10-01','매입','현대카드',10000,'import','카드'],['2026-10-02','배송비','토스체크',4000,'import','카드'],['2026-10-03','매입 부대비','',3000,'import','없음']]);
  assert.equal(rows[0].memo,'시험, 따옴표');
  rows.forEach(r=>F.validateEntry(r));
});
