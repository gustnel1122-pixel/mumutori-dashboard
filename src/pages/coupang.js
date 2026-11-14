import { mountCoupangDaily } from '../coupang-private.js';

let serial=0, cleanup=()=>{};
export default function renderPage({head}){
  cleanup();
  const generation=String(++serial);
  queueMicrotask(()=>{
    const root=document.querySelector('.cpg-root');
    if(root?.dataset.generation!==generation)return;
    cleanup=mountCoupangDaily(root);
  });
  return head('쿠팡','매일 아침(09:30) 점검 — 광고 수익률·재고 경보·문의. 원 단위 숫자는 로그인(현수·다희) 후에만 보여요.')+
    `<section class="cpg-root" aria-label="쿠팡 매일 점검" data-generation="${generation}"><p class="note" role="status">불러오는 중이에요.</p></section>`;
}
