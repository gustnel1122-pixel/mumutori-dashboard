// 재무 공용 장부 저장 — Firebase hub/financeV1 (사장님 구글 로그인 전용 칸, 보안 규칙은 hub 규칙을 그대로 물려받음).
// SDK 없이 REST + ID 토큰(fbauth.dbUrl). 쓰기는 '한 줄' 단위(PUT entries/<id>) — 칸 전체를 덮어쓰지 않는다.
// 시험: window.__MMT_TEST_FIN__ = {entries:{}, sales:{}, meta:{}} 가 있으면 네트워크 없이 메모리에서만 읽고 쓴다.
import { dbUrl } from './fbauth.js?v=access20261028';
import { requestAi, manualCategory, undoAi } from './fin-classify.js?v=undo-20261027';

export const ROOT = 'hub/financeV1';
// 칸 자리(1단계에서 쓰는 것: entries · receipts · meta, 2단계 · 알림 입구가 채울 것: sales · inboxSeen · imports · recon · legacy)
export const PATHS = { entries: 'entries', receipts: 'receipts', meta: 'meta', sales: 'sales', inboxSeen: 'inboxSeen' };
// 알림 입구(7절): hub/financeInbox/<비밀키>/<id> — 규칙 적용 · 휴대폰 설정은 q115 답과 승인 뒤. 여기서는 이름만 잡아 둔다.
export const INBOX_ROOT = 'hub/financeInbox';
// 원문은 기존 hub 관리자 권한을 물려받지 않는 사장님 전용 입구에 둔다.
export const RAW_INBOX_ROOT = 'financeRawInbox';

const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
// RTDB omits null/empty child nodes and may return object keys in another order.
function normalizedFirebase(value){
  if(value===null||value===undefined)return undefined;
  if(typeof value!=='object')return value;
  const result={};for(const key of Object.keys(value).sort()){
    const child=normalizedFirebase(value[key]);if(child!==undefined)result[key]=child;
  }
  return Object.keys(result).length?result:undefined;
}
const sameStored=(a,b)=>JSON.stringify(normalizedFirebase(a))===JSON.stringify(normalizedFirebase(b));
async function safeDigest(value){
  if(!globalThis.crypto?.subtle)throw Error('안전한 식별 확인을 할 수 없습니다.');
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
// This deliberately accepts only an unambiguous subset shared by Python JSON and JS.
function pcCanonical(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error('수집 값의 숫자 형식을 확인해 주세요.');return value;}
  if(typeof value==='string'){
    for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xD800&&n<=0xDBFF){const next=value.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))throw Error('수집 값의 문자 형식을 확인해 주세요.');}else if(n>=0xDC00&&n<=0xDFFF)throw Error('수집 값의 문자 형식을 확인해 주세요.');}
    return value;
  }
  if(Array.isArray(value))return value.map(pcCanonical);
  if(typeof value==='object'){
    const result={};for(const key of Object.keys(value).sort()){
      if(!/^[A-Za-z0-9_-]+$/.test(key)||/^(?:0|[1-9]\d*)$/.test(key))throw Error('수집 값의 항목 형식을 확인해 주세요.');
      const v=pcCanonical(value[key]);if(v===null||(Array.isArray(v)&&v.length===0)||(typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0))continue;
      result[key]=v;
    }
    return result;
  }
  throw Error('수집 값의 형식을 확인해 주세요.');
}
export async function pcCollectorFingerprint(value){return safeDigest(JSON.stringify(pcCanonical(value)));}

