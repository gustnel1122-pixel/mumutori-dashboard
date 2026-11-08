// Offline planning only: no network, storage, or implicit matching. Callers
// must supply confirmed, complete order evidence; output may contain private
// financial information and must not be placed in public assets or logs.
import {planStagingImport} from './staging-map.js';

const RECEIPT_DATE = '2026-10-24';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Same five fields that staging-map uses to reject duplicate input rows.
export function receiptReference(row) {
  if (!isObject(row) || !nonempty(row.cardKey) || !Number.isSafeInteger(row.batch) || !nonempty(row.sourceCode)) {
    throw new Error('입고 기록 참조를 확인해 주세요.');
  }
  return JSON.stringify([row.cardKey, row.batch, row.sourceCode.trim(), row.option || '', row.purpose || '']);
}

function grouped(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (!nonempty(value)) continue;
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(item);
  }
  return result;
}

/**
 * Apply only explicit one-to-one receipt bindings and a unique, verified full
 * order payment. Each evidence record must enumerate its complete receiptRefs;
 * the total CNY must reconcile to those lines. A partial, duplicate, conflicting
 * or non-reconciling order remains unconverted. This intentionally fails closed
 * when freight, refunds, discounts, or grouped card charges are unresolved.
 */
export function planSettledReceipts(source, bindings = [], evidence = []) {
  if (!Array.isArray(bindings) || !Array.isArray(evidence)) throw new Error('결제 근거를 확인해 주세요.');
  const output = planStagingImport(source);
  const rows = [...output.cards, ...output.materials].flatMap(card => card.receipts);
  const byRef = new Map(rows.map(row => [receiptReference(row), row]));
  if (byRef.size !== rows.length) throw new Error('입고 기록이 중복되었어요.');
  for (const row of rows) {
    row.date = RECEIPT_DATE;
    row.receivedDate = RECEIPT_DATE;
    row.settlementStatus = '청구액 없음';
  }

  const byReceipt = grouped(bindings, 'receiptRef');
  const byOrder = grouped(evidence, 'orderId');
  const requested = new Map();
  for (const [ref, group] of byReceipt) {
    const row = byRef.get(ref);
    if (!row) throw new Error('입고 기록 연결을 확인해 주세요.');
    if (group.length !== 1 || group[0].verified !== true || !nonempty(group[0].orderId)) {
      row.settlementStatus = '확인 필요';
      continue;
    }
    const orderId = group[0].orderId;
    if (!requested.has(orderId)) requested.set(orderId, []);
    requested.get(orderId).push(ref);
  }

  for (const [orderId, refs] of requested) {
    const orders = byOrder.get(orderId) || [];
    if (!orders.length) continue;
    const mark = () => refs.forEach(ref => { byRef.get(ref).settlementStatus = '확인 필요'; });
    if (orders.length !== 1) { mark(); continue; }
    const order = orders[0];
    if (order.verified !== true || order.scope !== 'complete-order' || !validDate(order.paidDate) ||
        !nonempty(order.sourceRef) || !Number.isSafeInteger(order.chargeKrw) || order.chargeKrw <= 0 ||
        typeof order.totalCny !== 'number' || !Number.isFinite(order.totalCny) || order.totalCny <= 0 ||
        !Array.isArray(order.receiptRefs) || !order.receiptRefs.length ||
        order.receiptRefs.some(ref => !nonempty(ref)) || new Set(order.receiptRefs).size !== order.receiptRefs.length ||
        refs.length !== order.receiptRefs.length || refs.some(ref => !order.receiptRefs.includes(ref))) {
      mark(); continue;
    }
    const total = refs.reduce((sum, ref) => {
      const row = byRef.get(ref);
      return sum + row.unitCostCny * row.quantity;
    }, 0);
    // The tiny tolerance absorbs floating-point representation, not a real
    // currency-unit discrepancy or an unassigned freight/discount.
    if (!Number.isFinite(total) || Math.abs(total - order.totalCny) > 0.001) { mark(); continue; }
    const rate = order.chargeKrw / order.totalCny;
    if (!Number.isFinite(rate) || rate <= 0) { mark(); continue; }
    for (const ref of refs) {
      const row = byRef.get(ref);
      const converted = row.unitCostCny * rate;
      if (!Number.isFinite(converted)) { mark(); break; }
    }
    if (refs.some(ref => byRef.get(ref).settlementStatus === '확인 필요')) continue;
    for (const ref of refs) {
      const row = byRef.get(ref);
      row.unitCost = row.unitCostCny * rate;
      row.currency = 'KRW';
      // Keep the original CNY evidence separately while marking the displayed
      // unit cost itself as KRW. The model rejects conflicting currency fields.
      row.sourceUnitCostCurrency = row.unitCostCurrency;
      row.unitCostCurrency = 'KRW';
      row.settlementStatus = '청구액 확인';
      row.settlementEvidence = {
        orderId, paidDate: order.paidDate, sourceRef: order.sourceRef,
        chargeKrw: order.chargeKrw, totalCny: order.totalCny, rateKrwPerCny: rate,
      };
    }
  }
  return {
    ...output,
    receiptDate: RECEIPT_DATE,
    summary: {
      receiptCount: rows.length,
      converted: rows.filter(row => row.settlementStatus === '청구액 확인').length,
      missing: rows.filter(row => row.settlementStatus === '청구액 없음').length,
      review: rows.filter(row => row.settlementStatus === '확인 필요').length,
    },
    unresolved: rows.filter(row => row.settlementStatus !== '청구액 확인')
      .map(row => ({receiptRef: receiptReference(row), status: row.settlementStatus})),
  };
}
