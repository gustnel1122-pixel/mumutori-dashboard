import { mountOrgchart } from '../orgchart-private.js';

let serial=0, cleanup=()=>{};
export default function renderPage({head}){
  cleanup();
  const generation=String(++serial);
  queueMicrotask(()=>{
    const root=document.querySelector('.orgx-root');
    if(root?.dataset.generation!==generation)return;
    cleanup=mountOrgchart(root);
  });
  return head('우리의 일하는 흐름','궁금한 항목을 누르면 이어진 업무와 진행 방법을 볼 수 있어요.')+
    `<section class="orgx-root" data-generation="${generation}" aria-label="조직도"><p class="orgx-message" role="status">조직도를 불러오는 중이에요.</p></section>`;
}
