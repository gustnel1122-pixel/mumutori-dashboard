import { onAuth as onActivityAuth } from './fbauth.js';
onActivityAuth(()=>{});
const { DEPARTMENTS, icon, departmentCards, workflowStrip, menuGroups } = await import(`./departments.js?v=${document.body.dataset.build}`);
const { createStore } = await import(`./store.js?v=${document.body.dataset.build}`);
(async function () {
  'use strict';
  const C=window.MumutoriERP;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const won=v=>v==null?'미확정':Number(v).toLocaleString('ko-KR');
  const money=v=>won(v)+(v==null?'':'원');
  const dateTime=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  const badge=(text,tone='')=>`<span class="badge ${tone}">${esc(text)}</span>`;
  const btn=(text,action,args={},className='')=>`<button type="button" class="${className}" data-action="${action}" ${Object.entries(args).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(text)}</button>`;
  const options=(values,selected,empty)=>`${empty!=null?`<option value="">${esc(empty)}</option>`:''}${values.map(v=>{const [id,label]=Array.isArray(v)?v:[v,v];return `<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`;}).join('')}`;
  const NAV=DEPARTMENTS.map(d=>[d.id,d.label,d.icon]);
  // '더보기' 메뉴를 연 상태는 화면을 다시 그려도 이 탭 동안 유지
  document.addEventListener('toggle',e=>{if(e.target.classList?.contains('nav-more')){try{sessionStorage.setItem('mmt-nav-more',e.target.open?'1':'0');}catch{/* 저장소 없음 */}}},true);
  const TYPE_LABEL={product:'상품',bank:'통장 거래',sale:'매출',purchase:'매입',movement:'입출고',partner:'거래처',account:'계좌',branding:'브랜딩 기록',backup:'백업',warehouse:'창고'};
  // 시연 모드(src/demo.js, ?demo=1)면 메모리 저장소 — 이 브라우저의 진짜 자료를 읽지도 쓰지도 않는다
  const LS=window.__MMT_DEMO_STORAGE__||localStorage;
  const store=createStore(C,LS);
  let data,savedRaw=null,loadError='',toastTimer,modal=null,priorFocus=null,filterTimer;
  let currentPage=null,hasRendered=false;
  const pageId=document.body.dataset.page||'overview';
  const state={view:pageId,query:new URLSearchParams(location.search).get('q')||'',filter:'전체',month:'',warehouse:'기본 창고',page:1,showVoided:false,stockTab:new URLSearchParams(location.search).get('tab')==='ledger'?'입출고 기록':'재고 현황',attention:new URLSearchParams(location.search).get('attention')||''};
  if(!NAV.some(n=>n[0]===state.view))state.view='overview';
  try{
    const result=await store.load(); data=result.data;savedRaw=result.raw;loadError=result.warning;
    state.warehouse=data.erp.warehouses[0]||'기본 창고';
    currentPage=(await import(`./pages/${state.view}.js?v=${document.body.dataset.build}`)).default;
  }catch(e){
    $('#root').innerHTML=`<section class="fatal"><h1>페이지를 열지 못했습니다</h1><p>저장된 자료는 그대로 보관되어 있습니다. 연결을 확인하고 다시 열어 주세요.</p><p>${esc(e.message)}</p><button id="retry">다시 열기</button><button id="rescue">저장 자료 내려받기</button></section>`;
    $('#retry').onclick=()=>location.reload();
    $('#rescue').onclick=()=>download(localStorage.getItem(C.STORAGE_KEY)||'', 'mumutori-storage-recovery.txt','text/plain');return;
  }

  function notify(text,error=false){clearTimeout(toastTimer);$('#toast').className='toast'+(error?' error':'');$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
  function download(content,name,type='application/json'){
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function backup(){download(JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'mumutori-erp-'+C.today()+'.json');notify('전체 백업 파일을 내려받았습니다.');}
  function commit(next,message){
    const result=store.save(next);savedRaw=result.raw;data=result.data;
    window.MumutoriActivity?.record({screen:'운영홈',action:'기록 저장'});
    render();notify(message||'저장했습니다.');
  }
  const link=(view,label,query='',extra='')=>`<a class="inline-link ${extra}" href="${view==='overview'?'index':view}.html${query?'?q='+encodeURIComponent(query):''}">${esc(label)} <span aria-hidden="true">↗</span></a>`;
  const accountName=id=>data.erp.accounts.find(a=>a.id===id)?.name||id;
  const findProduct=sku=>data.products.find(p=>p.id===sku);
  const matches=(r,fields)=>!state.query||fields.map(k=>r[k]).join(' ').toLowerCase().includes(state.query.toLowerCase());
  const inMonth=r=>!state.month||r.date?.startsWith(state.month);
  const visible=rows=>rows.filter(r=>state.showVoided||!r.voided);
  const byDate=rows=>{const key=r=>(r.date||r.receivedAt||'')+'|'+(r.timestamp?.slice(11)||r.createdAt?.slice(11)||'');return [...rows].sort((a,b)=>key(b).localeCompare(key(a)));};
  const rowClass=r=>r.voided?'class="voided"':'';
  function rowsTable(headers,rows,renderRow,emptyText='등록된 기록이 없습니다.',emptyAction=''){
    const pages=Math.max(1,Math.ceil(rows.length/25));state.page=Math.min(state.page,pages);
    const slice=rows.slice((state.page-1)*25,state.page*25);
    return `<div class="panel"><div class="tablewrap"><table class="table"><thead><tr>${headers.map(h=>`<th ${h[0]==='#'?'class="num"':''}>${esc(h.replace(/^#/,''))}</th>`).join('')}</tr></thead><tbody>${slice.length?slice.map(renderRow).join(''):`<tr><td colspan="${headers.length}"><div class="empty"><b>${esc(emptyText)}</b>${emptyAction}</div></td></tr>`}</tbody></table></div><div class="pager"><span>총 ${won(rows.length)}건 · ${(state.page-1)*25+(rows.length?1:0)}–${Math.min(state.page*25,rows.length)}</span><div class="actions"><button data-action="page" data-value="-1" ${state.page<=1?'disabled':''}>이전</button><span>${state.page} / ${pages}</span><button data-action="page" data-value="1" ${state.page>=pages?'disabled':''}>다음</button></div></div></div>`;
  }
  const editButtons=(type,r,extra='')=>`<div class="rowaction">${!r.voided?btn('수정','edit',{type,id:type==='purchase'?r.orderNo:r.id},'text')+extra:''}${type==='product'?'':btn(r.voided?'복구':'취소','void',{type,id:type==='purchase'?r.orderNo:r.id},'text '+(r.voided?'':'danger'))}</div>`;
  function filters(placeholder,opts=[],withMonth=false,voids=true){return `${state.attention?'<div class="attention-note">확인할 업무로 좁혀 보고 있습니다. '+btn('전체 목록 보기','attention-clear',{},'text')+'</div>':''}`+`<div class="toolbar"><div class="filters"><input id="search" class="search" data-filter="query" aria-label="검색" placeholder="${esc(placeholder)}" value="${esc(state.query)}">${opts.length?`<select id="filter" data-filter="filter" aria-label="분류 필터">${options(['전체',...opts],state.filter)}</select>`:''}${withMonth?`<input type="month" id="month" aria-label="조회 월" data-filter="month" value="${esc(state.month)}">${state.month?btn('전체 기간','clear-month',{},'text'):''}`:''}${voids?`<label><input type="checkbox" data-filter="showVoided" ${state.showVoided?'checked':''}>취소 포함</label>`:''}</div></div>`;}
  const metric=(label,value,unit,sub)=>`<div class="metric"><small>${esc(label)}</small><strong>${won(value)}<em>${esc(unit)}</em></strong><footer>${esc(sub)}</footer></div>`;
  function head(title,desc,actions){const d=DEPARTMENTS.find(d=>d.id===state.view);return `<div class="pagehead"><div><div class="eyebrow"><span class="tiny-index">${d.number}</span> <span class="dept-owner">${d.owner}</span></div><h1>${title}<span class="title-dot">.</span></h1><p>${desc}</p></div><div class="actions">${actions||''}</div></div>`;}
  function accountSummary(){return data.erp.accounts.map(a=>{const rows=C.active(data.bankTransactions).filter(t=>t.accountLabel===a.id);const latest=byDate(rows.filter(t=>t.balance!=null))[0];return {a,rows,latest,net:C.sum(rows,'signedAmount')};});}
  function render(){
    const focus=document.activeElement,focusId=focus?.id,selection=focus?.selectionStart;
    const d=DEPARTMENTS.find(d=>d.id===state.view);
    const context={C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip};
    // 지금 화면이 어느 메뉴에 속하나(통장 탭 → 재무). '더보기'는 그 안의 화면이거나 이 탭에서 열어 둔 적이 있으면 펼친다.
    const navOf=DEPARTMENTS.find(x=>x.id===state.view)?.tabOf||state.view;
    const navItem=n=>`<a href="${n.id==='overview'?'index':n.id}.html" class="nav-item ${navOf===n.id?'active':''}" data-view="${n.id}" ${navOf===n.id?'aria-current="page"':''}><span class="nav-icon">${icon(n.icon)}</span><span>${n.label}</span><small>${n.number}</small></a>`;
    const {daily,more}=menuGroups();
    const moreOpen=more.some(n=>n.id===navOf)||(()=>{try{return sessionStorage.getItem('mmt-nav-more')==='1';}catch{return false;}})();
    const mobileNav=`<optgroup label="매일">${daily.map(n=>`<option value="${n.id}" ${state.view===n.id?'selected':''}>${esc(n.label)}</option>`+(n.id==='finance'?`<option value="bank" ${state.view==='bank'?'selected':''}>재무 · 계좌별</option>`:'')).join('')}</optgroup><optgroup label="더보기">${more.map(n=>`<option value="${n.id}" ${state.view===n.id?'selected':''}>${esc(n.label)}</option>`).join('')}</optgroup>`;
    // 재무 = 장부 하나(총괄 #15): ① 장부 · 요약 ② 계좌별(bank.html) ③ 확인 필요(장부 안 칸) ④ 옛 기록(이 PC 브라우저, 읽기 전용 · 맨 끝)
    const finTabs=()=>`<nav class="sub-tabs" aria-label="재무 안 메뉴">${[['finance','finance.html','장부 · 요약'],['bank','bank.html','계좌별'],['','finance.html#fin-needs','확인 필요'],['','finance.html#legacy','옛 기록(10/03 이전 · 이 PC만)']].map(([id,href,label])=>`<a href="${href}" class="sub-tab ${id&&state.view===id?'active':''}${id?'':' sub-tab-anchor'}" ${id&&state.view===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
    context.finTabs=finTabs;
    $('#root').innerHTML=`<div class="shell"><aside class="sidebar"><a href="index.html" class="brand" aria-label="무무토리 운영 홈"><span class="brandmark">m<span>✳</span></span><div><strong>mumutori<span>®</span></strong><small>작은 것들의 큰 가능성</small></div></a><div class="nav-label">메뉴</div><nav aria-label="주 메뉴">${daily.map(navItem).join('')}</nav><details class="nav-more" ${moreOpen?'open':''}><summary>더보기 <small>${more.length}</small></summary><nav aria-label="더보기 메뉴">${more.map(navItem).join('')}</nav></details><div class="nav-spacer"></div><div class="sidebar-note"><i class="dot"></i> 재무는 공용 장부 · 나머지는 이 브라우저</div></aside><main class="workspace" id="main-content"><header class="topbar"><div class="breadcrumb">무무토리 <span>/</span> <b>${d.owner}</b></div><a class="mobile-brand" href="index.html">mumutori<span>®</span></a><select class="mobile-nav" id="mobile-nav" aria-label="주 메뉴">${mobileNav}</select><div class="top-actions"><span class="status"><i class="dot"></i>${data.erp.updatedAt?'저장됨 '+dateTime(data.erp.updatedAt):'기록 준비 완료'}</span>${btn('백업','backup')}${btn('+ 빠른 기록','quick',{},'primary')}<span class="avatar" title="무무토리 워크스페이스">M</span></div></header><div class="content ${hasRendered?'':'page-enter'}" data-department="${d.id}">${state.view!=='overview'?'<p><a class="inline-link" href="index.html#projects">← 운영 홈으로</a></p>':''}${loadError?`<div class="note amber">${esc(loadError)}</div>`:''}${currentPage(context)}${state.view!=='overview'?`<div class="handoff-strip"><span>${icon('link')} 함께 보는 업무</span>${d.related.map(id=>{const t=DEPARTMENTS.find(x=>x.id===id);return link(id,t.label);}).join('')}<small>같은 상품·거래 기록으로 연결됩니다</small></div>`:''}<footer class="workspace-footer"><b>mumutori studio.</b><span>작은 기록, 이어지는 흐름.</span><span>재무는 공용 장부(폰 · PC 같은 장부) · 그 밖의 기록은 이 브라우저 · 은행 직접 연결 없음(수기 입력 · 결제 알림은 준비 중)</span></footer></div></main></div>`;
    hasRendered=true;
    if(focusId){const el=document.getElementById(focusId);if(el){el.focus();if(selection!=null&&['text','search'].includes(el.type))el.setSelectionRange(selection,selection);}}
  }
  function navigate(view){if(modal&&!closeModal())return;location.assign((view==='overview'?'index':view)+'.html');}
  function field(name,label,value='',config={}){
    const attrs=`id="f-${name}" name="${name}" ${config.required?'required':''} ${config.disabled?'disabled':''} ${config.min!=null?`min="${config.min}"`:''} ${config.step!=null?`step="${config.step}"`:''}`;
    let input;
    if(config.options)input=`<select ${attrs}>${options(config.options,value,config.empty)}</select>`;
    else if(config.textarea)input=`<textarea ${attrs} rows="3">${esc(value)}</textarea>`;
    else input=`<input ${attrs} type="${config.type||'text'}" value="${esc(value??'')}" ${config.placeholder?`placeholder="${esc(config.placeholder)}"`:''} ${config.maxLength?`maxlength="${config.maxLength}"`:''}>`;
    return `<label class="field ${config.full?'full':''}"><span>${esc(label)}${config.required?' *':''}</span>${input}${config.help?`<small>${esc(config.help)}</small>`:''}</label>`;
  }
  const productOptions=()=>data.products.map(p=>[p.id,p.name+' · '+p.id]);
  const optionalAmount={type:'number',min:0,step:1};
  function recordDraft(type,id,prefill={}){
    let old;
    if(type==='product')old=data.products.find(x=>x.id===id);
    if(type==='bank')old=data.bankTransactions.find(x=>x.id===id);
    if(type==='sale')old=data.finance.channelTransactions.find(x=>x.id===id);
    if(type==='purchase')old=C.purchases(data).find(x=>x.orderNo===id);
    if(type==='movement')old=data.erp.movements.find(x=>x.id===id);
    if(type==='partner')old=data.erp.partners.find(x=>x.id===id);
    if(type==='account')old=data.erp.accounts.find(x=>x.id===id);
    if(type==='branding')old=(Array.isArray(data.erp.branding)?data.erp.branding:[]).find(x=>x.id===id);
    // 아직 저장된 줄이 없는 기록의 기본값은 화면 모듈이 줄 수 있다(브랜딩: 공개 목록의 품목 — 공개해도 되는 칸만 넘어온다).
    const seed=id&&!old?currentPage?.seed?.(type,id)||null:null;
    if(id&&!old&&!seed)throw Error('기록을 찾지 못했습니다.');
    const date=C.today(),now=new Date().toISOString();
    let sku='PRD-001',n=1;while(data.products.some(p=>p.id===sku))sku='PRD-'+String(++n).padStart(3,'0');
    let brandId='BRAND-01',b=1;if(type==='branding')while((Array.isArray(data.erp.branding)?data.erp.branding:[]).some(x=>x.id===brandId)||currentPage?.seed?.(type,brandId))brandId='BRAND-'+String(++b).padStart(2,'0');
    const defaults={
      product:{id:sku,name:'',salesStatus:'판매 준비',type:'판매상품',price:null,safetyStock:0,memo:'',imageData:'',createdAt:now},
      bank:{id:C.uid('bank'),date,accountLabel:data.erp.accounts[0]?.id||'',direction:'출금',amount:'',category:'운영비',description:'',memo:'',createdAt:now},
      sale:{id:C.uid('sale'),date,orderId:'SALE-'+date.replace(/-/g,'')+'-'+C.uid('').slice(-5),channel:'직접 판매',customer:'',sku:'',productName:'',quantity:1,salesGross:0,feeNet:0,feeVAT:0,settlementBase:0,linkedBankIds:[],sourceIds:[],erpManual:true,createdAt:now},
      purchase:{orderNo:'BUY-'+date.replace(/-/g,'')+'-'+C.uid('').slice(-5),date,vendor:'',status:'발주',purchase:null,shipping:null,customs:null,vatCredit:0,lines:[{id:C.uid('pl'),sku:'',qty:1,amountKRW:null}],createdAt:now},
      movement:{id:C.uid('move'),date,sku:'',type:'입고',qty:1,warehouse:state.warehouse||'기본 창고',memo:'',sourceType:'',sourceId:'',createdAt:now},
      partner:{id:C.uid('partner'),name:'',type:'구매처',businessNo:'',contact:'',memo:''},
      account:{id:C.uid('account'),name:'',mode:'수동 기록',memo:''},
      branding:{id:brandId,kind:'도장',name:'',use:'',status:'candidate',createdAt:now}
    };
    return {draft:C.clone(old||{...defaults[type],...seed,...prefill}),isNew:!old,seeded:!!seed};
  }
  // noCancel: 아래 단추가 '닫기'뿐인 창(빠른 기록)은 같은 일을 하는 '취소'를 빼고 하나만 둔다(검수 15)
  function modalMarkup(title,body,{wide=false,saveLabel='저장',subtitle='',footer='저장을 눌러야 기록돼요.',noCancel=false}={}){
    return `<div class="overlay"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button type="button" aria-label="닫기" data-action="modal-close">×</button></div><form id="editor-form"><div class="modal-body">${body}<div id="form-error" class="form-error" role="alert"></div></div><div class="modal-footer"><span>${esc(footer)}</span><div class="actions">${noCancel?'':btn('취소','modal-close')}<button type="submit" class="primary" id="submit-record">${esc(saveLabel)}</button></div></div></form></section></div>`;
  }
  function displayModal(html,focus=true){
    if(!modal)return;$('#modal-root').innerHTML=html;document.body.style.overflow='hidden';
    if(focus)setTimeout(()=>$('.modal input:not([disabled]),.modal select:not([disabled]),.modal button')?.focus(),0);
  }
  function editorBody(){
    const r=modal.draft,type=modal.type;
    if(type==='product')return `<div class="photo-edit">${r.imageData?`<img src="${esc(r.imageData)}" alt="상품 사진">`:'<span class="thumb blank">◇</span>'}<div><h3>상품 사진</h3><input type="file" id="product-photo" accept="image/png,image/jpeg,image/webp" aria-label="상품 사진 선택"><p class="sub">10MB 이하 · 화면 저장용으로 크기를 조정합니다.</p>${r.imageData?btn('사진 제거','photo-remove',{},'text'):''}</div></div><div class="formgrid">${field('id','상품 관리번호',r.id,{required:true,disabled:!modal.isNew,help:'등록 후 고정돼요. 관련 기록을 이 번호로 이어요.'})}${field('name','상품명',r.name,{required:true,maxLength:100})}${field('salesStatus','판매 상태',r.salesStatus,{options:C.STATUS})}${field('type','상품 구분',r.type,{options:['판매상품','부자재']})}${field('barcode','바코드',r.barcode)}${field('supplier','주 구매처',r.supplier)}${field('price','기본 판매가 (원)',r.price,optionalAmount)}${field('safetyStock','안전재고 (개)',r.safetyStock,optionalAmount)}${field('memo','메모',r.memo,{full:true,textarea:true})}</div>`;
    if(type==='bank'){
      const locked=!!r.transferId,owner=r.direction==='입금'&&C.person(r);
      return `<div class="formgrid">${owner?'<div class="note">김현수·백다희 입금은 매출에 포함되지 않습니다. 자금 충전 또는 대여금 회수로 선택하세요.</div>':''}${locked?'<div class="note">사업 계좌 간 짝이 확인된 이체입니다. 짝을 지키려고 금액·계좌는 고정돼요.</div>':''}${field('date','거래일',r.date,{type:'date',required:true,disabled:locked})}${field('accountLabel','계좌',r.accountLabel,{options:data.erp.accounts.map(a=>[a.id,a.name]),required:true,disabled:locked})}${field('direction','입출금 구분',r.direction,{options:['입금','출금','기록'],disabled:locked})}${field('amount','금액 (원)',r.amount,{...optionalAmount,required:true,disabled:locked})}${field('description','거래 내용 / 상대방',r.description,{required:true,disabled:locked})}${field('category','자금 분류',C.bankCategory(r),{options:C.allowedCategories(r)})}${field('balance','거래 후 통장 잔액 (선택)',r.balance,{type:'number',step:1,help:'통장 내역에 잔액이 보일 때만 넣으세요.',disabled:locked})}${field('memo','메모',r.memo,{textarea:true,full:true})}${r.sourceFile?`<div class="note">원본: ${esc(r.sourceFile)}${r.sourceRow?' · '+esc(r.sourceRow)+'행':''}</div>`:''}</div>`;
    }
    if(type==='sale'){
      const eligible=C.eligibleBank(data,r);
      return `<div class="formgrid">${field('date','매출일',r.date,{type:'date',required:true})}${field('orderId','주문 / 문서 번호',r.orderId,{required:true})}${field('channel','판매 채널',r.channel,{required:true})}${field('customer','거래처 / 고객',r.customer)}${field('sku','재고 상품 연결',r.sku,{options:productOptions(),empty:'상품 미연결',full:true,help:'상품을 연결하면 매출 목록에서 출고를 기록할 수 있습니다.'})}${field('productName','판매 품목명',r.productName,{required:true})}${field('quantity','판매 수량',r.quantity,{type:'number',step:1,required:true,help:'반품은 수량과 매출액을 음수로 입력합니다.'})}${field('salesGross','매출액 · 부가세 포함 (원)',r.salesGross,{type:'number',step:1,required:true})}${field('settlementBase','수수료 차감 후 정산 예정액 (원)',r.settlementBase,{type:'number',step:1,required:true})}${field('feeNet','판매 수수료 공급가 (원)',r.feeNet,{type:'number',step:1,required:true})}${field('feeVAT','판매 수수료 부가세 (원)',r.feeVAT,{type:'number',step:1,required:true})}<div class="field full">${btn('매출액 − 수수료로 정산액 계산','calc-settlement',{},'text')}</div>${field('supplyAmount','세금계산서 공급가액 (선택)',r.supplyAmount,{type:'number',step:1})}${field('vatAmount','세금계산서 부가세 (선택)',r.vatAmount,{type:'number',step:1})}${field('invoiceNumber','세금계산서 승인번호 (선택)',r.invoiceNumber,{full:true})}<div class="field full"><span>정산 들어왔나 — 통장 입금 고르기</span><small>‘매출 수금 / 채널 정산’으로 분류한 입금만 고를 수 있어요. 통장 입금 하나는 매출 기록 하나에만 이어져요.</small><div class="checklist">${eligible.length?eligible.map(t=>`<label><input type="checkbox" name="linkedBankIds" value="${esc(t.id)}" ${(r.linkedBankIds||[]).includes(t.id)?'checked':''}>${esc(t.date)} · ${esc(t.description)} · ${money(t.amount)} · ${esc(accountName(t.accountLabel))}</label>`).join(''):'<p>연결할 통장 입금이 없습니다. 통장·자금에서 먼저 기록하세요.</p>'}</div></div>${field('memo','메모',r.memo,{full:true,textarea:true})}</div>`;
    }
    if(type==='purchase'){
      const cost=C.purchaseCost(r);
      return `<div class="formgrid">${field('orderNo','매입 / 발주 번호',r.orderNo,{required:true,disabled:!modal.isNew})}${field('vendor','구매처',r.vendor,{required:true})}${field('date','매입일',r.date||r.receivedAt,{type:'date',required:true})}${field('status','진행 상태',r.status||'기록 확인',{options:['발주','운송 중','배송완료','입고 완료','기록 확인']})}${field('purchase','상품 구매 결제액 (원)',r.purchase,optionalAmount)}${field('shipping','배송·작업비 (원)',r.shipping,optionalAmount)}${field('customs','통관 결제액 (원)',r.customs,optionalAmount)}${field('vatCredit','증빙으로 확인한 공제 부가세 (원)',r.vatCredit,optionalAmount)}<div class="note">확인되지 않은 금액은 비워 두세요. 실제 비용이 없을 때만 0을 입력하세요. 입고는 별도 입출고 기록으로 반영됩니다.</div></div><div class="section-gap"><h3>매입 품목</h3><div class="linegrid header"><span>상품</span><span>수량</span><span>상품금액 (원)</span><span></span></div>${r.lines.map((l,i)=>`<div class="linegrid"><select aria-label="매입 품목 ${i+1}" data-line="${i}" data-key="sku" required>${options(productOptions(),l.sku,'상품 선택')}</select><input type="number" min="1" step="1" aria-label="매입 수량 ${i+1}" data-line="${i}" data-key="qty" value="${esc(l.qty)}" required><input type="number" min="0" step="1" aria-label="품목 금액 ${i+1}" data-line="${i}" data-key="amountKRW" value="${esc(l.amountKRW??'')}" placeholder="선택"><button type="button" aria-label="품목 ${i+1} 제거" data-action="line-remove" data-index="${i}">×</button></div>`).join('')}${btn('+ 품목 추가','line-add',{},'text')}<p class="sub">구매·통관비는 품목마다 원화 금액, 위안 금액, 또는 수량 비율로 나눠 담아요. 배송비는 수량 비율이에요. 금액이 일부만 있으면 단가는 아직 확정 전이에요.</p></div><div class="moneyline section-gap"><div>확인된 결제액<strong>${money(cost.known)}</strong></div><div>공제 부가세 제외 원가<strong>${money(cost.net)}</strong></div></div>${r.lines.length?`<div class="tablewrap section-gap"><table class="table"><thead><tr><th>품목</th><th>나눠 담은 단가 (참고)</th><th>기록된 입고</th></tr></thead><tbody>${r.lines.map(l=>`<tr><td>${esc(findProduct(l.sku)?.name||'상품 선택')}</td><td>${C.allocation(r,l)==null?'미확정':money(Math.round(C.allocation(r,l)*100)/100)}</td><td>${C.moved(data,'purchase',r.orderNo,l.sku)} / ${esc(l.qty)}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="formgrid section-gap">${field('memo','메모 / 증빙 위치',r.memo||r.note,{textarea:true,full:true})}</div>`;
    }
    if(type==='movement'){
      let permitted=productOptions();
      if(r.sourceType==='purchase'){const po=C.purchases(data).find(x=>x.orderNo===r.sourceId);permitted=permitted.filter(p=>po?.lines.some(l=>l.sku===p[0]));}
      if(r.sourceType==='sale'){const sale=data.finance.channelTransactions.find(x=>x.id===r.sourceId);permitted=permitted.filter(p=>p[0]===sale?.sku);}
      const s=C.stock(data,r.sku,r.warehouse);
      return `<div class="formgrid">${r.sourceId?`<div class="note">연결된 ${r.sourceType==='purchase'?'매입':'매출'}: ${esc(r.sourceId)}<br>같은 문서의 입출고 수량을 합산하여 초과 등록을 막습니다.</div>`:''}${field('date','기록일',r.date,{type:'date',required:true})}${field('type','입출고 구분',r.type,{options:r.sourceType?[r.sourceType==='purchase'?'입고':'출고']:C.MOVE_TYPES})}${field('sku','상품',r.sku,{options:permitted,empty:'상품 선택',required:true,full:true})}${field('warehouse',r.type==='창고이동'?'출발 창고':'창고',r.warehouse,{options:data.erp.warehouses})}${field('qty',r.type==='실사'?'실제로 센 현재 수량':'이동 수량',r.qty,{type:'number',min:r.type==='실사'?0:1,step:1,required:true})}${r.type==='창고이동'?field('toWarehouse','도착 창고',r.toWarehouse,{options:data.erp.warehouses,empty:'도착 창고 선택',required:true}):''}<div class="note ${s.known?'':'amber'}">${r.type==='실사'?'이 날짜의 기준 수량을 등록합니다. 이후 입출고로 재고를 계산합니다.':s.known?'현재 장부 재고: '+won(s.qty)+'개':'아직 실사 기준이 없습니다. 입출고 이력은 보관되며 재고는 실사 등록 후 확정됩니다.'}</div>${field('memo','사유 / 메모',r.memo,{textarea:true,full:true})}</div>`;
    }
    if(type==='partner')return `<div class="formgrid">${field('name','거래처명',r.name,{required:true})}${field('type','구분',r.type,{options:['구매처','판매처','물류사','기타']})}${field('businessNo','사업자등록번호',r.businessNo)}${field('contact','담당자 / 연락처',r.contact)}${field('memo','정산 조건 / 메모',r.memo,{full:true,textarea:true})}</div>`;
    if(type==='branding'){
      const group=(title,body,sub='')=>`<div class="section-gap"><h3>${esc(title)}${sub?` <small class="br-local">${esc(sub)}</small>`:''}</h3><div class="formgrid">${body}</div></div>`,local='이 브라우저에만 저장';
      return `<div class="note">${modal.seeded?'공개 목록에 있는 품목입니다. 저장하면 이 브라우저의 장부에 내 기록이 생기고, 그 뒤로는 내 기록이 화면에 나옵니다. ':''}주문번호·결제액·도안 원본 위치는 이 브라우저의 장부에만 저장되며 공개 화면 자료·저장소에는 올라가지 않습니다.</div>`+
        group('품목',field('id','품목 ID',r.id,{required:true,disabled:!modal.isNew||modal.seeded,maxLength:40,help:'등록 후 고정됩니다. 예: STAMP-PAPER-01'})+field('kind','종류',r.kind,{options:C.BRAND_KINDS})+field('name','이름',r.name,{required:true,full:true,maxLength:120})+field('use','용도',r.use)+field('status','상태',r.status,{options:C.BRAND_STATUS,help:'주문 완료는 발주일, 수령은 수령일, 사용 중은 수령일이나 사용 근거가 있어야 저장됩니다.'}))+
        group('같은 것을 다시 살 정보',field('vendor','판매처',r.vendor)+field('productNo','상품번호',r.productNo)+field('url','상품 주소',r.url,{type:'url',full:true,placeholder:'https://'})+field('model','모델',r.model)+field('shape','형태',r.shape)+field('option','옵션·색',r.option,{full:true})+field('sku','옵션 SKU',r.sku)+field('printSize','인쇄(인각) 크기',r.printSize)+field('artSize','실제 도안 크기',r.artSize,{full:true})+field('inkMaker','잉크 제조사',r.inkMaker)+field('inkModel','잉크 정확한 모델',r.inkModel)+field('inkVolume','잉크 용량',r.inkVolume)+field('inkCompat','호환 근거',r.inkCompat,{full:true})+field('priceTotal','확인한 금액 · 배송비 포함 (원)',r.priceTotal,optionalAmount)+field('priceChecked','가격 확인일',r.priceChecked,{type:'date'})+field('priceNote','금액 내역',r.priceNote,{full:true,placeholder:'예: 본품 29,000원 + 기본 배송 3,000원'}))+
        group('도안',field('artSource','도안 원본 위치',r.artSource,{full:true,help:'폴더 이름이나 링크. 공개 화면 자료에는 들어가지 않습니다.'})+field('artVersion','제출한 도안 버전',r.artVersion,{placeholder:'예: v01'})+field('artMirror','좌우 반전(미러링)',r.artMirror,{options:C.BRAND_MIRROR,empty:'기록 없음'})+field('artNote','도안 메모',r.artNote,{full:true,textarea:true}),local)+
        group('주문·수령',field('orderDate','발주일',r.orderDate,{type:'date'})+field('orderNo','주문번호',r.orderNo)+field('orderUrl','주문 내역 주소',r.orderUrl,{type:'url',full:true,placeholder:'https://'})+field('qty','수량',r.qty,optionalAmount)+field('paid','실제 결제액 (원)',r.paid,optionalAmount)+field('receivedDate','수령일',r.receivedDate,{type:'date'})+field('useEvidence','사용 근거',r.useEvidence,{placeholder:'예: 2026-11부터 매장 포장에 사용'}),local)+
        group('수령 후 샘플 시험',field('testDate','시험일',r.testDate,{type:'date'})+field('testResult','결과',r.testResult,{options:C.BRAND_TESTS,empty:'기록 없음'})+field('testMaterial','시험한 소재·묶음',r.testMaterial,{full:true,placeholder:'예: 지금 쓰는 OPP 봉투 10×15cm'})+field('testNote','건조·문지름·구김·겹침 결과',r.testNote,{full:true,textarea:true}),local)+
        group('메모',field('pending','남은 확인 (한 줄에 하나)',r.pending,{full:true,textarea:true})+field('caution','주의',r.caution,{full:true})+field('reorderNote','재주문 메모',r.reorderNote,{full:true,textarea:true,placeholder:'마지막으로 성공한 조합, 바꾸면 안 되는 것, 필요한 수량'}));
    }
    if(type==='account')return `<div class="formgrid">${field('name','계좌 표시 이름',r.name,{required:true,full:true,placeholder:'예: 매출 통장 ·1234'})}${field('memo','용도 / 메모',r.memo,{full:true,textarea:true})}<div class="note">계좌를 등록하면 통장 거래를 직접 입력하거나 CSV로 가져올 수 있습니다. 은행 자동 연동 기능은 연결되어 있지 않습니다.</div></div>`;
    return '';
  }
  function refreshEditor(){
    displayModal(modalMarkup(TYPE_LABEL[modal.type]+(modal.isNew?' 등록':' 수정'),editorBody(),{wide:['sale','purchase','branding'].includes(modal.type),subtitle:modal.seeded?modal.draft.id+' · 공개 목록의 품목에 내 기록을 만듭니다.':modal.isNew?'새 기록을 입력합니다.':modal.type==='purchase'?modal.draft.orderNo:modal.draft.id}));
  }
  function openEditor(type,id,prefill={}){priorFocus=document.activeElement;const r=recordDraft(type,id,prefill);modal={kind:'editor',type,...r,dirty:false};refreshEditor();}
  function readForm(){
    if(!modal||modal.kind!=='editor')return;
    const fd=new FormData($('#editor-form'));
    for(const [k,v] of fd.entries()){if(k!=='linkedBankIds')modal.draft[k]=v;}
    if(modal.type==='sale')modal.draft.linkedBankIds=fd.getAll('linkedBankIds');
    for(const el of document.querySelectorAll('[data-line]'))modal.draft.lines[Number(el.dataset.line)][el.dataset.key]=el.value;
  }
  function closeModal(force=false){
    if(!modal)return true;
    if(!force&&modal.dirty&&!confirm('저장하지 않은 내용을 닫을까요?'))return false;
    modal=null;$('#modal-root').innerHTML='';document.body.style.overflow='';if(priorFocus?.isConnected)priorFocus.focus();return true;
  }
  function formError(e){$('#form-error').textContent=e.message||String(e);$('#form-error').scrollIntoView({block:'nearest'});}
  function prepareRow(){
    readForm();const r=C.clone(modal.draft);
    const numeric={product:['price','safetyStock'],bank:['amount','balance'],sale:['quantity','salesGross','feeNet','feeVAT','settlementBase','supplyAmount','vatAmount'],purchase:['purchase','shipping','customs','vatCredit'],movement:['qty'],branding:['priceTotal','paid','qty']};
    for(const k of numeric[modal.type]||[])r[k]=r[k]==null||r[k]===''?null:Number(r[k]);
    if(modal.type==='product'){r.name=r.name.trim();r.id=r.id.trim();r.active=r.salesStatus!=='판매 중단';if(r.salesStatus==='자재')r.type='부자재';}
    if(modal.type==='bank'){r.description=r.description.trim();r.account=r.accountLabel;r.categoryReviewed=true;}
    if(modal.type==='movement'&&r.type!=='창고이동')delete r.toWarehouse;
    if(modal.type==='branding')for(const k of Object.keys(r))if(typeof r[k]==='string')r[k]=r[k].trim();
    if(modal.type==='purchase')r.lines=r.lines.map(l=>({...l,qty:Number(l.qty),amountKRW:l.amountKRW===''||l.amountKRW==null?null:Number(l.amountKRW),productName:findProduct(l.sku)?.name||l.productName}));
    return r;
  }
  function openVoid(type,id){
    const rows={bank:data.bankTransactions,sale:data.finance.channelTransactions,purchase:data.finance.purchaseEvidence,movement:data.erp.movements,branding:Array.isArray(data.erp.branding)?data.erp.branding:[]}[type];
    const row=rows?.find(r=>(type==='purchase'?r.orderNo:r.id)===id);if(!row)throw Error('기록을 찾을 수 없습니다.');
    if(row.voided){commit(C.toggleVoid(data,type,id),'기록을 복구했습니다.');return;}
    priorFocus=document.activeElement;modal={kind:'void',type,id,dirty:false};
    displayModal(modalMarkup('기록 취소',`<p>기록을 취소하면 합계와 재고 계산에서 제외됩니다. 원본과 취소 이력은 남으며 목록에서 복구할 수 있습니다.</p><div class="formgrid section-gap">${field('reason','취소 사유','',{full:true,textarea:true,required:true})}</div>`,{saveLabel:'기록 취소'}));
  }
  async function photo(file){
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('10MB 이하 JPG·PNG·WEBP 사진을 선택하세요.');
    readForm();const current=modal;
    $('#submit-record').disabled=true;
    try{
      const raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});
      const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('사진을 열지 못했습니다.'));im.src=raw;});
      const canvas=document.createElement('canvas'),scale=Math.min(1,360/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      if(modal!==current)return;
      modal.draft.imageData=canvas.toDataURL('image/webp',.75);modal.draft.imageSource='직접 등록';modal.dirty=true;refreshEditor();
    }finally{if($('#submit-record'))$('#submit-record').disabled=false;}
  }
  function csvOpen(){priorFocus=document.activeElement;modal={kind:'csv',dirty:false,preview:null};displayModal(modalMarkup('통장 거래 CSV 가져오기',`<p>등록할 계좌를 먼저 설정·백업에서 추가하세요.</p>${btn('CSV 양식 내려받기','csv-template')}<div class="filebox"><input id="csv-file" type="file" accept=".csv,text/csv" aria-label="통장 CSV 파일 선택"></div><div id="import-preview" class="note">파일을 선택하면 등록할 거래와 중복 후보 건수를 확인합니다.</div>`,{saveLabel:'확인한 거래 등록'}));}
  async function backupPreview(file){
    if(!file)return;if(file.size>20*1024*1024)throw Error('20MB 이하 백업을 선택하세요.');
    const incoming=C.validateBackup(JSON.parse(await file.text())),preview=C.mergeBackup(data,incoming);
    priorFocus=document.activeElement;modal={kind:'backup',incoming,dirty:false};
    displayModal(modalMarkup('백업 병합 확인',`<div class="note">추가 ${preview.report.added}건 · 같은 번호의 내용 차이 ${preview.report.conflicts}건</div><p class="section-gap">현재 자료에 없는 기록은 추가합니다. 같은 관리번호의 내용이 다를 때 적용할 기준을 선택하세요.</p><div class="formgrid section-gap">${field('preference','내용 차이 처리','current',{options:[['current','현재 브라우저 자료 유지'],['incoming','가져온 파일의 자료 적용']],full:true})}</div><p class="sub">반영 전 현재 상태를 복구용으로 저장합니다. 가져온 파일도 별도로 보관하세요.</p>`,{saveLabel:'백업 병합'}));
  }
  function csvTemplate(){download('\uFEFF날짜,계좌,구분,금액,내용,분류,메모\r\n','mumutori-bank-template.csv','text/csv;charset=utf-8');}
  function openQuick(){priorFocus=document.activeElement;modal={kind:'quick',dirty:false};displayModal(modalMarkup('빠른 기록',`<div class="formgrid">${[['product','상품 등록'],['sale','매출 등록'],['purchase','매입 등록'],['movement','입출고 기록'],['partner','거래처 등록']].map(([type,label])=>btn(label,'quick-edit',{type})).join('')}</div>`,{saveLabel:'닫기',noCancel:true,footer:'기록할 업무를 선택하세요.'}));}
  function openWarehouse(){priorFocus=document.activeElement;modal={kind:'warehouse',dirty:false};displayModal(modalMarkup('창고 추가',`<div class="formgrid">${field('name','창고 이름','',{required:true,full:true})}</div>`));}
  document.addEventListener('submit',e=>{
    if(!e.target.matches('form#editor-form'))return;e.preventDefault();
    try{
      if(modal.kind==='quick'){closeModal(true);return;}
      if(modal.kind==='editor'){
        const row=prepareRow();const next=C.record(data,modal.type,row,{isNew:modal.isNew,action:modal.isNew?'등록':'수정'});
        commit(next,TYPE_LABEL[modal.type]+'을 저장했습니다.');closeModal(true);
      }else if(modal.kind==='void'){
        commit(C.toggleVoid(data,modal.type,modal.id,new FormData(e.target).get('reason')),'기록을 취소했습니다.');closeModal(true);
      }else if(modal.kind==='csv'){
        if(!modal.preview)throw Error('CSV 파일을 먼저 선택하세요.');
        if(!modal.preview.rows.length)throw Error('새로 등록할 거래가 없습니다.');
        const refreshed=C.csvImport(modal.text,data);let next=C.clone(data);
        for(const r of refreshed.rows)next=C.record(next,'bank',r,{isNew:true,action:'CSV 등록'});
        commit(next,refreshed.rows.length+'건을 등록했습니다.');closeModal(true);
      }else if(modal.kind==='backup'){
        const next=C.mergeBackup(data,modal.incoming,new FormData(e.target).get('preference')==='incoming').data;
        try{LS.setItem('mumutori-before-import',JSON.stringify(data));}catch(e){throw Error('반영 전 복사본을 저장할 공간이 부족합니다. 먼저 전체 백업을 내려받고 저장 공간을 확보하세요.');}
        commit(next,'백업 자료를 병합했습니다.');closeModal(true);
      }else if(modal.kind==='warehouse'){
        const name=String(new FormData(e.target).get('name')||'').trim();if(!name)throw Error('창고 이름을 입력하세요.');if(data.erp.warehouses.includes(name))throw Error('이미 등록된 창고입니다.');
        const next=C.clone(data);next.erp.warehouses.push(name);C.appendAudit(next,'warehouse',name,'등록',null,{name});commit(next,'창고를 등록했습니다.');closeModal(true);
      }
    }catch(err){formError(err);}
  });
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');if(!el)return;
    const {action,type,id,view,value,index}=el.dataset;
    try{
      if(action==='nav')navigate(view);
      if(action==='backup')backup();
      if(action==='edit')openEditor(type,id);
      if(action==='quick')openQuick();
      if(action==='quick-edit'){closeModal(true);openEditor(type);}
      if(action==='modal-close')closeModal();
      if(action==='void')openVoid(type,id);
      if(action==='page'){state.page+=Number(value);render();}
      if(action==='attention-clear'){state.attention='';state.page=1;const u=new URL(location.href);u.searchParams.delete('attention');history.replaceState(null,'',u);render();}
      if(action==='clear-month'){state.month='';state.page=1;render();}
      if(action==='stock-tab'){state.stockTab=value;state.query='';state.filter='전체';state.page=1;render();}
      if(action==='count')openEditor('movement',null,{sku:id,type:'실사',qty:C.stock(data,id,state.warehouse).qty??0});
      if(action==='move-product')openEditor('movement',null,{sku:id});
      if(action==='ship'){
        const sale=data.finance.channelTransactions.find(s=>s.id===id);openEditor('movement',null,{type:'출고',sku:sale.sku,sourceType:'sale',sourceId:id,qty:sale.quantity-C.moved(data,'sale',id,sale.sku)});
      }
      if(action==='receive'){
        const po=C.purchases(data).find(p=>p.orderNo===id),line=po.lines.find(l=>l.sku&&C.moved(data,'purchase',id,l.sku)<C.sum(po.lines.filter(x=>x.sku===l.sku),'qty'));
        if(!line)throw Error('입고 가능한 품목이 없습니다. 품목 연결 또는 기존 입고 기록을 확인하세요.');
        openEditor('movement',null,{type:'입고',sku:line.sku,sourceType:'purchase',sourceId:id,qty:C.sum(po.lines.filter(x=>x.sku===line.sku),'qty')-C.moved(data,'purchase',id,line.sku)});
      }
      if(action==='line-add'){readForm();modal.draft.lines.push({id:C.uid('pl'),sku:'',qty:1,amountKRW:null});modal.dirty=true;refreshEditor();}
      if(action==='line-remove'){readForm();modal.draft.lines.splice(Number(index),1);modal.dirty=true;refreshEditor();}
      if(action==='photo-remove'){readForm();modal.draft.imageData='';modal.dirty=true;refreshEditor();}
      if(action==='calc-settlement'){readForm();modal.draft.settlementBase=C.num(modal.draft.salesGross)-C.num(modal.draft.feeNet)-C.num(modal.draft.feeVAT);modal.dirty=true;refreshEditor();}
      if(action==='csv-open')csvOpen();
      if(action==='csv-template')csvTemplate();
      if(action==='warehouse-open')openWarehouse();
      if(action==='import-backup'){const raw=LS.getItem('mumutori-before-import');if(!raw)throw Error('이 브라우저에서 백업을 병합한 이력이 없습니다.');download(raw,'mumutori-before-import.json');}
      if(action==='migration-backup'){const raw=LS.getItem('mumutori-before-erp');if(!raw)throw Error('이 브라우저에 ERP 전환 전 복사본이 없습니다. 현재 자료는 전체 백업으로 내려받을 수 있습니다.');download(raw,'mumutori-before-erp.json');}
    }catch(err){if(modal&&$('#form-error'))formError(err);else notify(err.message,true);}
  });
  document.addEventListener('input',e=>{
    if(e.target.dataset.filter==='query'){
      state.query=e.target.value;state.page=1;clearTimeout(filterTimer);filterTimer=setTimeout(render,160);
    }
    if(e.target.closest('#editor-form')&&modal)modal.dirty=true;
  });
  document.addEventListener('change',async e=>{
    try{
      const el=e.target;
      if(el.dataset.filter&&el.dataset.filter!=='query'){state[el.dataset.filter]=el.type==='checkbox'?el.checked:el.value;state.page=1;render();return;}
      if(el.id==='mobile-nav'){navigate(el.value);return;}
      if(el.id==='backup-file'){try{await backupPreview(el.files[0]);}finally{el.value='';}return;}
      if(el.id==='csv-file'){
        modal.preview=null;modal.text='';$('#import-preview').textContent='파일을 확인하고 있습니다.';
        const file=el.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('10MB 이하 CSV 파일을 선택하세요.');
        const current=modal,text=await file.text();if(modal!==current)return;modal.text=text;modal.preview=C.csvImport(text,data);
        $('#import-preview').innerHTML=`<b>신규 ${modal.preview.rows.length}건 · 중복 후보 ${modal.preview.duplicates}건 제외</b><p>${modal.preview.rows.slice(0,8).map(r=>`${esc(r.date)} · ${esc(r.description)} · ${money(r.amount)} · ${esc(r.category)}`).join('<br>')}</p>${modal.preview.rows.length>8?'<p>외 '+(modal.preview.rows.length-8)+'건</p>':''}`;return;
      }
      if(el.id==='product-photo'){await photo(el.files[0]);return;}
      if(modal?.kind==='editor'){
        readForm();modal.dirty=true;
        if(modal.type==='bank'&&['direction','description'].includes(el.name)){
          const allowed=C.allowedCategories(modal.draft);if(!allowed.includes(modal.draft.category))modal.draft.category=modal.draft.direction==='입금'&&C.person(modal.draft)?'자금입금·용도 확인':allowed[0];
          const category=$('#f-category');category.innerHTML=options(allowed,modal.draft.category);
          if(el.name==='direction')refreshEditor();
        }
        if(modal.type==='sale'&&el.name==='sku'&&el.value){modal.draft.productName=findProduct(el.value)?.name||modal.draft.productName;refreshEditor();}
        if(modal.type==='movement'&&['type','sku','warehouse'].includes(el.name)){
          if(el.name==='sku'&&modal.draft.sourceType==='purchase'){
            const po=C.purchases(data).find(p=>p.orderNo===modal.draft.sourceId);modal.draft.qty=C.sum(po.lines.filter(l=>l.sku===el.value),'qty')-C.moved(data,'purchase',po.orderNo,el.value,modal.draft.id);
          }
          refreshEditor();
        }
      }
    }catch(err){if(modal&&$('#form-error'))formError(err);else notify(err.message,true);}
  });
  document.addEventListener('keydown',e=>{
    if(!modal)return;
    if(e.key==='Escape'){e.preventDefault();closeModal();}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('#editor-form').requestSubmit();}
    if(e.key==='Tab'){
      const list=[...document.querySelectorAll('.modal button:not([disabled]),.modal input:not([disabled]),.modal select:not([disabled]),.modal textarea:not([disabled]),.modal a[href]')].filter(x=>x.offsetParent!==null);
      const first=list[0],last=list.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  window.addEventListener('storage',e=>{
    if(window.__MMT_DEMO__)return;   // 시연 탭은 다른 창의 진짜 자료를 받지 않는다
    if(e.key!==C.STORAGE_KEY||e.newValue===savedRaw)return;
    if(modal){notify('다른 창에서 자료가 변경되었습니다. 현재 입력을 보관한 뒤 새로고침하세요.',true);return;}
    if(!e.newValue){notify('저장 자료가 다른 창에서 제거되었습니다. 먼저 전체 백업을 내려받으세요.',true);return;}
    try{const latest=store.accept(e.newValue);data=latest.data;savedRaw=latest.raw;render();notify('다른 창의 저장 내용을 반영했습니다.');}catch(err){notify('다른 창의 자료를 읽지 못했습니다. 현재 내용을 백업하세요.',true);}
  });
  window.addEventListener('beforeunload',e=>{if(modal?.dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pageshow',e=>{if(e.persisted&&localStorage.getItem(C.STORAGE_KEY)!==savedRaw)location.reload();});
  render();
})();

