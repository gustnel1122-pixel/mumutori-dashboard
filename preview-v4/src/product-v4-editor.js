import {openPrivateProduct} from './product-v4-private.js';

export async function openCatalogEditor(id, knownProducts, bucket='products') {
  const auth=await import('./fbauth.js?v=access20261028'), uid=auth.current()?.uid;
  if(!uid)throw Error('로그인한 뒤 다시 시도해 주세요.');
  const handle=await openPrivateProduct(id,bucket);
  if(auth.current()?.uid!==uid){handle.cancel();throw Error('로그인이 바뀌어 작업을 멈췄어요.');}
  const old=handle.previous, esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const overlay=document.createElement('div');overlay.className='overlay pv4-editor';
  const kind=['single','set'].includes(old.kind)?old.kind:'';
  const components=(Array.isArray(old.components)?old.components:[]).filter(x=>x&&x.id);
  overlay.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="pv4-title"><div class="modal-head"><h2 id="pv4-title">상품 정보 입력</h2><button type="button" data-close aria-label="닫기">×</button></div><form id="pv4-editor-form"><div class="modal-body"><p>확인한 내용만 입력해요. 빈 칸은 확인 필요로 남아요.</p><label>구분<select name="kind"><option value="">확인 필요</option><option value="single" ${kind==='single'?'selected':''}>단품</option><option value="set" ${kind==='set'?'selected':''}>세트</option></select></label><div class="pv4-editor-parts"><p>세트 구성품</p><div data-parts></div><button type="button" data-add>+ 구성품 추가</button><small>구성을 아직 모르면 비워 두세요.</small></div><label>원가 (원)<input name="cost" type="number" min="0" step="1" value="${esc(old.cost??'')}"></label><details><summary>배송·통관을 나눠 원가 계산</summary><p>이 상품 구매액과 수량, 전체 수량을 입력하면 배송·통관비는 수량 비율로 나눠요. 비어 있으면 확인 필요예요.</p><label>이 상품 구매액<input name="purchase" type="number" min="0" step="1" value="${esc(old.breakdown?.purchase??'')}"></label><label>전체 배송비<input name="shipping" type="number" min="0" step="1" value="${esc(old.breakdown?.shipping??'')}"></label><label>전체 통관비<input name="customs" type="number" min="0" step="1" value="${esc(old.breakdown?.customs??'')}"></label><label>전체 수량<input name="totalQuantity" type="number" min="1" step="1" value="${esc(old.breakdown?.totalQuantity??'')}"></label><label>이 상품 수량<input name="itemQuantity" type="number" min="1" step="1" value="${esc(old.breakdown?.itemQuantity??'')}"></label></details><label><input name="estimated" type="checkbox" ${old.estimated?'checked':''}> 원가는 예상 금액이에요</label><label>KC 확인 상태<select name="kcStatus"><option value="확인 필요">확인 필요</option><option value="확인 완료" ${old.kcStatus==='확인 완료'?'selected':''}>확인 완료</option><option value="해당 없음" ${old.kcStatus==='해당 없음'?'selected':''}>해당 없음</option></select></label><p role="alert" data-error></p></div><div class="modal-footer"><button type="button" data-close>취소</button><button type="submit" class="primary">저장</button></div></form></section>`;
  let closed=false,busy=false,dirty=false;const form=overlay.querySelector('form'),error=overlay.querySelector('[data-error]');
  let unsubscribe=()=>{};
  const guard=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',guard);
  const close=()=>{if(closed)return;closed=true;window.removeEventListener('beforeunload',guard);window.removeEventListener('mmt-catalog-denied',close);unsubscribe();handle.cancel();overlay.remove();};
  window.addEventListener('mmt-catalog-denied',close);
  unsubscribe=auth.onAuth(user=>{if(user?.uid!==uid)close();});
  const addPart=(part={})=>{const row=document.createElement('div');row.className='pv4-editor-part';const current=String(part.id||'');const choices=[...knownProducts].filter(([key,v])=>key!==id&&(typeof v==='object'?v.kind:v)!=='set').map(([key,v])=>`<option value="${esc(key)}" ${key===current?'selected':''}>${esc(typeof v==='object'?v.name||'이름 확인 필요':key)}</option>`).join('');row.innerHTML=`<select aria-label="구성 상품"><option value="">상품 선택</option>${current&&!knownProducts.has(current)?`<option value="${esc(current)}" selected>상품 확인 필요</option>`:''}${choices}</select><input aria-label="구성 수량" type="number" min="1" step="1" value="${esc(part.quantity??1)}"><button type="button" data-remove>삭제</button>`;row.querySelector('[data-remove]').onclick=()=>{row.remove();dirty=true;};overlay.querySelector('[data-parts]').append(row);};
  components.forEach(addPart);overlay.querySelector('[data-add]').onclick=()=>{addPart();dirty=true;};
  overlay.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>{if(!busy&&(!dirty||confirm('입력한 내용을 닫을까요?')))close();}));
  form.addEventListener('input',()=>{dirty=true;});
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;error.textContent='';
    const fd=new FormData(form),selected=String(fd.get('kind')||''),raw=String(fd.get('cost')||'').trim(),rows=[...form.querySelectorAll('.pv4-editor-part')],components=[],seen=new Set();
    if(raw&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))){error.textContent='원가는 0 이상의 숫자로 입력해 주세요.';return;}
    const parts=['purchase','shipping','customs','totalQuantity','itemQuantity'],breakdown={};let hasBreakdown=false;
    for(const key of parts){const value=String(fd.get(key)||'').trim();if(value&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||(/Quantity$/.test(key)&&Number(value)<1))){error.textContent='구매액·배송비·통관비는 0 이상, 수량은 1 이상으로 입력해 주세요.';return;}breakdown[key]=value?Number(value):null;if(value)hasBreakdown=true;}
    if(breakdown.totalQuantity!=null&&breakdown.itemQuantity!=null&&breakdown.itemQuantity>breakdown.totalQuantity){error.textContent='이 상품 수량이 전체 수량보다 많아요.';return;}
    for(const row of rows){const partId=row.querySelector('select').value,qty=row.querySelector('input').value,v=knownProducts.get(partId);if(!partId||partId===id||seen.has(partId)||!knownProducts.has(partId)||(typeof v==='object'?v.kind:v)==='set'||!/^([1-9]\d*)$/.test(qty)||!Number.isSafeInteger(Number(qty))){error.textContent='등록된 구성품과 수량을 겹치지 않게 선택해 주세요.';return;}seen.add(partId);components.push({id:partId,quantity:Number(qty)});}
    if(selected!=='set'&&components.length){error.textContent='구성품은 세트를 선택한 뒤 입력해 주세요.';return;}
    busy=true;form.dataset.busy='1';form.querySelectorAll('input,select,textarea,button').forEach(x=>{x.disabled=true;});
    try {await handle.save({kind:selected||null,components,cost:raw?Number(raw):null,breakdown:hasBreakdown?breakdown:null,estimated:fd.has('estimated'),kcStatus:String(fd.get('kcStatus')||'확인 필요')});dirty=false;close();}
    catch(e){if(!closed){const denied='이 계정은 수정 권한이 없어요. 입력 내용은 그대로예요.';error.textContent=e?.message===denied?denied:'저장 여부를 확인하지 못했어요. 입력은 그대로 두었어요. 연결과 다른 기기의 변경을 확인해 주세요.';busy=false;delete form.dataset.busy;form.querySelectorAll('input,select,textarea,button').forEach(x=>{x.disabled=false;});}}
  });
  document.getElementById('modal-root').append(overlay);form.querySelector('select').focus();
}
