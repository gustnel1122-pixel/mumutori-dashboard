'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

// 20261114_1823: agents.html 캡처에서 '2026.11.15 (오늘)'로 하루 더 가 있는 게 보여 찾은 버그.
// 원인: kstToday()가 Date.getTime()(이미 UTC 절대값) 위에 +9h을 더하면서 동시에
// -getTimezoneOffset()도 더해, OS 시간대가 이미 한국(KST)이면 9시간을 두 번 더했다.
// 고친 뒤: 어떤 OS 시간대에서 실행하든(여기선 Date.prototype.getTimezoneOffset을 흉내 내 확인),
// 그리고 한국 시간 23:59/00:01 경계에서도 날짜가 하루씩만 맞게 바뀌어야 한다.
function withTimezoneOffset(minutes, fn) {
  const original = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = function () { return minutes; };
  try { return fn(); } finally { Date.prototype.getTimezoneOffset = original; }
}
function withNow(ms, fn) {
  const OriginalDate = Date;
  class FixedDate extends OriginalDate {
    constructor(...args) { if (args.length === 0) super(ms); else super(...args); }
    static now() { return ms; }
  }
  global.Date = FixedDate;
  try { return fn(); } finally { global.Date = OriginalDate; }
}

test('kstToday is independent of the OS timezone offset (KST-set machines no longer double-add 9h)', async () => {
  const {kstToday} = await import('../src/ads-private.js');
  const now = Date.now();
  // KST(-540)로 흉내 낸 OS와 UTC(0)로 흉내 낸 OS에서 같은 순간을 재면 같은 날짜가 나와야 한다.
  const asKstOs = withTimezoneOffset(-540, () => kstToday());
  const asUtcOs = withTimezoneOffset(0, () => kstToday());
  assert.equal(asKstOs, asUtcOs);
  assert.ok(now > 0); // 그냥 흐름 확인용
});

test('kstToday rolls over exactly at the KST midnight boundary (23:59 → 00:01), not at a UTC boundary', async () => {
  const {kstToday} = await import('../src/ads-private.js' + '?boundary');
  // 2026-11-14 23:59 KST = 2026-11-14 14:59 UTC
  const beforeMidnight = Date.UTC(2026, 10, 14, 14, 59, 0);
  // 2026-11-15 00:01 KST = 2026-11-14 15:01 UTC
  const afterMidnight = Date.UTC(2026, 10, 14, 15, 1, 0);
  assert.equal(withNow(beforeMidnight, () => kstToday()), '2026-11-14');
  assert.equal(withNow(afterMidnight, () => kstToday()), '2026-11-15');
});

test('kstWeek is also independent of the OS timezone offset', async () => {
  const {kstWeek} = await import('../src/ads-private.js' + '?tz');
  const asKstOs = withTimezoneOffset(-540, () => kstWeek());
  const asUtcOs = withTimezoneOffset(0, () => kstWeek());
  assert.equal(asKstOs, asUtcOs);
});

test('agents-daily.js kstToday matches the same fixed KST-boundary cases', async () => {
  const {kstToday} = await import('../src/agents-daily.js');
  const beforeMidnight = Date.UTC(2026, 10, 14, 14, 59, 0);
  const afterMidnight = Date.UTC(2026, 10, 14, 15, 1, 0);
  assert.equal(withNow(beforeMidnight, () => kstToday()), '2026-11-14');
  assert.equal(withNow(afterMidnight, () => kstToday()), '2026-11-15');
});
