'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/done-wall.js');

test('20261117_1030: validatedCounts returns null for null/undefined (아직 자료 없음)', async () => {
  const {validatedCounts} = await mod;
  assert.equal(validatedCounts(null), null);
  assert.equal(validatedCounts(undefined), null);
});

test('20261117_1030: validatedCounts rejects a non-object root', async () => {
  const {validatedCounts} = await mod;
  assert.throws(() => validatedCounts([1,2,3]), /format/);
});

test('20261117_1030: validatedCounts fills missing categories with 0 (지어내지 않음 — 모르면 0, 숫자 조작 없음) and caps daily at 14', async () => {
  const {validatedCounts} = await mod;
  const daily = Array.from({length:20}, (_,i)=>({date:'2026-11-'+(i+1), count:i}));
  const out = validatedCounts({since:'2026-11-16', counts:{doneJobs:{jobs:5,items:5}}, daily, labels:{doneJobs:'끝낸 일감 수'}});
  assert.equal(out.counts.doneJobs.items, 5);
  assert.equal(out.counts.posters.items, 0);
  assert.equal(out.daily.length, 14);
  assert.equal(out.since, '2026-11-16');
});

test('20261117_1030: validatedWall returns null for null/undefined and rejects non-data-URI image', async () => {
  const {validatedWall} = await mod;
  assert.equal(validatedWall(null), null);
  assert.throws(() => validatedWall({entries:[{job:'x', title:'t', image:'https://example.com/a.jpg'}]}), /format/);
});

test('20261117_1030: validatedWall accepts well-formed entries with optional image', async () => {
  const {validatedWall} = await mod;
  const out = validatedWall({entries:[{job:'x', title:'끝낸 일', sent:'11/16 22:19', result:'완료'}]});
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].title, '끝낸 일');
});

test('20261117_1030: validatedCounts/validatedWall are separate code paths from chongwal-ops.js validatedOps', async () => {
  const dw = await mod;
  const ops = await import('../src/chongwal-ops.js');
  assert.notEqual(dw.validatedCounts, ops.validatedOps);
  assert.notEqual(dw.validatedWall, ops.validatedOps);
});
