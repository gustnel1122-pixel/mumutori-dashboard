export default function renderPage(ctx){
  const {C,data,state,esc,won,money,dateTime,badge,btn,options,TYPE_LABEL,accountName,findProduct,matches,inMonth,visible,byDate,rowClass,rowsTable,editButtons,filters,metric,head,accountSummary,link,icon,departmentCards,workflowStrip}=ctx;
    const rows=byDate(visible(data.bankTransactions).filter(r=>matches(r,['id','description','memo','accountLabel','category'])&&inMonth(r)&&(!state.attention||!['pending'].includes(state.attention)||['미분류','자금입금·용도 확인'].includes(C.bankCategory(r)))&&(state.filter==='전체'||C.bankCategory(r)===state.filter)));
    const s=C.financeSummary(data,state.month);
    return head('통장·자금','입출금의 성격을 기록하고 매출 수금과 연결하세요.',btn('CSV 가져오기','csv-open')+btn('+ 거래 등록','edit',{type:'bank'},'primary'))+
      `<div class="metrics">${metric('외부 입금',s.inflow,'원','사업 계좌 간 이체 제외')}${metric('외부 출금',s.outflow,'원','기록된 자금 사용액')}${metric('자금 충전',s.funding,'원','매출 집계에서 제외')}${metric('대여금 회수',s.loanReceived,'원','매출 집계에서 제외')}</div>`+
      `<div class="note section-gap" style="margin-bottom:18px">김현수·백다희의 입금은 <b>자금 충전 / 대여금 회수</b>로 관리합니다. 서로 짝이 확인된 사업 계좌 간 이체는 자금 이동으로 유지합니다.</div>`+
      filters('거래 내용, 계좌, 메모 검색',C.BANK_CATEGORIES,true)+
      rowsTable(['날짜','계좌','거래 내용','분류','#입금','#출금','관리'],rows,r=>`<tr ${rowClass(r)}><td class="date">${esc(r.date)}</td><td>${esc(accountName(r.accountLabel||r.account))}</td><td class="maincell"><b>${esc(r.description)}</b><span class="sub">${esc(r.memo||r.sourceFile||'직접 입력')}</span></td><td>${badge(C.bankCategory(r),C.bankCategory(r).includes('확인')?'amber':'')}${r.voided?badge('취소','red'):''}</td><td class="num plus">${r.direction==='입금'?money(r.amount):'—'}</td><td class="num minus">${r.direction==='출금'?money(r.amount):'—'}</td><td>${editButtons('bank',r)}</td></tr>`);
  }
