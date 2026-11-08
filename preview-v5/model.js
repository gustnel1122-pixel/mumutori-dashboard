// Pure product calculations. Unknown input stays unknown, never a guessed zero.
export const FEES = Object.freeze({ smart: 0.0662, own: 0.0363 });

export function numberOrNull(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function positiveInteger(value) {
  const n = numberOrNull(value);
  return n !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
}

function nonnegativeInteger(value) {
  const n = numberOrNull(value);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

function catalogById(items) {
  return new Map((Array.isArray(items) ? items : []).filter(x => x && typeof x.id === 'string' && x.id).map(x => [x.id, x]));
}

function isBox(material) {
  // Boxes are out of scope even when catalog data classifies them as packaging.
  return [material?.kind, material?.name].some(value => /박스|box/i.test(String(value || '')));
}

function materialKind(material) {
  const value = String(material?.kind || '').trim();
  if (value === 'item' || value === '상품에 붙음') return 'item';
  if (value === 'pack' || value === '포장') return 'pack';
  return null;
}

// ROAS in percent; no positive contribution margin means no finite threshold.
export function minimumRoas(price, cost, fee) {
  const p = numberOrNull(price), c = numberOrNull(cost), f = numberOrNull(fee);
  if (p === null || c === null || f === null || f >= 1 || p <= 0) return null;
  const margin = p * (1 - f) - c;
  return margin > 0 ? p / margin * 100 : null;
}

export function validateMaterialLinks(links, materials) {
  const catalog = catalogById(materials), errors = [], seen = new Set();
  if (!Array.isArray(links)) return {valid: false, errors: ['부자재 연결 목록 확인 필요']};
  for (const link of links) {
    if (!link || typeof link.materialId !== 'string' || !catalog.has(link.materialId)) {
      errors.push('등록된 부자재만 연결할 수 있어요');
      continue;
    }
    if (seen.has(link.materialId)) errors.push('같은 부자재가 중복 연결되어 있어요');
    seen.add(link.materialId);
    if (isBox(catalog.get(link.materialId))) errors.push('박스 연결은 아직 사용할 수 없어요');
    if (!materialKind(catalog.get(link.materialId))) errors.push('부자재 종류 확인 필요');
    if (positiveInteger(link.quantity) === null) errors.push('부자재 개수 확인 필요');
  }
  return {valid: errors.length === 0, errors};
}

function sumMaterialCost(links, materials, issues) {
  const check = validateMaterialLinks(links, materials);
  if (!check.valid) { issues.push(...check.errors); return null; }
  const catalog = catalogById(materials);
  let total = 0;
  for (const link of links) {
    const material = catalog.get(link.materialId);
    if (receiptCurrency(material) !== 'KRW') { issues.push('부자재 원화 단가 확인 필요'); return null; }
    const cost = numberOrNull(material.unitCost);
    if (cost === null) { issues.push('부자재 단가 확인 필요'); return null; }
    total += cost * positiveInteger(link.quantity);
  }
  return Number.isFinite(total) ? total : null;
}

export function receiptAllocation(row) {
  const pending = ['배송 중','배대지 창고','구매취소','확인 필요'].includes(row?.status);
  if (pending && row?.quantity !== 0) return null;
  const quantity = pending && row?.quantity === 0 ? 0 : positiveInteger(row?.quantity);
  const saleQuantity = nonnegativeInteger(row?.saleQuantity);
  const eventQuantity = nonnegativeInteger(row?.eventQuantity);
  if (quantity === null || saleQuantity === null || eventQuantity === null ||
      !Number.isSafeInteger(saleQuantity + eventQuantity) || saleQuantity + eventQuantity !== quantity) return null;
  return {quantity, saleQuantity, eventQuantity};
}

// Legacy entries were entered in KRW. Unsupported explicit currencies are
// never guessed or converted into KRW.
export function receiptCurrency(row) {
  const primary = row?.currency;
  const secondary = row?.unitCostCurrency;
  if (primary !== undefined && primary !== null && primary !== '' &&
      secondary !== undefined && secondary !== null && secondary !== '' && primary !== secondary) return null;
  const value = primary === undefined || primary === null || primary === '' ? row?.unitCostCurrency : primary;
  if (value === undefined || value === null || value === '') return 'KRW';
  return value === 'KRW' || value === 'CNY' ? value : null;
}

export function validOptionalDate(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function receiptTotals(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) return {received: null, saleReceived: null, eventReceived: null, eventCost: null, unitCost: null};
  let quantity = 0, saleQuantity = 0, eventQuantity = 0, saleAmount = 0, eventAmount = 0;
  let allocationsComplete = true, saleCostsComplete = true, eventCostsComplete = true;
  for (const row of receipts) {
    // Orders still in transit, at the forwarder or cancelled are not stock.
    // Their orderedQuantity is separate; zero received does not erase older
    // already-received batches from totals.
    if (['배송 중','배대지 창고','구매취소','확인 필요'].includes(row?.status)) continue;
    const q = positiveInteger(row?.quantity), c = numberOrNull(row?.unitCost);
    if (q === null) return {received: null, saleReceived: null, eventReceived: null, eventCost: null, unitCost: null};
    quantity += q;
    const allocation = receiptAllocation(row);
    if (!allocation) { allocationsComplete = false; continue; }
    saleQuantity += allocation.saleQuantity;
    eventQuantity += allocation.eventQuantity;
    if (c === null || receiptCurrency(row) !== 'KRW') {
      if (allocation.saleQuantity) saleCostsComplete = false;
      if (allocation.eventQuantity) eventCostsComplete = false;
    } else {
      saleAmount += allocation.saleQuantity * c;
      eventAmount += allocation.eventQuantity * c;
    }
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(saleQuantity) || !Number.isSafeInteger(eventQuantity) ||
        !Number.isFinite(saleAmount) || !Number.isFinite(eventAmount)) return {received: null, saleReceived: null, eventReceived: null, eventCost: null, unitCost: null};
  }
  if (!Number.isSafeInteger(quantity)) return {received: null, saleReceived: null, eventReceived: null, eventCost: null, unitCost: null};
  return {received: quantity, saleReceived: allocationsComplete ? saleQuantity : null,
    eventReceived: allocationsComplete ? eventQuantity : null,
    eventCost: allocationsComplete && eventCostsComplete ? eventAmount : null,
    unitCost: allocationsComplete && saleCostsComplete && saleQuantity > 0 ? saleAmount / saleQuantity : null};
}

export function calcProduct(product, materials, options = {}) {
  const issues = [], p = product || {};
  const includeMaterials = options.includeMaterials !== false;
  const channel = Object.hasOwn(FEES, options.channel) ? options.channel : 'smart';
  const receipts = receiptTotals(p.receipts);
  const explicitCost = receiptCurrency({currency:p.unitCostCurrency}) === 'KRW' ? numberOrNull(p.unitCost) : null;
  // A legacy or manual KRW cost has no verified relation to foreign-currency
  // sales receipts. Do not silently present it as their converted cost.
  const hasForeignSales = Array.isArray(p.receipts) && p.receipts.some(row => {
    const allocation = receiptAllocation(row);
    return receiptCurrency(row) !== 'KRW' && (!allocation || allocation.saleQuantity > 0);
  });
  const unitCost = hasForeignSales ? null : explicitCost === null ? receipts.unitCost : explicitCost;
  if (unitCost === null) issues.push('상품 원가 확인 필요');
  const activeLinks = Array.isArray(p.links) ? p.links.filter(x => x?.always === true) : [];
  const materialCost = sumMaterialCost(activeLinks, materials, issues);
  const cost = unitCost === null || (includeMaterials && materialCost === null) ? null : unitCost + (includeMaterials ? materialCost : 0);
  const price = numberOrNull(p.salePrice);
  if (price === null) issues.push('판매가 확인 필요');
  const stock = nonnegativeInteger(p.stock), received = receipts.received, saleReceived = receipts.saleReceived;
  const sold = stock === null || saleReceived === null || stock > saleReceived ? null : saleReceived - stock;
  const sellRate = sold === null || saleReceived <= 0 ? null : sold / saleReceived * 100;
  const profitPerUnit = price === null || cost === null ? null : price * (1 - FEES[channel]) - cost;
  const earned = sold === null || profitPerUnit === null ? null : sold * profitPerUnit;
  return {unitCost, materialCost, cost, price, roas: {smart: minimumRoas(price, cost, FEES.smart), own: minimumRoas(price, cost, FEES.own)}, received, saleReceived, eventReceived: receipts.eventReceived, eventCost: receipts.eventCost, stock, sold, sellRate, profitPerUnit, earned, issues};
}

export function calcSet(set, products, materials, options = {}) {
  const issues = [], productMap = catalogById(products), materialMap = catalogById(materials), components = Array.isArray(set?.components) ? set.components : [];
  if (!components.length) issues.push('구성 상품을 선택해 주세요');
  const grouped = new Map();
  for (const part of components) {
    const q = positiveInteger(part?.quantity);
    if (!part || typeof part.id !== 'string' || !productMap.has(part.id) || q === null) { issues.push('구성 상품과 개수 확인 필요'); continue; }
    const p = productMap.get(part.id);
    if (p.kind === 'set') { issues.push('세트 안에 세트를 넣을 수 없어요'); continue; }
    grouped.set(part.id, (grouped.get(part.id) || 0) + q);
  }
  const structureComplete = components.length > 0 && issues.length === 0;
  let componentCost = 0, stock = null, costComplete = structureComplete, stockComplete = structureComplete;
  for (const [id, q] of grouped) {
    if (!Number.isSafeInteger(q)) { costComplete = false; stockComplete = false; issues.push('구성 상품 개수 확인 필요'); continue; }
    const product = productMap.get(id);
    // Set components retain their attached tags, while individual packaging is
    // replaced by the set's own packaging, exactly once per set.
    // Missing or invalid references remain in the list so they fail validation.
    const componentLinks = Array.isArray(product.links) ? product.links.filter(link => {
      const material = materialMap.get(link?.materialId);
      return !material || isBox(material) || materialKind(material) !== 'pack';
    }) : [];
    const calc = calcProduct({...product, links: componentLinks}, materials, options);
    if (calc.cost === null) { costComplete = false; issues.push('구성 상품 원가 확인 필요'); }
    else componentCost += calc.cost * q;
    if (calc.stock === null) { stockComplete = false; issues.push('구성 상품 재고 확인 필요'); }
    else stock = stock === null ? Math.floor(calc.stock / q) : Math.min(stock, Math.floor(calc.stock / q));
  }
  const setMaterials = Array.isArray(set?.materials) ? set.materials : [];
  const wrongPack = setMaterials.some(link => {
    const material = materialMap.get(link?.materialId);
    return material && materialKind(material) !== 'pack';
  });
  if (wrongPack) issues.push('세트 포장 부자재 확인 필요');
  const packCost = wrongPack ? null : sumMaterialCost(setMaterials, materials, issues);
  const includeMaterials = options.includeMaterials !== false;
  const cost = !costComplete || (includeMaterials && packCost === null) ? null : componentCost + (includeMaterials ? packCost : 0);
  if (!stockComplete || !grouped.size) stock = null;
  const price = numberOrNull(set?.salePrice);
  return {cost, stock, price, roas: {smart: minimumRoas(price, cost, FEES.smart), own: minimumRoas(price, cost, FEES.own)}, issues};
}
