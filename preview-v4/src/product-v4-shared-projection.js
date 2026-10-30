// Only explicit shared base fields are overlaid in memory; local records remain intact.
export const SHARED_PRODUCT_FIELDS = Object.freeze(['name','salesStatus','type','barcode','supplier','price','safetyStock','memo','imageData','imageSource','active']);
export function mergeSharedProducts(localProducts, privateProducts, links={}) {
  const rows=new Map(localProducts.map(p=>[p.id,{...p}]));
  if(!Array.isArray(privateProducts)) return [...rows.values()];
  for(const p of privateProducts){
    if(!p||typeof p.id!=='string')continue;
    const old=rows.get(p.id), merged={...(old||{}),id:p.id};
    // Even identical IDs and names cannot identify independently created items.
    if(old&&(!p.base?.identity||links[p.id]!==p.base.identity)){merged.sharedIdentityConflict=true;rows.set(p.id,merged);continue;}
    if(!p.base||p.base.schema!=='product-base-v1')continue;
    const differs=!!old&&SHARED_PRODUCT_FIELDS.some(k=>Object.hasOwn(old,k)&&JSON.stringify(old[k]??null)!==JSON.stringify(p.base[k]??null));
    for(const k of SHARED_PRODUCT_FIELDS){delete merged[k];if(Object.hasOwn(p.base,k))merged[k]=p.base[k];}
    if(!merged.name)merged.name='상품명 확인 필요';
    if(!merged.salesStatus)merged.salesStatus='확인 필요';
    merged.sharedBase=true;merged.sharedLocalDiff=differs;rows.set(p.id,merged);
  }
  return [...rows.values()];
}
export function restoreLocalProducts(next,local){return {...next,products:local.products};}
