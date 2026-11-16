import { mountOrgchart } from '../orgchart-private.js';

let serial=0, cleanupChongwal=()=>{}, cleanupDaily=()=>{}, cleanupOrg=()=>{};
export default function renderPage({head}){
  cleanupChongwal();cleanupDaily();cleanupOrg();
  const generation=String(++serial);
  queueMicrotask(async()=>{
    // 20261116_2326: 총괄 보고서 — agents-daily.js(하루 보고)와는 완전히 분리된 자료·코드 경로라 따로 끌어온다.
    const chongwal=document.querySelector('.chongwal-report-root');
    if(chongwal?.dataset.generation===generation){
      const {mountChongwalReport}=await import(`../chongwal-report.js?v=${document.body.dataset.build}`);
      if(chongwal.dataset.generation===generation)cleanupChongwal=mountChongwalReport(chongwal);
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
    `<section class="chongwal-report-root" data-generation="${generation}" aria-label="총괄 보고서"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<section class="agents-daily-root" data-generation="${generation}" aria-label="하루 보고"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<div class="panel"><div class="panelhead"><h2>우리의 일하는 흐름</h2></div><div class="panelbody"><p class="muted">궁금한 항목을 누르면 이어진 업무와 진행 방법을 볼 수 있어요.</p>` +
    `<section class="orgx-root" data-generation="${generation}" aria-label="조직도"><p class="orgx-message" role="status">조직도를 불러오는 중이에요.</p></section></div></div>`;
}
