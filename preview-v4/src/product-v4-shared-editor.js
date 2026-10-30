import {openPrivateProduct} from './product-v4-private.js';
import {confirmLink} from './product-v4-links.js';

export async function openSharedProductEditor(id,local,isNew){
  const auth=await import('./fbauth.js?v=access20261028'),uid=auth.current()?.uid;
  if(!uid)throw Error('로그인 필요');
  const handle=await openPrivateProduct(id);
  if(auth.current()?.uid!==uid){handle.cancel();throw Error('로그인 변경');}
  if(isNew&&Object.keys(handle.previous).length){handle.cancel();throw Error('상품 번호 중복');}
  const remote=handle.previous.base?.schema==='product-base-v1',old=remote?handle.previous.base:(local||{});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=['판매 중','판매 준비','판매 중단','품절','자재','확인 필요'];
  const fields=[['name','상품명'],['barcode','바코드'],['supplier','주 구매처'],['price','판매가'],['safetyStock','안전재고'],['memo','메모']];
  const overlay=document.createElement('div');overlay.className='overlay pv4-editor shared-product-editor';
  overlay.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="shared-product-title"><div class="modal-head"><h2 id="shared-product-title">상품 ${isNew?'등록':'수정'}</h2><button type="button" data-close aria-label="닫기">×</button></div><form><div class="modal-body"><p>저장하면 로그인한 두 분이 같은 상품 정보를 볼 수 있어요.</p>${local?.sharedLocalDiff?'<p>이 기기에 남은 정보와 공유 정보가 다릅니다. 기기의 기존 기록은 유지됩니다.</p>':''}${!remote&&!isNew?'<p>이 기기의 정보를 확인한 뒤 저장하면 두 분께 공유됩니다.</p>':''}<label>판매 상태<select name="salesStatus">${status.map(s=>`<option ${s===(old.salesStatus||'판매 준비')?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>상품 구분<select name="type"><option ${old.type!=='부자재'?'selected':''}>판매상품</option><option ${old.type==='부자재'?'selected':''}>부자재</option></select></label>${fields.map(([key,label])=>`<label>${label}<input name="${key}" value="${esc(old[key]??'')}" ${key==='name'?'required maxlength="100"':''} ${['price','safetyStock'].includes(key)?'type="number" min="0" step="1"':''}></label>`).join('')}<label>상품 사진<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" data-photo-remove>사진 제거</button><p data-photo-status>${old.imageData?'기존 사진 유지':'사진 없음'}</p><p role="alert" data-error></p></div><div class="modal-footer"><button type="button" data-close>취소</button><button type="submit" class="primary">저장</button></div></form></section>`;
  let closed=false,busy=false,dirty=false,image=old.imageData||null,unsubscribe=()=>{};
  const form=overlay.querySelector('form'),error=overlay.querySelector('[data-error]');
  const guard=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};
  const close=()=>{if(closed)return;closed=true;image=null;window.removeEventListener('beforeunload',guard);window.removeEventListener('mmt-catalog-denied',close);unsubscribe();handle.cancel();overlay.remove();};
  window.addEventListener('beforeunload',guard);window.addEventListener('mmt-catalog-denied',close);
  unsubscribe=auth.onAuth(user=>{if(user?.uid!==uid)close();});
  overlay.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy&&(!dirty||confirm('입력한 내용을 닫을까요?')))close();}));
  form.addEventListener('input',()=>{dirty=true;});
  overlay.querySelector('[data-photo-remove]').onclick=()=>{image=null;dirty=true;overlay.querySelector('[data-photo-status]').textContent='저장하면 사진이 삭제됩니다.';};
  form.elements.photo.addEventListener('change',async()=>{
    const file=form.elements.photo.files[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){error.textContent='10MB 이하 사진을 선택해 주세요.';return;}
    busy=true;form.querySelector('[type=submit]').disabled=true;
    try {const raw=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
      const pic=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=raw;});
      if(closed)return;const canvas=document.createElement('canvas'),scale=Math.min(1,360/Math.max(pic.width,pic.height));canvas.width=Math.max(1,Math.round(pic.width*scale));canvas.height=Math.max(1,Math.round(pic.height*scale));canvas.getContext('2d').drawImage(pic,0,0,canvas.width,canvas.height);image=canvas.toDataURL('image/webp',.75);dirty=true;overlay.querySelector('[data-photo-status]').textContent='새 사진을 선택했어요.';error.textContent='';
    }catch(_){if(!closed)error.textContent='사진을 읽지 못했어요. 기존 사진은 유지됩니다.';}finally{busy=false;if(!closed)form.querySelector('[type=submit]').disabled=false;}
  });
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;error.textContent='';const fd=new FormData(form),base={schema:'product-base-v1'};
    for(const [key] of fields){const raw=String(fd.get(key)||'').trim();if(['price','safetyStock'].includes(key)){if(raw&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))){error.textContent='금액과 재고는 0 이상의 숫자로 입력해 주세요.';return;}base[key]=raw?Number(raw):null;}else base[key]=raw;}
    if(!base.name||base.name.length>100){error.textContent='상품명을 확인해 주세요.';return;}
    base.originName=remote?old.originName:(local?.name||base.name);base.identity=old.identity||crypto.randomUUID();base.salesStatus=String(fd.get('salesStatus'));base.type=base.salesStatus==='자재'?'부자재':String(fd.get('type'));base.active=base.salesStatus!=='판매 중단';base.imageData=image;base.imageSource=image?'직접 등록':null;
    busy=true;form.querySelectorAll('input,select,button').forEach(x=>x.disabled=true);
    try{await handle.save({base});if(local&&!confirmLink(uid,id,base.identity))alert('저장은 됐지만 이 기기에서 연결 확인을 기억하지 못했어요. 다시 연결해 주세요.');window.dispatchEvent(new Event('mmt-catalog-refresh'));dirty=false;close();}catch(_){if(!closed){busy=false;form.querySelectorAll('input,select,button').forEach(x=>x.disabled=false);error.textContent='저장 여부를 확인하지 못했어요. 입력은 그대로예요. 다른 기기의 변경과 연결을 확인해 주세요.';}}
  });
  document.getElementById('modal-root').append(overlay);form.elements.name.focus();
}
