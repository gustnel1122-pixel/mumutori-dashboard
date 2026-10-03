export default function renderPage(ctx){
  const {C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip}=ctx;
    const action=btn('+ 입출고 기록','edit',{type:'movement'},'primary');
    let html=head('입출고·재고','실사 수량을 기준으로 입고·출고·반품·창고 이동을 관리합니다.',action)+
      `<div class="chips">${['재고 현황','입출고 원장'].map(v=>btn(v,'stock-tab',{value:v},'chip '+(state.stockTab===v?'active':''))).join('')}</div>`;
    if(state.stockTab==='재고 현황'){
      html+=`${state.attention?'<div class="attention-note">첫 실사가 필요한 상품만 보고 있습니다. '+btn('전체 목록 보기','attention-clear',{},'text')+'</div>':''}`+`<div class="toolbar"><div class="filters"><input id="search" class="search" data-filter="query" aria-label="검색" placeholder="상품명 또는 관리번호 검색" value="${esc(state.query)}"><select id="warehouse" data-filter="warehouse" aria-label="창고 필터">${options(data.erp.warehouses,state.warehouse)}</select></div></div>`;
      const rows=data.products.filter(p=>matches(p,['id','name'])&&p.active!==false&&(!state.attention||state.attention!=='uncounted'||!C.stock(data,p.id,state.warehouse).known));
      html+=rowsTable(['상품','창고','#현재 재고','#안전재고','최근 실사','관리'],rows,p=>{const s=C.stock(data,p.id,state.warehouse);return `<tr><td class="maincell"><b>${esc(p.name)}</b><span class="sub">${esc(p.id)}</span></td><td>${esc(state.warehouse)}</td><td class="num">${s.known?`<span class="stock-qty">${won(s.qty)}</span>개 ${s.qty<=C.num(p.safetyStock)?badge('재고 확인','amber'):''}`:badge('실사 필요','amber')}</td><td class="num">${p.safetyStock!=null?won(p.safetyStock)+'개':'—'}</td><td class="date">${esc(s.lastCount||'기준 수량 없음')}</td><td><div class="rowaction">${btn('실사','count',{id:p.id},'text')}${btn('입출고','move-product',{id:p.id},'text')}</div></td></tr>`;});
      html+='<div class="note">과거 사입 수량은 현재 재고로 자동 반영하지 않습니다. 최초 실사를 등록한 뒤 이후 날짜의 입출고가 재고에 반영됩니다. 실사 날짜 이전 기록은 이력으로 보관합니다.</div>';
    }else{
      html+=filters('상품 관리번호, 메모, 문서번호 검색',C.MOVE_TYPES,true);
      const rows=byDate(visible(data.erp.movements).filter(r=>matches({...r,name:findProduct(r.sku)?.name},['sku','name','memo','sourceId'])&&inMonth(r)&&(state.filter==='전체'||state.filter===r.type)));
      html+=rowsTable(['날짜','구분','상품','창고','#수량','연결 문서','관리'],rows,r=>`<tr ${rowClass(r)}><td class="date">${esc(r.date)}</td><td>${badge(r.type,r.type==='출고'?'amber':'')}</td><td class="maincell"><b>${esc(findProduct(r.sku)?.name||r.sku)}</b><span class="sub">${esc(r.sku)}</span></td><td>${esc(r.warehouse)}${r.toWarehouse?' → '+esc(r.toWarehouse):''}</td><td class="num">${won(r.qty)}</td><td>${r.sourceType==='purchase'?link('purchases',r.sourceId,r.sourceId):r.sourceType==='sale'?link('sales',r.sourceId,r.sourceId):esc(r.sourceId||'직접 기록')}<span class="sub">${esc(r.memo||'')}</span></td><td>${editButtons('movement',r)}</td></tr>`);
    }return html;
  }
