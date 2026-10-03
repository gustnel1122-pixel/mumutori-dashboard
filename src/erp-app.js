const { DEPARTMENTS, icon, departmentCards, workflowStrip } = await import(`./departments.js?v=${document.body.dataset.build}`);
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
  const TYPE_LABEL={product:'상품',bank:'통장 거래',sale:'매출',purchase:'매입',movement:'입출고',partner:'거래처',account:'계좌',backup:'백업',warehouse:'창고'};
  const store=createStore(C);
  let data,savedRaw=null,loadError='',toastTimer,modal=null,priorFocus=null,filterTimer;
  let currentPage=null,hasRendered=false;
  const pageId=document.body.dataset.page||'overview';
  const state={view:pageId,query:new URLSearchParams(location.search).get('q')||'',filter:'전체',month:'',warehouse:'기본 창고',page:1,showVoided:false,stockTab:new URLSearchParams(location.search).get('tab')==='ledger'?'입출고 원장':'재고 현황',attention:new URLSearchParams(location.search).get('attention')||''};
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
  function head(title,desc,actions){const d=DEPARTMENTS.find(d=>d.id===state.view);return `<div class="pagehead"><div><div class="eyebrow"><span class="tiny-index">${d.number}</span> ${d.english} <span class="dept-owner">${d.owner}</span></div><h1>${title}<span class="title-dot">.</span></h1><p>${desc}</p></div><div class="actions">${actions||''}</div></div>`;}
  function accountSummary(){return data.erp.accounts.map(a=>{const rows=C.active(data.bankTransactions).filter(t=>t.accountLabel===a.id);const latest=byDate(rows.filter(t=>t.balance!=null))[0];return {a,rows,latest,net:C.sum(rows,'signedAmount')};});}
  function render(){
    const focus=document.activeElement,focusId=focus?.id,selection=focus?.selectionStart;
    const d=DEPARTMENTS.find(d=>d.id===state.view);
    const context={C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip};
    const navItem=n=>`<a href="${n.id==='overview'?'index':n.id}.html" class="nav-item ${state.view===n.id?'active':''}" data-view="${n.id}" ${state.view===n.id?'aria-current="page"':''}><span class="nav-icon">${icon(n.icon)}</span><span>${n.label}</span><small>${n.number}</small></a>`;
    $('#root').innerHTML=`<div class="shell"><aside class="sidebar"><a href="index.html" class="brand" aria-label="무무토리 운영 홈"><span class="brandmark">m<span>✳</span></span><div><strong>mumutori<span>®</span></strong><small>작은 것들의 큰 가능성</small></div></a><div class="nav-label">OUR WORKSPACE <span>01—08</span></div><nav aria-label="주 메뉴">${DEPARTMENTS.slice(0,8).map(navItem).join('')}</nav><div class="nav-spacer"></div><div class="side-poster"><span class="poster-flower">✳</span><b>MAKE SMALL<br>THINGS MATTER.</b><small>오늘의 작은 기록을 쌓아요.</small></div><nav aria-label="관리 메뉴">${DEPARTMENTS.slice(8).map(navItem).join('')}</nav><div class="sidebar-note"><i class="dot"></i> 내 브라우저에 보관 중</div></aside><main class="workspace" id="main-content"><header class="topbar"><div class="breadcrumb">WORKSPACE <span>/</span> <b>${d.owner}</b></div><a class="mobile-brand" href="index.html">mumutori<span>®</span></a><select class="mobile-nav" id="mobile-nav" aria-label="주 메뉴">${options(NAV.map(n=>[n[0],n[1]]),state.view)}</select><div class="top-actions"><span class="status"><i class="dot"></i>${data.erp.updatedAt?'저장됨 '+dateTime(data.erp.updatedAt):'기록 준비 완료'}</span>${btn('백업','backup')}${btn('+ 빠른 기록','quick',{},'primary')}<span class="avatar" title="무무토리 워크스페이스">M</span></div></header><div class="content ${hasRendered?'':'page-enter'}" data-department="${d.id}">${loadError?`<div class="note amber">${esc(loadError)}</div>`:''}${currentPage(context)}${state.view!=='overview'?`<div class="handoff-strip"><span>${icon('link')} 함께 보는 업무</span>${d.related.map(id=>{const t=DEPARTMENTS.find(x=>x.id===id);return link(id,t.label);}).join('')}<small>같은 상품·거래 기록으로 연결됩니다</small></div>`:''}<footer class="workspace-footer"><b>mumutori studio.</b><span>작은 기록, 이어지는 흐름.</span><span>이 브라우저 저장 · 은행 미연결</span></footer></div></main></div>`;
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
    if(id&&!old)throw Error('기록을 찾지 못했습니다.');
    const date=C.today(),now=new Date().toISOString();
    let sku='PRD-001',n=1;while(data.products.some(p=>p.id===sku))sku='PRD-'+String(++n).padStart(3,'0');
    const defaults={
      product:{id:sku,name:'',salesStatus:'판매 준비',type:'판매상품',price:null,safetyStock:0,memo:'',imageData:'',createdAt:now},
      bank:{id:C.uid('bank'),date,accountLabel:data.erp.accounts[0]?.id||'',direction:'출금',amount:'',category:'운영비',description:'',memo:'',createdAt:now},
      sale:{id:C.uid('sale'),date,orderId:'SALE-'+date.replace(/-/g,'')+'-'+C.uid('').slice(-5),channel:'직접 판매',customer:'',sku:'',productName:'',quantity:1,salesGross:0,feeNet:0,feeVAT:0,settlementBase:0,linkedBankIds:[],sourceIds:[],erpManual:true,createdAt:now},
      purchase:{orderNo:'BUY-'+date.replace(/-/g,'')+'-'+C.uid('').slice(-5),date,vendor:'',status:'발주',purchase:null,shipping:null,customs:null,vatCredit:0,lines:[{id:C.uid('pl'),sku:'',qty:1,amountKRW:null}],createdAt:now},
      movement:{id:C.uid('move'),date,sku:'',type:'입고',qty:1,warehouse:state.warehouse||'기본 창고',memo:'',sourceType:'',sourceId:'',createdAt:now},
      partner:{id:C.uid('partner'),name:'',type:'구매처',businessNo:'',contact:'',memo:''},
      account:{id:C.uid('account'),name:'',mode:'수동 기록',memo:''}
    };
    return {draft:C.clone(old||{...defaults[type],...prefill}),isNew:!old};
  }
  function modalMarkup(title,body,{wide=false,saveLabel='저장',subtitle='',footer='저장을 눌러야 원장에 반영됩니다.'}={}){
    return `<div class="overlay"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button type="button" aria-label="닫기" data-action="modal-close">×</button></div><form id="editor-form"><div class="modal-body">${body}<div id="form-error" class="form-error" role="alert"></div></div><div class="modal-footer"><span>${esc(footer)}</span><div class="actions">${btn('취소','modal-close')}<button type="submit" class="primary" id="submit-record">${esc(saveLabel)}</button></div></div></form></section></div>`;
  }
  function displayModal(html,focus=true){
    if(!modal)return;$('#modal-root').innerHTML=html;document.body.style.overflow='hidden';
    if(focus)setTimeout(()=>$('.modal input:not([disabled]),.modal select:not([disabled]),.modal button')?.focus(),0);
  }
  function editorBody(){
    const r=modal.draft,type=modal.type;
    if(type==='product')return `<div class="photo-edit">${r.imageData?`<img src="${esc(r.imageData)}" alt="상품 사진">`:'<span class="thumb blank">◇</span>'}<div><h3>상품 사진</h3><input type="file" id="product-photo" accept="image/png,image/jpeg,image/webp" aria-label="상품 사진 선택"><p class="sub">10MB 이하 · 화면 저장용으로 크기를 조정합니다.</p>${r.imageData?btn('사진 제거','photo-remove',{},'text'):''}</div></div><div class="formgrid">${field('id','상품 관리번호',r.id,{required:true,disabled:!modal.isNew,help:'등록 후 고정됩니다. 관련 원장을 이 번호로 연결합니다.'})}${field('name','상품명',r.name,{required:true,maxLength:100})}${field('salesStatus','판매 상태',r.salesStatus,{options:C.STATUS})}${field('type','상품 구분',r.type,{options:['판매상품','부자재']})}${field('barcode','바코드',r.barcode)}${field('supplier','주 구매처',r.supplier)}${field('price','기본 판매가 (원)',r.price,optionalAmount)}${field('safetyStock','안전재고 (개)',r.safetyStock,optionalAmount)}${field('memo','메모',r.memo,{full:true,textarea:true})}</div>`;
    if(type==='bank'){
      const locked=!!r.transferId,owner=r.direction==='입금'&&C.person(r);
      return `<div class="formgrid">${owner?'<div class="note">김현수·백다희 입금은 매출에 포함되지 않습니다. 자금 충전 또는 대여금 회수로 선택하세요.</div>':''}${locked?'<div class="note">사업 계좌 간 짝이 확인된 이체입니다. 연결 관계를 보존하기 위해 원장 금액·계좌는 고정됩니다.</div>':''}${field('date','거래일',r.date,{type:'date',required:true,disabled:locked})}${field('accountLabel','계좌',r.accountLabel,{options:data.erp.accounts.map(a=>[a.id,a.name]),required:true,disabled:locked})}${field('direction','입출금 구분',r.direction,{options:['입금','출금','기록'],disabled:locked})}${field('amount','금액 (원)',r.amount,{...optionalAmount,required:true,disabled:locked})}${field('description','거래 내용 / 상대방',r.description,{required:true,disabled:locked})}${field('category','자금 분류',C.bankCategory(r),{options:C.allowedCategories(r)})}${field('balance','거래 후 원장 잔액 (선택)',r.balance,{type:'number',step:1,help:'은행 원장에 표시된 잔액이 있을 때만 입력하세요.',disabled:locked})}${field('memo','메모',r.memo,{textarea:true,full:true})}${r.sourceFile?`<div class="note">원본: ${esc(r.sourceFile)}${r.sourceRow?' · '+esc(r.sourceRow)+'행':''}</div>`:''}</div>`;
    }
    if(type==='sale'){
      const eligible=C.eligibleBank(data,r);
      return `<div class="formgrid">${field('date','매출일',r.date,{type:'date',required:true})}${field('orderId','주문 / 문서 번호',r.orderId,{required:true})}${field('channel','판매 채널',r.channel,{required:true})}${field('customer','거래처 / 고객',r.customer)}${field('sku','재고 상품 연결',r.sku,{options:productOptions(),empty:'상품 미연결',full:true,help:'상품을 연결하면 매출 목록에서 출고를 기록할 수 있습니다.'})}${field('productName','판매 품목명',r.productName,{required:true})}${field('quantity','판매 수량',r.quantity,{type:'number',step:1,required:true,help:'반품은 수량과 매출액을 음수로 입력합니다.'})}${field('salesGross','매출액 · 부가세 포함 (원)',r.salesGross,{type:'number',step:1,required:true})}${field('settlementBase','수수료 차감 후 정산 예정액 (원)',r.settlementBase,{type:'number',step:1,required:true})}${field('feeNet','판매 수수료 공급가 (원)',r.feeNet,{type:'number',step:1,required:true})}${field('feeVAT','판매 수수료 부가세 (원)',r.feeVAT,{type:'number',step:1,required:true})}<div class="field full">${btn('매출액 − 수수료로 정산액 계산','calc-settlement',{},'text')}</div>${field('supplyAmount','세금계산서 공급가액 (선택)',r.supplyAmount,{type:'number',step:1})}${field('vatAmount','세금계산서 부가세 (선택)',r.vatAmount,{type:'number',step:1})}${field('invoiceNumber','세금계산서 승인번호 (선택)',r.invoiceNumber,{full:true})}<div class="field full"><span>실제 수금 연결</span><small>‘매출 수금 / 채널 정산’으로 분류한 입금만 선택할 수 있습니다. 하나의 통장 입금은 한 기록에만 연결됩니다.</small><div class="checklist">${eligible.length?eligible.map(t=>`<label><input type="checkbox" name="linkedBankIds" value="${esc(t.id)}" ${(r.linkedBankIds||[]).includes(t.id)?'checked':''}>${esc(t.date)} · ${esc(t.description)} · ${money(t.amount)} · ${esc(accountName(t.accountLabel))}</label>`).join(''):'<p>연결할 통장 입금이 없습니다. 통장·자금에서 먼저 기록하세요.</p>'}</div></div>${field('memo','메모',r.memo,{full:true,textarea:true})}</div>`;
    }
    if(type==='purchase'){
      const cost=C.purchaseCost(r);
      return `<div class="formgrid">${field('orderNo','매입 / 발주 번호',r.orderNo,{required:true,disabled:!modal.isNew})}${field('vendor','구매처',r.vendor,{required:true})}${field('date','매입일',r.date||r.receivedAt,{type:'date',required:true})}${field('status','진행 상태',r.status||'기록 확인',{options:['발주','운송 중','배송완료','입고 완료','기록 확인']})}${field('purchase','상품 구매 결제액 (원)',r.purchase,optionalAmount)}${field('shipping','배송·작업비 (원)',r.shipping,optionalAmount)}${field('customs','통관 결제액 (원)',r.customs,optionalAmount)}${field('vatCredit','증빙으로 확인한 공제 부가세 (원)',r.vatCredit,optionalAmount)}<div class="note">확인되지 않은 금액은 비워 두세요. 실제 비용이 없을 때만 0을 입력하세요. 입고는 별도 입출고 기록으로 반영됩니다.</div></div><div class="section-gap"><h3>매입 품목</h3><div class="linegrid header"><span>상품</span><span>수량</span><span>상품금액 (원)</span><span></span></div>${r.lines.map((l,i)=>`<div class="linegrid"><select aria-label="매입 품목 ${i+1}" data-line="${i}" data-key="sku" required>${options(productOptions(),l.sku,'상품 선택')}</select><input type="number" min="1" step="1" aria-label="매입 수량 ${i+1}" data-line="${i}" data-key="qty" value="${esc(l.qty)}" required><input type="number" min="0" step="1" aria-label="품목 금액 ${i+1}" data-line="${i}" data-key="amountKRW" value="${esc(l.amountKRW??'')}" placeholder="선택"><button type="button" aria-label="품목 ${i+1} 제거" data-action="line-remove" data-index="${i}">×</button></div>`).join('')}${btn('+ 품목 추가','line-add',{},'text')}<p class="sub">구매·통관비는 전 품목의 원화 금액, 기존 위안 금액, 또는 수량 기준으로 배부합니다. 배송비는 수량 기준입니다. 일부 금액만 있으면 단가는 미확정입니다.</p></div><div class="moneyline section-gap"><div>확인된 결제액<strong>${money(cost.known)}</strong></div><div>공제 부가세 제외 원가<strong>${money(cost.net)}</strong></div></div>${r.lines.length?`<div class="tablewrap section-gap"><table class="table"><thead><tr><th>품목</th><th>배부단가 (참고)</th><th>기록된 입고</th></tr></thead><tbody>${r.lines.map(l=>`<tr><td>${esc(findProduct(l.sku)?.name||'상품 선택')}</td><td>${C.allocation(r,l)==null?'미확정':money(Math.round(C.allocation(r,l)*100)/100)}</td><td>${C.moved(data,'purchase',r.orderNo,l.sku)} / ${esc(l.qty)}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="formgrid section-gap">${field('memo','메모 / 증빙 위치',r.memo||r.note,{textarea:true,full:true})}</div>`;
    }
    if(type==='movement'){
      let permitted=productOptions();
      if(r.sourceType==='purchase'){const po=C.purchases(data).find(x=>x.orderNo===r.sourceId);permitted=permitted.filter(p=>po?.lines.some(l=>l.sku===p[0]));}
      if(r.sourceType==='sale'){const sale=data.finance.channelTransactions.find(x=>x.id===r.sourceId);permitted=permitted.filter(p=>p[0]===sale?.sku);}
      const s=C.stock(data,r.sku,r.warehouse);
      return `<div class="formgrid">${r.sourceId?`<div class="note">연결된 ${r.sourceType==='purchase'?'매입':'매출'}: ${esc(r.sourceId)}<br>같은 문서의 입출고 수량을 합산하여 초과 등록을 막습니다.</div>`:''}${field('date','기록일',r.date,{type:'date',required:true})}${field('type','입출고 구분',r.type,{options:r.sourceType?[r.sourceType==='purchase'?'입고':'출고']:C.MOVE_TYPES})}${field('sku','상품',r.sku,{options:permitted,empty:'상품 선택',required:true,full:true})}${field('warehouse',r.type==='창고이동'?'출발 창고':'창고',r.warehouse,{options:data.erp.warehouses})}${field('qty',r.type==='실사'?'실제로 센 현재 수량':'이동 수량',r.qty,{type:'number',min:r.type==='실사'?0:1,step:1,required:true})}${r.type==='창고이동'?field('toWarehouse','도착 창고',r.toWarehouse,{options:data.erp.warehouses,empty:'도착 창고 선택',required:true}):''}<div class="note ${s.known?'':'amber'}">${r.type==='실사'?'이 날짜의 기준 수량을 등록합니다. 이후 입출고로 재고를 계산합니다.':s.known?'현재 장부 재고: '+won(s.qty)+'개':'아직 실사 기준이 없습니다. 입출고 이력은 보관되며 재고는 실사 등록 후 확정됩니다.'}</div>${field('memo','사유 / 메모',r.memo,{textarea:true,full:true})}</div>`;
    }
    if(type==='partner')return `<div class="formgrid">${field('name','거래처명',r.name,{required:true})}${field('type','구분',r.type,{options:['구매처','판매처','물류사','기타']})}${field('businessNo','사업자등록번호',r.businessNo)}${field('contact','담당자 / 연락처',r.contact)}${field('memo','정산 조건 / 메모',r.memo,{full:true,textarea:true})}</div>`;
    if(type==='account')return `<div class="formgrid">${field('name','계좌 표시 이름',r.name,{required:true,full:true,placeholder:'예: 매출 통장 ·1234'})}${field('memo','용도 / 메모',r.memo,{full:true,textarea:true})}<div class="note">계좌를 등록하면 통장 거래를 직접 입력하거나 CSV로 가져올 수 있습니다. 은행 자동 연동 기능은 연결되어 있지 않습니다.</div></div>`;
    return '';
  }
  function refreshEditor(){
    displayModal(modalMarkup(TYPE_LABEL[modal.type]+(modal.isNew?' 등록':' 수정'),editorBody(),{wide:['sale','purchase'].includes(modal.type),subtitle:modal.isNew?'새 기록을 입력합니다.':modal.type==='purchase'?modal.draft.orderNo:modal.draft.id}));
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
    const numeric={product:['price','safetyStock'],bank:['amount','balance'],sale:['quantity','salesGross','feeNet','feeVAT','settlementBase','supplyAmount','vatAmount'],purchase:['purchase','shipping','customs','vatCredit'],movement:['qty']};
    for(const k of numeric[modal.type]||[])r[k]=r[k]==null||r[k]===''?null:Number(r[k]);
    if(modal.type==='product'){r.name=r.name.trim();r.id=r.id.trim();r.active=r.salesStatus!=='판매 중단';if(r.salesStatus==='자재')r.type='부자재';}
    if(modal.type==='bank'){r.description=r.description.trim();r.account=r.accountLabel;r.categoryReviewed=true;}
    if(modal.type==='movement'&&r.type!=='창고이동')delete r.toWarehouse;
    if(modal.type==='purchase')r.lines=r.lines.map(l=>({...l,qty:Number(l.qty),amountKRW:l.amountKRW===''||l.amountKRW==null?null:Number(l.amountKRW),productName:findProduct(l.sku)?.name||l.productName}));
    return r;
  }
  function openVoid(type,id){
    const rows={bank:data.bankTransactions,sale:data.finance.channelTransactions,purchase:data.finance.purchaseEvidence,movement:data.erp.movements}[type];
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
  function openQuick(){priorFocus=document.activeElement;modal={kind:'quick',dirty:false};displayModal(modalMarkup('빠른 기록',`<div class="formgrid">${[['product','상품 등록'],['bank','통장 거래'],['sale','매출 등록'],['purchase','매입 등록'],['movement','입출고 기록'],['partner','거래처 등록']].map(([type,label])=>btn(label,'quick-edit',{type})).join('')}</div>`,{saveLabel:'닫기',footer:'기록할 업무를 선택하세요.'}));}
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
        try{localStorage.setItem('mumutori-before-import',JSON.stringify(data));}catch(e){throw Error('반영 전 복사본을 저장할 공간이 부족합니다. 먼저 전체 백업을 내려받고 저장 공간을 확보하세요.');}
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
      if(action==='import-backup'){const raw=localStorage.getItem('mumutori-before-import');if(!raw)throw Error('이 브라우저에서 백업을 병합한 이력이 없습니다.');download(raw,'mumutori-before-import.json');}
      if(action==='migration-backup'){const raw=localStorage.getItem('mumutori-before-erp');if(!raw)throw Error('이 브라우저에 ERP 전환 전 복사본이 없습니다. 현재 자료는 전체 백업으로 내려받을 수 있습니다.');download(raw,'mumutori-before-erp.json');}
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
      if(el.id==='backup-file'){await backupPreview(el.files[0]);el.value='';return;}
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
    if(e.key!==C.STORAGE_KEY||e.newValue===savedRaw)return;
    if(modal){notify('다른 창에서 자료가 변경되었습니다. 현재 입력을 보관한 뒤 새로고침하세요.',true);return;}
    if(!e.newValue){notify('저장 자료가 다른 창에서 제거되었습니다. 먼저 전체 백업을 내려받으세요.',true);return;}
    try{const latest=store.accept(e.newValue);data=latest.data;savedRaw=latest.raw;render();notify('다른 창의 저장 내용을 반영했습니다.');}catch(err){notify('다른 창의 자료를 읽지 못했습니다. 현재 내용을 백업하세요.',true);}
  });
  window.addEventListener('beforeunload',e=>{if(modal?.dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pageshow',e=>{if(e.persisted&&localStorage.getItem(C.STORAGE_KEY)!==savedRaw)location.reload();});
  render();
})();
