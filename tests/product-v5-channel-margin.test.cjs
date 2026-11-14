'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=import('../preview-v5/model.js');

// 20261106_1차입고_상품분류표.xlsx '수수료 설정'·'쿠팡 전략' 탭 실제 값으로 맞춰본 것(20261114_1702).
test('channel settlement matches the fee sheet exactly for a 9,900원 example', async () => {
  const {channelSettlement, CHANNEL_FEES} = await modules;
  assert.equal(Math.round(channelSettlement(9900, CHANNEL_FEES.smart)), 9245);
  assert.equal(Math.round(channelSettlement(9900, CHANNEL_FEES.own)), 9541);
  assert.equal(Math.round(channelSettlement(9900, CHANNEL_FEES.coupang, 2250)), 6507);
});

test('channel breakdown reproduces 쿠팡 전략 탭 row (거위 집게핀 세트: 9,900원 · 원가 640 · 물류비 2,250)', async () => {
  const {channelBreakdown, CHANNEL_FEES} = await modules;
  const b = channelBreakdown(9900, 640, CHANNEL_FEES.coupang, 2250);
  assert.equal(Math.round(b.settlement), 6507);
  assert.equal(Math.round(b.margin), 5867); // 탭의 '마진' 칸과 정확히 같음
  assert.ok(b.roas > 165 && b.roas < 172); // 탭 '최소 ROAS' 168.7%대 — 반올림 차이만 있음
});

test('margin at or below zero has no finite ROAS; unknown cost keeps margin unknown', async () => {
  const {channelBreakdown, CHANNEL_FEES} = await modules;
  const loss = channelBreakdown(3900, 1072, CHANNEL_FEES.coupang, 2500); // 채널 수수료·물류비.md 감자동전지갑 예시(물류비 2,500) — 적자 -123원과 거의 같음
  assert.ok(Math.abs(loss.margin - -123) < 1);
  assert.equal(loss.roas, null);
  const unknown = channelBreakdown(9900, null, CHANNEL_FEES.coupang, 2250);
  assert.equal(unknown.margin, null);
  assert.equal(unknown.roas, null);
});

test('store channel has no fee and no logistics by default', async () => {
  const {channelBreakdown, CHANNEL_FEES} = await modules;
  const b = channelBreakdown(10000, 3000, CHANNEL_FEES.store);
  assert.equal(b.settlement, 10000);
  assert.equal(b.margin, 7000);
});

test('coupang bundle: 단품이 목표 ROAS 안이면 단품 추천 (인형처럼 마진 넉넉한 상품)', async () => {
  const {coupangBundleOptions} = await modules;
  const r = coupangBundleOptions(12900, 1897, {stock: 20}); // 멍한 치와와 인형 예시(채널 수수료·물류비.md)
  assert.equal(r.bundles[0].coupangPrice, 12900);
  assert.equal(r.recommend, 1);
  assert.ok(r.bundles[0].roas < 300);
});

test('coupang bundle: 단품이 적자/목표 밖이면 다음 묶음을 추천하고, 끝까지 밖이면 안 올림', async () => {
  const {coupangBundleOptions} = await modules;
  const keyring = coupangBundleOptions(1500, 1900, {stock: 20}); // 단품은 원가가 더 커 확실한 적자 예시
  assert.equal(keyring.bundles[0].margin < 0, true);
  assert.notEqual(keyring.recommend, 1);
  // 3개 묶음도 밖이면 추천 없음(null)이고, 그렇지 않다면 2 또는 3이어야 한다.
  assert.ok(keyring.recommend === null || keyring.recommend === 2 || keyring.recommend === 3);
});

test('coupang bundle: 재고가 최소 수량 미만이면 마진과 무관하게 안 올림', async () => {
  const {coupangBundleOptions} = await modules;
  const r = coupangBundleOptions(12900, 1897, {stock: 3, minStock: 10});
  assert.equal(r.recommend, null);
  assert.equal(r.lowStock, true);
  assert.match(r.reason, /10개 미만/);
});

test('coupang bundle price rounds up to the common …900원 ending seen in the real 쿠팡 전략 탭', async () => {
  const {coupangBundleOptions} = await modules;
  const r = coupangBundleOptions(5000, 1000, {stock: 20});
  for (const b of r.bundles) assert.match(String(b.coupangPrice), /900$/);
});

test('a manual priceOverride on a bundle is used instead of the auto-suggested price', async () => {
  const {coupangBundleOptions} = await modules;
  const r = coupangBundleOptions(5000, 1000, {stock: 20, priceOverride: {2: 9900}});
  assert.equal(r.bundles[1].coupangPrice, 9900);
  assert.equal(r.bundles[1].suggestedPrice, 10900); // 자동 제안가는 그대로 보여 손으로 바꾼 것과 비교할 수 있게
});
