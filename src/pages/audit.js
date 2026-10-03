export default function renderPage(ctx){
  const {C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip}=ctx;
    const rows=data.erp.audit.filter(r=>matches(r,['label','recordId','action'])&&(state.filter==='전체'||TYPE_LABEL[r.type]===state.filter));
    return head('변경 이력','이 브라우저에서 저장한 등록·수정·취소 내역입니다.')+filters('품목, 관리번호, 작업 검색',Object.values(TYPE_LABEL),false,false)+rowsTable(['저장 시각','구분','기록','작업','변경 항목'],rows,r=>`<tr><td class="date">${dateTime(r.date)}</td><td>${esc(TYPE_LABEL[r.type]||r.type)}</td><td class="maincell"><b>${esc(r.label)}</b><span class="sub">${esc(r.recordId)}</span></td><td>${badge(r.action)}</td><td class="audit-fields">${esc(r.fields.join(', '))}</td></tr>`,'아직 저장한 변경이 없습니다.');
  }
