// 소싱 장바구니의 수량 구간·행사가 계산 — 화면용. 읽기만 하고 장부에는 쓰지 않는다.
// 자료는 소싱 담당이 1688 상세에서 읽어 장부 items/<상품>/priceInfo 에 넣는다:
//   mode  'tier'(수량 구간) | 'fixed'(고정 단가)
//   tiers [{min,price}] — 그 판매글에서 담은 옵션 수량의 합계 기준
//   options {<옵션키>:{price,list,promo,stock}}, promo {has,limit} — limit 이 0보다 크면 그 수량까지만 행사가
// 여기서는 "이 수량이면 어느 구간인지, 몇 개 더 사면 개당·총액이 얼마나 달라지는지"만 계산한다. 단가를 고치지 않는다.
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
const cents=v=>Math.round(v*100)/100;

// 구간 목록(작은 수량부터). Firebase가 배열을 묶음으로 돌려줘도 읽는다.
export function tiersOf(info){
  const raw=Array.isArray(info?.tiers)?info.tiers:Object.values(info?.tiers||{});
  const rows=raw.map(t=>({min:Math.round(n(t?.min)),price:n(t?.price)})).filter(t=>t.min>0&&t.price>0).sort((a,b)=>a.min-b.min);
  return rows.filter((t,i)=>i===0||t.min!==rows[i-1].min);
}
// 구간 이름: 2~49개 / 200개~
export function tierLabel(tiers,i){const t=tiers[i],next=tiers[i+1];return next?`${t.min.toLocaleString('ko-KR')}~${(next.min-1).toLocaleString('ko-KR')}개`:`${t.min.toLocaleString('ko-KR')}개~`;}

// total: 그 판매글에서 담은 옵션 수량의 합.
// 돌려주는 값: kind 'tier' 이면 지금 구간(current)·다음 구간(next)·더 사야 하는 수(more)·총액 차이(diff, 위안)·같은 단가로 줄일 수 있는 수량(keepMin)
export function tierPlan(info,total){
  const tiers=tiersOf(info);total=Math.max(0,Math.round(n(total)));
  if(info?.mode!=='tier'||tiers.length<2||new Set(tiers.map(t=>t.price)).size<2)return {kind:'fixed',tiers,total};
  let index=-1;tiers.forEach((t,i)=>{if(t.min<=total)index=i;});
  const current=index>=0?tiers[index]:null,next=tiers[index+1]||null,out={kind:'tier',tiers,total,index,current,next};
  if(!current){out.below=true;out.need=tiers[0].min-total;return out;}                 // 최소 수량에 못 미침
  if(next){out.more=next.min-total;out.totalFrom=cents(total*current.price);out.totalTo=cents(next.min*next.price);out.diff=cents(out.totalTo-out.totalFrom);}
  if(total>current.min)out.keepMin=current.min;                                         // 이 수량까지 줄여도 단가가 같다
  return out;
}

// 그 옵션의 행사가: 수량 한도가 있는 행사가(limited) / 한도 없는 행사가(sale) / 없음(null)
export function promoOf(info,optKey,qty){
  const o=info?.options?.[optKey];if(!o||typeof o!=='object')return null;
  const limit=n(info?.promo?.limit),has=v=>v!=null&&v!==''&&n(v)>0;
  if(has(o.promo)&&limit>0)return {kind:'limited',promo:n(o.promo),limit,regular:has(o.price)?n(o.price):has(o.list)?n(o.list):null,within:n(qty)>0&&n(qty)<=limit};
  if(has(o.list)&&has(o.price)&&n(o.price)<n(o.list))return {kind:'sale',price:n(o.price),list:n(o.list)};
  return null;
}

// 이 수량에서의 개당 단가(자료가 없으면 null): 구간이면 구간 단가, 고정이면 그 옵션의 단가
export function unitAt(info,optKey,total){
  const plan=tierPlan(info,total);
  if(plan.kind==='tier')return plan.current?plan.current.price:null;
  const o=info?.options?.[optKey];
  return o&&o.price!=null&&n(o.price)>0?n(o.price):null;
}
