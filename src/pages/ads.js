import { mountAdsHub } from '../ads-private.js';

let serial=0, cleanup=()=>{};
export default function renderPage({head}){
  cleanup();
  const generation=String(++serial);
  queueMicrotask(()=>{
    const root=document.querySelector('.ads-root');
    if(root?.dataset.generation!==generation)return;
    cleanup=mountAdsHub(root);
  });
  return head('광고','쿠팡·네이버·메타·카카오·구글을 한 곳에서. 원 단위 숫자는 로그인(현수·다희) 후에만 보여요.')+
    `<section class="ads-root" aria-label="광고 통합 관리" data-generation="${generation}"><p class="note" role="status">불러오는 중이에요.</p></section>`;
}
