'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/chongwal-ops.js');

const SAMPLE = {
  updatedAt: '2026-11-17T00:00:00Z', by: '총괄',
  strategy: [{pillar:'온라인 몰', face:'도토리', goal:'검색에 나오게'}],
  proposals: [{id:'p-gacha', name:'가챠(캡슐토이)', stage:'기획안', next:'기계값 조사', due:'11/18', jobs:['20261116_2354_gacha-cost']}],
  jobs: [{job:'20261116_2227_seo-check-1', title:'검색 점검표', plan:'온라인 몰', seats:['광고'], sent:'11/16 22:27', due:'11/17 09:00', status:'끝', result:'완료'}],
  seats: [{seat:'광고', face:'밤', where:'PC', does:'쿠팡·스마트스토어·네이버 숫자'}],
};

test('20261117_0004: validatedOps accepts a well-formed ops payload (strategy·proposals·jobs·seats)', async () => {
  const {validatedOps} = await mod;
  const out = validatedOps(SAMPLE);
  assert.equal(out.strategy.length, 1);
  assert.equal(out.proposals[0].stage, '기획안');
  assert.equal(out.jobs[0].status, '끝');
  assert.equal(out.seats[0].face, '밤');
});

test('20261117_0004: validatedOps returns null for null/undefined (아직 자료 없음)', async () => {
  const {validatedOps} = await mod;
  assert.equal(validatedOps(null), null);
  assert.equal(validatedOps(undefined), null);
});

test('20261117_0004: validatedOps rejects a non-object/array root and bad field types', async () => {
  const {validatedOps} = await mod;
  assert.throws(() => validatedOps([1,2,3]), /format/);
  assert.throws(() => validatedOps({strategy:[{pillar:1, face:'도토리', goal:'x'}]}), /format/);
  assert.throws(() => validatedOps({jobs:[{job:'x', title:'x', seats:[1,2]}]}), /format/);
});

test('20261117_0004: validatedOps defaults job.status to 보냄 when missing, and tolerates unknown stage/status strings (no fabrication, no crash)', async () => {
  const {validatedOps} = await mod;
  const out = validatedOps({jobs:[{job:'x', title:'t'}], proposals:[{id:'p', name:'n', stage:'모르는단계'}]});
  assert.equal(out.jobs[0].status, '보냄');
  assert.equal(out.proposals[0].stage, '모르는단계');
});

test('20261117_0004: validatedOps rejects a non-data-URI proposal image (same discipline as chongwal-report.js cards)', async () => {
  const {validatedOps} = await mod;
  assert.throws(() => validatedOps({proposals:[{id:'p', name:'n', stage:'제안', image:'https://example.com/a.jpg'}]}), /format/);
});

test('20261117_0004: countHomeStats counts 하는 중/막힘 jobs and 사장님 OK proposals separately', async () => {
  const {countHomeStats} = await mod;
  const data = {
    jobs: [{status:'하는 중'},{status:'막힘'},{status:'끝'},{status:'보냄'}],
    proposals: [{stage:'사장님 OK'},{stage:'제안'}],
  };
  assert.deepEqual(countHomeStats(data), {running:1, blocked:1, waitingOwnerOk:1});
});

test('20261117_0004: validatedOps is a separate code path from agents-daily.js validatedDay and chongwal-report.js validatedReport (no shared allow-list)', async () => {
  const ops = await mod;
  const agentsDaily = await import('../src/agents-daily.js');
  const report = await import('../src/chongwal-report.js');
  assert.notEqual(ops.validatedOps, agentsDaily.validatedDay);
  assert.notEqual(ops.validatedOps, report.validatedReport);
});
