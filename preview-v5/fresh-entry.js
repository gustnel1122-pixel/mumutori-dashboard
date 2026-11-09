import {current, onAuth, signIn, dbUrl} from '../src/fbauth.js?v=access20261028';
const buildVersion = new URL(import.meta.url).searchParams.get('v');
const buildQuery = buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : '';
const {createAuthenticatedStore} = await import('./fresh-adapter.js' + buildQuery);
const {freshSchema} = await import('./fresh-schema.js' + buildQuery);

// Only this page's new, private root is used. A different identity destroys
// all rendered data and editors before it can start another session.
const root = document.getElementById('fresh-protected');
const status = document.getElementById('fresh-status');
let generation = 0, activeUid = '', store = null, started = false, refreshSequence = 0, refreshController = null;
function message(text, login = false, retry = false) {
  status.replaceChildren();
  const p = document.createElement('p'); p.textContent = text; status.append(p);
  if (login || retry) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = login ? 'Google 로그인' : started && activeUid ? '다시 확인' : '다시 불러오기';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { if (login) await signIn(); else if (started && activeUid) await revalidate(); else location.reload(); }
      catch (_) { p.textContent = '연결을 완료하지 못했어요. 다시 시도해 주세요.'; button.disabled = false; }
    });
    status.append(button);
  }
  status.hidden = false;
}
function wipe(text, login = false) {
  ++generation; ++refreshSequence; refreshController?.abort(); refreshController = null;
  activeUid = ''; store?.stop(); store = null;
  delete window.__MMT_V5_FRESH_STORE__;
  root.hidden = true; root.replaceChildren();
  message(text, login, !login);
}
async function revalidate() {
  const uid=activeUid, sequence=++refreshSequence;
  refreshController?.abort();
  const controller=new AbortController(); refreshController=controller;
  // Hide, but keep unsaved inputs in this document while the same account is
  // rechecked. On denial or account switch wipe() destroys the whole view.
  root.hidden=true; message('접근 권한을 다시 확인하고 있어요.');
  const valid=()=>sequence===refreshSequence && started && activeUid===uid && current()?.uid===uid;
  try {
    const url=await dbUrl('productCatalogPrivate/products_v5');
    if(!valid())return;
    const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
    if(!valid())return;
    if(response.status===401||response.status===403){wipe('이 계정은 상품 관리를 볼 수 없어요.');return;}
    if(!response.ok)throw Error('unavailable');
    await response.body?.cancel();
    if(!valid())return;
    status.hidden=true;root.hidden=false;
  } catch (_) {
    if(valid())message('접근 권한을 확인하지 못했어요. 다시 확인해 주세요.',false,true);
  }
}
onAuth(async user => {
  const uid = user?.uid || '';
  if (started) {
    if (uid !== activeUid) wipe('로그인이 바뀌었어요. 다시 불러와 주세요.', !uid);
    else revalidate();
    return;
  }
  if (store && uid !== activeUid) { wipe('로그인이 바뀌었어요. 다시 불러와 주세요.', !uid); return; }
  if (!uid) { message('상품 관리를 볼 계정으로 로그인해 주세요.', true); return; }
  if (store && uid === activeUid) return;
  const mine = ++generation;
  activeUid = uid;
  message('접근 권한을 확인하고 있어요.');
  const candidate = createAuthenticatedStore({auth:{current,onAuth,dbUrl}, fetchImpl:fetch,
    schema:freshSchema, allowWrites:true,
    onStatus(value) { if (value === 'denied' && mine === generation) wipe('이 계정은 상품 관리를 볼 수 없어요.'); }
  });
  store = candidate;
  try {
    // A server-authorized read is required before loading any private UI.
    await candidate.load();
    if (mine !== generation || current()?.uid !== uid) return;
    window.__MMT_V5_FRESH_STORE__ = candidate;
    await import('./app.js' + buildQuery);
    if (mine !== generation || current()?.uid !== uid) return;
    started = true; status.hidden = true; root.hidden = false;
  } catch (_) {
    if (mine === generation) wipe('상품 자료를 불러오지 못했어요. 연결과 권한을 확인해 주세요.');
  }
});
