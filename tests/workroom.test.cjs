'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/workroom.js');

test('20261117_1030: validatedWorkroom returns null for null/undefined (아직 자료 없음)', async () => {
  const {validatedWorkroom} = await mod;
  assert.equal(validatedWorkroom(null), null);
  assert.equal(validatedWorkroom(undefined), null);
});

test('20261117_1030: validatedWorkroom rejects a non-object/array root', async () => {
  const {validatedWorkroom} = await mod;
  assert.throws(() => validatedWorkroom([1,2,3]), /format/);
});

test('20261117_1030: validatedWorkroom always returns all 9 seats, filling missing/bad seats with 확인 필요 (no crash)', async () => {
  const {validatedWorkroom, SEAT_ORDER} = await mod;
  const out = validatedWorkroom({coupang:{status:'움직이는 중', job:'seo-fix', progress:'3/9', lastMovedAt:'2026-11-17T01:00:00Z', steps:[{at:'2026-11-17T01:00:00Z', job:'x', step:'단계1', progress:''}], images:[], autoEstimated:false}});
  assert.deepEqual(Object.keys(out).sort(), SEAT_ORDER.slice().sort());
  assert.equal(out.coupang.status, '움직이는 중');
  assert.equal(out.coupang.steps[0].step, '단계1');
  assert.equal(out.hamili.status, '확인 필요'); // 자료 없음 — 지어내지 않음
});

test('20261117_1030: validatedWorkroom drops non-data-URI images (same discipline as other cards)', async () => {
  const {validatedWorkroom} = await mod;
  const out = validatedWorkroom({coupang:{images:['https://example.com/a.jpg', 'data:image/jpeg;base64,abc=']}});
  assert.deepEqual(out.coupang.images, ['data:image/jpeg;base64,abc=']);
});

test('20261117_1030: validatedWorkroom caps steps at 50 and tolerates malformed step entries', async () => {
  const {validatedWorkroom} = await mod;
  const steps = Array.from({length:60}, (_,i)=>({at:'2026-11-17T00:00:00Z', job:'x', step:'s'+i, progress:''}));
  const out = validatedWorkroom({coupang:{steps}});
  assert.equal(out.coupang.steps.length, 50);
});

test('20261117_1030: validatedWorkroom is a separate code path from chongwal-ops.js validatedOps (no shared allow-list)', async () => {
  const workroom = await mod;
  const ops = await import('../src/chongwal-ops.js');
  assert.notEqual(workroom.validatedWorkroom, ops.validatedOps);
});
