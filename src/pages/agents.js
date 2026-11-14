import { mountOrgchart } from '../orgchart-private.js';
import { mountAgentsDaily } from '../agents-daily.js';

let serial=0, cleanupDaily=()=>{}, cleanupOrg=()=>{};
export default function renderPage({head}){
  cleanupDaily();cleanupOrg();
  const generation=String(++serial);
  queueMicrotask(()=>{
    const daily=document.querySelector('.agents-daily-root');
    if(daily?.dataset.generation===generation)cleanupDaily=mountAgentsDaily(daily);
    const org=document.querySelector('.orgx-root');
    if(org?.dataset.generation===generation)cleanupOrg=mountOrgchart(org);
  });
  return head('AI 자리 · 하루 보고','9개 자리가 오늘 한 일·업그레이드·막힘을 모아 보여줘요. 숫자·원가·개인정보는 여기 안 적어요.')+
    `<section class="agents-daily-root" data-generation="${generation}" aria-label="하루 보고"><p class="note" role="status">불러오는 중이에요.</p></section>` +
    `<div class="section-gap"></div>` +
    `<div class="panel"><div class="panelhead"><h2>우리의 일하는 흐름</h2></div><div class="panelbody"><p class="muted">궁금한 항목을 누르면 이어진 업무와 진행 방법을 볼 수 있어요.</p>` +
    `<section class="orgx-root" data-generation="${generation}" aria-label="조직도"><p class="orgx-message" role="status">조직도를 불러오는 중이에요.</p></section></div></div>`;
}
