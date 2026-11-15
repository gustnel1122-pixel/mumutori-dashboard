'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/agents-daily.js');

test('20261115_0801: validatedDay accepts an old-format report with no easy/nums (옛 보고 그대로 표시)', async () => {
  const {validatedDay} = await mod;
  const out = validatedDay({coupang:{done:'오늘 한 일',upgrade:'없음',at:'2026-11-14T08:00:00.000Z'}});
  assert.equal(out.coupang.done,'오늘 한 일');
  assert.equal(out.coupang.easy,undefined);
  assert.equal(out.coupang.nums,undefined);
});

test('20261115_0801: validatedDay accepts a new-format report with easy+nums (새 칸 있는 보고도 정상)', async () => {
  const {validatedDay} = await mod;
  const out = validatedDay({coupang:{
    done:'오늘 한 일',
    easy:{did:'쿠팡 광고 점검했어요.',found:'검색어를 모았어요.',ask:'우선순위 정해 주세요.'},
    nums:{coupangInquiry:{label:'쿠팡 문의',value:3,unit:'건'}},
  }});
  assert.deepEqual(out.coupang.easy,{did:'쿠팡 광고 점검했어요.',found:'검색어를 모았어요.',ask:'우선순위 정해 주세요.'});
  assert.deepEqual(out.coupang.nums,{coupangInquiry:{label:'쿠팡 문의',value:3,unit:'건'}});
});

test('20261115_0801: validatedDay rejects easy text over 120 chars', async () => {
  const {validatedDay} = await mod;
  assert.throws(() => validatedDay({coupang:{easy:{did:'가'.repeat(121)}}}),/format/);
});

test('20261115_0801: validatedDay rejects more than 8 nums keys and non-finite values', async () => {
  const {validatedDay} = await mod;
  const tooMany = {};
  for (let i = 0; i < 9; i++) tooMany['k'+i] = {label:'x',value:1,unit:''};
  assert.throws(() => validatedDay({coupang:{nums:tooMany}}),/format/);
  assert.throws(() => validatedDay({coupang:{nums:{a:{label:'x',value:'1',unit:''}}}}),/format/);
  assert.throws(() => validatedDay({coupang:{nums:{a:{label:'x',value:NaN,unit:''}}}}),/format/);
});

test('20261115_0801: validatedDay drops unknown seats and fields without throwing', async () => {
  const {validatedDay} = await mod;
  const out = validatedDay({'not-a-seat':{done:'x'},coupang:{done:'y',unknownField:'z'}});
  assert.equal(out['not-a-seat'],undefined);
  assert.equal(out.coupang.done,'y');
  assert.equal(out.coupang.unknownField,undefined);
});

test('20261115_0801: validatedComments normalizes status and carries a reply through (코멘트 상태 바뀜)', async () => {
  const {validatedComments} = await mod;
  const out = validatedComments({coupang:{
    c1:{at:'2026-11-15T00:00:00.000Z',by:'사장님',date:'2026-11-15',text:'잘했어요',status:'done',reply:{at:'2026-11-15T01:00:00.000Z',text:'감사합니다'}},
    c2:{at:'2026-11-15T00:00:00.000Z',by:'다희',date:'2026-11-15',text:'이건 어떻게 된 거예요?'},
  }});
  assert.equal(out.coupang.c1.status,'done');
  assert.equal(out.coupang.c1.reply.text,'감사합니다');
  assert.equal(out.coupang.c2.status,'new');
});

test('20261115_0801: validatedComments drops malformed entries and unknown seats', async () => {
  const {validatedComments} = await mod;
  const out = validatedComments({coupang:{c1:{text:''},c2:{text:'ok',at:'x',by:'y',date:'z'}},'not-a-seat':{c1:{text:'ok'}}});
  assert.equal(out.coupang.c1,undefined);
  assert.equal(out.coupang.c2.text,'ok');
  assert.equal(out['not-a-seat'],undefined);
});

test('20261115_0801: validatedKeywords keeps valid rows, normalizes compete, caps at 200', async () => {
  const {validatedKeywords} = await mod;
  const rows = [{kw:'말랑 키링',monthly:1200,compete:'낮음',where:'네이버',group:'말랑이'},{kw:'',monthly:999},{notKw:true}];
  const out = validatedKeywords(rows);
  assert.equal(out.length,1);
  assert.equal(out[0].kw,'말랑 키링');
  assert.equal(out[0].compete,'낮음');
  const many = Array.from({length:250},(_, i) => ({kw:'k'+i,monthly:i}));
  assert.equal(validatedKeywords(many).length,200);
});

test('20261115_0801: validatedKeywords falls back to 확인 필요 for an unknown compete value', async () => {
  const {validatedKeywords} = await mod;
  const out = validatedKeywords([{kw:'x',monthly:1,compete:'모름'}]);
  assert.equal(out[0].compete,'확인 필요');
});

