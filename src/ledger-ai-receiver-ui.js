// Local candidate: mount next to the existing notification settings.
// No receiver is set until the signed-in user explicitly clicks the button.
import {current,onAuth,dbUrl} from './fbauth.js?v=access20261028';
let generation=0,busy=false,active=new Set(),host=null;
let status='두 분이 각자 본인 휴대폰에서 알림을 켠 뒤 지정해 주세요.';
const session=()=>{const user=current();return user?.uid?{uid:user.uid,generation}:null;};
const check=(snapshot)=>{const now=session();if(!snapshot||!now||now.uid!==snapshot.uid||now.generation!==snapshot.generation)throw Error('SESSION_CHANGED');};
function paint(){
 if(!host)return;
 host.replaceChildren();host.className='panel';
 const header=document.createElement('div');header.className='panelhead';
 const h=document.createElement('h2');h.textContent='장부 결과 알림을 받을 휴대폰';header.append(h);host.append(header);
 const body=document.createElement('div');body.className='panelbody';
 const text=document.createElement('p');text.textContent=status;text.setAttribute('role','status');text.setAttribute('aria-live','polite');body.append(text);
 const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=busy?'확인 중…':'이 휴대폰으로 지정';button.disabled=busy||!session();button.addEventListener('click',event=>{if(event.isTrusted)register();});body.append(button);host.append(body);
}
async function request(path,{method='GET',body,etag}={}){
 const before=session();if(!before)throw Error('LOGIN_REQUIRED');
 const controller=new AbortController();active.add(controller);
 try{
  const url=await dbUrl('appPush/'+path);check(before);
  const headers={};if(method==='GET')headers['X-Firebase-ETag']='true';if(method==='PUT'){headers['Content-Type']='application/json';headers['If-Match']=etag;}
  const response=await fetch(url,{method,headers,body:method==='PUT'?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});check(before);
  let result=null;if(method==='GET'&&response.ok){result=await response.json();check(before);}
  return {status:response.status,etag:response.headers.get('ETag'),body:result};
 }finally{active.delete(controller);}
}
const message=code=>({LOGIN_REQUIRED:'로그인한 뒤 다시 눌러 주세요.',ROLE_UNAVAILABLE:'이 계정은 지정할 수 없거나 서버 준비가 필요해요.',SERVER_UNAVAILABLE:'연결을 확인한 뒤 다시 눌러 주세요.',NO_CONDITIONAL_WRITE:'안전한 저장을 확인하지 못해 지정을 멈췄어요.',DEVICE_UNAVAILABLE:'먼저 이 휴대폰에서 알림 받기를 켜 주세요.',DEVICE_MISMATCH:'이 휴대폰 알림을 다시 켠 뒤 지정해 주세요.',DIGEST_FAILED:'휴대폰 확인에 실패했어요. 다시 열어 주세요.',SESSION_CHANGED:'로그인이 바뀌어 지정을 멈췄어요.',CONFLICT:'다른 곳에서 설정이 바뀌었어요. 다시 확인해 주세요.',WRITE_DENIED:'권한이나 연결을 확인하지 못해 지정을 멈췄어요.',WRITE_UNKNOWN_NO_RETRY:'저장 결과를 확인하지 못했어요. 다시 누르기 전에 설정을 확인해 주세요.',VERIFY_FAILED:'지정 결과를 확인하지 못했어요. 설정을 다시 확인해 주세요.'})[code]||'휴대폰 지정을 마치지 못했어요. 연결과 설정을 확인해 주세요.';
async function register(){
 if(busy)return;busy=true;paint();
 const build=String(document.body.dataset.build||'');
 const api={session,
  readRole:role=>request('ledgerAiReceivers/'+role),
  currentPhoneProof:async()=>{const before=session();try{const push=await import('./app-push.js?v='+build);const proof=await push.ledgerReceiverCurrentDeviceProof();check(before);return proof;}catch(_){check(before);throw Error('DEVICE_UNAVAILABLE');}},
  readOwnDevice:(uid,id)=>request('devices/'+uid+'/'+id),
  digest:async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join(''),
  compareAndSet:(role,value,etag)=>request('ledgerAiReceivers/'+role,{method:'PUT',body:value,etag})
 };
 try{if(!/^[a-f0-9]{12}$/.test(build))throw Error('BUILD_UNAVAILABLE');const {bindCurrentPhone}=await import('./ledger-ai-receiver-core.js?v='+build);await bindCurrentPhone(api);status='이 휴대폰을 장부 결과 알림 수신기로 지정했어요.';}
 catch(error){status=message(error?.message);}
 finally{busy=false;paint();}
}
function mount(){
 const anchor=document.getElementById('app-push-settings');if(!anchor?.parentNode){host=null;return;}
 const existing=document.getElementById('ledger-ai-receiver-settings');
 if(existing){host=existing;return;}
 host=document.createElement('section');host.id='ledger-ai-receiver-settings';anchor.insertAdjacentElement('afterend',host);paint();
}
onAuth(()=>{generation++;for(const c of active)c.abort();active.clear();status=current()?'두 분이 각자 본인 휴대폰에서 알림을 켠 뒤 지정해 주세요.':'Google 로그인 후 본인 휴대폰에서 지정해 주세요.';paint();});
mount();const root=document.getElementById('root');if(root)new MutationObserver(mount).observe(root,{childList:true,subtree:true});
