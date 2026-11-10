const buildVersion = new URL(import.meta.url).searchParams.get('v');
const buildQuery = buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : '';
const {validateMaterialLinks, validateMaterialLinkUpdate, receiptAllocation, receiptCurrency, validOptionalDate} = await import('./model.js' + buildQuery);
const {prepareSaleChange, MARGIN_VISIBLE_TO} = await import('./sale-model.js' + buildQuery);

// UI data boundary: methods are asynchronous so a future authenticated store
// can implement the same contract. This preview adapter never uses the network.
// Save methods return only after validation succeeds, then load() returns a
// fresh snapshot; the UI must not assume a mutable cached snapshot is saved.
export function createMemoryStore(initial, {marginVisibleTo = MARGIN_VISIBLE_TO} = {}) {
  const data = structuredClone(initial);
  const byId = (rows, id) => rows.find(row => row.id === id);
  const validMaterial = material => {
    if (!material || typeof material.id !== 'string' || !String(material.name || '').trim() || !['item','pack'].includes(material.kind)) throw new Error('부자재 정보를 확인해 주세요.');
    if (/박스|box/i.test(material.name)) throw new Error('박스 연결은 아직 사용할 수 없어요.');
    if (!Number.isFinite(material.unitCost) || material.unitCost < 0) throw new Error('부자재 단가를 확인해 주세요.');
    if (!receiptCurrency(material)) throw new Error('부자재 단가 통화를 확인해 주세요.');
    for (const field of ['stock','minStock']) if (!Number.isSafeInteger(material[field]) || material[field] < 0) throw new Error('부자재 수량을 확인해 주세요.');
  };
  return Object.freeze({
    async load() { return structuredClone(data); },
    // Simulation only; 'allowed' shows margins to both permitted users.
    canViewMargin() { return marginVisibleTo === 'allowed'; },
    async saveSale(productId, patch) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      const result = prepareSaleChange(product.sale, patch, 'preview');
      if (result.changed) product.sale = result.sale;
    },
    async saveProductLinks(productId, links) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      const result = validateMaterialLinkUpdate(links, Array.isArray(product.links) ? product.links : [], data.materials);
      if (!result.valid) throw new Error(result.errors[0]);
      product.links = structuredClone(links);
    },
    async saveReceipt(productId, index, receipt) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      if (!receipt || !Number.isSafeInteger(receipt.batch) || receipt.batch < 1 || receipt.batch > 999) throw new Error('입고 차수를 확인해 주세요.');
      if (!Array.isArray(product.receipts)) product.receipts = [];
      if (index !== null && (!Number.isSafeInteger(index) || index < 0 || index >= product.receipts.length)) throw new Error('입고 기록을 찾을 수 없어요.');
      const previous = index === null ? {} : product.receipts[index];
      const merged = {...previous, ...receipt};
      if (!validOptionalDate(merged.date)) throw new Error('입고 날짜를 확인해 주세요.');
      if (!validOptionalDate(merged.orderDate)) throw new Error('발주 날짜를 확인해 주세요.');
      const currency = receiptCurrency(merged);
      if (!currency) throw new Error('단가 통화를 확인해 주세요.');
      if (String(receipt.supplier || '').length > 100) throw new Error('판매처를 확인해 주세요.');
      if (receipt.unitCost !== null && (!Number.isFinite(receipt.unitCost) || receipt.unitCost < 0)) throw new Error('단가를 확인해 주세요.');
      if (receipt.settlementKrw != null && (!Number.isSafeInteger(receipt.settlementKrw) || receipt.settlementKrw < 0)) throw new Error('원화 결제액을 확인해 주세요.');
      const allocation = receiptAllocation(receipt);
      if (!allocation) throw new Error('판매용과 이벤트/불량용의 합이 들어온 수와 같아야 해요.');
      if (String(receipt.memo || '').length > 500) throw new Error('메모는 500자까지 입력해 주세요.');
      let url = '';
      if (receipt.url) {
        try {
          const u = new URL(receipt.url);
          if (u.protocol !== 'https:' || !(u.hostname === '1688.com' || u.hostname.endsWith('.1688.com')) || u.username || u.password || u.port) throw new Error();
          url = u.href;
        } catch { throw new Error('1688의 https 링크를 입력해 주세요.'); }
      }
      const status = String(merged.status || '');
      if (!['', '입고 완료', '배송 중', '배대지 창고', '구매취소', '확인 필요'].includes(status)) throw Error('입고 상태를 확인해 주세요.');
      const entry = {...previous,batch:receipt.batch,date:merged.date || '',orderDate:merged.orderDate || '',status,currency,supplier:String(receipt.supplier || '').trim(),url,unitCost:receipt.unitCost,settlementKrw:receipt.settlementKrw??null,...allocation,memo:String(receipt.memo || '')};
      if ('unitCostCurrency' in previous) entry.unitCostCurrency = currency;
      if (index === null) product.receipts.push(entry); else product.receipts[index] = entry;
    },
    async saveImage(productId, dataUrl) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) || dataUrl.length > 1400000) throw new Error('1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.');
      product.imageData = dataUrl;
    },
    async createMaterial(material) {
      validMaterial(material);
      if (byId(data.materials, material.id)) throw new Error('부자재 정보를 확인해 주세요.');
      data.materials.push(structuredClone(material));
    },
    async saveMaterial(id, fields) {
      const previous = byId(data.materials, id);
      if (!previous || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('부자재 정보를 확인해 주세요.');
      const updated = {...previous,...structuredClone(fields),id};
      if ('unitCostCurrency' in previous && fields.currency != null) updated.unitCostCurrency = fields.currency;
      validMaterial(updated);
      if (updated.kind !== 'pack' && data.sets.some(set => (set.materials || []).some(link => link.materialId === id))) throw new Error('세트에 연결된 포장은 종류를 바꿀 수 없어요.');
      Object.assign(previous,updated);
    },
    async createSet(set) {
      if (!set || typeof set.id !== 'string' || byId(data.sets, set.id) || !String(set.name || '').trim() || !Array.isArray(set.components) || !set.components.length) throw new Error('세트 이름과 구성품을 확인해 주세요.');
      if (set.components.some(part => !byId(data.products, part.id) || !Number.isSafeInteger(part.quantity) || part.quantity < 1)) throw new Error('세트 구성품을 확인해 주세요.');
      const check = validateMaterialLinks(set.materials, data.materials);
      if (!check.valid || set.materials.some(link => byId(data.materials, link.materialId)?.kind !== 'pack' && byId(data.materials, link.materialId)?.kind !== '부자재')) throw new Error('세트 포장 부자재를 확인해 주세요.');
      if (!Number.isFinite(set.salePrice) || set.salePrice < 0) throw new Error('세트 판매가를 확인해 주세요.');
      data.sets.push(structuredClone(set));
    },
  });
}
