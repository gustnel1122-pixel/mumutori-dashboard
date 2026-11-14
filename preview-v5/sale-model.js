// Sale-preparation values are private product data; never infer unknown prices.
export const SALE_CHANNELS = Object.freeze(['own', 'smart', 'coupang']);
// Both already-authorized accounts may see margins when the feature is used.
// This is a display setting and does not grant database access.
export const MARGIN_VISIBLE_TO = 'allowed';
const DECISIONS = new Set(['미정', '판매', '보류', '안 팜']);
const DETAILS = new Set(['없음', '만드는 중', '완료']);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const owns = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
const fail = () => { throw Error('판매 준비 내용을 확인해 주세요.'); };
const price = x => x == null || x === '' ? null : typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : fail();
// 1823: 매장(오프라인) 판매가가 기준값 — 자사몰·스스·쿠팡 칸을 비우면 이 값을 따라간다(기존 saleMargin의 own 기준값을 매장으로 승격).
const barcodeText = x => x == null || x === '' ? '' : typeof x === 'string' && x.trim().length <= 40 ? x.trim() : fail();
export const BUNDLE_QTYS = Object.freeze([1, 2, 3]);
const HISTORY_FIELDS = /^(?:decision|storePrice|barcode|prices\.(?:own|smart|coupang)|coupangBundlePrices\.[123]|listings\.(?:own|smart|coupang)\.(?:registered|url|detail))$/;
const HISTORY_LIMIT = 30;
const ACTOR = /^[A-Za-z0-9:_-]{1,128}$/;

// Firebase drops null properties. Store explicit type/presence rather than
// relying on a nullable `value` to distinguish missing, null, false and zero.
function historyValue(value, present) {
  if (!present) return {present:false};
  if (value === null || value === undefined) return {present:true,type:'null'};
  if (typeof value === 'boolean') return {present:true,type:'boolean',value};
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return {present:true,type:'number',value};
  if (typeof value === 'string' && value.length <= 2048) return {present:true,type:'string',value};
  fail();
}
function validateHistoryValue(value) {
  if (!object(value) || typeof value.present !== 'boolean') fail();
  if (!value.present) {
    if (Object.keys(value).some(k => k !== 'present')) fail();
    return {present:false};
  }
  if (!['null','boolean','number','string'].includes(value.type)) fail();
  if (Object.keys(value).some(k => !['present','type','value'].includes(k))) fail();
  if (value.type === 'null') {
    if (owns(value,'value') && value.value != null) fail();
    return {present:true,type:'null'};
  }
  const expected = historyValue(value.value, true);
  if (expected.type !== value.type) fail();
  return expected;
}
function historyList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    if (!object(value)) fail();
    const keys = Object.keys(value);
    if (!keys.every(k => /^(0|[1-9]\d*)$/.test(k))) fail();
    keys.sort((a,b) => Number(a)-Number(b));
    if (keys.some((k,i) => Number(k) !== i)) fail();
    value = keys.map(k => value[k]);
  }
  if (value.length > HISTORY_LIMIT) fail();
  return value.map(entry => {
    if (!object(entry) || Object.keys(entry).some(k => !['field','old','new','at','by'].includes(k)) ||
        typeof entry.field !== 'string' || !HISTORY_FIELDS.test(entry.field) ||
        typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
        typeof entry.by !== 'string' || !ACTOR.test(entry.by)) fail();
    return {field:entry.field, old:validateHistoryValue(entry.old), new:validateHistoryValue(entry.new), at:entry.at, by:entry.by};
  });
}
function getPath(root, path) {
  let parent = root;
  for (const part of path.split('.')) {
    if (!object(parent) || !owns(parent,part)) return {present:false};
    parent = parent[part];
  }
  return {present:true,value:parent};
}
function patchFields(patch) {
  const fields=[];
  if (owns(patch,'decision')) fields.push('decision');
  if (owns(patch,'storePrice')) fields.push('storePrice');
  if (owns(patch,'barcode')) fields.push('barcode');
  if (owns(patch,'coupangBundlePrices')) for (const qty of Object.keys(patch.coupangBundlePrices)) fields.push(`coupangBundlePrices.${qty}`);
  if (owns(patch,'prices')) for (const channel of Object.keys(patch.prices)) fields.push(`prices.${channel}`);
  if (owns(patch,'listings')) for (const channel of Object.keys(patch.listings)) {
    for (const field of Object.keys(patch.listings[channel])) fields.push(`listings.${channel}.${field}`);
  }
  if (!fields.length || fields.some(field => !HISTORY_FIELDS.test(field))) fail();
  return fields;
}

