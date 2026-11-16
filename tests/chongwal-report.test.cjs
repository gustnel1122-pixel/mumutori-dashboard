'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../src/chongwal-report.js');

test('20261116_2326: validatedReport accepts a well-formed report (id·updatedAt·title·cards[caption,img])', async () => {
  const {validatedReport} = await mod;
  const img = 'data:image/jpeg;base64,' + Buffer.from('fake-jpg-bytes').toString('base64');
  const out = validatedReport({id:'20261116', updatedAt:'2026-11-16T14:25:00Z', title:'총괄 보고서 · 11/16–11/22', cards:[{caption:'이번 주 세 갈래 목표', img}]});
  assert.equal(out.id,'20261116');
  assert.equal(out.cards.length,1);
  assert.equal(out.cards[0].caption,'이번 주 세 갈래 목표');
  assert.equal(out.cards[0].img,img);
});

test('20261116_2326: validatedReport returns null for null/undefined (아직 보고서 없음)', async () => {
  const {validatedReport} = await mod;
  assert.equal(validatedReport(null), null);
  assert.equal(validatedReport(undefined), null);
});

test('20261116_2326: validatedReport rejects non-data-URI img (file path, http url, etc — Firebase에는 data URI만)', async () => {
  const {validatedReport} = await mod;
  assert.throws(() => validatedReport({id:'x', updatedAt:'t', title:'', cards:[{caption:'c', img:'01_이번주.jpg'}]}), /format/);
  assert.throws(() => validatedReport({id:'x', updatedAt:'t', title:'', cards:[{caption:'c', img:'https://example.com/a.jpg'}]}), /format/);
});

test('20261116_2326: validatedReport rejects more than 8 cards and missing id/updatedAt', async () => {
  const {validatedReport} = await mod;
  const img = 'data:image/jpeg;base64,QUJD';
  const manyCards = Array.from({length:9},()=>({caption:'c', img}));
  assert.throws(() => validatedReport({id:'x', updatedAt:'t', title:'', cards:manyCards}), /format/);
  assert.throws(() => validatedReport({updatedAt:'t', title:'', cards:[{caption:'c', img}]}), /format/);
  assert.throws(() => validatedReport({id:'x', title:'', cards:[{caption:'c', img}]}), /format/);
  assert.throws(() => validatedReport({id:'x', updatedAt:'t', title:'', cards:[]}), /format/);
});

test('20261116_2326: validatedReport is a separate code path from agents-daily.js validatedDay (no shared allow-list)', async () => {
  const chongwal = await mod;
  const agentsDaily = await import('../src/agents-daily.js');
  assert.notEqual(chongwal.validatedReport, agentsDaily.validatedDay);
});
