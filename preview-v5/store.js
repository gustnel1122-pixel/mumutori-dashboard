import {validateMaterialLinks} from './model.js';

// UI data boundary: methods are asynchronous so a future authenticated store
// can implement the same contract. This preview adapter never uses the network.
// Save methods return only after validation succeeds, then load() returns a
// fresh snapshot; the UI must not assume a mutable cached snapshot is saved.
export function createMemoryStore(initial) {
  const data = structuredClone(initial);
  const byId = (rows, id) => rows.find(row => row.id === id);
  return Object.freeze({
    async load() { return structuredClone(data); },
    async saveProductLinks(productId, links) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      const result = validateMaterialLinks(links, data.materials);
      if (!result.valid) throw new Error(result.errors[0]);
      product.links = structuredClone(links);
    },
    async saveReceipt(productId, index, receipt) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      if (!receipt || !Number.isSafeInteger(receipt.batch) || receipt.batch < 1 || receipt.batch > 999) throw new Error('입고 차수를 확인해 주세요.');
      if (typeof receipt.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)) throw new Error('입고 날짜를 확인해 주세요.');
      const parsed = new Date(receipt.date + 'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== receipt.date) throw new Error('입고 날짜를 확인해 주세요.');
      if (!String(receipt.supplier || '').trim() || String(receipt.supplier).length > 100) throw new Error('판매처를 확인해 주세요.');
      if (!Number.isFinite(receipt.unitCost) || receipt.unitCost < 0 || !Number.isSafeInteger(receipt.quantity) || receipt.quantity < 1) throw new Error('단가와 수량을 확인해 주세요.');
      if (String(receipt.memo || '').length > 500) throw new Error('메모는 500자까지 입력해 주세요.');
      let url = '';
      if (receipt.url) {
        try {
          const u = new URL(receipt.url);
          if (u.protocol !== 'https:' || !(u.hostname === '1688.com' || u.hostname.endsWith('.1688.com')) || u.username || u.password || u.port) throw new Error();
          url = u.href;
        } catch { throw new Error('1688의 https 링크를 입력해 주세요.'); }
      }
      const entry = {batch:receipt.batch,date:receipt.date,supplier:String(receipt.supplier).trim(),url,unitCost:receipt.unitCost,quantity:receipt.quantity,memo:String(receipt.memo || '')};
      if (!Array.isArray(product.receipts)) product.receipts = [];
      if (index === null) product.receipts.push(entry);
      else if (Number.isSafeInteger(index) && index >= 0 && index < product.receipts.length) product.receipts[index] = entry;
      else throw new Error('입고 기록을 찾을 수 없어요.');
    },
    async saveImage(productId, dataUrl) {
      const product = byId(data.products, productId);
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) || dataUrl.length > 1400000) throw new Error('1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.');
      product.imageData = dataUrl;
    },
    async createMaterial(material) {
      if (!material || typeof material.id !== 'string' || byId(data.materials, material.id) || !String(material.name || '').trim() || !['item','pack'].includes(material.kind)) throw new Error('부자재 정보를 확인해 주세요.');
      if (/박스|box/i.test(material.name)) throw new Error('박스 연결은 아직 사용할 수 없어요.');
      if (!Number.isFinite(material.unitCost) || material.unitCost < 0) throw new Error('부자재 단가를 확인해 주세요.');
      for (const field of ['stock','minStock']) if (!Number.isSafeInteger(material[field]) || material[field] < 0) throw new Error('부자재 수량을 확인해 주세요.');
      data.materials.push(structuredClone(material));
    },
    async createSet(set) {
      if (!set || typeof set.id !== 'string' || byId(data.sets, set.id) || !String(set.name || '').trim() || !Array.isArray(set.components) || !set.components.length) throw new Error('세트 이름과 구성품을 확인해 주세요.');
      if (set.components.some(part => !byId(data.products, part.id) || !Number.isSafeInteger(part.quantity) || part.quantity < 1)) throw new Error('세트 구성품을 확인해 주세요.');
      const check = validateMaterialLinks(set.materials, data.materials);
      if (!check.valid || set.materials.some(link => byId(data.materials, link.materialId)?.kind !== 'pack')) throw new Error('세트 포장 부자재를 확인해 주세요.');
      if (!Number.isFinite(set.salePrice) || set.salePrice < 0) throw new Error('세트 판매가를 확인해 주세요.');
      data.sets.push(structuredClone(set));
    },
  });
}
