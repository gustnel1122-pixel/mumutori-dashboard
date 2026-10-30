// Pure calculations for the private product catalog. Unknown is never zero.
export const knownNumber = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) >= 0;

export function allocatedUnitCost({purchase, shipping, customs, totalQuantity, itemQuantity}) {
  if (![purchase, shipping, customs, totalQuantity, itemQuantity].every(knownNumber) || Number(totalQuantity) <= 0 || Number(itemQuantity) <= 0 || Number(itemQuantity) > Number(totalQuantity)) return null;
  // Purchase is the amount for this item; both logistics amounts use quantity share.
  return Number(purchase) / Number(itemQuantity) + (Number(shipping) + Number(customs)) / Number(totalQuantity);
}

export function catalogItem(item, itemsById) {
  if (!item || typeof item !== 'object') return null;
  const isSet = item.kind === 'set';
  const components = isSet && Array.isArray(item.components) ? item.components : [];
  let cost = null, estimated = !!item.estimated;
  if (isSet && components.length) {
    let total = 0, complete = true;
    for (const component of components) {
      if (!component || typeof component !== 'object') { complete = false; break; }
      const product = itemsById[component.id];
      const partCost=product?.breakdown?allocatedUnitCost(product.breakdown):knownNumber(product?.cost)?Number(product.cost):null;
      if (!product || partCost===null || !knownNumber(component.quantity) || Number(component.quantity) <= 0) { complete = false; break; }
      total += partCost * Number(component.quantity);
      estimated ||= !!product.estimated;
    }
    if (complete) cost = total;
  } else if (!isSet) cost = item.breakdown ? allocatedUnitCost(item.breakdown) : knownNumber(item.cost) ? Number(item.cost) : null;
  const price = knownNumber(item.price) ? Number(item.price) : null;
  return {...item, isSet, isSingle: item.kind === 'single', components, price, cost, estimated, profit: price === null || cost === null ? null : price - cost};
}

export function matchesCatalogFilter(item, filters = {}) {
  if (filters.kind && filters.kind !== 'all' && (item.isSet ? 'set' : item.isSingle ? 'single' : 'unknown') !== filters.kind) return false;
  if (filters.sale && filters.sale !== 'all' && item.saleStatus !== filters.sale) return false;
  if (filters.channel && filters.channel !== 'all' && !(Array.isArray(item.channels) && item.channels.includes(filters.channel))) return false;
  if (filters.kc && item.kcStatus !== '확인 필요') return false;
  if (filters.lowStock && !(knownNumber(item.stock) && knownNumber(item.lowStockAt) && Number(item.stock) <= Number(item.lowStockAt))) return false;
  return true;
}
