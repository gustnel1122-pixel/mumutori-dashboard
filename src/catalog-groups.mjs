const clean=value=>String(value??'').trim();
const norm=value=>clean(value).replace(/\s+/g,'').toLocaleLowerCase();
export function catalogRows(catalog,config={}){
 const owners=new Map();for(const group of config.groups||[])for(const id of group.memberIds){if(owners.has(id))throw Error('상품 묶음에 같은 상품이 두 번 들어 있어요.');owners.set(id,group);}
 const seen=new Set(),rows=[];
 for(const product of catalog){const group=owners.get(product.id);if(!group){rows.push({...product,isGroup:false});continue;}if(seen.has(group.id))continue;seen.add(group.id);
  const members=catalog.filter(p=>group.memberIds.includes(p.id)).map(p=>({...p,variantLabel:group.variantLabels?.[p.id]||((group.id==='group:goose-clips'||group.id==='group:goose-keyrings')?`${p.productName||p.name} · ${p.barcode||'바코드 없음'}`:p.productName||p.name)}));
  rows.push({id:group.id,name:group.name,isGroup:true,members,zone500:!!group.zone500,basis:group.basis});
 }
 return rows;
}
export function rowMembers(row,includeAll=false){return (row.isGroup?row.members:[row]).filter(p=>includeAll||p.decision==='판매');}
export function rowMatches(row,query,includeAll=false,extra=''){
 const members=rowMembers(row,includeAll);if(!members.length)return false;const q=norm(query);if(!q)return true;
 return [row.name,extra,...members.flatMap(p=>[p.name,p.productName,p.barcode,p.variantLabel])].some(v=>norm(v).includes(q));
}
export function groupPrice(row,priceProduct,rules){
 if(!row.isGroup)return priceProduct(row,rules);
 const base=priceProduct({...row.members[0],productName:row.name},rules),values=row.members.map(p=>p.storePrice),valid=values.filter(v=>Number.isFinite(v)&&v>=0),distinct=[...new Set(valid)],conflict=distinct.length>1,missing=valid.length!==values.length;
 const consensus=!conflict&&!missing?distinct[0]:null;
 const inherited=base.priceSource==='사장님 21:09 가격';
 const price=conflict||missing?'':inherited?base.price:consensus;
 return {...base,productId:row.id,productName:row.members.map(p=>p.productName||p.name).join(' · '),name:row.name,barcode:'',kind:row.zone500?(consensus===500?'sticker':'card'):base.kind,price,
  isGroup:true,memberCount:row.members.length,memberIds:row.members.map(p=>p.id),priceConflict:conflict,priceMissing:missing,memberPrices:row.members.map(p=>({name:p.productName||p.name,barcode:p.barcode,price:p.storePrice})),
  priceSource:conflict?'가격 다름 · '+distinct.map(n=>n.toLocaleString('ko-KR')+'원').join(' / ')+' · 직접 적어 주세요.':missing?'매장가 미입력 · 가격을 직접 적어 주세요.':inherited?'사장님 21:09 공용 가격 (기존 v3d 유지)':'상품홈 색·모양별 매장가가 같음',
  shapeSource:row.zone500?(consensus===500?'11/19 500원 존 · 현재 매장가500원 → 스티커':'500원 존의 공통500원이 아니므로 카드 · 직접 변경 가능'):base.shapeSource};
}
