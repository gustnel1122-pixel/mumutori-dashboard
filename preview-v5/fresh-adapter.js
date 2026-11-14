const buildVersion = new URL(import.meta.url).searchParams.get('v');
const buildQuery = buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : '';
const {validateMaterialLinks, validateMaterialLinkUpdate, receiptAllocation, receiptCurrency, validOptionalDate, normalizeSettings} = await import('./model.js' + buildQuery);
const {normalizeSale, mergeSalePatch, prepareSaleChange, MARGIN_VISIBLE_TO} = await import('./sale-model.js' + buildQuery);

// Operational integration draft. No connection starts until a caller invokes
// load or a mutation. The public demo must keep using its memory store.
// The Firebase rules, root-level ETag writes and migration mappings must be
// verified before this adapter is connected to an operational screen.
const ROOT = 'productCatalogPrivate/products_v5';
const ID = /^[A-Za-z0-9가-힣_-]{1,100}$/;
const LIMIT = 2000;
const BASE_OPTIONS = {cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error'};
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = x => JSON.parse(JSON.stringify(x));
const validId = x => typeof x === 'string' && ID.test(x) && !['__proto__','prototype','constructor'].includes(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const optionalInteger = x => x === null || integer(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const canonical = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const rows = value => Array.isArray(value) ? value : object(value) ? Object.values(value) : [];
export {MARGIN_VISIBLE_TO};

function project(schema, raw) {
  if (!schema || typeof schema.project !== 'function' || typeof schema.apply !== 'function') {
    throw Error('상품 자료의 저장 위치와 연결 방식을 먼저 확인해 주세요.');
  }
  const value = schema.project(clone(raw));
  if (!object(value)) throw Error('상품 자료 형식을 확인해 주세요.');
  const out = {};
  for (const key of ['products','materials','sets']) {
    if (!Array.isArray(value[key]) || value[key].length > LIMIT) throw Error('상품 자료 형식을 확인해 주세요.');
    const seen = new Set();
    for (const row of value[key]) {
      if (!object(row) || !validId(row.id) || seen.has(row.id)) throw Error('상품 자료 형식을 확인해 주세요.');
      seen.add(row.id);
    }
    out[key] = clone(value[key]);
  }
  out.settings = normalizeSettings(value.settings);
  return out;
}

export function createAuthenticatedStore({auth, fetchImpl, schema = null, onChange = () => {}, onStatus = () => {}, allowWrites = false, marginVisibleTo = MARGIN_VISIBLE_TO}) {
  if (!auth || typeof auth.current !== 'function' || typeof auth.onAuth !== 'function' ||
      typeof auth.dbUrl !== 'function' || typeof fetchImpl !== 'function') throw Error('자료 연결을 준비하지 못했어요.');
  let epoch = 0, loadSequence = 0, closed = false, userId = auth.current()?.uid || '', lastEtag = null;
  const pending = new Set();
  const invalidate = () => { ++epoch; ++loadSequence; lastEtag = null; for (const controller of pending) controller.abort(); pending.clear(); onChange(null); };
  const unwatch = auth.onAuth(user => {
    const next = user?.uid || '';
    if (next !== userId) { userId = next; invalidate(); }
  });
  if (typeof unwatch !== 'function') throw Error('로그인 상태를 확인하지 못했어요.');
  function begin() {
    // Until an approved migration mapping and storage schema are supplied,
    // do not even request the existing private catalog.
    if (!schema || typeof schema.project !== 'function' || typeof schema.apply !== 'function') throw Error('상품 자료의 저장 위치와 연결 방식을 먼저 확인해 주세요.');
    const uid = auth.current()?.uid || '';
    if (closed || !uid || uid !== userId) throw Error('다시 로그인한 뒤 확인해 주세요.');
    const generation = epoch, controller = new AbortController(); pending.add(controller);
    return {uid, generation, controller};
  }
  function check(request) {
    if (closed || epoch !== request.generation || auth.current()?.uid !== request.uid) throw Error('로그인이 바뀌어 작업을 멈췄어요.');
  }
  function permissionDenied() { invalidate(); onStatus('denied'); }
  async function privateUrl(request) {
    let url;
    try { url = await auth.dbUrl(ROOT); }
    catch (_) { throw Error('로그인과 연결 상태를 확인해 주세요.'); }
    check(request); return url;
  }
  async function read(request) {
    const url = await privateUrl(request);
    let response;
    try { response = await fetchImpl(url, {...BASE_OPTIONS, method:'GET', headers:{'X-Firebase-ETag':'true'}, signal:request.controller.signal}); }
    catch (_) { check(request); throw Error('상품 자료를 읽지 못했어요. 연결을 확인해 주세요.'); }
    check(request);
    if (response.status === 401 || response.status === 403) { permissionDenied(); throw Error('이 계정은 상품 자료를 볼 수 없어요.'); }
    if (!response.ok) throw Error('상품 자료를 읽지 못했어요.');
    const etag = response.headers.get('ETag'); let raw;
    try { raw = await response.json(); } catch (_) { throw Error('상품 자료 형식을 확인해 주세요.'); }
    check(request);
    if (!etag) throw Error('자료 변경 여부를 확인하지 못했어요.');
    return {raw, etag, snapshot:project(schema, raw)};
  }
  async function transact(mutator, expectedRevision = lastEtag, options = {}) {
    if (!allowWrites) throw Error('미리보기에서는 저장할 수 없어요.');
    if (!expectedRevision) throw Error('자료를 다시 불러온 뒤 저장해 주세요.');
    const request = begin();
    try {
      const {raw, etag, snapshot} = await read(request); check(request);
      if (etag !== expectedRevision) { invalidate(); throw Error('다른 곳에서 자료가 바뀌었어요. 다시 불러와 주세요.'); }
      const next = clone(raw || {});
      const outcome = mutator(next, snapshot, request);
      if (options.skipWrite && options.skipWrite(outcome)) { onStatus('saved'); return; }
      if (options.beforeWrite) {
        await options.beforeWrite({raw, etag, snapshot, request, outcome});
        check(request);
      }
      const url = await privateUrl(request);
      let result;
      try {
        result = await fetchImpl(url, {...BASE_OPTIONS, method:'PUT',
          headers:{'Content-Type':'application/json', 'If-Match':etag}, body:JSON.stringify(next), signal:request.controller.signal});
      } catch (_) {
        // Failure may mean the server accepted the write but its response was
        // lost. Do not retain the stale view or retry a potentially applied PUT.
        invalidate();
        throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.');
      }
      check(request);
      if (result.status === 401 || result.status === 403) { permissionDenied(); throw Error('이 계정은 저장할 수 없어요.'); }
      if (result.status === 412) { invalidate(); throw Error('다른 곳에서 자료가 바뀌었어요. 다시 불러와 주세요.'); }
      if (!result.ok) { invalidate(); throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.'); }
      if (options.verifyWrite) {
        let after;
        try { after = await read(request); check(request); }
        catch (_) { invalidate(); throw Error('저장 후 자료를 확인하지 못했어요. 다시 불러와 주세요.'); }
        if (!options.verifyWrite(after.snapshot, outcome)) {
          invalidate(); throw Error('저장 후 자료가 달라졌어요. 다시 불러와 주세요.');
        }
      }
      // Do not optimistically retain sensitive state; caller reloads with auth.
      invalidate(); onStatus('saved');
    } catch (error) {
      if (error?.name === 'AbortError') throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.');
      throw error;
    } finally { pending.delete(request.controller); }
  }
  return Object.freeze({
    async load() {
      const request = begin(), sequence = ++loadSequence; onStatus('loading');
      try {
        const result = await read(request); check(request);
        if (sequence !== loadSequence) throw Error('새 자료를 다시 불러왔어요.');
        lastEtag = result.etag;
        const snapshot = clone(result.snapshot); onChange(clone(snapshot)); onStatus('ready'); return snapshot;
      } catch (error) {
        if (epoch === request.generation && sequence === loadSequence && !closed) { onChange(null); onStatus('unavailable'); }
        if (error?.name === 'AbortError') throw Error('로그인이 바뀌어 작업을 멈췄어요.');
        throw error;
      } finally { pending.delete(request.controller); }
    },
    revision() { return lastEtag; },
    // 'allowed' means both already authorized accounts, not owner-only.
    canViewMargin() { return marginVisibleTo === 'allowed' && !!auth.current()?.uid; },
    async saveSale(id, patch, expectedRevision = lastEtag) {
      if (!validId(id)) throw Error('상품을 찾을 수 없어요.');
      // Validate patch before network access. A second validation uses the
      // actual current sale, preserving fields the caller did not edit.
      mergeSalePatch(null, patch);
      return transact((raw, data, request) => {
        const product = data.products.find(item => item.id === id);
        const original = rows(raw.products).find(item => item?.id === id);
        if (!product || !original) throw Error('상품을 찾을 수 없어요.');
        const previous = original.sale == null ? null : clone(original.sale);
        const result = prepareSaleChange(previous, patch, request.uid);
        if (result.changed) schema.apply(raw, {type:'saveSale', id, sale:result.sale});
        return {id, sale:result.sale, changed:result.changed};
      }, expectedRevision, {
        skipWrite(outcome) { return !outcome.changed; },
        verifyWrite(snapshot, outcome) {
          const product = snapshot.products.find(item => item.id === outcome.id);
          return !!product && canonical(normalizeSale(product.sale)) === canonical(normalizeSale(outcome.sale));
        }
      });
    },
    async saveSettings(fields, expectedRevision = lastEtag) {
      if (!object(fields) || !Object.keys(fields).length) throw Error('설정 칸을 확인해 주세요.');
      return transact((raw) => {
        schema.apply(raw, {type:'saveSettings', fields:clone(fields)});
      }, expectedRevision);
    },
    async saveProductLinks(id, links, expectedRevision = lastEtag) {
      if (!validId(id) || !Array.isArray(links)) throw Error('상품 연결을 확인해 주세요.');
      return transact((raw, data) => {
        const product = data.products.find(product => product.id === id);
        if (!product) throw Error('상품을 찾을 수 없어요.');
        const result = validateMaterialLinkUpdate(links, Array.isArray(product.links) ? product.links : [], data.materials);
        if (!result.valid) throw Error(result.errors[0]);
        schema.apply(raw, {type:'saveProductLinks', id, links:clone(links)});
      }, expectedRevision);
    },
    async createMaterial(material, expectedRevision = lastEtag) {
      if (!object(material) || !validId(material.id)) throw Error('부자재 정보를 확인해 주세요.');
      if (!String(material.name || '').trim()) throw Error('부자재 이름을 확인해 주세요.');
      if (!['item','pack'].includes(material.kind)) throw Error('부자재 종류를 확인해 주세요.');
      if (!number(material.unitCost)) throw Error('부자재 단가를 확인해 주세요.');
      if (!receiptCurrency(material)) throw Error('부자재 통화를 확인해 주세요.');
      if (!optionalInteger(material.stock)) throw Error('부자재 재고(정수)를 확인해 주세요.');
      if (!optionalInteger(material.minStock)) throw Error('부자재 부족 기준(정수)을 확인해 주세요.');
      return transact((raw, data) => {
        if (data.materials.some(existing => existing.id === material.id)) throw Error('이미 등록됐거나 자료를 확인할 수 없어요.');
        schema.apply(raw, {type:'createMaterial', material:clone(material)});
      }, expectedRevision);
    },
    async saveMaterial(id, fields, expectedRevision = lastEtag) {
      if (!validId(id) || !object(fields)) throw Error('부자재 정보를 확인해 주세요.');
      return transact((raw, data) => {
        const previous = data.materials.find(existing => existing.id === id);
        if (!previous) throw Error('부자재 정보를 확인해 주세요.');
        // A re-sent currency equal to the stored one is not a price edit; only an
        // actual change (or a new unitCost) should require unitCost/currency to be valid.
        const touchesPrice = 'unitCost' in fields || ('currency' in fields && fields.currency !== receiptCurrency(previous));
        const material = {...previous,...clone(fields),id};
        if ('unitCostCurrency' in previous && fields.currency != null) material.unitCostCurrency = fields.currency;
        if (!String(material.name || '').trim()) throw Error('부자재 이름을 확인해 주세요.');
        if (!['item','pack'].includes(material.kind)) throw Error('부자재 종류를 확인해 주세요.');
        if (touchesPrice && !number(material.unitCost)) throw Error('부자재 단가를 확인해 주세요.');
        if (touchesPrice && !receiptCurrency(material)) throw Error('부자재 통화를 확인해 주세요.');
        if (!optionalInteger(material.stock)) throw Error('부자재 재고(정수)를 확인해 주세요.');
        if (!optionalInteger(material.minStock)) throw Error('부자재 부족 기준(정수)을 확인해 주세요.');
        if (material.kind !== 'pack' && data.sets.some(set => (set.materials || []).some(link => link.materialId === id))) throw Error('세트에 연결된 포장은 종류를 바꿀 수 없어요.');
        schema.apply(raw, {type:'saveMaterial', material:clone(material)});
      }, expectedRevision);
    },
    async createSet(set, expectedRevision = lastEtag) {
      if (!object(set) || !validId(set.id) || !String(set.name || '').trim() ||
          !Array.isArray(set.components) || !set.components.length || !Array.isArray(set.materials) || !number(set.salePrice)) {
        throw Error('세트 정보를 확인해 주세요.');
      }
      return transact((raw, data) => {
        const products = new Set(data.products.map(p=>p.id)), ids = new Set();
        for (const c of set.components) {
          if (!object(c) || !products.has(c.id) || ids.has(c.id) || !positive(c.quantity)) throw Error('세트 구성품을 확인해 주세요.');
          ids.add(c.id);
        }
        const check = validateMaterialLinks(set.materials, data.materials);
        if (!check.valid || set.materials.some(link => data.materials.find(m=>m.id===link.materialId)?.kind !== 'pack' && data.materials.find(m=>m.id===link.materialId)?.kind !== '부자재')) {
          throw Error('세트 포장 부자재를 확인해 주세요.');
        }
        if (data.sets.some(existing => existing.id === set.id)) throw Error('이미 등록됐거나 자료를 확인할 수 없어요.');
        schema.apply(raw, {type:'createSet', set:clone(set)});
      }, expectedRevision);
    },
    async saveReceipt(productId, index, receipt, expectedRevision = lastEtag) {
      if (!validId(productId) || !object(receipt) || !Number.isSafeInteger(receipt.batch) || receipt.batch < 1 || receipt.batch > 999 ||
          String(receipt.supplier || '').length > 100 ||
          (receipt.unitCost !== null && !number(receipt.unitCost)) || String(receipt.memo || '').length > 500) throw Error('입고 기록을 확인해 주세요.');
      const allocation = receiptAllocation(receipt);
      if (!allocation) throw Error('판매용과 이벤트/불량용의 합이 들어온 수와 같아야 해요.');
      if (receipt.settlementKrw != null && !integer(receipt.settlementKrw)) throw Error('원화 결제액을 확인해 주세요.');
      if (!validOptionalDate(receipt.date)) throw Error('입고 날짜를 확인해 주세요.');
      if (!validOptionalDate(receipt.orderDate)) throw Error('발주 날짜를 확인해 주세요.');
      let url = '';
      if (receipt.url) {
        try { const parsed = new URL(receipt.url); if (parsed.protocol !== 'https:' || !(parsed.hostname === '1688.com' || parsed.hostname.endsWith('.1688.com')) || parsed.username || parsed.password || parsed.port) throw Error(); url = parsed.href; }
        catch { throw Error('1688의 https 링크를 입력해 주세요.'); }
      }
      return transact((raw, data) => {
        const product = data.products.find(row => row.id === productId);
        if (!product) throw Error('상품을 찾을 수 없어요.');
        const receipts = Array.isArray(product.receipts) ? product.receipts : [];
        if (index !== null && (!Number.isSafeInteger(index) || index < 0 || index >= receipts.length)) throw Error('입고 기록을 찾을 수 없어요.');
        const previous = index === null ? {} : receipts[index];
        const merged = {...previous, ...receipt};
        const currency = receiptCurrency(merged);
        if (!currency) throw Error('단가 통화를 확인해 주세요.');
        if (!validOptionalDate(merged.date) || !validOptionalDate(merged.orderDate)) throw Error('날짜를 확인해 주세요.');
        const status = String(merged.status || '');
        if (!['', '입고 완료', '배송 중', '배대지 창고', '구매취소', '확인 필요'].includes(status)) throw Error('입고 상태를 확인해 주세요.');
        const entry = {...previous,batch:receipt.batch,date:merged.date || '',orderDate:merged.orderDate || '',status,currency,supplier:String(receipt.supplier || '').trim(),url,unitCost:receipt.unitCost,settlementKrw:receipt.settlementKrw??null,...allocation,memo:String(receipt.memo || '')};
        if ('unitCostCurrency' in previous) entry.unitCostCurrency = currency;
        schema.apply(raw, {type:'saveReceipt', id:productId, index, receipt:entry});
      }, expectedRevision);
    },
    async saveImage(productId, dataUrl, expectedRevision = lastEtag) {
      if (!validId(productId) || typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) || dataUrl.length > 1400000) throw Error('1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.');
      return transact((raw, data) => {
        if (!data.products.some(row => row.id === productId)) throw Error('상품을 찾을 수 없어요.');
        schema.apply(raw, {type:'saveImage', id:productId, dataUrl});
      }, expectedRevision);
    },
    async saveMaterialImage(materialId, dataUrl, expectedRevision = lastEtag) {
      if (!validId(materialId) || typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) || dataUrl.length > 1400000) throw Error('1MB 이하의 PNG, JPG, WebP 사진만 선택해 주세요.');
      return transact((raw, data) => {
        if (!data.materials.some(row => row.id === materialId)) throw Error('부자재를 찾을 수 없어요.');
        schema.apply(raw, {type:'saveMaterialImage', id:materialId, dataUrl});
      }, expectedRevision);
    },
    stop() { if (!closed) { closed = true; invalidate(); unwatch(); } }
  });
}
