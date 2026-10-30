// Private data is held only in memory, never in browser storage or public files.
export async function watchPrivateCatalog(onChange) {
  const auth = await import('./fbauth.js?v=access20261028');
  let epoch = 0, stopped = false, controller = null, acceptedUid = '';
  const changed = async user => {
    const version = ++epoch;
    controller?.abort();
    // A routine refresh for the same authorized account must not tear down an
    // input the user just focused. A different identity is always cleared.
    if (!user?.uid || user.uid !== acceptedUid) { acceptedUid = ''; onChange(null); }
    if (!user?.uid || stopped) return;
    controller = new AbortController();
    try {
      const url = await auth.dbUrl('productCatalogPrivate/data');
      if (version !== epoch || stopped || auth.current()?.uid !== user.uid) return;
      const response = await fetch(url, {method:'GET', cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal:controller.signal});
      if (version !== epoch || stopped || auth.current()?.uid !== user.uid) return;
      if (response.status===401||response.status===403){acceptedUid='';onChange(null);window.dispatchEvent(new Event('mmt-catalog-denied'));return;}
      if (!response.ok) {acceptedUid='';onChange(null);return;}
      const result = await response.json();
      if (version !== epoch || stopped || auth.current()?.uid !== user.uid) return;
      if (result !== null && (!result || typeof result !== 'object' || (result.products != null && typeof result.products !== 'object'))) {acceptedUid='';onChange(null);return;}
      const products=result?.products==null?[]:Array.isArray(result.products)?result.products:Object.values(result.products);
      if(products.length>2000){acceptedUid='';onChange(null);return;}
      const entries=result?.reviewCandidates;
      const candidates=(Array.isArray(entries)?entries:entries&&typeof entries==='object'?Object.values(entries):[]).filter(c=>c&&typeof c.id==='string'&&/^candidate_[a-f0-9]{24}$/.test(c.id)&&typeof c.name==='string'&&c.name.length>0&&c.name.length<=120&&[null,undefined,'set','single','unknown'].includes(c.kind)).map(c=>({...c,kind:c.kind||'unknown'}));
      if(candidates.length>200){acceptedUid='';onChange(null);return;}
      acceptedUid=user.uid;
      onChange(products.filter(p => p && typeof p.id === 'string' && /^[A-Za-z0-9가-힣_-]{1,100}$/.test(p.id)),candidates);
    } catch (_) { if(version===epoch){acceptedUid='';onChange(null);} }
  };
  const unsubscribe = auth.onAuth(changed);
  let lastVisibleRefresh=0;
  const refresh=()=>changed(auth.current());window.addEventListener('mmt-catalog-refresh',refresh);
  const refreshVisible=()=>{if(document.visibilityState!=='visible'||Date.now()-lastVisibleRefresh<5000)return;lastVisibleRefresh=Date.now();refresh();};
  window.addEventListener('focus',refreshVisible);document.addEventListener('visibilitychange',refreshVisible);
  return () => { stopped = true; ++epoch; controller?.abort(); unsubscribe(); window.removeEventListener('mmt-catalog-refresh',refresh);window.removeEventListener('focus',refreshVisible);document.removeEventListener('visibilitychange',refreshVisible); onChange(null); };
}

// Per-item conditional writes prevent another device's changes being overwritten.
export async function openPrivateProduct(id, bucket='products') {
  if(!/^[A-Za-z0-9가-힣_-]{1,100}$/.test(id))throw Error('상품 번호를 확인해 주세요.');
  if(!['products','reviewCandidates'].includes(bucket)||(bucket==='reviewCandidates'&&!/^candidate_[a-f0-9]{24}$/.test(id)))throw Error('상품 정보를 확인해 주세요.');
  const auth=await import('./fbauth.js?v=access20261028'),uid=auth.current()?.uid;
  if(!uid)throw Error('다시 로그인한 뒤 확인해 주세요.');
  const controller=new AbortController();let alive=true;
  const unsubscribe=auth.onAuth(user=>{if(user?.uid!==uid){alive=false;controller.abort();}});
  const check=()=>{if(!alive||auth.current()?.uid!==uid)throw Error('로그인이 바뀌어 저장을 멈췄어요.');};
  try {
    const url=await auth.dbUrl('productCatalogPrivate/data/'+bucket+'/'+encodeURIComponent(id));check();
    const result=await fetch(url,{method:'GET',headers:{'X-Firebase-ETag':'true'},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});check();
    if(result.status===401||result.status===403)window.dispatchEvent(new Event('mmt-catalog-denied'));
    if(!result.ok)throw Error('상품 정보를 읽지 못했어요. 권한과 연결을 확인해 주세요.');
    const etag=result.headers.get('ETag'),previous=await result.json();check();
    if(!etag||previous!==null&&(typeof previous!=='object'||Array.isArray(previous)))throw Error('상품 정보를 확인하지 못했어요.');
    if(bucket==='reviewCandidates'&&(!previous||previous.id!==id))throw Error('이 확인 항목을 다시 불러와 주세요.');
    let saving=false;
    return {previous:previous||{},cancel(){alive=false;controller.abort();unsubscribe();},async save(fields){
      check();if(saving)throw Error('이미 저장하고 있어요.');saving=true;
      try {const freshUrl=await auth.dbUrl('productCatalogPrivate/data/'+bucket+'/'+encodeURIComponent(id));check();
      const response=await fetch(freshUrl,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({...previous,...fields,id}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      check();if(response.status===401||response.status===403)throw Error('이 계정은 수정 권한이 없어요. 입력 내용은 그대로예요.');
      if(response.status===412)throw Error('다른 곳에서 상품이 바뀌었어요. 입력 내용을 복사하고 다시 열어 주세요.');
      if(!response.ok)throw Error('저장하지 못했어요. 권한과 연결을 확인해 주세요.');
      alive=false;unsubscribe();window.dispatchEvent(new Event('mmt-catalog-refresh'));
      } finally {saving=false;}
    }};
  } catch(e){alive=false;unsubscribe();if(e.name==='AbortError')throw Error('로그인이 바뀌어 작업을 멈췄어요.');throw e;}
}
