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
  let book = { entries: {}, sales: {}, meta: {}, bankReviews: {}, alertReviews: {}, importReviews: {} }, timer = 0, state = '', inboxRun = null, visibilityHandler = null;
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
      const [entries, sales, meta, bankReviews, alertReviews, importReviews] = await Promise.all([req('GET', PATHS.entries), req('GET', PATHS.sales), req('GET', PATHS.meta), req('GET','bankReviews'), req('GET','alertReviews'), req('GET','importReviews')]);
      book = { entries: entries || {}, sales: sales || {}, meta: meta || {}, bankReviews:bankReviews || {}, alertReviews:alertReviews || {}, importReviews:importReviews || {}, inboxTestCount:book.inboxTestCount };
      status('ok'); emit(); return clone(book);
    } catch (err) { if (state !== 'denied') status('offline'); throw err; }
  }
  // Root compare-and-set couples the row, review and receipt marker, without discarding other data.
  async function readFinance() {
    ensureActive();
    if(test)return {data:clone(test),tag:'test'};
    const url=await dbUrl(root);ensureActive();const r=await fetch(url,{cache:'no-store',headers:{'X-Firebase-ETag':'true'},signal:closeController.signal});ensureActive();
    if(!r.ok)throw Error('장부를 다시 읽지 못했습니다.');
    const tag=r.headers.get('ETag');if(!tag)throw Error('동시 수정 확인이 필요합니다.');
    const data=await r.json()||{};ensureActive();return {data,tag,url};
  }
  function refreshBook(data){
    book={...book,entries:data.entries||{},sales:data.sales||{},meta:data.meta||{},bankReviews:data.bankReviews||{},alertReviews:data.alertReviews||{},importReviews:data.importReviews||{}};emit();
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
      for (let attempt = 0; attempt < 3; attempt++) {
        let entries, tag, url;
        if (test) entries = await req('GET', PATHS.entries) || {};
        else {
          url = await dbUrl(`${root}/${PATHS.entries}`);
          const response = await fetch(url, {cache:'no-store',headers:{'X-Firebase-ETag':'true'}});
          if (!response.ok) throw Error('이동 짝을 확인할 장부를 읽지 못했습니다.');
          entries = await response.json() || {}; tag = response.headers.get('ETag');
          if (!tag) throw Error('이동 짝의 동시 수정 확인이 필요합니다.');
        }
        const pairs = F.bankTransferPairs(entries); if (!pairs.length) return 0;
        const next = clone(entries);
        for (const pair of pairs) for (const row of pair.rows) { F.validateEntry(row); next[row.id] = row; }
        if (test) await req('PUT', PATHS.entries, next);
        else {
          const response = await fetch(url, {method:'PUT',headers:{'Content-Type':'application/json','if-match':tag},body:JSON.stringify(next)});
          if (response.status === 412) continue;
          if (!response.ok) throw Error('내 계좌 이동 짝을 저장하지 못했습니다.');
        }
        const saved = await req('GET', PATHS.entries);
        for (const pair of pairs) for (const row of pair.rows) {
          if (saved?.[row.id]?.transferId !== pair.transferId || saved[row.id].kind !== 'move') throw Error('이동 짝 재조회가 달라 확인이 필요합니다.');
        }
        book.entries = saved; emit(); return pairs.length;
      }
      throw Error('다른 기기에서 장부를 수정 중입니다. 다음 수집 때 이동 짝을 다시 확인합니다.');
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
                  data.alertReviews[id]={...safeAlert(repeated),reason:'ID_CONFLICT'};
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
              data.inboxSeen[id]={reviewId:id,pending:true,event:await alertIdentity(draft),at:new Date().toISOString()};
              return {changed:true,value:'pending'};
            }
            data.entries[draft.id]=draft;data.inboxSeen[id]={entryId:draft.id,event:await alertIdentity(draft),at:new Date().toISOString()};
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
