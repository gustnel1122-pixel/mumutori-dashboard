// Offline planning only: this module has no filesystem, network or database
// access, and does not assign operational product IDs or convert currencies.
const SOURCE_SCHEMA = 'product-v5-batch-staging-v1';
const OUTPUT_SCHEMA = 'product-v5-batch-plan-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => value === null || value === undefined || typeof value === 'string';
const fail = () => { throw new Error('입고 준비 자료의 형식이나 연결을 확인해 주세요.'); };

function batchNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') fail();
  const match = String(value).trim().match(/^([1-9]\d{0,2})(?:차)?$/);
  if (!match) fail();
  return Number(match[1]);
}

function validDate(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validUrl(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === '1688.com' || url.hostname.endsWith('.1688.com')) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function transformReceipt(row, cardKey, kind, seen) {
  if (!object(row) || row.cardKey !== cardKey || !nonempty(row.sourceCode) || !text(row.option) || !text(row.purpose) || !object(row.sourceRecord)) fail();
  if (!integer(row.received) || row.received === 0 || typeof row.unitCostCny !== 'number' || !Number.isFinite(row.unitCostCny) || row.unitCostCny < 0 || row.unitCostCurrency !== 'CNY') fail();
  if (!validDate(row.receivedDate) || !validDate(row.orderDate) || !validUrl(row.url) || !text(row.supplier)) fail();
  if (Object.hasOwn(row.sourceRecord, '카드') && String(row.sourceRecord['카드']).trim() !== cardKey) fail();
  if (Object.hasOwn(row.sourceRecord, '코드') && String(row.sourceRecord['코드']).trim() !== row.sourceCode.trim()) fail();
  const batch = batchNumber(row.batch);
  const reference = JSON.stringify([cardKey, batch, row.sourceCode.trim(), row.option || '', row.purpose || '']);
  if (seen.has(reference)) fail();
  seen.add(reference);
  if (kind === 'product') {
    if (!integer(row.forSale) || !integer(row.forEvent) || !Number.isSafeInteger(row.forSale + row.forEvent) || row.forSale + row.forEvent !== row.received) fail();
  } else if (row.forSale != null || row.forEvent != null) fail();

  // Carry every original field, including sourceRecord, in addition to the
  // explicit UI names. A missing received date remains unknown, not the order
  // date. Material allocation is inapplicable rather than guessed as sales.
  return {
    ...structuredClone(row),
    stagingOriginal: structuredClone(row),
    batch,
    quantity: row.received,
    saleQuantity: kind === 'product' ? row.forSale : null,
    eventQuantity: kind === 'product' ? row.forEvent : null,
    unitCost: row.unitCostCny,
    currency: 'CNY',
    date: row.receivedDate ?? '',
    orderDate: row.orderDate ?? '',
    sourceRecord: structuredClone(row.sourceRecord),
  };
}

function transformCards(rows, kind, seenCards, seenReceipts) {
  if (!Array.isArray(rows) || rows.length > 2000) fail();
  return rows.map(card => {
    if (!object(card) || Object.hasOwn(card, 'id') || Object.hasOwn(card, 'productId') || !nonempty(card.cardKey) || card.cardKey !== card.cardKey.trim() || !text(card.catalogLinkStatus) || !Array.isArray(card.receipts) || !card.receipts.length || card.receipts.length > 2000 || seenCards.has(card.cardKey)) fail();
    seenCards.add(card.cardKey);
    const receipts = card.receipts.map(row => transformReceipt(row, card.cardKey, kind, seenReceipts));
    return {...structuredClone(card), receipts};
  });
}

export function planStagingImport(input) {
  if (!object(input) || input.schema !== SOURCE_SCHEMA || !Array.isArray(input.cards) || !Array.isArray(input.materials)) fail();
  if (input.expectedProductCards != null && (!integer(input.expectedProductCards) || input.expectedProductCards !== input.cards.length)) fail();
  if (input.expectedMaterials != null && (!integer(input.expectedMaterials) || input.expectedMaterials !== input.materials.length)) fail();
  const seenCards = new Set(), seenReceipts = new Set();
  const cards = transformCards(input.cards, 'product', seenCards, seenReceipts);
  const materials = transformCards(input.materials, 'material', seenCards, seenReceipts);
  const metadata = structuredClone(input);
  delete metadata.cards; delete metadata.materials;
  return {schema: OUTPUT_SCHEMA, source: metadata, cards, materials};
}
