const clean=v=>String(v??'').trim();
const normalized=v=>clean(v).replace(/\s+/g,'');
export function priceProduct(p,rules){
 const productName=clean(p.productName||p.name),rule=(rules.rules||[]).find(r=>[r.name,...r.aliases].some(n=>normalized(n)===normalized(productName)));
 const price=rule?.price??p.storePrice??'';
 return {productId:p.id,productName,barcode:p.barcode,name:rule?.name||productName,english:rule?.english||'',sub:rule?.sub||'',kind:rule?.kind||'card',price,decision:p.decision,priceSource:rule?.price!=null?'사장님 21:09 가격':'상품홈 매장가',shapeSource:rule?'11/18·11/19·오늘 기준':'기본 카드 · 직접 변경 가능'};
}
export function itemErrors(p){const errors=[];if(!clean(p.name))errors.push('한글 이름을 적어 주세요.');if(p.price===''||p.price==null||!Number.isInteger(Number(p.price))||Number(p.price)<0||Number(p.price)>9999999)errors.push('가격을0~9,999,999원으로 적어 주세요.');if(!['card','sticker'].includes(p.kind))errors.push('모양을 골라 주세요.');if(['name','english','sub'].some(k=>clean(p[k]).length>100))errors.push('문구를100자이내로 적어 주세요.');return errors;}
export function duplicateProducts(items){const map=new Map();for(const p of items){if(!map.has(p.productId))map.set(p.productId,new Set());map.get(p.productId).add(p.kind);}return new Set([...map].filter(([,s])=>s.size>1).map(([id])=>id));}
export function queueErrors(items){const duplicate=duplicateProducts(items);return items.flatMap(p=>[...itemErrors(p),...(duplicate.has(p.productId)?['같은 상품이 카드와 스티커에 모두 담겼어요. 한 모양을 빼 주세요.']:[])]);}
export function addItem(items,item){const next=items.map(p=>({...p}));const i=next.findIndex(p=>p.productId===item.productId&&p.kind===item.kind);if(i<0)next.push({...item});else next[i]={...item};return next;}
export function pricePayload(items){return items.map(p=>({productId:p.productId,name:clean(p.name),english:clean(p.english),sub:clean(p.sub),price:Number(p.price),kind:p.kind}));}
