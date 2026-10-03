(function (root) {
  'use strict';
  const VERSION = 1;
  const STORAGE_KEY = 'mumutori-private-finance-v3';
  const PEOPLE = ['김현수', '백다희'];
  const BANK_CATEGORIES = ['매출 수금','채널 정산','자금 충전','대여금 회수','자금입금·용도 확인','차입금 입금','상품 매입','배송·통관','운영비','광고비','기타 사업지출','매입 예치금 충전','대여금 지급','차입금 상환','개인자금 인출','개인 대납비 상환','계좌이체','이자','캐시백','기타','미분류','기록'];
  const STATUS = ['판매 중','판매 준비','판매 중단','품절','자재','확인 필요'];
  const MOVE_TYPES = ['실사','입고','출고','반품입고','반품출고','폐기','창고이동'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const num = value => Number(value) || 0;
  const active = rows => (rows || []).filter(x => !x.voided);
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const uid = prefix => prefix + '-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const sum = (rows, field) => rows.reduce((n,r) => n + num(typeof field === 'function' ? field(r) : r[field]),0);
  const person = row => PEOPLE.find(n => [row.description,row.counterparty,row.ownerName].filter(Boolean).join(' ').includes(n)) || '';
  const isTransfer = row => !!row.transferId || row.category === '계좌이체' || row.category === '자금이동';
  function bankCategory(row) {
    if (isTransfer(row)) return '계좌이체';
    if (row.direction === '입금' && person(row)) {
      if (row.category === '대여금 회수') return '대여금 회수';
      if (['사업주 투입','자금 충전','차입금 입금'].includes(row.category)) return '자금 충전';
      return '자금입금·용도 확인';
    }
    return ({'사업주 투입':'자금 충전','사업주 인출':'개인자금 인출','자금이동':'계좌이체'})[row.category] || row.category || '미분류';
  }
  function allowedCategories(row) {
    if (row.transferId) return ['계좌이체'];
    if (row.direction === '입금' && person(row)) return ['자금 충전','대여금 회수','자금입금·용도 확인'];
    if(row.direction === '기록')return ['기록'];
    const incoming=['매출 수금','채널 정산','자금 충전','대여금 회수','자금입금·용도 확인','차입금 입금','계좌이체','이자','캐시백','기타','미분류'];
    return row.direction==='입금'?incoming:BANK_CATEGORIES.filter(x=>!incoming.filter(c=>!['계좌이체','기타','미분류'].includes(c)).includes(x)&&x!=='기록');
  }
  function normalizeBank(row) {
    const category=bankCategory(row);
    return {...row,category,amount:num(row.amount),signedAmount:row.direction==='출금'?-num(row.amount):row.direction==='입금'?num(row.amount):0,
      ...(category!==row.category?{erpOriginalCategory:row.erpOriginalCategory||row.category,classificationBasis:'ERP 자금 분류 기준 적용'}:{})};
  }
  function migrate(input) {
    const d=clone(input);
    for(const key of ['products','purchaseOrders','purchaseLines','stockMoves','bankTransactions'])d[key]=Array.isArray(d[key])?d[key]:[];
    d.finance=d.finance||{};
    for(const key of ['channelTransactions','channelCosts','channelCostDetails','sourceFiles','purchaseEvidence','productLinks'])d.finance[key]=Array.isArray(d.finance[key])?d.finance[key]:[];
    if(!d.bankTransactions.length&&d.finance.bankTransactions?.length)d.bankTransactions=d.finance.bankTransactions;
    d.bankTransactions=d.bankTransactions.map(normalizeBank);
    d.finance.bankTransactions=d.bankTransactions;
    d.erp={version:VERSION,revision:0,accounts:[],partners:[],movements:[],audit:[],warehouses:['기본 창고'],...d.erp};
    if(!d.erp.warehouses?.length)d.erp.warehouses=['기본 창고'];
    if(!d.erp.accounts?.length){
      const names=[...new Set(d.bankTransactions.map(t=>t.accountLabel||t.account).filter(Boolean))];
      d.erp.accounts=names.map(name=>({id:name,name,mode:'수동 기록',openingDate:'',openingBalance:null}));
    }
    d.products=d.products.map(p=>({...p,salesStatus:p.salesStatus||(p.type==='부자재'?'자재':p.active===false?'판매 중단':'확인 필요')}));
    return d;
  }
  function validDate(value,label='날짜') {
    const parsed=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw Error(label+'를 올바르게 입력하세요.');
  }
  function finite(value,label,{min=-Infinity,integer=false,required=true}={}) {
    if(value===''||value==null){if(required)throw Error(label+'를 입력하세요.');return null;}
    const n=Number(value);
    if(!Number.isFinite(n)||n<min||(integer&&!Number.isInteger(n)))throw Error(label+'를 올바르게 입력하세요.');
    return n;
  }
  function validateBank(row,d) {
    validDate(row.date);
    finite(row.amount,'금액',{min:row.direction==='기록'?0:1,integer:true});
    if(!['입금','출금','기록'].includes(row.direction))throw Error('입출금 구분을 선택하세요.');
    if(!row.description?.trim())throw Error('거래 내용을 입력하세요.');
    if(!d.erp.accounts.some(a=>a.id===row.accountLabel))throw Error('계좌를 선택하세요.');
    if(!allowedCategories(row).includes(row.category))throw Error('거래 성격에 맞는 분류를 선택하세요. 김현수·백다희 입금은 매출로 분류할 수 없습니다.');
    if(active(d.finance.channelTransactions).some(s=>(s.linkedBankIds||[]).includes(row.id))&&
      (row.direction!=='입금'||person(row)||isTransfer(row)||!['매출 수금','채널 정산'].includes(row.category)))throw Error('매출에 연결된 수금입니다. 매출에서 연결을 해제한 뒤 자금 분류를 변경하세요.');
  }
  function validateProduct(row,d,isNew) {
    if(!row.id?.trim()||!row.name?.trim())throw Error('상품 관리번호와 상품명을 입력하세요.');
    if(!/^[A-Za-z0-9가-힣_-]+$/.test(row.id))throw Error('상품 관리번호는 글자, 숫자, -와 _로 입력하세요.');
    if(isNew&&d.products.some(p=>p.id===row.id))throw Error('이미 사용 중인 상품 관리번호입니다.');
    if(!STATUS.includes(row.salesStatus))throw Error('판매 상태를 선택하세요.');
    finite(row.price,'판매가',{min:0,integer:true,required:false});
    finite(row.safetyStock,'안전재고',{min:0,integer:true,required:false});
  }
  function purchases(d) {
    const evidence=d.finance.purchaseEvidence||[];
    const out=evidence.map(e=>({...d.purchaseOrders.find(o=>o.orderNo===e.orderNo),...e,id:e.orderNo,
      lines:d.purchaseLines.filter(l=>l.orderNo===e.orderNo&&!l.voided)}));
    for(const o of d.purchaseOrders){
      if(out.some(e=>e.orderNo===o.orderNo))continue;
      out.push({...o,id:o.orderNo,date:o.receivedAt,vendor:o.vendor||'토스토스',purchase:null,shipping:null,customs:null,
        lines:d.purchaseLines.filter(l=>l.orderNo===o.orderNo||l.orderId===o.id)});
    }
    return out;
  }
  function purchaseCost(o) {
    const fields=[o.purchase,o.shipping,o.customs];
    const known=fields.reduce((n,v)=>n+num(v),0);
    const complete=fields.every(v=>v!==''&&v!=null);
    const credit=num(o.vatCredit);
    return {known,complete,total:complete?known:null,net:complete?known-credit:null};
  }
  function allocation(o,line) {
    const cost=purchaseCost(o);if(!cost.complete)return null;
    const lines=o.lines||[];
    const has=v=>v!==''&&v!=null;
    const hasKRW=lines.some(l=>has(l.amountKRW));
    const hasCNY=lines.some(l=>has(l.amountCNY));
    if(hasKRW&&!lines.every(l=>has(l.amountKRW)))return null;
    if(!hasKRW&&hasCNY&&!lines.every(l=>has(l.amountCNY)))return null;
    const weight=l=>hasKRW?num(l.amountKRW):hasCNY?num(l.amountCNY):num(l.qty);
    const weights=sum(lines,weight),qty=sum(lines,'qty');
    if(!weights||!qty||!num(line.qty))return null;
    return ((num(o.purchase)+num(o.customs)-num(o.vatCredit))*weight(line)/weights+num(o.shipping)*num(line.qty)/qty)/num(line.qty);
  }
  function movementDelta(m,warehouse) {
    if(m.type==='창고이동')return m.warehouse===warehouse?-num(m.qty):m.toWarehouse===warehouse?num(m.qty):0;
    if(m.warehouse!==warehouse)return 0;
    return ['출고','반품출고','폐기'].includes(m.type)?-num(m.qty):num(m.qty);
  }
  const sortedMoves=(d,sku)=>active(d.erp.movements).filter(m=>m.sku===sku).sort((a,b)=>(a.date+'|'+(a.createdAt||a.id)).localeCompare(b.date+'|'+(b.createdAt||b.id)));
  function stock(d,sku,warehouse='기본 창고') {
    let qty=0,known=false,lastCount='',delta=0;
    for(const m of sortedMoves(d,sku)){
      if(m.type==='실사'&&m.warehouse===warehouse){qty=num(m.qty);known=true;lastCount=m.date;delta=0;}
      else{const amount=movementDelta(m,warehouse);qty+=amount;delta+=amount;}
    }
    return {qty:known?qty:null,delta,lastCount,known};
  }
  function moved(d,sourceType,sourceId,sku,exceptId) {
    return sum(active(d.erp.movements).filter(m=>m.id!==exceptId&&m.sourceType===sourceType&&m.sourceId===sourceId&&m.sku===sku&&((sourceType==='purchase'&&m.type==='입고')||(sourceType==='sale'&&m.type==='출고'))),'qty');
  }
  function validateStockHistory(d,sku) {
    for(const warehouse of d.erp.warehouses){
      let balance=null;
      for(const m of sortedMoves(d,sku)){
        if(m.type==='실사'&&m.warehouse===warehouse)balance=num(m.qty);
        else if(balance!==null)balance+=movementDelta(m,warehouse);
        if(balance!==null&&balance<0)throw Error('기록 후 재고가 음수가 됩니다. 실사 수량과 입출고 날짜를 확인하세요.');
      }
    }
  }
  function validateMovement(row,d) {
    validDate(row.date);
    if(!d.products.some(p=>p.id===row.sku))throw Error('상품을 선택하세요.');
    if(!MOVE_TYPES.includes(row.type))throw Error('입출고 구분을 선택하세요.');
    finite(row.qty,'수량',{min:row.type==='실사'?0:1,integer:true});
    if(!d.erp.warehouses.includes(row.warehouse))throw Error('창고를 선택하세요.');
    if(row.type==='창고이동'&&(!d.erp.warehouses.includes(row.toWarehouse)||row.toWarehouse===row.warehouse))throw Error('다른 도착 창고를 선택하세요.');
    if(row.sourceType==='purchase'){
      const po=purchases(d).find(p=>p.orderNo===row.sourceId&&!p.voided);
      if(row.type!=='입고'||!po)throw Error('연결할 매입과 입고 구분을 확인하세요.');
      const purchased=sum(po.lines.filter(l=>l.sku===row.sku),'qty');
      if(moved(d,'purchase',row.sourceId,row.sku,row.id)+num(row.qty)>purchased)throw Error('매입 수량을 초과하여 중복 입고할 수 없습니다.');
    }
    if(row.sourceType==='sale'){
      const sale=active(d.finance.channelTransactions).find(s=>s.id===row.sourceId);
      if(row.type!=='출고'||!sale||sale.sku!==row.sku)throw Error('연결할 매출의 상품과 출고 구분을 확인하세요.');
      if(moved(d,'sale',row.sourceId,row.sku,row.id)+num(row.qty)>num(sale.quantity))throw Error('주문 수량을 초과하여 중복 출고할 수 없습니다.');
    }
    const next=clone(d);
    next.erp.movements=next.erp.movements.filter(m=>m.id!==row.id).concat(row);
    validateStockHistory(next,row.sku);
    const previous=d.erp.movements.find(m=>m.id===row.id);
    if(previous&&previous.sku!==row.sku)validateStockHistory(next,previous.sku);
  }
  function eligibleBank(d,sale) {
    const used=new Set(active(d.finance.channelTransactions).filter(s=>s.id!==sale.id).flatMap(s=>s.linkedBankIds||[]));
    return active(d.bankTransactions).filter(t=>t.direction==='입금'&&!person(t)&&!isTransfer(t)&&['매출 수금','채널 정산'].includes(bankCategory(t))&&!used.has(t.id));
  }
  function saleTotals(d,s) {
    const expected=s.settlementBase==null?num(s.salesGross)-num(s.feeNet)-num(s.feeVAT):num(s.settlementBase);
    const ids=s.linkedBankIds||[];
    const received=sum(active(d.bankTransactions).filter(t=>ids.includes(t.id)),'amount');
    return {expected,received,due:expected-received,status:ids.length?(received===expected?'수금 완료':received>expected?'초과 수금':'일부 수금'):'수금 미연결'};
  }
  function validateSale(row,d) {
    validDate(row.date);
    if(!row.orderId?.trim()||!row.productName?.trim()||!row.channel?.trim())throw Error('주문번호, 품목명, 판매 채널을 입력하세요.');
    finite(row.quantity,'판매 수량',{integer:true});
    if(!num(row.quantity))throw Error('판매 수량은 0일 수 없습니다.');
    finite(row.salesGross,'매출 금액',{integer:true});
    if(num(row.quantity)*num(row.salesGross)<0)throw Error('반품은 수량과 매출 금액을 모두 음수로 기록하세요.');
    for(const key of ['feeNet','feeVAT','settlementBase'])finite(row[key],'수수료·정산 금액',{integer:true});
    if(row.sku&&!d.products.some(p=>p.id===row.sku))throw Error('상품 관리번호를 확인하세요.');
    const old=d.finance.channelTransactions.find(s=>s.id===row.id);
    const linked=active(d.erp.movements).filter(m=>m.sourceType==='sale'&&m.sourceId===row.id);
    if(linked.length&&(old?.sku!==row.sku||sum(linked.filter(m=>m.type==='출고'),'qty')>num(row.quantity)))throw Error('연결된 출고 내역을 먼저 수정하세요.');
    const eligible=new Set(eligibleBank(d,row).map(t=>t.id));
    if((row.linkedBankIds||[]).some(id=>!eligible.has(id)))throw Error('개인 자금 입금 또는 다른 매출에 연결된 거래는 수금으로 연결할 수 없습니다.');
  }
  function validatePurchase(row,d) {
    if(!row.orderNo?.trim()||!row.vendor?.trim())throw Error('매입번호와 구매처를 입력하세요.');
    validDate(row.date);
    for(const key of ['purchase','shipping','customs','vatCredit'])finite(row[key],'원가 금액',{min:0,integer:true,required:false});
    if(num(row.vatCredit)>purchaseCost(row).known)throw Error('공제 부가세가 결제액보다 큽니다.');
    if(!row.lines?.length)throw Error('매입 품목을 한 개 이상 추가하세요.');
    for(const l of row.lines){
      if(!l.sku||!d.products.some(p=>p.id===l.sku))throw Error('매입 품목의 상품을 선택하세요.');
      finite(l.qty,'매입 수량',{min:1,integer:true});
      finite(l.amountKRW,'상품금액',{min:0,integer:true,required:false});
    }
    for(const sku of new Set(d.erp.movements.filter(m=>m.sourceType==='purchase'&&m.sourceId===row.orderNo).map(m=>m.sku))){
      if(moved(d,'purchase',row.orderNo,sku)>sum(row.lines.filter(l=>l.sku===sku),'qty'))throw Error('이미 입고한 수량보다 매입 수량을 줄일 수 없습니다. 입고 내역을 먼저 수정하세요.');
    }
  }
  const collections={product:d=>d.products,bank:d=>d.bankTransactions,sale:d=>d.finance.channelTransactions,purchase:d=>d.finance.purchaseEvidence,movement:d=>d.erp.movements,partner:d=>d.erp.partners,account:d=>d.erp.accounts};
  const keyOf=(type,r)=>type==='purchase'?r.orderNo:r.id;
  function record(d,type,row,{isNew=false,action='저장'}={}) {
    const next=clone(d),rows=collections[type](next),key=keyOf(type,row),index=rows.findIndex(r=>keyOf(type,r)===key);
    if(isNew&&index>=0)throw Error('같은 관리번호가 이미 존재합니다.');
    const before=index>=0?clone(rows[index]):null;
    const normalized={...before,...clone(row),updatedAt:new Date().toISOString()};
    if(type==='product')validateProduct(normalized,d,isNew);
    if(type==='bank')validateBank(normalized,d);
    if(type==='sale')validateSale(normalized,d);
    if(type==='purchase')validatePurchase(normalized,d);
    if(type==='movement')validateMovement(normalized,d);
    if(type==='partner'&&!normalized.name?.trim())throw Error('거래처명을 입력하세요.');
    if(type==='account'&&!normalized.name?.trim())throw Error('계좌 이름을 입력하세요.');
    if(type==='purchase'){
      normalized.lines=normalized.lines.map((l,i)=>({...l,id:l.id||uid('pl'),orderNo:normalized.orderNo,lineNo:i+1,qty:num(l.qty),amountKRW:l.amountKRW===''?null:l.amountKRW}));
      next.purchaseLines=next.purchaseLines.filter(l=>l.orderNo!==normalized.orderNo).concat(normalized.lines);
      delete normalized.lines;
    }
    if(type==='bank')Object.assign(normalized,normalizeBank(normalized));
    if(index<0)rows.push(normalized);else rows[index]=normalized;
    next.finance.bankTransactions=next.bankTransactions;
    appendAudit(next,type,key,action,before,normalized);
    return next;
  }
  function appendAudit(d,type,key,action,before,after) {
    const fields=[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(k=>!['raw','imageData','updatedAt','createdAt'].includes(k)&&JSON.stringify(before?.[k])!==JSON.stringify(after?.[k]));
    d.erp.audit=[{id:uid('log'),date:new Date().toISOString(),type,recordId:key,action,fields,
      label:after?.name||after?.description||after?.productName||after?.orderNo||key},...d.erp.audit].slice(0,1500);
  }
  function toggleVoid(d,type,id,reason='') {
    const next=clone(d),row=collections[type](next).find(r=>keyOf(type,r)===id);
    if(!row)throw Error('기록을 찾을 수 없습니다.');
    if(type==='product')throw Error('상품은 판매 상태로 관리하세요.');
    if(!row.voided){
      if(!reason.trim())throw Error('취소 사유를 입력하세요.');
      if(type==='bank'&&row.transferId)throw Error('서로 연결된 계좌이체는 원본 내역과 함께 확인해야 합니다. 단독 취소할 수 없습니다.');
      if(type==='bank'&&active(d.finance.channelTransactions).some(s=>(s.linkedBankIds||[]).includes(id)))throw Error('매출 수금 연결을 먼저 해제하세요.');
      if(['sale','purchase'].includes(type)&&active(d.erp.movements).some(m=>m.sourceType===type&&m.sourceId===id))throw Error('연결된 입출고를 먼저 취소하세요.');
    }
    const before=clone(row);row.voided=!row.voided;row.voidReason=reason;row.updatedAt=new Date().toISOString();
    if(!row.voided&&type==='sale')validateSale(row,next);
    if(!row.voided&&type==='bank')validateBank(row,next);
    if(type==='movement'){
      if(!row.voided)validateMovement(row,next);
      else{
        validateStockHistory(next,row.sku);
      }
    }
    appendAudit(next,type,id,row.voided?'취소':'복구',before,row);
    next.finance.bankTransactions=next.bankTransactions;
    return next;
  }
  function financeSummary(d,month='') {
    const inPeriod=r=>!month||r.date?.startsWith(month);
    const bank=active(d.bankTransactions).filter(inPeriod),sales=active(d.finance.channelTransactions).filter(inPeriod);
    return {salesGross:sum(sales,'salesGross'),salesCount:sales.length,expected:sum(sales,s=>saleTotals(d,s).expected),
      inflow:sum(bank.filter(t=>t.direction==='입금'&&!isTransfer(t)),'amount'),outflow:sum(bank.filter(t=>t.direction==='출금'&&!isTransfer(t)),'amount'),
      funding:sum(bank.filter(t=>t.direction==='입금'&&['자금 충전','자금입금·용도 확인'].includes(bankCategory(t))),'amount'),
      loanReceived:sum(bank.filter(t=>t.direction==='입금'&&bankCategory(t)==='대여금 회수'),'amount'),
      pending:bank.filter(t=>['미분류','자금입금·용도 확인'].includes(bankCategory(t))).length,
      receivable:sum(sales.filter(s=>(s.linkedBankIds||[]).length),s=>Math.max(0,saleTotals(d,s).due)),unlinked:sales.filter(s=>!(s.linkedBankIds||[]).length).length};
  }
  function validateBackup(raw) {
    if(!raw||!Array.isArray(raw.products)||!Array.isArray(raw.bankTransactions)||!raw.finance)throw Error('무무토리 전체 백업 JSON을 선택하세요.');
    for(const rows of [raw.products,raw.bankTransactions,raw.purchaseLines||[],raw.finance.channelTransactions||[],raw.erp?.movements||[]]){
      const ids=new Set();for(const r of rows){if(!r.id||ids.has(r.id))throw Error('백업에 중복되거나 비어 있는 관리번호가 있습니다.');ids.add(r.id);}
    }
    for(const t of raw.bankTransactions){validDate(t.date);finite(t.amount,'백업 거래 금액',{min:0});}
    return migrate(raw);
  }
  function mergeBackup(current,incoming,preferIncoming=false) {
    const next=clone(current),report={added:0,conflicts:0};
    function merge(a,b,key='id'){
      const rows=clone(a||[]),map=new Map(rows.map((r,i)=>[r[key],i]));
      for(const r of b||[]){if(!map.has(r[key])){map.set(r[key],rows.length);rows.push(clone(r));report.added++;}
      else if(JSON.stringify(rows[map.get(r[key])])!==JSON.stringify(r)){report.conflicts++;if(preferIncoming)rows[map.get(r[key])]=clone(r);}}
      return rows;
    }
    for(const key of ['products','bankTransactions','purchaseLines','purchaseOrders','stockMoves'])next[key]=merge(next[key],incoming[key]);
    for(const key of ['channelTransactions','channelCosts','channelCostDetails','sourceFiles'])next.finance[key]=merge(next.finance[key],incoming.finance[key]);
    next.finance.purchaseEvidence=merge(next.finance.purchaseEvidence,incoming.finance.purchaseEvidence,'orderNo');
    for(const key of ['accounts','partners','movements'])next.erp[key]=merge(next.erp[key],incoming.erp[key]);
    next.erp.warehouses=[...new Set([...next.erp.warehouses,...incoming.erp.warehouses])];
    next.finance.bankTransactions=next.bankTransactions;
    for(const s of active(next.finance.channelTransactions).filter(s=>(s.linkedBankIds||[]).length))validateSale(s,next);
    for(const m of active(next.erp.movements))validateMovement(m,next);
    appendAudit(next,'backup','backup','백업 병합',null,{name:report.added+'건 추가 · '+report.conflicts+'건 차이 확인'});
    return {data:next,report};
  }
  function parseCSV(text) {
    const rows=[];let row=[],value='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(value);value='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value='';}
      else value+=c;
    }
    if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');
    row.push(value);if(row.some(Boolean))rows.push(row);return rows;
  }
  function csvImport(text,d) {
    const [headers,...rows]=parseCSV(text);
    if(!headers||!['날짜','계좌','구분','금액','내용'].every(k=>headers.includes(k)))throw Error('CSV 양식의 날짜·계좌·구분·금액·내용 열이 필요합니다.');
    const seen=new Set(d.bankTransactions.map(r=>[r.date,r.accountLabel,r.direction,r.amount,r.description].join('|')));
    const result={rows:[],duplicates:0};
    for(const [i,values] of rows.entries()){
      const f=Object.fromEntries(headers.map((k,n)=>[k,values[n]||'']));
      const amount=Number(f['금액'].replace(/,/g,''));
      const account=d.erp.accounts.find(a=>a.id===f['계좌']||a.name===f['계좌']);
      const r=normalizeBank({id:uid('bank'),date:f['날짜'],accountLabel:account?.id||f['계좌'],account:account?.id||f['계좌'],direction:f['구분'],amount,description:f['내용'],category:f['분류']||'미분류',memo:f['메모']||'',sourceFile:'사용자 CSV',sourceRow:i+2});
      try{validateBank(r,d);}catch(e){throw Error((i+2)+'행: '+e.message);}
      const key=[r.date,r.accountLabel,r.direction,r.amount,r.description].join('|');
      if(seen.has(key)){result.duplicates++;continue;}seen.add(key);result.rows.push(r);
    }
    return result;
  }
  const api={VERSION,STORAGE_KEY,PEOPLE,BANK_CATEGORIES,STATUS,MOVE_TYPES,clone,num,active,today,uid,sum,person,isTransfer,bankCategory,allowedCategories,normalizeBank,migrate,validDate,finite,
    purchases,purchaseCost,allocation,stock,moved,validateMovement,eligibleBank,saleTotals,record,toggleVoid,financeSummary,validateBackup,mergeBackup,parseCSV,csvImport,appendAudit};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MumutoriERP=api;
})(typeof window!=='undefined'?window:globalThis);