export function openFinStore({ root = ROOT, onChange, onStatus } = {}) {
  const test = typeof window !== 'undefined' && window.__MMT_TEST_FIN__;
  let book = { entries: {}, sales: {}, meta: {}, bankReviews: {}, alertReviews: {}, importReviews: {}, transferReviews: {} }, timer = 0, state = '', inboxRun = null, visibilityHandler = null;
  const reviewSelections=new Map();
  let closed=false;const closeController=new AbortController();
  const ensureActive=()=>{if(closed)throw Error('계정이 바뀌어 확인을 중단했습니다.');};
  const status = s => { if (s !== state) { state = s; onStatus?.(s); } };
  const emit = () => onChange?.(clone(book));

  async function req(method, path, body) {
    if (test) {   // 메모리 시험: 같은 자리 규칙(줄 단위 쓰기)만 흉내 낸다
      const keys = path.split('/').filter(Boolean); let o = test;
      if (method === 'GET') { for (const k of keys) o = o?.[k]; return clone(o ?? null); }
      for (const k of keys.slice(0, -1)) o = o[k] = o[k] || {};
      const last = keys.at(-1);
      if (method === 'PUT') o[last] = clone(body); else if (method === 'PATCH') o[last] = { ...(o[last] || {}), ...clone(body) }; else if (method === 'DELETE') delete o[last];
      return clone(o[last] ?? null);
    }
    return reqAbs(method, `${root}/${path}`.replace(/\/$/, ''), body);
  }
  async function reqAbs(method, fullPath, body) {
    const url = await dbUrl(fullPath);
    const r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 || r.status === 403) { status('denied'); throw Error('공용 장부를 열 권한이 없습니다. 공동 운영 Google 계정으로 로그인해 주세요.'); }
    if (!r.ok) throw Error('공용 장부 ' + (method === 'GET' ? '읽기' : '저장') + ' 실패 (' + r.status + ')');
    return r.status === 204 ? null : r.json();
  }

  async function load() {
    try {
      status('loading');
      const {data}=await readFinance();
      book = { entries:data.entries||{},sales:data.sales||{},meta:data.meta||{},bankReviews:data.bankReviews||{},alertReviews:data.alertReviews||{},importReviews:data.importReviews||{},transferReviews:data.transferReviews||{},inboxTestCount:book.inboxTestCount };
      status('ok'); emit(); return clone(book);
    } catch (err) { if (state !== 'denied') status('offline'); throw err; }
  }
  // Root compare-and-set couples the row, review and receipt marker, without discarding other data.
  async function readFinance() {
    ensureActive();
    if(test)return {data:clone(test),tag:'test'};
    const url=await dbUrl(root);ensureActive();const r=await fetch(url,{cache:'no-store',headers:{'X-Firebase-ETag':'true'},signal:closeController.signal});ensureActive();
    if(r.status===401||r.status===403){status('denied');throw Error('공용 장부를 열 권한이 없습니다.');}
    if(!r.ok)throw Error('장부를 다시 읽지 못했습니다.');
    const tag=r.headers.get('ETag');if(!tag)throw Error('동시 수정 확인이 필요합니다.');
    const data=await r.json()||{};ensureActive();return {data,tag,url};
  }
  function refreshBook(data){
    book={...book,entries:data.entries||{},sales:data.sales||{},meta:data.meta||{},bankReviews:data.bankReviews||{},alertReviews:data.alertReviews||{},importReviews:data.importReviews||{},transferReviews:data.transferReviews||{}};emit();
  }
  async function changeFinance(transform,verify){
    for(let attempt=0;attempt<4;attempt++){
      const {data,tag,url}=await readFinance(),next=clone(data),result=await transform(next);
      ensureActive();
      if(!result.changed){refreshBook(data);return result.value;}
      if(test){if(JSON.stringify(test)!==JSON.stringify(data))continue;for(const k of Object.keys(test))delete test[k];Object.assign(test,clone(next));refreshBook(test);return result.value;}
      let response;
      try{ensureActive();response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':tag},body:JSON.stringify(next),signal:closeController.signal});}
      catch(_){const back=await readFinance();if(await verify(back.data,result.value)){refreshBook(back.data);return result.value;}throw Error('저장 결과를 확인하지 못했습니다. 다시 확인해 주세요.');}
      if(response.status===412)continue;
      if(!response.ok){
        if(response.status===408||response.status>=500){const back=await readFinance();if(await verify(back.data,result.value)){refreshBook(back.data);return result.value;}}
        throw Error('장부를 저장하지 못했습니다.');
      }
      const back=await readFinance();if(!await verify(back.data,result.value))throw Error('저장 결과를 다시 확인해 주세요.');
      refreshBook(back.data);return result.value;
    }
    throw Error('다른 기기에서 장부를 수정 중입니다. 다시 확인해 주세요.');
  }
  const safeAlert=e=>({status:'REVIEW',source:'alert',method:e.method||'',kind:e.kind,amount:e.amount,date:e.date,time:e.time||'',bankSource:e.bankSource||'',alertAt:e.alertAt||null,createdAt:new Date().toISOString()});
  const alertIdentity=async e=>({method:e.method||'',kind:e.kind,amount:e.amount,date:e.date,time:e.time||'',bankSource:e.bankSource||'',alertAt:Number.isFinite(e.alertAt)?e.alertAt:0,
    cardFingerprint:e.bankSource?'':await safeDigest(JSON.stringify([e.card||'',e.vendor||'']))});
  function candidates(entries,draft){
    return Object.values(entries||{}).filter(e=>{
      if(!e||Number(e.amount)!==draft.amount)return false;
      const F=window.FinCore,base=name=>F.ACCOUNTS.find(a=>a.name===name)?.link||name,account=base(F.accountOf(draft));
      const maybeMove=e.kind==='move'&&(!e.from||!e.to||(draft.kind==='out'&&e.from===account)||(draft.kind==='in'&&e.to===account));
      if(['in','out','move'].includes(e.kind)&&e.kind!==draft.kind&&!maybeMove)return false;
      const route=draft.draft||draft;
      if(e.kind==='move'&&draft.kind==='move'&&e.from&&e.to&&route.from&&route.to&&(e.from!==route.from||e.to!==route.to))return false;
      if(F.validDate(e.date)&&F.validDate(draft.date)&&e.date!==draft.date)return false;
      if(!maybeMove&&F.ALL_METHODS.includes(e.method)&&F.ALL_METHODS.includes(draft.method)&&e.method!==draft.method&&base(F.accountOf(e))!==account)return false;
      return true;
    });
  }
  function publicCandidate(e){
    const F=window.FinCore;
    const account=name=>F.ACCOUNTS.some(a=>a.name===name)?name:'';
    return {id:e.id,date:F.validDate(e.date)?e.date:'',time:/^\d{2}:\d{2}$/.test(e.time||'')?e.time:'',
      method:F.ALL_METHODS.includes(e.method)?e.method:'',kind:['in','out','move'].includes(e.kind)?e.kind:'',
      amount:Number(e.amount),status:e.status==='void'?'void':'active',account:account(e.account),from:account(e.from),to:account(e.to)};
  }
  function publicReview(review,type){
    const p=publicCandidate(type==='import'?{...review,account:review.draft?.account,from:review.draft?.from,to:review.draft?.to}:review);
    return {kind:p.kind,amount:p.amount,date:p.date,time:p.time,method:p.method,source:type,
      account:p.account,from:p.from,to:p.to,reason:['POSSIBLE_DUPLICATE','ID_CONFLICT','NEEDS_IDENTITY'].includes(review.reason)?review.reason:''};
  }
  function unambiguousChoice(rows,selected){
    const F=window.FinCore,accounts=F.ACCOUNTS.map(a=>a.name);
    if(!['in','out','move'].includes(selected.kind))return false;
    if(selected.kind==='move'&&(!accounts.includes(selected.from)||!accounts.includes(selected.to)||selected.from===selected.to))return false;
    const display=e=>{const {id,...safe}=publicCandidate(e);return safe;};
    return rows.filter(e=>sameStored(display(e),display(selected))).length===1;
  }
  function bankPendingEvent(id,r){
    const F=window.FinCore;
    if(r?.status!=='REVIEW'||!['kakaobank','tossbank'].includes(r.bankSource)||!['in','out'].includes(r.kind)||!Number.isSafeInteger(r.amount)||r.amount<=0||!Number.isSafeInteger(r.alertAt))return null;
    const e=F.normEntry({id:'al_'+id,inboxId:id,source:'alert',bankSource:r.bankSource,bankDirection:r.kind==='in'?'입금':'출금',alertAt:r.alertAt,kind:r.kind,amount:r.amount,date:r.date,time:r.time,method:r.method,vendor:'',memo:'개인사업자 통장 알림',evidence:'없음'},new Date(r.alertAt));
    return F.bankOriginal(e)?e:null;
  }
  function pairedBankRow(e){
    const F=window.FinCore,prefix=e?.bankSource==='kakaobank'?'kb_':e?.bankSource==='tossbank'?'tb_':'';
    const allowed=new Set(['id','kind','amount','date','time','method','bankSource','bankDirection','alertAt','source','inboxId','vendor','memo','evidence','category','vatIncluded','status','createdAt','from','to','transferId','updatedAt']);
    if(!e||Object.keys(e).some(k=>!allowed.has(k)))return false;
    return !!prefix&&e?.source==='alert'&&e.kind==='move'&&e.status==='ok'&&e.category===F.MOVE_CATEGORY&&
      e.memo==='은행 알림 자동 짝맞춤 · 동일 금액·2분 이내 유일한 짝'&&e.vendor===''&&
      typeof e.inboxId==='string'&&new RegExp('^'+prefix+'\\d{13}$').test(e.inboxId)&&e.id==='al_'+e.inboxId&&
      Number.isSafeInteger(e.alertAt)&&Number(e.inboxId.slice(3))===e.alertAt&&['입금','출금'].includes(e.bankDirection)&&
      (e.bankDirection==='출금'?e.from===F.accountOf(e):e.to===F.accountOf(e));
  }
  const bankDirection=e=>e.kind==='move'?(e.bankDirection==='입금'?'in':'out'):e.kind;
  // Never include edited free text in a persisted ambiguity fingerprint.
  const safeTransferStamp=e=>JSON.stringify(['id','kind','amount','date','time','status','source','category','method','account','from','to','transferId','inboxId','bankSource','bankDirection','alertAt','updatedAt'].map(k=>e?.[k]??null));
  function bankPeer(a,b){return !!a&&!!b&&a.id!==b.id&&a.bankSource!==b.bankSource&&bankDirection(a)!==bankDirection(b)&&a.amount===b.amount&&Math.abs(a.alertAt-b.alertAt)<=120000;}
  function transferConflictRows(data){
    const F=window.FinCore,groups=new Map(),late=[];
    for(const e of Object.values(data.entries||{})){
      if(pairedBankRow(e)&&e.transferId){
        const m=/^bt_(al_(?:kb|tb)_\d{13})_(al_(?:kb|tb)_\d{13})$/.exec(e.transferId);
        if(m)groups.set(e.transferId,{ids:[m[1],m[2]],bases:null});
      }
      else if(F.bankOriginal(e))late.push({type:'entry',id:e.id,row:e});
    }
    for(const [id,proof] of Object.entries(data.transferPairProofs||{})){
      if(data.transferReviews?.[id]?.status==='RESOLVED'&&data.transferReviews[id].action==='reassign')continue;
      const ids=Object.keys(proof?.originals||{}).sort();
      if(proof?.version===1&&ids.length===2&&ids.every(k=>F.bankOriginal(proof.originals[k]))&&bankPeer(proof.originals[ids[0]],proof.originals[ids[1]]))groups.set(id,{ids,bases:ids.map(k=>proof.originals[k])});
    }
    for(const [id,r] of Object.entries(data.alertReviews||{})){const e=bankPendingEvent(id,r);if(e)late.push({type:'alert',id,row:e});}
    const result=[];
    for(const [id,group] of groups){
      const rows=group.ids.map(k=>data.entries?.[k]||null),bases=group.bases||rows.filter(pairedBankRow);
      if(!group.bases&&bases.length===1){
        const otherId=group.ids.find(k=>k!==bases[0].id),source=otherId?.startsWith('al_kb_')?'kakaobank':otherId?.startsWith('al_tb_')?'tossbank':'';
        if(source&&source!==bases[0].bankSource)bases.push({id:otherId,bankSource:source,kind:bankDirection(bases[0])==='in'?'out':'in',amount:bases[0].amount,alertAt:Number(otherId.slice(6))});
      }
      if(!bases.length)continue;
      const matches=late.filter(c=>!group.ids.includes(c.row.id)&&bases.some(r=>bankPeer(r,c.row))).sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
      if(matches.length)result.push({id,ids:group.ids,rows,matches});
    }
    return result;
  }
  async function updateTransferReviews(data,onlyId){
    const F=window.FinCore;let changed=false;
    for(const issue of transferConflictRows(data)){
      if(onlyId&&issue.id!==onlyId)continue;
      const refs=issue.matches.map(c=>({type:c.type,id:c.id}));
      const snapshots=await Promise.all([...issue.ids.map((id,i)=>({id,row:issue.rows[i]})),...issue.matches.filter(c=>c.type==='entry').map(c=>({id:c.row.id,row:c.row}))].map(async x=>({id:x.id,stamp:await safeDigest(safeTransferStamp(x.row))})));
      const candidateHashes=await Promise.all(issue.matches.map(async c=>({type:c.type,id:c.id,stamp:await safeDigest(safeTransferStamp(c.row))})));
      const signature=await safeDigest(JSON.stringify(normalizedFirebase({rows:snapshots,candidates:candidateHashes})));
      data.transferReviews=data.transferReviews||{};const prior=data.transferReviews[issue.id];
      if(prior?.signature===signature&&['REVIEW','RESOLVED'].includes(prior.status))continue;
      data.transferReviews[issue.id]={status:'REVIEW',reason:'LATE_CANDIDATE',entryIds:issue.ids,candidates:refs,rows:snapshots,signature,createdAt:new Date().toISOString()};changed=true;
    }
    return changed;
  }
  async function transferReviewContext(data,id){
    const F=window.FinCore,r=data.transferReviews?.[id];
    if(!r||r.status!=='REVIEW'||!Array.isArray(r.entryIds)||r.entryIds.length!==2||!Array.isArray(r.candidates)||!Array.isArray(r.rows))throw Error('이동 확인 대기를 다시 확인해 주세요.');
    const existing=r.entryIds.map(k=>data.entries?.[k]);
    const choices=r.candidates.map(ref=>{
      if(ref.type==='entry'){const e=data.entries?.[ref.id];return {type:'entry',id:ref.id,row:e||null};}
      if(ref.type==='alert'){const e=bankPendingEvent(ref.id,data.alertReviews?.[ref.id]);return {type:'alert',id:ref.id,row:e};}
      return {type:'unknown',id:'',row:null};
    });
    const proof=data.transferPairProofs?.[id];let proofValid=false,reconstructed=false;
    const originals=Object.fromEntries(r.entryIds.map(key=>[key,proof?.originals?.[key]])),timestamp=new Date(proof?.pairedAt||'');
    if(proof?.version===1&&Number.isFinite(timestamp.getTime())&&r.entryIds.every(key=>F.bankOriginal(originals[key]))){
      const pairs=F.bankTransferPairs(originals,timestamp);
      if(pairs.length===1&&pairs[0].transferId===id){const matches=await Promise.all(pairs[0].rows.map(async row=>proof.stamps?.[row.id]===await safeDigest(F.transferRowStamp(row))));proofValid=matches.every(Boolean);}
    }
    if(proofValid){const validRows=await Promise.all(existing.map(async e=>!!e&&pairedBankRow(e)&&e.transferId===id&&proof.stamps?.[e.id]===await safeDigest(F.transferRowStamp(e))));reconstructed=validRows.every(Boolean);}
    const reassignAllowed=reconstructed&&choices.some(c=>c.row&&F.bankOriginal(c.row)&&existing.some(e=>bankPeer(e,c.row)));
    return {review:r,existing,choices,proof,proofValid,reassignAllowed};
  }
  function publicBankRow(e,type,id){
    const F=window.FinCore,name=e?F.accountOf(e):'',direction=e?bankDirection(e):'';
    return {id,type,direction:['in','out'].includes(direction)?direction:'',amount:Number.isSafeInteger(e?.amount)?e.amount:null,date:F.validDate(e?.date)?e.date:'',time:/^\d{2}:\d{2}$/.test(e?.time||'')?e.time:'',account:F.ACCOUNTS.some(a=>a.name===name)?name:'',status:e?.status==='void'?'void':e?'active':'missing'};
  }
  function transferContextSnapshot(ctx){
    return JSON.stringify(normalizedFirebase({review:ctx.review,existing:ctx.existing,choices:ctx.choices.map(c=>({type:c.type,id:c.id,row:c.row})),proof:ctx.proof,proofValid:ctx.proofValid,reassignAllowed:ctx.reassignAllowed}));
  }
  const candidateSnapshot=(entries,review)=>JSON.stringify(normalizedFirebase({review,candidates:candidates(entries,review).map(e=>[e.id,e]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))}));
  function pcTarget(key){
    const m=/^sale_(smartstore|coupang|sixshop)_(\d{4})(\d{2})(\d{2})$/.exec(String(key||''));
    if(m){const date=`${m[2]}-${m[3]}-${m[4]}`,parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('자동 수집 날짜를 확인해 주세요.');return {target:'daily-sales',channel:m[1],date};}
    if(key==='meta_coupangSettle')return {target:'settlement',channel:null,date:null};
    if(key==='meta_coupangCal')return {target:'calendar',channel:null,date:null};
    throw Error('자동 수집 대상을 확인해 주세요.');
  }
  function pcCurrent(data,target){return target.target==='daily-sales'?data.sales?.[target.channel]?.[target.date]??null:data.meta?.[target.target==='settlement'?'coupangSettle':'coupangCal']??null;}
  function pcSummary(value,target){
    if(value==null)return null;
    if(typeof value!=='object'||Array.isArray(value))throw Error('자동 수집 내역의 형식을 확인해 주세요.');
    const number=(v)=>v==null?null:Number.isSafeInteger(v)?v:(()=>{throw Error('자동 수집 숫자를 확인해 주세요.');})();
    const day=(v)=>v==null||v===''?null:(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:(()=>{throw Error('자동 수집 날짜를 확인해 주세요.');})());
    if(target.target==='daily-sales')return {gross:number(value.gross),orders:number(value.orders),cancel:number(value.cancel),fee:number(value.fee)};
    if(target.target==='settlement'){
      let periodStart=null,periodEnd=null;
      if(value.period){const m=/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(String(value.period));if(!m)throw Error('정산 기준 기간을 확인해 주세요.');periodStart=day(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);periodEnd=day(`${m[4]}-${m[5].padStart(2,'0')}-${m[6].padStart(2,'0')}`);if(periodStart>periodEnd)throw Error('정산 기준 기간을 확인해 주세요.');}
      return {nextDate:day(value.nextDate),nextAmount:number(value.nextAmount),periodStart,periodEnd,revenue:number(value.revenue),cost:number(value.cost),profit:number(value.profit),ads:number(value.ads),fulfillment:number(value.fulfillment),fee:number(value.fee)};
    }
    const payment=v=>{if(v==null)return null;if(typeof v!=='object'||Array.isArray(v))throw Error('정산 일정 형식을 확인해 주세요.');return {date:day(v.date),amount:number(v.amount)};};
    if(value.weeks!=null&&(!Array.isArray(value.weeks)||value.weeks.length>12))throw Error('정산 주차를 확인해 주세요.');
    return {next:payment(value.next),weeks:(value.weeks||[]).map(w=>{if(!w||typeof w!=='object'||Array.isArray(w))throw Error('정산 주차 형식을 확인해 주세요.');return {start:day(w.start),end:day(w.end),sales:number(w.sales),ads:number(w.ads),fulfillment:number(w.fulfillment),fee:number(w.fee),cost:number(w.cost),payout:number(w.payout),pay70:payment(w.pay70),pay30:payment(w.pay30)};})};
  }
  async function validatePcReview(data,key){
    const target=pcTarget(key),review=data.meta?.pcCollectorReviews?.[key],current=pcCurrent(data,target);
    if(!review||review.status!=='REVIEW'||review.reason!=='UNVERIFIED_EXISTING'||typeof review.currentExists!=='boolean'||review.currentExists!==(current!==null)||!review.proposal||typeof review.proposal!=='object'||Array.isArray(review.proposal))throw Error('자동 수집 확인 대기를 다시 확인해 주세요.');
    if(!['currentFingerprint','proposalFingerprint','valueFingerprint'].every(k=>/^[0-9a-f]{64}$/.test(review[k]||'')))throw Error('자동 수집의 변경 확인값이 없습니다.');
    const proposal=target.target==='daily-sales'?Object.fromEntries(Object.entries(review.proposal).filter(([k])=>k!=='updatedAt')):review.proposal;
    const fingerprints=await Promise.all([pcCollectorFingerprint(current),pcCollectorFingerprint(review.currentSnapshot??null),pcCollectorFingerprint(review.proposal),pcCollectorFingerprint(proposal)]);
    if(fingerprints[0]!==review.currentFingerprint||fingerprints[1]!==review.currentFingerprint||fingerprints[2]!==review.valueFingerprint||fingerprints[3]!==review.proposalFingerprint)throw Error('자동 수집 대상이나 제안이 바뀌었습니다. 다시 확인해 주세요.');
    return {target,review,current,summary:{...target,current:pcSummary(current,target),proposal:pcSummary(review.proposal,target)}};
  }
  // Fresh read + conditional PUT prevents AI requests/undo from overwriting another device.
  async function changeEntry(id, transform) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error('거래 번호가 올바르지 않습니다.');
    const path = `${PATHS.entries}/${id}`;
    let before, tag, url;
    if (test) before = await req('GET', path);
    else {
      url = await dbUrl(`${root}/${path}`);
      const r = await fetch(url, {cache:'no-store', headers:{'X-Firebase-ETag':'true'}});
      if (!r.ok) throw Error('거래를 다시 읽지 못했습니다.');
      tag = r.headers.get('ETag'); before = await r.json();
      if (!tag) throw Error('충돌 확인을 할 수 없어 저장하지 않았습니다.');
    }
    if (!before) throw Error('거래를 찾지 못했습니다.');
    const next = transform(before, new Date().toISOString());
    if (test) await req('PUT', path, next);
    else {
      const r = await fetch(url, {method:'PUT',headers:{'Content-Type':'application/json','if-match':tag},body:JSON.stringify(next)});
      if (r.status === 412) throw Error('다른 곳에서 수정됐어요. 새로고침 후 다시 해 주세요.');
      if (!r.ok) throw Error('저장하지 못했습니다. 다시 확인해 주세요.');
    }
    const saved = await req('GET',path);
    if (!saved || saved.updatedAt !== next.updatedAt || saved.category !== next.category || saved.ai?.status !== next.ai?.status) throw Error('저장 결과가 달라요. 새로고침 후 확인해 주세요.');
    book.entries[id]=saved; emit(); return saved;
  }
  const api = {
    load,
    requestAi(id, note) { return changeEntry(id, (e,now) => requestAi(e,note,'req_'+(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),now)); },
    setCategory(id, category) { return changeEntry(id,(e,now) => manualCategory(e,category,now)); },
    undoAi(id) { return changeEntry(id,(e,now) => undoAi(e,now)); },
    book: () => clone(book),
    async listPcCollectorReview(key){
      const {data}=await readFinance(),checked=await validatePcReview(data,key);
      reviewSelections.set('pc:'+key,JSON.stringify(pcCanonical({review:checked.review,current:checked.current})));
      return checked.summary;
    },
    async resolvePcCollectorReview(key,choice){
      const target=pcTarget(key);if(!['keep','apply'].includes(choice?.action))throw Error('유지 또는 적용을 직접 선택해 주세요.');
      let expectedCurrent='',expectedProposal='',expectedValue='';
      return changeFinance(async data=>{
        const prior=data.meta?.pcCollectorReviews?.[key];
        if(prior?.status==='RESOLVED'){
          if(prior.action===choice.action)return {changed:false,value:{status:'RESOLVED',action:choice.action}};
          throw Error('이미 확인한 자동 수집 기록입니다.');
        }
        const checked=await validatePcReview(data,key),snapshot=JSON.stringify(pcCanonical({review:checked.review,current:checked.current}));
        if(!reviewSelections.has('pc:'+key)||reviewSelections.get('pc:'+key)!==snapshot)throw Error('자동 수집 내용이 바뀌었어요. 다시 확인해 주세요.');
        expectedCurrent=checked.review.currentFingerprint;expectedProposal=checked.review.proposalFingerprint;expectedValue=checked.review.valueFingerprint;
        data.meta=data.meta||{};
        if(choice.action==='apply'){
          if(target.target==='daily-sales'){data.sales=data.sales||{};data.sales[target.channel]=data.sales[target.channel]||{};data.sales[target.channel][target.date]=clone(checked.review.proposal);}
          else data.meta[target.target==='settlement'?'coupangSettle':'coupangCal']=clone(checked.review.proposal);
          data.meta.pcCollectorProvenance=data.meta.pcCollectorProvenance||{};
          data.meta.pcCollectorProvenance[key]={version:1,fingerprint:checked.review.valueFingerprint};
        }
        data.meta.pcCollectorReviews[key]={...checked.review,status:'RESOLVED',action:choice.action,resolvedAt:new Date().toISOString()};
        return {changed:true,value:{status:'RESOLVED',action:choice.action}};
      },async(data,value)=>{
        const r=data.meta?.pcCollectorReviews?.[key];if(r?.status!=='RESOLVED'||r.action!==value.action||r.currentFingerprint!==expectedCurrent||r.proposalFingerprint!==expectedProposal||r.valueFingerprint!==expectedValue)return false;
        if(value.action==='apply')return data.meta?.pcCollectorProvenance?.[key]?.version===1&&data.meta.pcCollectorProvenance[key].fingerprint===r.valueFingerprint&&await pcCollectorFingerprint(pcCurrent(data,target))===r.valueFingerprint;
        return await pcCollectorFingerprint(pcCurrent(data,target))===r.currentFingerprint;
      });
    },
    // Compare the whole ledger and review state under one ETag. A retry never creates a second row.
    async confirmBankReview(id,input) {
      const F=window.FinCore;
      if(!/^(?:kb|tb)_\d{13}$/.test(String(id||'')))throw Error('은행 알림 번호를 다시 확인해 주세요.');
      if(!['in','out'].includes(input?.direction))throw Error('입금 또는 출금을 직접 선택해 주세요.');
      if(!Number.isSafeInteger(input?.amount)||input.amount<=0||input.amount>100000000)throw Error('금액을 1원 이상 1억 원 이하의 정수로 입력해 주세요.');
      const entryId='al_'+id, error=(code,message)=>Object.assign(new Error(message),{code});
      async function readRoot(){
        if(test)return {value:clone(test),tag:'test',url:''};
        const url=await dbUrl(root),response=await fetch(url,{cache:'no-store',headers:{'X-Firebase-ETag':'true'}});
        if(!response.ok)throw error('REVIEW_READ','장부를 다시 읽지 못했습니다.');
        const tag=response.headers.get('ETag');if(!tag)throw error('REVIEW_READ','동시 수정 확인이 필요합니다.');
        return {value:await response.json()||{},tag,url};
      }
      const matches=(data)=>{const review=data?.bankReviews?.[id],e=data?.entries?.[entryId];return review?.status==='CONFIRMED'&&review.entryId===entryId&&e?.inboxId===id&&e.bankSource===review.src&&e.alertAt===review.ts&&e.kind===input.direction&&e.amount===input.amount;};
      const show=data=>{refreshBook(data);return {status:'confirmed',entryId};};
      for(let attempt=0;attempt<3;attempt++){
        const current=await readRoot(),data=current.value,review=data.bankReviews?.[id];
        if(matches(data))return show(data);
        if(!review||review.status!=='REVIEW')throw error('REVIEW_RESOLVED','이미 확인됐거나 확인할 알림이 없습니다.');
        const draft=F.confirmedBankReview(id,review,input);F.validateEntry(draft);
        if(data.entries?.[entryId]||F.bankReviewCandidates(data.entries,draft).length)throw error('REVIEW_CANDIDATE','같은 계좌·방향·금액의 기존 기록 후보가 있습니다. 기존 장부를 확인해 주세요.');
        const next=clone(data);next.entries=next.entries||{};next.bankReviews=next.bankReviews||{};
        next.entries[entryId]=draft;next.bankReviews[id]={...review,status:'CONFIRMED',entryId,confirmedAt:new Date().toISOString()};
        if(test){if(JSON.stringify(test)!==JSON.stringify(data))continue;test.entries=clone(next.entries);test.bankReviews=clone(next.bankReviews);return show(test);}
        let response;
        try{response=await fetch(current.url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':current.tag},body:JSON.stringify(next)});}
        catch(_){try{const reread=await readRoot();if(matches(reread.value))return show(reread.value);}catch{}throw error('REVIEW_UNKNOWN','저장 결과를 확인하지 못했습니다. 다시 열어 확인해 주세요.');}
        if(response.status===412)continue;
        if(!response.ok){
          if(response.status===408||response.status>=500){try{const reread=await readRoot();if(matches(reread.value))return show(reread.value);}catch{}throw error('REVIEW_UNKNOWN','저장 결과를 확인하지 못했습니다. 다시 열어 확인해 주세요.');}
          throw error('REVIEW_WRITE','확인 내용을 저장하지 못했습니다.');
        }
        try{const reread=await readRoot();if(matches(reread.value))return show(reread.value);}catch{}
        throw error('REVIEW_UNKNOWN','저장 결과를 확인하지 못했습니다. 다시 열어 확인해 주세요.');
      }
      throw error('REVIEW_CONFLICT','다른 기기에서 장부를 수정 중입니다. 다시 확인해 주세요.');
    },
    // 한 줄 넣기(새 id) — 다시 읽어 서버 값으로 확인한 줄을 돌려준다(완료 = 바뀐 상태를 다시 읽어 판정)
    async add(entry) {
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(entry?.id||'')))throw Error('거래 번호를 확인해 주세요.');
      window.FinCore.validateEntry(entry);
      if(entry.source==='import')return changeFinance(data=>{
        data.importReviews=data.importReviews||{};
        if(data.importReviews[entry.id]?.status==='REVIEW'){
          const prior=data.importReviews[entry.id];
          if(prior.kind!==entry.kind||prior.amount!==entry.amount||prior.date!==entry.date||prior.method!==(entry.method||''))throw Error('가져오기 번호가 겹쳐 다시 확인해야 합니다.');
          return {changed:false,value:{status:'REVIEW',pending:true}};
        }
        if(data.importReviews[entry.id])throw Error('이미 확인한 가져오기 기록입니다.');
        // Preserve the normalized ledger fields in this private ledger, not the source CSV.
        const draft={};for(const k of ['id','kind','date','amount','method','category','vendor','memo','evidence','source','createdBy','vatIncluded','status','createdAt'])if(entry[k]!==undefined)draft[k]=entry[k];
        data.importReviews[entry.id]={status:'REVIEW',source:'import',kind:entry.kind,amount:entry.amount,date:entry.date,method:entry.method||'',reason:'NEEDS_IDENTITY',createdAt:new Date().toISOString(),draft};
        return {changed:true,value:{status:'REVIEW',pending:true}};
      },data=>data.importReviews?.[entry.id]?.status==='REVIEW');
      return changeFinance(data=>{
        data.entries=data.entries||{};
        if(data.entries[entry.id]){
          if(sameStored(data.entries[entry.id],entry))return {changed:false,value:clone(data.entries[entry.id])};
          throw Error('같은 번호의 기록이 있어 다시 확인해야 합니다.');
        }
        data.entries[entry.id]=clone(entry);return {changed:true,value:clone(entry)};
      },data=>sameStored(data.entries?.[entry.id],entry));
    },
    async listAlertReviewCandidates(id){
      const {data}=await readFinance(),review=data.alertReviews?.[id];
      if(!review||review.status!=='REVIEW')throw Error('확인할 알림이 없습니다.');
      reviewSelections.set('alert:'+id,candidateSnapshot(data.entries,review));
      return {review:publicReview(review,'alert'),candidates:candidates(data.entries,review).map(publicCandidate)};
    },
    async listBankTransferReview(id){
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(id||'')))throw Error('이동 확인 번호를 다시 확인해 주세요.');
      const {data}=await readFinance(),ctx=await transferReviewContext(data,id);
      reviewSelections.set('transfer:'+id,transferContextSnapshot(ctx));
      const originals=ctx.proofValid?ctx.review.entryIds.map(id=>ctx.proof.originals[id]):[];
      return {existing:ctx.existing.map((e,i)=>publicBankRow(e,'entry',ctx.review.entryIds[i])),originalHistory:originals.map(e=>publicBankRow(e,'entry',e.id)),candidates:ctx.choices.map(c=>({...publicBankRow(c.row,c.type,c.id),eligible:!!(c.row&&window.FinCore.bankOriginal(c.row)&&ctx.existing.some(e=>bankPeer(e,c.row)))})),reassignAllowed:!!ctx.reassignAllowed};
    },
    async resolveBankTransferReview(id,choice){
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(id||''))||!['keep','reassign'].includes(choice?.action))throw Error('이동 확인 내용을 선택해 주세요.');
      if(choice.action==='reassign'&&(!/^[A-Za-z0-9_-]{1,100}$/.test(String(choice.anchorId||''))||!['entry','alert'].includes(choice.candidateType)||!/^[A-Za-z0-9_-]{1,100}$/.test(String(choice.candidateId||''))))throw Error('연결할 두 기록을 선택해 주세요.');
      const result=await changeFinance(async data=>{
        const prior=data.transferReviews?.[id];
        if(prior?.status==='RESOLVED'){
          if(prior.action===choice.action&&(choice.action==='keep'||(prior.anchorId===choice.anchorId&&prior.candidateType===choice.candidateType&&prior.candidateId===choice.candidateId)))return {changed:false,value:{status:'RESOLVED',action:choice.action,checks:{}}};
          throw Error('이미 확인한 이동 기록입니다.');
        }
        const ctx=await transferReviewContext(data,id);
        if(!reviewSelections.has('transfer:'+id)||reviewSelections.get('transfer:'+id)!==transferContextSnapshot(ctx))throw Error('이동 기록이나 후보가 바뀌었어요. 다시 확인해 주세요.');
        const checks={};let selection={};
        if(choice.action==='reassign'){
          if(!ctx.reassignAllowed)throw Error('기존 기록의 자동 생성 원본을 확인할 수 없어 변경하지 않았습니다.');
          const F=window.FinCore,anchor=ctx.existing.find(e=>e.id===choice.anchorId),candidate=ctx.choices.find(c=>c.type===choice.candidateType&&c.id===choice.candidateId);
          if(!anchor||!candidate?.row||!F.bankOriginal(candidate.row)||!bankPeer(anchor,candidate.row))throw Error('선택한 이동 후보를 다시 확인해 주세요.');
          const shown=c=>{const {id,type,eligible,status,...v}=publicBankRow(c.row,c.type,c.id);return v;};
          if(ctx.choices.filter(c=>c.row&&sameStored(shown(c),shown(candidate))).length!==1)throw Error('같은 모습의 후보를 구분할 수 없어 장부에서 먼저 확인해 주세요.');
          const originalAnchor=clone(ctx.proof.originals[anchor.id]),other=ctx.existing.find(e=>e.id!==anchor.id),originalOther=clone(ctx.proof.originals[other.id]),incoming=clone(candidate.row);
          if(candidate.type==='alert'&&data.entries?.[incoming.id])throw Error('늦은 알림과 같은 번호의 기록이 있어 다시 확인해야 합니다.');
          const pairs=F.bankTransferPairs({[originalAnchor.id]:originalAnchor,[incoming.id]:incoming});if(pairs.length!==1)throw Error('선택한 두 기록의 이동을 확인할 수 없습니다.');
          const at=new Date().toISOString();originalOther.updatedAt=at;data.entries[originalOther.id]=originalOther;checks[originalOther.id]=F.transferRowStamp(originalOther);
          for(const row of pairs[0].rows){row.memo='은행 알림 · 직접 선택한 계좌 이동';row.updatedAt=at;F.validateEntry(row);data.entries[row.id]=row;checks[row.id]=F.transferRowStamp(row);}
          if(candidate.type==='alert'){
            data.alertReviews[candidate.id]={...data.alertReviews[candidate.id],status:'RESOLVED',action:'transfer',entryId:incoming.id,resolvedAt:at};
            data.inboxSeen=data.inboxSeen||{};data.inboxSeen[candidate.id]={...data.inboxSeen[candidate.id],entryId:incoming.id,reviewId:candidate.id,pending:false,at};
          }
          selection={anchorId:choice.anchorId,candidateType:choice.candidateType,candidateId:choice.candidateId};
        }
        if(choice.action==='keep')await updateTransferReviews(data,id);
        data.transferReviews[id]={...data.transferReviews[id],status:'RESOLVED',action:choice.action,...selection,resolvedAt:new Date().toISOString()};
        return {changed:true,value:{status:'RESOLVED',action:choice.action,checks}};
      },(data,value)=>{const r=data.transferReviews?.[id];return r?.status==='RESOLVED'&&r.action===value.action&&(value.action==='keep'||(r.anchorId===choice.anchorId&&r.candidateType===choice.candidateType&&r.candidateId===choice.candidateId))&&Object.entries(value.checks).every(([key,stamp])=>window.FinCore.transferRowStamp(data.entries?.[key])===stamp)&&(value.action!=='reassign'||choice.candidateType!=='alert'||(data.alertReviews?.[choice.candidateId]?.status==='RESOLVED'&&data.alertReviews[choice.candidateId].entryId==='al_'+choice.candidateId));});
      return {status:result.status,action:result.action};
    },
    async listImportReviewCandidates(id){
      const {data}=await readFinance(),review=data.importReviews?.[id];
      if(!review||review.status!=='REVIEW')throw Error('확인할 가져오기 기록이 없습니다.');
      reviewSelections.set('import:'+id,candidateSnapshot(data.entries,review));
      return {review:publicReview(review,'import'),candidates:candidates(data.entries,review).map(publicCandidate)};
    },
    async resolveImportReview(id,choice){
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(id||''))||!['same','add'].includes(choice?.action))throw Error('확인 내용을 선택해 주세요.');
      if(choice.action==='same'&&!/^[A-Za-z0-9_-]{1,100}$/.test(String(choice.candidateId||'')))throw Error('기존 기록을 선택해 주세요.');
      const resolvedId=id.length<=89?'csv_review_'+id:'ci_'+await safeDigest(id);
      return changeFinance(data=>{
        const review=data.importReviews?.[id];
        if(review?.status==='RESOLVED'){
          if(review.action===choice.action&&(choice.action!=='same'||review.entryId===choice.candidateId))return {changed:false,value:{status:'RESOLVED',entryId:review.entryId}};
          throw Error('이미 확인된 가져오기 기록입니다.');
        }
        if(!review||review.status!=='REVIEW')throw Error('확인할 가져오기 기록이 없습니다.');
        if(review.source!=='import'||!review.draft||review.draft.id!==id||!(review.draft.source==='import'||/^ai-[a-z0-9-]{2,30}$/.test(review.draft.source||''))||!['in','out','move'].includes(review.draft.kind)||!Number.isSafeInteger(review.draft.amount)||review.draft.kind!==review.kind||review.draft.amount!==review.amount||review.draft.date!==review.date||review.draft.method!==review.method){
          const err=Error('가져오기 원본 정보가 부족합니다. 원본 CSV를 보관하고 다시 확인해 주세요.');err.code='IMPORT_SOURCE_REQUIRED';throw err;
        }
        const accounts=window.FinCore.ACCOUNTS.map(a=>a.name),d=review.draft;
        let origin;
        if(d.source!=='import'){
          origin=typeof d.origin==='string'?d.origin:Number.isSafeInteger(d.origin)?String(d.origin):'';
          if(!origin.trim()||origin.length>300||/[\u0000-\u001F\u007F-\u009F]/.test(origin)){
            const err=Error('원래 거래 번호를 확인할 수 없습니다. 원본 기록을 보관하고 다시 확인해 주세요.');err.code='IMPORT_SOURCE_REQUIRED';throw err;
          }
        }
        if((d.account&&!accounts.includes(d.account))||(d.from&&!accounts.includes(d.from))||(d.to&&!accounts.includes(d.to))||
          (d.kind==='move'&&(!accounts.includes(d.from)||!accounts.includes(d.to)||d.from===d.to))){
          const err=Error('계좌 이동의 보낸 곳과 받은 곳을 다시 확인해 주세요.');err.code='IMPORT_ACCOUNT_REVIEW';throw err;
        }
        window.FinCore.validateEntry(review.draft);
        if(!reviewSelections.has('import:'+id)||reviewSelections.get('import:'+id)!==candidateSnapshot(data.entries,review))throw Error('기존 기록 후보가 바뀌었어요. 목록을 다시 열어 확인해 주세요.');
        data.entries=data.entries||{};let entryId;
        if(choice.action==='same'){
          const matches=candidates(data.entries,review),selected=matches.find(e=>e.id===choice.candidateId);
          if(!selected||selected.status==='void')throw Error('기존 기록이 바뀌었거나 취소되어 다시 확인해야 합니다.');
          if(!unambiguousChoice(matches,selected))throw Error('같은 모습의 기존 기록을 구분할 수 없습니다. 장부에서 먼저 확인해 주세요.');
          entryId=selected.id;
        }else{
          if(data.entries[resolvedId])throw Error('같은 번호의 기록이 있어 확인이 필요합니다.');
          const draft={};for(const k of ['kind','date','time','amount','method','category','vendor','memo','evidence','source','createdBy','vatIncluded','status','createdAt','card','check','account','from','to'])if(review.draft[k]!==undefined)draft[k]=review.draft[k];
          if(origin!==undefined)draft.origin=origin;
          const e=window.FinCore.normEntry({...draft,id:resolvedId,updatedAt:new Date().toISOString()});
          window.FinCore.validateEntry(e);data.entries[resolvedId]=e;entryId=resolvedId;
        }
        data.importReviews[id]={...review,status:'RESOLVED',action:choice.action,entryId,resolvedAt:new Date().toISOString()};
        return {changed:true,value:{status:'RESOLVED',entryId}};
      },(data,value)=>data.importReviews?.[id]?.status==='RESOLVED'&&data.importReviews[id].action===choice.action&&data.importReviews[id].entryId===value.entryId);
    },
    async resolveAlertReview(id,choice){
      if(!/^[A-Za-z0-9_-]{1,80}$/.test(String(id||''))||!['same','add'].includes(choice?.action))throw Error('확인 내용을 선택해 주세요.');
      if(choice.action==='same'&&!/^[A-Za-z0-9_-]{1,100}$/.test(String(choice.candidateId||'')))throw Error('기존 기록을 선택해 주세요.');
      const resolvedId='al_review_'+id;
      return changeFinance(data=>{
        const review=data.alertReviews?.[id];
        if(review?.status==='RESOLVED'){
          if(review.action===choice.action&&(choice.action!=='same'||review.entryId===choice.candidateId))return {changed:false,value:{status:'RESOLVED',entryId:review.entryId}};
          throw Error('이미 확인된 알림입니다.');
        }
        if(!review||review.status!=='REVIEW')throw Error('확인할 알림이 없습니다.');
        if(!reviewSelections.has('alert:'+id)||reviewSelections.get('alert:'+id)!==candidateSnapshot(data.entries,review))throw Error('기존 기록 후보가 바뀌었어요. 목록을 다시 열어 확인해 주세요.');
        data.entries=data.entries||{};let entryId;
        if(choice.action==='same'){
          const matches=candidates(data.entries,review),selected=matches.find(e=>e.id===choice.candidateId);
          if(!selected||selected.status==='void')throw Error('기존 기록이 바뀌었거나 취소되어 다시 확인해야 합니다.');
          if(!unambiguousChoice(matches,selected))throw Error('같은 모습의 기존 기록을 구분할 수 없습니다. 장부에서 먼저 확인해 주세요.');
          entryId=selected.id;
        }else{
          if(data.entries[resolvedId])throw Error('같은 번호의 기록이 있어 확인이 필요합니다.');
          const e=window.FinCore.normEntry({id:resolvedId,kind:review.kind,amount:review.amount,date:review.date,time:review.time,method:review.method,
            bankSource:review.bankSource||'',alertAt:review.alertAt||undefined,source:'alert',inboxId:id,vendor:'',memo:'알림 · 직접 확인 (알림 수신 기준)',category:'',evidence:'없음',updatedAt:new Date().toISOString()});
          window.FinCore.validateEntry(e);data.entries[resolvedId]=e;entryId=resolvedId;
        }
        data.alertReviews[id]={...review,status:'RESOLVED',action:choice.action,entryId,resolvedAt:new Date().toISOString()};
        data.inboxSeen=data.inboxSeen||{};const seen=data.inboxSeen[id]||{};
        data.inboxSeen[id]={...seen,...(review.reason==='ID_CONFLICT'&&seen.entryId?{originalEntryId:seen.entryId}:{}),entryId,reviewId:id,pending:false,at:new Date().toISOString()};
        return {changed:true,value:{status:'RESOLVED',entryId}};
      },(data,value)=>data.alertReviews?.[id]?.status==='RESOLVED'&&data.alertReviews[id].action===choice.action&&data.alertReviews[id].entryId===value.entryId);
    },
    // 칸 몇 개만 고치기(분류 정하기 · 취소)
    async patch(id, fields) {
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(id||'')))throw Error('거래 번호를 확인해 주세요.');
      const path=`${PATHS.entries}/${id}`;let before,tag,url;
      if(test)before=await req('GET',path);
      else{url=await dbUrl(`${root}/${path}`);const r=await fetch(url,{cache:'no-store',headers:{'X-Firebase-ETag':'true'}});if(!r.ok)throw Error('거래를 다시 읽지 못했습니다.');tag=r.headers.get('ETag');if(!tag)throw Error('동시 수정 확인이 필요합니다.');before=await r.json();}
      if(!before)throw Error('거래를 찾지 못했습니다.');
      if(before.status==='void'){
        if(fields?.status==='void'&&Object.keys(fields).length===1){book.entries[id]=before;emit();return before;}
        throw Error('취소된 기록은 수정할 수 없습니다.');
      }
      const next={...before,...fields,updatedAt:new Date().toISOString()};
      if(test){const current=await req('GET',path);if(JSON.stringify(current)!==JSON.stringify(before))throw Error('다른 곳에서 수정됐어요. 다시 확인해 주세요.');await req('PUT',path,next);}
      else{const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':tag},body:JSON.stringify(next)});if(r.status===412)throw Error('다른 곳에서 수정됐어요. 다시 확인해 주세요.');if(!r.ok)throw Error('저장하지 못했습니다.');}
      const saved=await req('GET',path);if(!saved||saved.updatedAt!==next.updatedAt||Object.keys(fields).some(k=>!sameStored(saved[k],fields[k])))throw Error('저장 결과를 다시 확인해 주세요.');
      book.entries[id]=saved;emit();return saved;
    },
    async saveReceipt(id, dataUrl) {
      if (String(dataUrl).length > 420000) throw Error('사진이 너무 큽니다(줄인 뒤에도 300KB 초과).');
      await req('PUT', `${PATHS.receipts}/${id}`, { data: dataUrl, at: new Date().toISOString() });
      return id;
    },
    // Two rows must become one transfer atomically. ETag retries preserve every unrelated row.
    async reconcileBankTransfers() {
      const F = window.FinCore; if (!F.bankTransferPairs) return 0;
      const result=await changeFinance(async data=>{
        data.entries=data.entries||{};const pending=Object.entries(data.alertReviews||{}).map(([id,r])=>bankPendingEvent(id,r)).filter(Boolean);
        const pairs=F.bankTransferPairs(data.entries,new Date(),pending),checks=[];
        for(const pair of pairs){
          const originals={},stamps={},rowChecks={};for(const row of pair.rows){F.validateEntry(row);originals[row.id]=clone(data.entries[row.id]);rowChecks[row.id]=F.transferRowStamp(row);stamps[row.id]=await safeDigest(rowChecks[row.id]);data.entries[row.id]=row;}
          data.transferPairProofs=data.transferPairProofs||{};data.transferPairProofs[pair.transferId]={version:1,pairedAt:pair.rows[0].updatedAt,originals,stamps};checks.push({id:pair.transferId,stamps:rowChecks});
        }
        const changedReviews=await updateTransferReviews(data);
        if(!pairs.length&&!changedReviews)return {changed:false,value:{count:0,checks:[],reviews:[]}};
        const reviews=Object.entries(data.transferReviews||{}).filter(([,r])=>r.status==='REVIEW').map(([id,r])=>({id,signature:r.signature}));
        return {changed:true,value:{count:pairs.length,checks,reviews}};
      },(data,value)=>value.checks.every(c=>Object.entries(c.stamps).every(([id,stamp])=>F.transferRowStamp(data.entries?.[id])===stamp)&&data.transferPairProofs?.[c.id]?.version===1)&&value.reviews.every(c=>data.transferReviews?.[c.id]?.signature===c.signature));
      return result.count;
    },
    // 알림 입구(hub/financeInbox/<키>/<id>)의 새 글 → 초안 줄(확인 필요, 규칙표에 있으면 바로 분류) → 처리 표시(inboxSeen).
    // 입구 규칙 · 휴대폰 설정 전에는 입구가 비어 있어 아무 일도 하지 않는다. PC AI도 같은 순서로 처리한다(fin_hub.py, 2단계).
    async processInbox() {
      if (inboxRun) return inboxRun;
      inboxRun = (async () => {
        const F = window.FinCore;
        const legacy = test ? test.__inbox : await reqAbs('GET', INBOX_ROOT);
        let rawInbox;
        if (test) rawInbox = test.__rawInbox;
        else {
          try { rawInbox = await reqAbs('GET', RAW_INBOX_ROOT); }
          catch (err) { if (state !== 'denied') throw err; status('ok'); }
        }
        // REVIEW is nested so older clients cannot mistake an uncertain alert for a transaction.
        const inbox = [...Object.values(legacy || {}), ...Object.values(rawInbox || {}).map(group => Object.fromEntries(Object.entries(group || {}).flatMap(([id,item]) => id==='review'&&item&&typeof item==='object' ? Object.entries(item).map(([rid,row])=>[rid,{...row,rawInbox:true}]) : [[id,{...item,rawInbox:true}]])))];
        if (!inbox) return 0;
        let made = 0, tests = 0;
        for (const items of Object.values(inbox)) for (const [id, item] of Object.entries(items || {})) {
          // 휴대폰 수동 연결 시험은 입구에만 보존하고 실제 지출/중복 판정에는 넣지 않는다.
          if (/^md_trial_/.test(id)) { tests++; continue; }
          if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))continue;
          const outcome=await changeFinance(async data=>{
            data.inboxSeen=data.inboxSeen||{};
            const previous=data.inboxSeen[id];
            if(previous){
              // The immutable safe fields reveal some ID collisions; old receipts have no such evidence.
              if(previous.event&&!data.alertReviews?.[id]&&item.review!==true){
                const repeated=F.draftFromAlert({...item,id},data.meta?.rules);
                const identity=repeated&&await alertIdentity(repeated);
                if(identity&&Object.keys(identity).some(k=>previous.event[k]!==identity[k])){
                  F.validateEntry(repeated);data.alertReviews=data.alertReviews||{};
                  data.alertReviews[id]={...safeAlert(repeated),reason:'ID_CONFLICT'};await updateTransferReviews(data);
                  return {changed:true,value:'collision'};
                }
              }
              return {changed:false,value:'seen'};
            }
            if(data.alertReviews?.[id])return {changed:false,value:'seen'};
            if(item.review===true){
              const safe=F.bankReview({...item,id});if(!safe)return {changed:false,value:'ignored'};
              data.bankReviews=data.bankReviews||{};const old=data.bankReviews[id];
              if(old&&(old.src!==safe.src||old.ts!==safe.ts))throw Error('기존 은행 확인 항목이 달라 다시 확인해야 합니다.');
              if(!old)data.bankReviews[id]=safe;
              data.inboxSeen[id]={reviewId:id,skipped:false,at:new Date().toISOString()};
              return {changed:true,value:'review'};
            }
            const draft=F.draftFromAlert({...item,id},data.meta?.rules);data.entries=data.entries||{};
            if(!draft){data.inboxSeen[id]={skipped:true,at:new Date().toISOString()};return {changed:true,value:'ignored'};}
            F.validateEntry(draft);
            if(data.entries[draft.id]||candidates(data.entries,draft).length){
              data.alertReviews=data.alertReviews||{};
              data.alertReviews[id]={...safeAlert(draft),reason:data.entries[draft.id]?'ID_CONFLICT':'POSSIBLE_DUPLICATE'};
              data.inboxSeen[id]={reviewId:id,pending:true,event:await alertIdentity(draft),at:new Date().toISOString()};await updateTransferReviews(data);
              return {changed:true,value:'pending'};
            }
            data.entries[draft.id]=draft;data.inboxSeen[id]={entryId:draft.id,event:await alertIdentity(draft),at:new Date().toISOString()};await updateTransferReviews(data);
            return {changed:true,value:'added'};
          },(data,value)=>value==='added'?!!data.entries?.[data.inboxSeen?.[id]?.entryId]:value==='review'?!!data.bankReviews?.[id]:value==='pending'?!!data.inboxSeen?.[id]?.pending&&!!data.alertReviews?.[id]:value==='collision'?data.alertReviews?.[id]?.reason==='ID_CONFLICT':!!data.inboxSeen?.[id]?.skipped);
          if(outcome==='added'||outcome==='review')made++;
        }
        await this.reconcileBankTransfers();
        book.inboxTestCount = tests; emit();
        return made;
      })();
      try { return await inboxRun; } finally { inboxRun = null; }
    },
    async addRule(rule) {
      const rules = [...(book.meta.rules || []).filter(r => r.match !== rule.match), rule];
      await req('PUT', `${PATHS.meta}/rules`, rules);
      book.meta.rules = rules; emit(); return rules;
    },
    watch(ms = 60000) {
      const refresh = () => load().then(() => api.processInbox()).catch(() => {});
      clearInterval(timer); timer = setInterval(refresh, ms);
      if (typeof document !== 'undefined') {
        if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = () => { if (!document.hidden) refresh(); };
        document.addEventListener('visibilitychange', visibilityHandler);
      }
    },
    close() { closed=true;closeController.abort();reviewSelections.clear();clearInterval(timer); if (visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityHandler); }
  };
  return api;
}

// 영수증 사진 줄이기: 긴 변 1280px, JPEG 품질을 낮춰 가며 300KB 이하로
export async function shrinkPhoto(file, maxBytes = 300000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(Error('사진을 읽지 못했습니다.')); i.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.65, 0.5, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length * 0.75 <= maxBytes) return d; }
    throw Error('사진을 300KB 아래로 줄이지 못했습니다.');
  } finally { URL.revokeObjectURL(url); }
}
