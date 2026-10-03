export default function renderPage(ctx){
  const {C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip}=ctx;
    const rows=data.erp.partners.filter(r=>matches(r,['name','businessNo','contact','memo']));
    return head('거래처','판매처·구매처의 연락처와 정산 메모를 관리하세요.',btn('+ 거래처 등록','edit',{type:'partner'},'primary'))+filters('거래처명, 사업자번호 검색',[],false,false)+rowsTable(['거래처','구분','사업자번호','연락처','메모','관리'],rows,r=>`<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.type)}</td><td>${esc(r.businessNo||'—')}</td><td>${esc(r.contact||'—')}</td><td class="maincell">${esc(r.memo||'')}</td><td>${btn('수정','edit',{type:'partner',id:r.id},'text')}</td></tr>`,'등록된 거래처가 없습니다.',btn('+ 거래처 등록','edit',{type:'partner'},'primary'));
  }