test('20261115_0801_v2: marginRows computes margin from unitCost+sale.storePrice, never fabricates missing cost/price', async () => {
  const {marginRows} = await mod;
  const rows = marginRows({
    a:{id:'a',name:'카드지갑',unitCost:1000,sale:{storePrice:5000},stock:10},
    b:{id:'b',name:'원가 없음 상품',sale:{storePrice:3000},stock:2},
    c:{id:'c',name:'판매가 없음 상품',unitCost:500,stock:0},
  });
  const a = rows.find(r=>r.id==='a');
  assert.equal(a.margin,4000);
  assert.equal(a.marginRate,80);
  const b = rows.find(r=>r.id==='b');
  assert.equal(b.cost,null);
  assert.equal(b.margin,null);
  const c = rows.find(r=>r.id==='c');
  assert.equal(c.price,null);
  assert.equal(c.margin,null);
});

test('20261115_0801_v2: marginRows ignores malformed product entries without throwing', async () => {
  const {marginRows} = await mod;
  const rows = marginRows({a:null,b:{name:'ok',unitCost:100,sale:{storePrice:200}},c:'문자열 아님'});
  assert.equal(rows.length,1);
});

test('20261115_0801_v2: marginRows also reads products given as an array (Firebase returns numeric-keyed nodes as arrays)', async () => {
  const {marginRows} = await mod;
  const rows = marginRows([{id:'0',name:'감자..',unitCost:993,sale:{storePrice:3000},stock:5},{id:'1',name:'감자빵 키링',unitCost:402,sale:{storePrice:2000},stock:3}]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].name,'감자..');
});

test('20261115_0801_v2: validatedCustomers keeps real name/phone/address as-is (no masking), drops entries without a name', async () => {
  const {validatedCustomers} = await mod;
  const out = validatedCustomers({own:{c1:{at:'2026-11-15T00:00:00.000Z',name:'김현수',phone:'010-0000-0000',address:'서울 강남구',items:'카드지갑 x1',amount:5000,repeat:true},c2:{phone:'010-1111-1111'}}});
  assert.equal(out.own.c1.name,'김현수');
  assert.equal(out.own.c1.phone,'010-0000-0000');
  assert.equal(out.own.c1.address,'서울 강남구');
  assert.equal(out.own.c1.repeat,true);
  assert.equal(out.own.c2,undefined);
});

test('20261115_0801_v2: validatedCustomers drops unknown-shaped top-level input without throwing', async () => {
  const {validatedCustomers} = await mod;
  assert.deepEqual(validatedCustomers(null),{});
  assert.deepEqual(validatedCustomers('문자열'),{});
  assert.deepEqual(validatedCustomers({own:'문자열'}),{});
});

test('20261115_0801_v3: keywordRelevant keeps only keywords whose text contains a real product word', async () => {
  const {keywordRelevant} = await mod;
  assert.equal(keywordRelevant('롤'),false);
  assert.equal(keywordRelevant('영수증'),false);
  assert.equal(keywordRelevant('카드지갑'),false);
  assert.equal(keywordRelevant('인형키링'),true);
  assert.equal(keywordRelevant('말랑이'),true);
  assert.equal(keywordRelevant('야광테이프'),true);
});

test('20261115_0801_v3: keywordOpportunity rewards high search volume with low competition over high volume with high competition', async () => {
  const {keywordOpportunity} = await mod;
  const lowCompeteSmallVolume = keywordOpportunity(1000,'낮음');
  const highCompeteSameVolume = keywordOpportunity(1000,'높음');
  assert(lowCompeteSmallVolume > highCompeteSameVolume);
  assert.equal(keywordOpportunity(null,'낮음'),0);
});

test('20261115_0801_v3: productStats counts confirmed sales and zero-stock without fabricating missing stock', async () => {
  const {marginRows, productStats} = await mod;
  const rows = marginRows({
    a:{id:'a',name:'팜',unitCost:100,sale:{storePrice:200,decision:'판매'},stock:0},
    b:{id:'b',name:'비확정',unitCost:100,sale:{storePrice:200,decision:'미정'},stock:5},
    c:{id:'c',name:'재고 모름',unitCost:100,sale:{storePrice:200,decision:'판매'}},
  });
  const stats = productStats(rows);
  assert.equal(stats.total,3);
  assert.equal(stats.confirmed,2);
  assert.equal(stats.zeroStock,1);
  assert.equal(stats.stockSum,5);
});

test('20261115_0801_v3: adsDailyTotals sums yesterday spend/revenue across channels, null when nothing is there', async () => {
  const {adsDailyTotals} = await mod;
  assert.equal(adsDailyTotals(null),null);
  assert.equal(adsDailyTotals({coupang:{}}),null);
  const t = adsDailyTotals({coupang:{yesterday:{spend:1000,revenue:3000}},naver:{yesterday:{spend:500,revenue:500}}});
  assert.equal(t.spend,1500);
  assert.equal(t.revenue,3500);
});

test('20261115_0801_v3: customerStats counts total and repeat customers across channels, null when empty', async () => {
  const {customerStats, validatedCustomers} = await mod;
  assert.equal(customerStats({}),null);
  const customers = validatedCustomers({own:{c1:{name:'김현수',repeat:true}},smartstore:{c2:{name:'안서진'}}});
  const stats = customerStats(customers);
  assert.equal(stats.total,2);
  assert.equal(stats.repeat,1);
});
