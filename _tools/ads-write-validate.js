// 광고 통합 자료 쓰기 — 모양 검사만 (아직 아무도 이 길로 쓰지 않음, 20261114_1112 2번 "준비만").
// 받는 쪽(장차 Apps Script 웹앱)이 엉뚱한 자리에 못 쓰게 먼저 걸러내는 순수 함수. Node에서도, (나중에) Apps Script에서도 그대로 쓸 수 있게
// Firebase·UrlFetchApp 같은 환경 전용 호출은 전혀 안 한다(이 파일은 모양 검사만).
const CHANNELS = ['coupang', 'naver', 'meta', 'kakao', 'google'];
const PERIODS = ['yesterday', 'd7', 'd30'];

function isFiniteNonNeg(v) { return v == null || (typeof v === 'number' && Number.isFinite(v) && v >= 0); }

function validPeriod(p) {
  if (p == null) return true;
  if (typeof p !== 'object') return false;
  if (!isFiniteNonNeg(p.spend) || !isFiniteNonNeg(p.revenue)) return false;
  if (p.roas != null && typeof p.roas !== 'number') return false;
  return true;
}

function validCampaign(c) {
  if (!c || typeof c !== 'object') return false;
  if (typeof c.name !== 'string' || c.name.length > 100) return false;
  if (typeof c.on !== 'boolean') return false;
  if (!isFiniteNonNeg(c.dailyBudget)) return false;
  if (c.targetRoas != null && typeof c.targetRoas !== 'number') return false;
  if (c.diagnosis != null && (typeof c.diagnosis !== 'string' || c.diagnosis.length > 200)) return false;
  return true;
}

const STATUSES = ['ok', 'blocked', 'no_campaign', 'disconnected'];

function validInflowRoute(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.rank != null && typeof r.rank !== 'number') return false;
  if (typeof r.route !== 'string' || r.route.length > 60) return false;
  if (r.visits != null && !isFiniteNonNeg(r.visits)) return false;
  if (r.sharePct != null && typeof r.sharePct !== 'number') return false;
  return true;
}

function validTopProduct(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.name !== 'string' || p.name.length > 100) return false;
  if (p.visits != null && !isFiniteNonNeg(p.visits)) return false;
  if (p.payments != null && !isFiniteNonNeg(p.payments)) return false;
  return true;
}

// 날짜 하나(hub/adsDaily/<date>)에 들어갈 전체 모양: 채널 id를 키로, 각 채널이 아래 shape.
function validChannelDay(ch) {
  if (ch == null) return true; // 아직 연결 전인 채널은 생략 가능
  if (typeof ch !== 'object') return false;
  if (typeof ch.updatedAt !== 'string') return false;
  if (!STATUSES.includes(ch.status)) return false;
  if (ch.status === 'blocked' && typeof ch.blockedReason !== 'string') return false;
  if (ch.breakeven != null && typeof ch.breakeven !== 'number') return false;
  for (const key of PERIODS) if (!validPeriod(ch[key])) return false;
  if (ch.campaigns != null) {
    if (!Array.isArray(ch.campaigns) || ch.campaigns.length > 50) return false;
    if (!ch.campaigns.every(validCampaign)) return false;
  }
  // 유입 경로·상품별 유입(지금은 30일 고정, 네이버 스마트스토어 비즈어드바이저 화면에서 옴 — 20261114_1407 C번)
  if (ch.topInflowRoutes30d != null) {
    if (!Array.isArray(ch.topInflowRoutes30d) || ch.topInflowRoutes30d.length > 20) return false;
    if (!ch.topInflowRoutes30d.every(validInflowRoute)) return false;
  }
  if (ch.topProducts30d != null) {
    if (!Array.isArray(ch.topProducts30d) || ch.topProducts30d.length > 20) return false;
    if (!ch.topProducts30d.every(validTopProduct)) return false;
  }
  if (ch.decisions != null && (typeof ch.decisions !== 'string' || ch.decisions.length > 500)) return false;
  return true;
}

// payload = { coupang: {...}|null, naver: {...}|null, ... } — 날짜 키 하나의 전체 내용.
function validateAdsDay(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'payload는 객체여야 합니다.' };
  for (const key of Object.keys(payload)) {
    if (!CHANNELS.includes(key)) return { ok: false, reason: `모르는 채널 "${key}"` };
  }
  for (const id of CHANNELS) {
    if (!validChannelDay(payload[id])) return { ok: false, reason: `채널 "${id}"의 모양이 맞지 않습니다.` };
  }
  return { ok: true };
}

module.exports = { CHANNELS, PERIODS, validateAdsDay };
