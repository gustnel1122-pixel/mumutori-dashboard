// 운영 홈 — 검수 기준 '3초 규칙': 맨 위에 '챙길 일(건수) + 이번 달', 그 아래 한 줄 띠, 옛 장부 숫자 · 부서 바로가기는 접기.
// 이번 달 숫자 · 확인 필요 건수는 공용 장부 기준(검수 2번, 장부 여는 방식 = 구글 로그인으로 정해짐 10/20).
// - 로그인돼 있으면 home-fin.js가 장부를 읽어(쓰지 않음) #home-need-line · #home-month-body를 바로 바꿔 넣는다.
// - 아래 기본 글은 로그인 전 모습: 재무 · 폰 장부 화면이 이 브라우저에 남긴 '건수와 시각'(fin-form rememberNeeds) 또는 안내.
// - 시연 모드(?demo=1)면 가짜 장부로 바로 센다.
const NEEDS_KEY='mmt-fin-needs-v1';
function finHint(){
  const F=window.FinCore,demo=window.__MMT_DEMO__&&window.__MMT_TEST_FIN__;
  if(demo&&F){const s=F.summarize(demo,'month');return {needs:s.needs,month:s,basis:'시연 자료'};}
  try{
    const h=JSON.parse(localStorage.getItem(NEEDS_KEY)||'null');
    if(h&&Number.isFinite(h.n)){
      const at=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(h.at));
      return {needs:h.n,month:null,basis:at+' 재무 화면 기준'};
    }
  }catch{/* 저장소 없음 */}
  return {needs:null,month:null,basis:''};
}
export default function overview(ctx){
  const {C,data,state,esc,won,money,dateTime,badge,btn,icon,metric,link,departmentCards,workflowStrip}=ctx;
  const s=C.financeSummary(data),products=data.products.filter(p=>p.active!==false);
  const counts=products.filter(p=>!C.stock(data,p.id,state.warehouse).known).length;
  const inbound=C.active(C.purchases(data)).filter(p=>C.sum(p.lines,'qty')>C.sum(p.lines,l=>C.moved(data,'purchase',p.orderNo,l.sku))).length;
  const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  const tasks=[['bank','pending','재무 · 통장','분류를 기다리는 거래',s.pending,'건','blue'],['sales','unlinked','판매팀','통장 입금과 안 맞춘 매출',s.unlinked,'건','pink'],['stock','uncounted','물류팀','첫 실사가 필요한 상품',counts,'개','green'],['purchases','unreceived','구매팀','입고 기록을 확인할 매입',inbound,'건','purple']];
  const fin=finHint();
  // 챙길 일 첫 줄: 재무 확인 필요 N건(모르면 숫자 대신 '재무에서 보기' — 틀린 숫자보다 빈칸)
  // 로그인돼 있으면 home-fin.js가 공용 장부로 이 줄과 '이번 달'을 바로 바꿔 넣는다(id 자리)
  const needLine=fin.needs==null
    ?`<a class="task-link" id="home-need-line" href="finance.html"><span class="task-dept tone-blue">재무</span><b>확인 필요 결제 · 분류 안 된 줄<small class="task-basis">로그인하거나 재무 화면을 열면 건수가 보여요</small></b><strong>재무<em>에서 보기</em></strong><span class="task-arrow">↗</span></a>`
    :`<a class="task-link${fin.needs?' task-hot':''}" id="home-need-line" href="finance.html#fin-needs"><span class="task-dept tone-blue">재무</span><b>${fin.needs?'확인 필요 결제 · 분류 · 수단 빈칸':'확인 필요 없음'}<small class="task-basis">${esc(fin.basis)}</small></b><strong>${won(fin.needs)}<em>건</em></strong><span class="task-arrow">↗</span></a>`;
  // 이번 달: 공용 장부 숫자는 재무 화면 맨 위(홈에서 장부 열기는 검수 2번과 함께). 시연이면 가짜 장부로 보여 준다.
  const m=fin.month;
  const monthBody=m
    ?`<div class="mini-row"><span>매출</span><strong>${money(m.sales)}</strong></div><div class="mini-row"><span>지출</span><strong>${money(m.spend)}</strong></div><div class="mini-row"><span>${m.salesConnected?'남는 돈(추정)':'돈 흐름(들어온 돈 − 나간 돈)'}</span><strong>${money(m.salesConnected?m.net:m.cashFlow)}</strong></div><p>${m.salesConnected?'채널 매출 · 수수료 반영 추정':'채널 매출 연결 전이라 실제 손익 아님'} · ${esc(fin.basis)}</p>`
    :`<p class="month-empty">이번 달 매출 · 지출 · 돈 흐름은 <b>재무 화면 맨 위</b>에 있어요(폰 · PC 같은 공용 장부).</p>${link('finance','재무에서 이번 달 보기')}`;
  const audit=data.erp.audit.slice(0,3);
  return `<div class="home-heading"><div><div class="eyebrow">무무토리 운영실</div><h1>오늘도, 무무토리<span class="title-dot">.</span></h1></div><span class="today-date">${date}</span></div>`+
    `<div class="home-top"><section class="panel task-panel"><div class="panelhead"><h2>다음으로 챙길 일 <span class="accent-orange">✳</span></h2>${badge('실제 할 일')}</div><div class="task-list">${needLine}</div>`+
      // 옛 장부(과거 기록 포함) 숫자는 사장님 할 일이 아니라 참고값이라 접어 둔다(검수 기준 2)
      `<details class="legacy-tasks"><summary>옛 장부 참고 숫자 <small>과거 기록 포함 · 지금 할 일 아님</small></summary><div class="task-list">${tasks.map(([v,a,dept,label,count,unit,tone])=>`<a class="task-link" href="${v}.html?attention=${a}"><span class="task-dept tone-${tone}">${dept}</span><b>${label}</b><strong>${won(count)}<em>${unit}</em></strong><span class="task-arrow">↗</span></a>`).join('')}</div><div class="task-foot">10/03 이전 옛 장부(이 PC 브라우저)에서 센 숫자예요. 실제 미수금 · 미입고 확정 건수는 아닙니다.</div></details></section>`+
      `<section class="panel month-panel"><div class="panelhead"><h2>이번 달</h2>${badge(m?'시연':'공용 장부')}</div><div class="panelbody" id="home-month-body">${monthBody}</div></section></div>`+
    // 큰 그림 배너 → 한 줄 띠(3초 규칙)
    `<section class="home-strip"><b>작은 기록이 모여, 우리의 다음이 되니까.</b><span>상품부터 정산까지 하나로 이어지는 무무토리 운영실</span>${btn('오늘의 기록 남기기 ↗','quick',{},'hero-cta')}</section>`+
    `<details class="legacy-ledger home-fold"><summary><b>옛 장부 숫자</b><small>10/03 이전 · 이 PC 브라우저 기록 · 공용 장부와 따로 계산</small></summary><div class="metrics home-metrics">${metric('기록된 매출',s.salesGross,'원','부가세 포함 · '+s.salesCount+'건')}${metric('외부 입금',s.inflow,'원','자금 충전·회수 포함 / 매출과 별도')}${metric('외부 출금',s.outflow,'원','매입·비용 등 / 내부 이체 제외')}${metric('함께 관리하는 상품',products.length,'개','운영 중인 상품 · 중단 이력 별도 보관')}</div></details>`+
    // 부서 카드는 왼쪽 메뉴와 겹쳐 접어 둔다(검수 13)
    `<details class="legacy-ledger home-fold"><summary><b>부서 바로가기</b><small>왼쪽 메뉴와 같은 곳 · 부서별 설명</small></summary>${departmentCards()}</details>`+
    // 최근의 발자취(이 브라우저의 등록 · 수정 기록)는 있을 때만(검수 12 — 비어 있으면 오해)
    (audit.length?`<section class="panel activity-panel home-activity"><div class="panelhead"><h2>최근의 발자취</h2><small class="task-basis">이 PC 브라우저의 등록 · 수정</small>${link('audit','전체 보기')}</div><div class="panelbody">${audit.map(a=>`<div class="activity"><i></i><div><b>${esc(a.label)}</b><small>${esc(a.action)} · ${dateTime(a.date)}</small></div></div>`).join('')}</div></section>`:'')+
    workflowStrip();
}
