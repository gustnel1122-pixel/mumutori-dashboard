// Server-authorized shared operators; each device stays inside its own UID. Device/FCM tokens never go into URLs, logs or Cache Storage.
import './notification-routes.js';
import './notification-state.js';
import { current, onAuth, signIn } from './fbauth.js?v=access20261028';
export const VAPID_KEY='BK3cjqd-fyFCjw3kLb3nSOLDMAx1e1IM8K-FDyo-xkUwCA7BUn4vqRVmKeon7wrxMo5sDBM5SfXahtHTtz4W4lM';
const ROOT='appPush', DEVICE_KEY='mumutori-push-device-v1';
let host=null, busy=false, status='공동 운영 계정으로 로그인한 뒤 이 기기의 알림을 켜 주세요.', registered=false;
let serverReady=false;
let messaging=null, stopForeground=null, requestTimer=null, generation=0;
let receiverProof=null;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const supported=()=>window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && (!ios()||standalone());
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function deviceId(create=false){let id=localStorage.getItem(DEVICE_KEY);if(!id&&create){id='d_'+crypto.randomUUID().replaceAll('-','');localStorage.setItem(DEVICE_KEY,id);}return /^d_[a-f0-9]{32}$/.test(id||'')?id:null;}
async function request(method,path,value){
  const uid=current()?.uid;if(!uid)throw Error('먼저 공동 운영 Google 계정으로 로그인해 주세요.');
  try{const result=await globalThis.MumutoriNoticeState.pushRequest(uid,method,path,value);if(current()?.uid!==uid)throw Error('account-changed');return result;}
  catch(e){if(current()?.uid!==uid||e.message==='account-changed')throw Error('로그인 계정이 바뀌었어요. 다시 눌러 주세요.');if(/permission_denied|permission denied/i.test(String(e.code||e.message)))throw Error('알림 서버 연결이 아직 준비되지 않았거나 이 계정에 권한이 없어요. 운영 담당이 Firebase 알림 규칙과 서버 연결을 확인해야 해요.');throw Error('알림 서버와 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');}
}
function paint(){
  if(!host)return;
  const user=current(), blocked=!supported(), denied=window.Notification?.permission==='denied';
  host.innerHTML=`<div class="panelhead"><h2>앱 알림</h2><span class="badge">${registered?'이 기기 연결됨':'기기별 설정'}</span></div><div class="panelbody"><p>함께 작업한 내용 · 새 레터 접수 · 로그인 필요 · 장부 확인을 알려드려요.</p><p role="status" aria-live="polite">${escape(status)}</p>${!standalone()?'<p class="sub">아이폰·아이패드는 홈 화면에 추가한 앱에서 열어 주세요.</p>':''}<div class="top-actions" style="flex-wrap:wrap;justify-content:flex-start">${!user?'<button type="button" data-push-action="login">구글 로그인</button>':''}<button type="button" class="primary" data-push-action="enable" ${busy||blocked||denied||!user||!serverReady?'disabled':''}>${busy?'처리 중…':'알림 받기'}</button><button type="button" data-push-action="test" ${busy||!registered||!user?'disabled':''}>시험 알림 보내기</button><button type="button" data-push-action="disable" ${busy||!registered||!user?'disabled':''}>이 기기 알림 끄기</button></div><p class="sub">${blocked?'아이폰·아이패드는 iOS 16.4 이상에서 홈 화면에 추가한 앱으로 열어 주세요. 다른 기기는 웹 푸시를 지원하는 브라우저가 필요해요.':denied?'알림이 차단되어 있어요. 휴대폰 설정에서 무무토리 스튜디오의 알림을 허용한 뒤 다시 열어 주세요.':'알림 권한은 ‘알림 받기’를 누를 때만 요청해요. 기존 이메일 알림도 함께 유지돼요.'}</p></div>`;
}
async function ready(){const config=await request('GET','config');if(config?.enabled!==true||config?.schema!=='push-v1')throw Error('알림 서버 연결을 마무리 중이에요. 서버 설정 완료 후 다시 눌러 주세요.');return true;}
async function worker(){
  const reg=await navigator.serviceWorker.getRegistration(new URL('../',import.meta.url));
  if(!reg?.active)throw Error('앱 업데이트를 마친 뒤 새로고침하고 다시 눌러 주세요.');
  // Do not subscribe on an old worker with no push handler.
  const reply=await new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>resolve(false),4000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data?.pushVersion==='push-v1');};reg.active.postMessage({type:'PUSH_VERSION'},[channel.port2]);});
  if(!reply)throw Error('앱 새 버전이 필요해요. ‘새 버전이 있어요 · 눌러서 새로고침’을 누른 뒤 다시 해 주세요.');
  return reg;
}
async function getMessaging(){
  const fb=window.firebase;
  if(!fb?.messaging||!await fb.messaging.isSupported())throw Error('이 브라우저에서 알림 도구를 사용할 수 없어요.');
  if(!messaging){messaging=fb.messaging();stopForeground=messaging.onMessage(async payload=>{
    const data=payload.data||{};if(data.kind!=='mumutori'||Notification.permission!=='granted')return;
    try{const reg=await worker();await reg.showNotification(data.title||'무무토리 알림',{body:data.body||'',icon:new URL('../assets/icon-192.png',import.meta.url).href,tag:data.eventId,actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],data:{mumutori:true,route:window.MumutoriRoutes.route(data),eventId:data.eventId||'',uid:data.uid||''}});}catch{/* Next message can retry; no token/payload logs. */}
  });}
  return messaging;
}
async function enable(){
  receiverProof=null;
  if(!serverReady)throw Error('알림 서버 연결을 먼저 확인해 주세요.');
  const uid=current()?.uid, mine=generation;
  // Called from the user's click, after setup is known; never ask on page load.
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')throw Error('알림을 허용하지 않았어요. 다시 누르거나 휴대폰 알림 설정을 확인해 주세요.');
  const reg=await worker(), api=await getMessaging();
  const token=await api.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
  if(!token)throw Error('기기 연결을 만들지 못했어요. 잠시 후 다시 눌러 주세요.');
  if(current()?.uid!==uid)throw Error('로그인 계정이 바뀌었어요. 다시 눌러 주세요.');
  const id=deviceId(true),path=`devices/${uid}/${id}`,old=await request('GET',path),now={'.sv':'timestamp'};
  const value={token,createdAt:old?.createdAt||now,updatedAt:now,platform:standalone()?'installed-app':'browser'};
  await request('PUT',path,value);
  const saved=await request('GET',path);
  if(saved?.token!==token)throw Error('기기 연결 저장을 확인하지 못했어요. 다시 눌러 주세요.');
  let tokenFingerprint='';
  try{tokenFingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(_){/* Existing push remains available if the optional proof cannot be made. */}
  if(current()?.uid!==uid||mine!==generation)throw Error('로그인이 바뀌어 지정을 멈췄어요.');
  receiverProof=tokenFingerprint?{uid,id,tokenFingerprint}:null;
  registered=true;status='이 기기로 알림을 받아요. ‘시험 알림 보내기’로 휴대폰 도착을 확인해 주세요.';
}
async function disable(){
  receiverProof=null;
  const id=deviceId();if(id){const path=`devices/${current().uid}/${id}`;await request('DELETE',path);if(await request('GET',path))throw Error('알림 끄기를 확인하지 못했어요.');}
  registered=false;const api=await getMessaging();await api.deleteToken();status='이 기기의 알림을 껐어요.';localStorage.removeItem(DEVICE_KEY);
}
// Called only after the user explicitly chooses this phone for ledger notices.
// Only a fingerprint is retained; the token is never returned or written to a receiver binding.
export async function ledgerReceiverCurrentDeviceProof(){
  const uid=current()?.uid, id=deviceId();
  if(!uid||!id||!registered||Notification.permission!=='granted')throw Error('먼저 이 휴대폰에서 알림 받기를 켜 주세요.');
  if(!receiverProof||receiverProof.uid!==uid||receiverProof.id!==id||!/^[a-f0-9]{64}$/.test(receiverProof.tokenFingerprint||''))throw Error('이 휴대폰 알림을 다시 켠 뒤 지정해 주세요.');
  return {...receiverProof};
}
async function test(){
  const uid=current()?.uid;await ready();if(current()?.uid!==uid)throw Error('로그인 계정이 바뀌었어요. 다시 눌러 주세요.');const id=deviceId();if(!id||!registered)throw Error('먼저 이 기기의 알림을 켜 주세요.');
  const path=`requests/${current().uid}/t_${crypto.randomUUID().replaceAll('-','')}`;
  const value={deviceId:id,createdAt:Date.now(),status:'pending'};
  await request('PUT',path,value);const back=await request('GET',path);
  if(back?.createdAt!==value.createdAt)throw Error('시험 요청 저장을 확인하지 못했어요.');
  status='시험 알림을 요청했어요. 서버가 약 1분 안에 보내요.';paint();
  const mine=generation;let attempts=0;clearInterval(requestTimer);
  requestTimer=setInterval(async()=>{if(mine!==generation||++attempts>20){clearInterval(requestTimer);return;}try{const result=await request('GET',path);if(result?.status==='pending')return;clearInterval(requestTimer);status=result?.status==='sent'?'푸시 서버가 시험 알림을 발송했어요. 휴대폰에서 실제 도착을 확인해 주세요.':result?.status==='throttled'?'시험 알림은 1분에 한 번만 보낼 수 있어요.':'시험 알림 발송에 실패했어요. 운영 담당이 서버 권한과 기기 연결을 확인해야 해요.';paint();}catch{clearInterval(requestTimer);}},5000);
}
async function refresh(){const mine=++generation;receiverProof=null;clearInterval(requestTimer);registered=false;serverReady=false;if(!current()){status='공동 운영 계정으로 로그인한 뒤 이 기기의 알림을 켜 주세요.';paint();return;}const timer=setTimeout(()=>{if(mine===generation){status='알림 서버 응답을 기다리고 있어요.';paint();}},8000);try{await ready();if(mine!==generation)return;serverReady=true;const id=deviceId();registered=!!(id&&(await request('GET',`devices/${current().uid}/${id}`))?.token);if(mine!==generation)return;status=registered?'이 기기에 알림이 연결되어 있어요.':'‘알림 받기’를 눌러 이 기기에 연결해 주세요.';if(registered&&supported()&&Notification.permission==='granted'){await enable();}}catch(e){if(mine===generation)status=e.message;}finally{clearTimeout(timer);}if(mine===generation)paint();}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-push-action]');if(!button||busy)return;busy=true;paint();const timer=setTimeout(()=>{status='서버 응답을 기다리고 있어요. 중복 요청을 막기 위해 잠시 기다려 주세요.';paint();},8000);try{await ({login:signIn,enable,disable,test}[button.dataset.pushAction])();}catch(e){status=e.message;}finally{clearTimeout(timer);busy=false;paint();}});
const mount=()=>{const found=document.getElementById('app-push-settings');if(found&&found!==host){host=found;paint();}};
new MutationObserver(mount).observe(document.getElementById('root'),{childList:true,subtree:true});
onAuth(()=>refresh());mount();
