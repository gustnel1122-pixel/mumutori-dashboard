// Only the server-authorized session gets a product runtime. The frame is
// destroyed synchronously on logout/account change, including its DOM and JS.
import {current, onAuth, signIn, dbUrl} from '../src/fbauth.js?v=access20261028';

const root=document.getElementById('root');
let generation=0, controller=null, frame=null, activeUid='', status=null;
const appDocument=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base target="_top"><title>상품 관리 미리보기</title><link rel="stylesheet" href="preview-v4/src/erp.css?v=preview20261031"></head><body data-page="products" data-build="preview20261031"><div id="root"><main role="status">상품을 불러오고 있어요.</main></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div><script src="assets/vendor/firebase/firebase-app-compat.js?sdk=12.19.0"><\/script><script src="assets/vendor/firebase/firebase-auth-compat.js?sdk=12.19.0"><\/script><script src="assets/vendor/firebase/firebase-database-compat.js?sdk=12.19.0"><\/script><script src="src/erp-core.js?v=preview20261031"><\/script><script type="module" src="preview-v4/src/erp-app.js?v=preview20261031"><\/script></body></html>`;

function reset(){if(frame){frame.remove();frame=null;}activeUid='';status=null;root.replaceChildren();}
function message(text,login=false,keep=false,retry=false){
  if(!keep)reset();else{if(frame)frame.hidden=true;status?.remove();}
  const main=document.createElement('main');main.className='preview-gate';
  status=main;
  const h=document.createElement('h1');h.textContent='상품 관리 미리보기';main.append(h);
  const p=document.createElement('p');p.textContent=text;main.append(p);
  if(login){const button=document.createElement('button');button.type='button';button.textContent='Google 로그인';button.addEventListener('click',async()=>{button.disabled=true;try{await signIn();}catch(_){p.textContent='로그인을 완료하지 못했어요. 다시 시도해 주세요.';button.disabled=false;}});main.append(button);}
  if(retry){const button=document.createElement('button');button.type='button';button.textContent='다시 불러오기';button.addEventListener('click',()=>transition(current()));main.append(button);}
  root.append(main);
}
async function transition(user){
  const keep=Boolean(frame&&user?.uid&&user.uid===activeUid);
  const version=++generation;
  controller?.abort();controller=null;
  // A different identity always loses the entire previous browsing context.
  if(!keep)reset();
  if(!user?.uid){message('사장님 또는 다희 님 계정으로 로그인해 주세요.',true);return;}
  const uid=user.uid;
  message('접근 권한을 확인하고 있어요.',false,keep);
  controller=new AbortController();
  try {
    const url=await dbUrl('productCatalogPrivate/data');
    if(version!==generation||current()?.uid!==uid)return;
    const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
    if(version!==generation||current()?.uid!==uid)return;
    if(response.status===401||response.status===403){message('이 계정은 상품 미리보기를 볼 수 없어요.');return;}
    if(!response.ok){message('연결을 확인한 뒤 다시 불러와 주세요.',false,keep,true);return;}
    // Authorization is checked by the server. The body is intentionally discarded.
    await response.body?.cancel();
    if(version!==generation||current()?.uid!==uid)return;
    if(keep&&frame){status?.remove();status=null;frame.hidden=false;return;}
    frame=document.createElement('iframe');frame.className='preview-frame';
    frame.title='상품 관리 미리보기';frame.srcdoc=appDocument;activeUid=uid;
    root.replaceChildren(frame);
  } catch(_) {
    if(version!==generation)return;
    message('연결을 확인한 뒤 다시 불러와 주세요.',false,keep,true);
  }
}
onAuth(transition);
