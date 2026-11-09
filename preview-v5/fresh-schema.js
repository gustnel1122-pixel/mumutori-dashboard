// Separate v5-only data. Never reads or writes the old product catalog.
const buildVersion = new URL(import.meta.url).searchParams.get('v');
const buildQuery = buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : '';
const {normalizeSale} = await import('./sale-model.js' + buildQuery);
const array = value => value == null ? [] : Array.isArray(value) ? value : Object.values(value);
const copy = value => structuredClone(value);
function requireRoot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schema !== 'product-v5-fresh-v1') throw Error('새 상품 자료가 아직 준비되지 않았어요.');
}
function receipt(value) {
  return {...value,date:value.date??'',orderDate:value.orderDate??'',settlementKrw:value.settlementKrw??null,unitCost:value.unitCost??null};
}
function product(value) {
  const receipts = array(value.receipts).map(receipt);
  return {...value,stock:value.stock??null,salePrice:value.salePrice??null,
    batch:[...new Set(receipts.map(row => row.batch).filter(n => Number.isSafeInteger(n) && n > 0).map(n => `${n}차`))],
    channels:array(value.channels),links:array(value.links),receipts,sale:normalizeSale(value.sale)};
}
function material(value) {
  return {...value,stock:value.stock??null,minStock:value.minStock??null,unitCost:value.unitCost??null,
    receipts:array(value.receipts).map(receipt)};
}
export const freshSchema = Object.freeze({
  project(raw) {
    requireRoot(raw);
    return {products: array(raw.products).map(product), materials: array(raw.materials).map(material), sets: array(raw.sets)};
  },
  apply(raw, operation) {
    requireRoot(raw);
    if (operation.type === 'saveSale') {
      // Do not reshape unrelated products/materials/sets while saving a sale.
      const matches = array(raw.products).filter(item => item?.id === operation.id);
      if (matches.length !== 1) throw Error('상품을 찾을 수 없어요.');
      matches[0].sale = copy(normalizeSale(operation.sale));
      return;
    }
    for (const key of ['products', 'materials', 'sets']) raw[key] = array(raw[key]);
    const product = () => {
      const value = raw.products.find(item => item.id === operation.id);
      if (!value) throw Error('상품을 찾을 수 없어요.');
      return value;
    };
    if (operation.type === 'saveProductLinks') product().links = copy(operation.links);
    else if (operation.type === 'saveImage') product().imageData = operation.dataUrl;
    else if (operation.type === 'saveReceipt') {
      const p = product(); p.receipts = array(p.receipts);
      if (operation.index === null) p.receipts.push(copy(operation.receipt));
      else p.receipts[operation.index] = copy(operation.receipt);
    } else if (operation.type === 'createMaterial') raw.materials.push(copy(operation.material));
    else if (operation.type === 'saveMaterial') {
      const index = raw.materials.findIndex(item => item.id === operation.material.id);
      if (index < 0) throw Error('부자재를 찾을 수 없어요.');
      raw.materials[index] = copy(operation.material);
    } else if (operation.type === 'createSet') raw.sets.push(copy(operation.set));
    else throw Error('저장할 내용을 확인해 주세요.');
  }
});
