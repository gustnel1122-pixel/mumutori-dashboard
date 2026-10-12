// 소싱 장바구니의 발주 단계 — 화면용. 읽기만 하고 장부에는 쓰지 않는다.
// 2026-10-12 사장님: "발주접수니까 표시해둬야지 그리고 발주단계도 기록해놔야해".
// 자료는 소싱 담당이 장부에 적는다:
//   orders/<발주일 YYYYMMDD>/items/<장바구니 줄>/{stage, stages{단계:날짜}, qty}, orders/<발주일>/stageOrder
//   cart/<줄>/{orderBatch, orderStage, orderStages{단계:날짜}}
// 원가·신청 번호는 공개 화면에 내지 않는다. 그래서 여기서는 위에 적은 칸(단계·날짜·수량)만 읽고,
// 발주 묶음의 다른 칸(제목·메모·그 밖에 무엇이 들어오든)은 읽지 않는다.
export const ORDER_STAGES=['접수','결제','창고 입고','출고','국내 도착','검수','상품 등록'];
const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
const day=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(text(v));return m?m[0]:'';};
// 2026-10-12 → 10/12
export const md=v=>{const d=day(v);return d?`${+d.slice(5,7)}/${+d.slice(8,10)}`:'';};
// 20261012 → 10/12 발주
export const batchLabel=key=>{const m=/^(\d{4})(\d{2})(\d{2})/.exec(text(key));return m?`${+m[2]}/${+m[3]} 발주`:'발주';};
// 그 발주의 단계 순서: 장부에 적힌 순서가 온전하면 그것, 아니면 기본 순서
export function stageOrder(order){
  const list=(Array.isArray(order?.stageOrder)?order.stageOrder:[]).map(text).filter(Boolean);
  return list.length>=2&&new Set(list).size===list.length?list:ORDER_STAGES;
}
// 장바구니 한 줄의 발주 단계(없으면 null)
export function lineStage(line,orders){
  const batch=text(line?.orderBatch),order=obj(orders?.[batch]),saved=obj(order?.items?.[line?.id])||{};
  const stage=text(line?.orderStage)||text(saved.stage);if(!stage)return null;
  const stages=obj(line?.orderStages)||obj(saved.stages)||{},steps=stageOrder(order),index=steps.indexOf(stage);
  return {batch,label:batchLabel(batch),stage,date:md(stages[stage]),index,next:index>=0?steps[index+1]||'':'',done:index===steps.length-1,
    history:steps.filter(s=>day(stages[s])).map(s=>[s,md(stages[s])])};
}
// 그 발주에 들어간 줄(장바구니에서 지워진 뒤에도 보여 줄 수 있게). 줄 번호·상품 번호·옵션 원문·수량만 읽는다 — 이름·메모 같은 글은 읽지 않는다.
export function orderLines(order){
  return Object.entries(obj(order?.items)||{}).filter(([,it])=>obj(it)).map(([id,it])=>({id,offerId:text(it.offerId)||id.split('~')[0],spec:text(it.spec),qty:Number(it.qty)>0?Number(it.qty):0}));
}
// 발주별 요약: 단계마다 지금 그 단계에 있는 줄 수와, 그 단계에 들어선 가장 최근 날짜. 최근 발주가 앞.
export function orderSummaries(orders){
  return Object.entries(obj(orders)||{}).filter(([,o])=>obj(o)&&obj(o.items)).sort((a,b)=>b[0].localeCompare(a[0])).map(([key,o])=>{
    const items=Object.values(o.items).filter(obj),counts={},dates={},steps=stageOrder(o);
    for(const it of items){
      const s=text(it.stage)||'단계 미기록';counts[s]=(counts[s]||0)+1;
      for(const [name,when] of Object.entries(obj(it.stages)||{})){const d=day(when);if(d&&(!dates[name]||d>dates[name]))dates[name]=d;}
    }
    const extra=Object.keys(counts).filter(s=>!steps.includes(s));
    return {key,label:batchLabel(key),lines:items.length,qty:items.reduce((a,it)=>a+(Number(it.qty)>0?Number(it.qty):0),0),
      steps:[...steps,...extra].map(s=>({stage:s,count:counts[s]||0,date:md(dates[s]),known:steps.includes(s)})),
      done:items.length>0&&(counts[steps.at(-1)]||0)===items.length};
  });
}
