import { mountOrgchart } from '../orgchart-private.js';

let serial=0, cleanupChongwal=()=>{}, cleanupOps=()=>{}, cleanupDaily=()=>{}, cleanupOrg=()=>{}, cleanupRevenue=()=>{};
export default function renderPage({head}){
  cleanupChongwal();cleanupOps();cleanupDaily();cleanupOrg();cleanupRevenue();
  const generation=String(++serial);
  queueMicrotask(async()=>{
    // 20261117_0004: 홈 화면 작은 카드(agents.html#ops-room)에서 왔으면 운영실로 스크롤 — 이 섹션 자체는
    // 화면에 바로 그려져 있으니(비동기 자료를 기다리지 않음) 지금 바로 맞출 수 있다.
    if(location.hash==='#ops-room')document.getElementById('ops-room')?.scrollIntoView({block:'start'});
    // 20261117_1030: 돈 버는 길 — 운영실 맨 위, chongwal-report.js·chongwal-ops.js와도 분리된 자료·코드 경로.
    const revenue=document.querySelector('.revenue-plan-root');
    if(revenue?.dataset.generation===generation){
      const {mountRevenuePlan}=await import(`../revenue-plan.js?v=${document.body.dataset.build}`);
      if(revenue.dataset.generation===generation)cleanupRevenue=mountRevenuePlan(revenue);
    }
    // 20261116_2326: 총괄 보고서 — agents-daily.js(하루 보고)와는 완전히 분리된 자료·코드 경로라 따로 끌어온다.
    const chongwal=document.querySelector('.chongwal-report-root');
    if(chongwal?.dataset.generation===generation){
      const {mountChongwalReport}=await import(`../chongwal-report.js?v=${document.body.dataset.build}`);
      if(chongwal.dataset.generation===generation)cleanupChongwal=mountChongwalReport(chongwal);
    }
    // 20261117_0004: 총괄 운영실 — 제안함·실행전략→일흐름·자리별 지금(ops.json/hub/chongwalOps, 2326과도
    // agents-daily.js와도 분리된 자료·코드 경로).
    const ops=document.querySelector('.ops-dynamic-root');
    if(ops?.dataset.generation===generation){
      const {mountChongwalOps}=await import(`../chongwal-ops.js?v=${document.body.dataset.build}`);
      if(ops.dataset.generation===generation)cleanupOps=mountChongwalOps(ops);
    }
    const daily=document.querySelector('.agents-daily-root');
    if(daily?.dataset.generation===generation){
      // 20261115_0801_v3: 이 import는 agents-daily.js를 직접 끌어오는 유일한 자리라, 빌드 해시를 안 붙이면
      // 서비스워커의 stale-while-revalidate가 옛 버전을 계속 보여준다(캐시가 비워지기 전까지). erp-app.js가
      // 페이지 모듈을 부를 때 쓰는 것과 같은 `document.body.dataset.build` 물음표를 여기도 붙인다.
      const {mountAgentsDaily}=await import(`../agents-daily.js?v=${document.body.dataset.build}`);
      if(daily.dataset.generation===generation)cleanupDaily=mountAgentsDaily(daily);
    }
    const org=document.querySelector('.orgx-root');
    if(org?.dataset.generation===generation)cleanupOrg=mountOrgchart(org);
  });
  return head('AI 자리 · 하루 보고','9개 자리가 한 일 · 알아낸 것 · 숫자를 한눈에 보여줘요.')+
    // 20261117_0004: 사장님 "총괄이 실행 전략을 세우고 에이전트를 관리하는 모습을 보고 싶어" — 보고서 카드(2326,
    // 그대로 재사용) + 제안함 + 실행전략→일흐름 + 자리별 지금, 네 단을 '총괄 운영실' 한 섹션으로 묶는다.
    `<section id="ops-room" class="ops-room" aria-label="총괄 운영실"><div class="ops-room-head"><h2>총괄 운영실</h2><p class="muted">총괄이 전략을 세우고 자리에 일을 나눠 주는 모습을 그림 위주로 봐요.</p></div>` +
    // 20261117_1030: 사장님 피드백 "정확히 뭘 어떻게 수익을 낼 거고 언제까지 할 거다라는 말도 없다" — 돈 버는
    // 길을 운영실 맨 위(보고서 카드보다도 위)에 둔다.
    `<h3 class="ops-block-title">돈 버는 길</h3>` +
    `<section class="revenue-plan-root" data-generation="${generation}" aria-label="돈 버는 길"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<section class="chongwal-report-root" data-generation="${generation}" aria-label="총괄 보고서"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<section class="ops-dynamic-root" data-generation="${generation}" aria-label="제안함 · 일 흐름 · 자리별 지금"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `</section>` +
    `<div class="section-gap"></div>` +
    `<section class="agents-daily-root" data-generation="${generation}" aria-label="하루 보고"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<div class="panel"><div class="panelhead"><h2>우리의 일하는 흐름</h2></div><div class="panelbody"><p class="muted">궁금한 항목을 누르면 이어진 업무와 진행 방법을 볼 수 있어요.</p>` +
    `<section class="orgx-root" data-generation="${generation}" aria-label="조직도"><p class="orgx-message" role="status">조직도를 불러오는 중이에요.</p></section></div></div>`;
}
