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