function url(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) fail();
  try {
    const p = new URL(value);
    if (p.protocol !== 'https:' || p.username || p.password || p.port || !p.hostname) fail();
    return p.href;
  } catch { fail(); }
}
function readListing(value) {
  if (value == null) return {registered:false,url:'',detail:'없음'};
  if (!object(value) || (value.registered != null && typeof value.registered !== 'boolean') ||
      (value.detail != null && !DETAILS.has(value.detail))) fail();
  return {...value, registered:value.registered === true, url:url(value.url), detail:value.detail ?? '없음'};
}
export function normalizeSale(value) {
  if (value == null) value = {};
  if (!object(value) || (value.prices != null && !object(value.prices)) ||
      (value.listings != null && !object(value.listings))) fail();
  const decision = value.decision ?? '미정';
  if (!DECISIONS.has(decision)) fail();
  if (value.updatedAt != null && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) fail();
  if (value.by != null && (typeof value.by !== 'string' || !value.by.trim() || value.by.length > 128)) fail();
  const prices = {...(value.prices || {})};
  const listings = {...(value.listings || {})};
  for (const channel of SALE_CHANNELS) {
    prices[channel] = price(prices[channel]);
    listings[channel] = readListing(listings[channel]);
  }
  if (value.coupangBundlePrices != null && !object(value.coupangBundlePrices)) fail();
  const coupangBundlePrices = {...(value.coupangBundlePrices || {})};
  for (const qty of BUNDLE_QTYS) coupangBundlePrices[qty] = price(coupangBundlePrices[qty]);
  return {...value, decision, prices, listings, storePrice:price(value.storePrice), barcode:barcodeText(value.barcode), coupangBundlePrices, history:historyList(value.history), updatedAt:value.updatedAt ?? null, by:value.by ?? null};
}
export function mergeSalePatch(original, patch) {
  if (!object(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => !['decision','prices','listings','storePrice','barcode','coupangBundlePrices'].includes(k))) fail();
  const result = normalizeSale(original);
  if (owns(patch,'decision')) result.decision = patch.decision;
  if (owns(patch,'storePrice')) result.storePrice = patch.storePrice;
  if (owns(patch,'barcode')) result.barcode = patch.barcode;
  if (owns(patch,'coupangBundlePrices')) {
    if (!object(patch.coupangBundlePrices) || !Object.keys(patch.coupangBundlePrices).length || Object.keys(patch.coupangBundlePrices).some(k => !BUNDLE_QTYS.includes(Number(k)))) fail();
    for (const qty of Object.keys(patch.coupangBundlePrices)) result.coupangBundlePrices[qty] = patch.coupangBundlePrices[qty];
  }
  for (const key of ['prices','listings']) {
    if (!owns(patch,key)) continue;
    if (!object(patch[key]) || !Object.keys(patch[key]).length || Object.keys(patch[key]).some(k => !SALE_CHANNELS.includes(k))) fail();
    for (const channel of Object.keys(patch[key])) {
      if (key === 'prices') result.prices[channel] = patch.prices[channel];
      else {
        const part = patch.listings[channel];
        if (!object(part) || !Object.keys(part).length || Object.keys(part).some(k => !['registered','url','detail'].includes(k))) fail();
        result.listings[channel] = {...result.listings[channel], ...part};
      }
    }
  }
  return normalizeSale(result);
}
export function prepareSaleChange(original, patch, actor, at = new Date().toISOString()) {
  if (typeof actor !== 'string' || !ACTOR.test(actor) || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) fail();
  const before = normalizeSale(original), after = mergeSalePatch(original, patch);
  const entries = [];
  for (const field of patchFields(patch)) {
    const oldLogical = getPath(before, field), newLogical = getPath(after, field);
    // Defaults only materialize on first write; a logically identical change
    // must not manufacture duplicate history.
    if (Object.is(oldLogical.value, newLogical.value)) continue;
    const old = getPath(original, field);
    entries.push({field,old:historyValue(old.value,old.present),new:historyValue(newLogical.value,true),at,by:actor});
  }
  if (!entries.length) return {sale:before, changed:false};
  after.history = [...before.history,...entries].slice(-HISTORY_LIMIT);
  after.updatedAt = at; after.by = actor;
  return {sale:normalizeSale(after),changed:true};
}
export function saleStatus(raw) {
  const sale = normalizeSale(raw);
  if (sale.decision === '미정') return '미정';
  if (sale.decision === '보류' || sale.decision === '안 팜') return '보류/안 팜';
  return SALE_CHANNELS.some(channel => sale.listings[channel].registered) ? '등록 완료' : '판매 확정 미등록';
}
export function saleMargin(raw, channel, cost, mayViewMargin = false) {
  if (!SALE_CHANNELS.includes(channel)) fail();
  const sale = normalizeSale(raw), own = sale.prices.own;
  const effectivePrice = channel === 'own' ? own : sale.prices[channel] ?? own;
  // The caller supplies only a verified KRW cost; it must never pass CNY here.
  const canView = mayViewMargin === true;
  const knownCost = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
  const margin = canView && effectivePrice !== null && knownCost !== null ? effectivePrice - knownCost : null;
  const marginRate = margin !== null && effectivePrice > 0 ? margin / effectivePrice * 100 : null;
  return {price:effectivePrice, margin, marginRate, visible:canView};
}
