'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/revenue-plan.js');

const SAMPLE = [
  {
    branch: '온라인 몰', face: '도토리', money: '매장 상품을 온라인에도 팔기',
    steps: [{step:'검색 고치기', due:'11/17', done:true}, {step:'상세 22개', due:'11/18', done:false}],
    targets: [{label:'온라인 주문', now:0, goal:3, unit:'건/하루', due:'12/15'}],
  },
];

test('20261117_1030: validatedRevenuePlan accepts a well-formed branch(steps·targets)', async () => {
  const {validatedRevenuePlan} = await mod;
  const out = validatedRevenuePlan(SAMPLE);
  assert.equal(out.length, 1);
  assert.equal(out[0].branch, '온라인 몰');
  assert.equal(out[0].steps[0].done, true);
  assert.equal(out[0].targets[0].goal, 3);
});

test('20261117_1030: validatedRevenuePlan returns null for null/undefined (아직 자료 없음)', async () => {
  const {validatedRevenuePlan} = await mod;
  assert.equal(validatedRevenuePlan(null), null);
  assert.equal(validatedRevenuePlan(undefined), null);
});

test('20261117_1030: validatedRevenuePlan rejects a non-array root and bad field types', async () => {
  const {validatedRevenuePlan} = await mod;
  assert.throws(() => validatedRevenuePlan({branch:'x'}), /format/);
  assert.throws(() => validatedRevenuePlan([{branch:1, money:'x'}]), /format/);
  assert.throws(() => validatedRevenuePlan([{branch:'x', money:'x', steps:[{step:1}]}]), /format/);
});

test('20261117_1030: validatedRevenuePlan keeps now/goal null (사장님이 모를 때 지어내지 않음) and tolerates missing targets', async () => {
  const {validatedRevenuePlan} = await mod;
  const out = validatedRevenuePlan([{branch:'오프라인 매장', money:'매장 매출', targets:[{label:'매장 매출', now:null, goal:null, unit:'원', note:'확인 필요'}]}]);
  assert.equal(out[0].targets[0].now, null);
  assert.equal(out[0].targets[0].note, '확인 필요');
  assert.deepEqual(out[0].steps, []);
});

test('20261117_1030: validatedRevenuePlan is a separate code path from chongwal-ops.js validatedOps (no shared allow-list)', async () => {
  const revenue = await mod;
  const ops = await import('../src/chongwal-ops.js');
  assert.notEqual(revenue.validatedRevenuePlan, ops.validatedOps);
});
