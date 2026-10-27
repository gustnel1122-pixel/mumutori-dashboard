import { CATEGORY_HELP } from './fin-classify.js';
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Native modal provides focus trapping, Escape and a safe focus return.
export function chooseCategory({categories,value='',vendor='',onSelect}) {
  document.querySelector('.fin-category-sheet')?.remove();
  const from=document.activeElement, d=document.createElement('dialog');
  d.className='fin-category-sheet fin-scope'; d.setAttribute('aria-labelledby','fin-category-title');
  d.innerHTML=`<header><div><h2 id="fin-category-title">분류 고르기</h2><p>무엇에 쓴 돈인지 골라 주세요.</p></div><button type="button" data-close aria-label="닫기">✕</button></header>
    <div class="fin-category-options">${categories.map(c=>`<button type="button" data-category="${esc(c)}" aria-pressed="${c===value}"><span>${esc(c)}</span><small>${esc(CATEGORY_HELP[c]||'들어온 돈의 성격을 골라 주세요.')}</small></button>`).join('')}</div>
    ${vendor?'<label class="q-check"><input type="checkbox" class="fin-always"> 앞으로 이 거래처는 항상</label>':''}<p class="q-msg" role="alert"></p>`;
  d.addEventListener('close',()=>{d.remove();if(from?.isConnected)from.focus();});
  d.addEventListener('click',async ev=>{
    const b=ev.target.closest('button');
    if(b?.hasAttribute('data-close')||ev.target===d){d.close();return;}
    if(!b?.dataset.category)return;
    const buttons=[...d.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
    try{await onSelect(b.dataset.category,!!d.querySelector('.fin-always')?.checked);d.close();}
    catch(err){d.querySelector('.q-msg').textContent=err.message;buttons.forEach(x=>x.disabled=false);}
  });
  document.body.append(d);d.showModal();d.querySelector(`[aria-pressed="true"]`)?.focus();
  return d;
}
