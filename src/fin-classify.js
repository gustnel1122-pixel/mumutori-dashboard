// Pure classification contract shared with the private Apps Script bridge.
// No model API, credentials, notification text or production data in this module.
export const POLICY_VERSION = 'ledger-classify-v1';
export const CATEGORY_HELP = {
  '매입':'팔 물건을 사 온 돈', '매입 부대비':'물건을 들여오는 운송·통관 비용',
  '배송비':'손님에게 상품을 보내는 돈', '광고비':'상품이나 가게를 알리는 돈',
  '수수료':'판매처·결제 서비스에 내는 돈', '구독료':'업무에 쓰는 멤버십·프로그램 이용료',
  '소모품':'포장지·잉크처럼 쓰면서 없어지는 물건', '식비':'직원 식사 등 업무 식비 · 누구와 먹었는지 메모',
  '식비(본인)':'사장님 본인의 식사 · 부가세 불공제', '접대(업무추진비)':'거래처 식사·선물 · 부가세 불공제',
  '차량(주유·주차)':'차량 이용 비용 · 차종과 용도 확인 필요', '세금·공과':'세금이나 공공요금 · 종류 확인 필요',
  '임차료':'가게·사무실을 빌린 돈', '기타':'어느 항목인지 아직 설명이 필요한 돈',
  '사장님 인출':'개인적으로 쓴 돈 · 사업 비용에서 제외', '통신비':'업무용 전화·인터넷·통신 요금', '매출':'상품·서비스를 팔아 받은 돈',
  '자금 충전':'사장님이 사업에 넣은 돈 · 매출 아님', '환불 받음':'취소한 결제의 돈을 돌려받음',
  '기타 수입':'매출·충전·환불 외에 들어온 돈'
};
export const OUT = Object.keys(CATEGORY_HELP).slice(0,16);
export const IN = ['매출','자금 충전','환불 받음','기타 수입'];
export const VAT_LABEL = { deductible:'공제', nondeductible:'불공제', review:'확인 필요' };
export const AI_LABEL = { pending:'AI 분류 대기', applied:'AI 분류', review:'사장님 확인', undone:'AI 분류 되돌림', manual:'직접 분류' };
const copy = x => JSON.parse(JSON.stringify(x));
const val = (x,k) => x[k] === undefined ? null : x[k];
const snapshot = e => Object.fromEntries(['category','status','vatTreatment','vatReason','vatAmount'].map(k=>[k,val(e,k)]));
export function cleanNote(value) {
  const s = String(value || '').trim();
  if (/현대[\s\S]*승인[\s\S]*원|누적\s*[\d,]+원/.test(s)) throw Error('결제 알림 원문 대신 무엇을 샀는지만 적어 주세요.');
  return s.replace(/(?:\d[ -]?){7,}/g,'[번호 제외]').replace(/[가-힣○●*]{2,5}\s*님/g,'[이름 제외]')
    .replace(/(?:성명|이름|명의자)\s*[:：]?\s*[가-힣]{2,5}/g,'[이름 제외]').slice(0,300);
}
export function requestAi(e, note, requestId, now) {
  if (!e || e.status === 'void' || e.kind === 'move') throw Error('이 거래는 AI 분류를 요청할 수 없어요.');
  note=cleanNote(note); if (!note) throw Error('무엇을 산 돈인지 한 줄 적어 주세요.');
  return {...e, ai:{status:'pending',requestId,note,requestedAt:now,policyVersion:POLICY_VERSION}, updatedAt:now};
}
export function manualCategory(e, category, now) {
  if (!(e.kind === 'in' ? IN : OUT).includes(category) || e.status === 'void' || e.kind === 'move') throw Error('분류를 다시 골라 주세요.');
  const blocked=['사장님 인출','식비(본인)','접대(업무추진비)'].includes(category);
  return {...e,category,status:'ok',vatTreatment:blocked?'nondeductible':'review',vatAmount:null,
    vatReason:blocked?'개인 지출·본인 식사·접대 관련 매입세액은 공제에서 제외합니다.':'증빙과 실제 세액 확인 전에는 공제에 넣지 않습니다.',
    ai:e.ai?{...e.ai,status:'manual'}:null,updatedAt:now};
}
// Export only fields needed to classify. No memo/raw/card/source/customer fields.
export function exportEntry(e) {
  if (e?.status==='void'||e?.kind==='move'||e?.ai?.status!=='pending') return null;
  return {id:e.id,requestId:e.ai.requestId,date:e.date,kind:e.kind,amount:e.amount,
    vendor:cleanNote(e.vendor).slice(0,60),method:e.method||'',category:e.category||'',evidence:e.evidence||'없음',
    note:cleanNote(e.ai.note),businessUse:e.method==='현대카드'?'business':'unknown',
    receiptVerified:e.receiptVerified===true,receiptVat:Number.isFinite(e.receiptVat)?e.receiptVat:null};
}
export function basis(e) {
  // Compare unredacted source in the bridge; send only its SHA-256 to the worker.
  return JSON.stringify([e.id,e.kind,e.amount,e.date,e.method,e.vendor,e.category,e.evidence,e.status,e.updatedAt||'',e.ai?.requestId,e.ai?.note,e.receiptVerified||false,e.receiptVat??null]);
}
export function validateDecision(e,d) {
  if (!d || d.requestId!==e.ai?.requestId || !['apply','review'].includes(d.action)) throw Error('오래되었거나 잘못된 AI 결과입니다.');
  if (Object.keys(d).some(k=>!['id','requestId','basisHash','action','category','vatTreatment','reason','confidence','policyVersion'].includes(k))) throw Error('허용되지 않은 결과 칸입니다.');
  if (d.policyVersion!==POLICY_VERSION || !['high','low'].includes(d.confidence) || !VAT_LABEL[d.vatTreatment]) throw Error('AI 결과 형식이 다릅니다.');
  if (!(e.kind==='in'?IN:OUT).includes(d.category) && !(d.action==='review' && d.category==='')) throw Error('AI 분류가 목록에 없습니다.');
  if (!d.reason || d.reason.length>200 || cleanNote(d.reason)!==d.reason) throw Error('개인정보 없는 이유 한 줄이 필요합니다.');
  if (d.action==='apply' && d.confidence!=='high') throw Error('확실하지 않은 결과는 사장님 확인으로 남겨야 합니다.');
  if (e.method==='현대카드' && d.category==='사장님 인출') throw Error('현대카드는 모두 사업 용도이며 사장님 인출로 자동 분류하지 않습니다.');
  if (['사장님 인출','식비(본인)','접대(업무추진비)'].includes(d.category) && d.vatTreatment!=='nondeductible') throw Error('이 항목은 부가세 불공제입니다.');
  if (d.vatTreatment==='deductible' && (e.kind!=='out'||e.receiptVerified!==true||!Number.isFinite(e.receiptVat)||e.receiptVat<=0||e.receiptVat>e.amount/10||!['카드','세금계산서','현금영수증'].includes(e.evidence))) throw Error('실제 적격증빙과 세액 확인이 먼저입니다.');
  return d;
}
export function applyDecision(e,d,now) {
  if (e?.ai?.status!=='pending'||e.status==='void') throw Error('이미 처리했거나 취소한 거래입니다.');
  validateDecision(e,d);
  const before=snapshot(e), next=copy(e);
  if(d.action==='apply') Object.assign(next,{category:d.category,status:'ok',vatTreatment:d.vatTreatment,vatReason:d.reason,vatAmount:d.vatTreatment==='deductible'?e.receiptVat:null});
  next.ai={...e.ai,status:d.action==='apply'?'applied':'review',decision:copy(d),before,applied:snapshot(next),decidedAt:now};
  next.updatedAt=now; return next;
}
export function undoAi(e,now) {
  // Firebase omits null properties and may reorder object keys on readback.
  if(e?.ai?.status!=='applied'||!e.ai.before||!e.ai.applied||Object.entries(snapshot(e)).some(([k,v])=>v!==val(e.ai.applied,k))) throw Error('그 뒤 수정된 거래입니다. 현재 내용을 먼저 확인해 주세요.');
  return {...e,...snapshot(e.ai.before),ai:{...e.ai,status:'undone',undoneAt:now},updatedAt:now};
}
