const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAdsDay } = require('../_tools/ads-write-validate.js');

test('empty payload and unknown-but-absent channels are fine', () => {
  assert.equal(validateAdsDay({}).ok, true);
  assert.equal(validateAdsDay({ coupang: null }).ok, true);
});

test('rejects an unknown channel key', () => {
  const r = validateAdsDay({ shopify: {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /모르는 채널/);
});

test('accepts a full valid coupang day', () => {
  const r = validateAdsDay({
    coupang: {
      updatedAt: '2026-11-14T09:40:00+09:00',
      status: 'ok',
      breakeven: 380,
      yesterday: { spend: 1816, revenue: 0, roas: 0 },
      d7: { spend: 19994, revenue: 29500, roas: 147.5 },
      d30: { spend: 106577, revenue: 169330, roas: 158.9 },
      campaigns: [{ name: '오늘의 Pick', on: true, dailyBudget: 10000, targetRoas: 600, diagnosis: '입찰 경쟁력 낮음' }],
      decisions: '목표 수익률을 낮출지 정해주세요.',
    },
  });
  assert.equal(r.ok, true);
});

test('rejects a blocked channel without a reason', () => {
  const r = validateAdsDay({ coupang: { updatedAt: '2026-11-14T09:40:00+09:00', status: 'blocked' } });
  assert.equal(r.ok, false);
});

test('rejects negative spend or a non-boolean campaign flag', () => {
  const base = { updatedAt: '2026-11-14T09:40:00+09:00', status: 'ok' };
  assert.equal(validateAdsDay({ coupang: { ...base, yesterday: { spend: -1, revenue: 0 } } }).ok, false);
  assert.equal(validateAdsDay({ coupang: { ...base, campaigns: [{ name: 'x', on: 'yes', dailyBudget: 0 }] } }).ok, false);
});

test('rejects a payload that is an array or a primitive', () => {
  assert.equal(validateAdsDay([]).ok, false);
  assert.equal(validateAdsDay('x').ok, false);
  assert.equal(validateAdsDay(null).ok, false);
});
