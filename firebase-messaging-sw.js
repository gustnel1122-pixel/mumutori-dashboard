importScripts('src/notification-routes.js','src/notification-state.js');
// Imported by sw.js: Firebase Messaging and the PWA share one registration/scope.
// Always display our data-only push, even when a different PWA screen is open.
// Firebase otherwise forwards to visible tabs that may not load the messaging SDK.
function showAppPush(data){
  return self.registration.showNotification(String(data.title || '무무토리 알림').slice(0,80), {
    body:String(data.body || '').slice(0,180),
    icon:new URL('assets/icon-192.png',self.registration.scope).href,
    badge:new URL('assets/icon-192.png',self.registration.scope).href,
    tag:String(data.eventId || 'mumutori').slice(0,100),
    actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],
    data:{mumutori:true, route:self.MumutoriRoutes.route(data),eventId:data.eventId||'',uid:data.uid||''}
  });
}
self.addEventListener('push',event=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(payload?.data?.kind!=='mumutori')return;
  event.stopImmediatePropagation();
  event.waitUntil(showAppPush(payload.data));
});
// Register our click handler before Firebase's handler (data-only messages).
function workerUser(){
  return new Promise((resolve,reject)=>{
    let unsubscribe;const timer=setTimeout(()=>{unsubscribe?.();reject(Error('auth-timeout'));},8000);
    unsubscribe=firebase.auth().onAuthStateChanged(user=>{clearTimeout(timer);unsubscribe?.();resolve(user);},()=>{clearTimeout(timer);unsubscribe?.();reject(Error('auth-unavailable'));});
  });
}
async function boundedAction(promise){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('pending')),8000);})]);}
  finally{clearTimeout(timer);}
}
self.addEventListener('notificationclick', event => {
  if (!event.notification.data?.mumutori) return;
  event.stopImmediatePropagation();
  const data=event.notification.data;
  if(event.action==='read'||event.action==='explain'){
    event.waitUntil((async()=>{
      try{
        const user=await workerUser();
        if(!user||!data.uid||user.uid!==data.uid)throw Error('account-changed');
        await boundedAction(self.MumutoriNoticeState.write(data.uid,data.eventId,event.action));
        event.notification.close();
      }catch(error){
        await self.registration.showNotification(error.message==='pending'?'알림 처리를 기다리고 있어요':'알림을 처리하지 못했어요',{
          body:error.message==='pending'?'연결 후 앱 알림함에서 상태를 확인해 주세요.':'앱 알림함에서 다시 눌러 주세요.',tag:event.notification.tag,
          icon:new URL('assets/icon-192.png',self.registration.scope).href,
          actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],data
        });
      }
    })());
    return;
  }
  event.notification.close();
  const target = new URL(self.MumutoriRoutes.safe(data.route),self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const same = windows.find(client => client.url === target);
    if (same) return same.focus();
    const screen=windows.find(c=>new URL(c.url).origin===new URL(target).origin&&new URL(c.url).pathname===new URL(target).pathname);
    if(screen?.navigate){const navigated=await screen.navigate(target);if(navigated)return navigated.focus();}
    return self.clients.openWindow(target);
  })());
});
importScripts('assets/vendor/firebase/firebase-app-compat.js?sdk=12.19.0','assets/vendor/firebase/firebase-auth-compat.js?sdk=12.19.0','assets/vendor/firebase/firebase-database-compat.js?sdk=12.19.0','assets/vendor/firebase/firebase-messaging-compat.js?sdk=12.19.0');
firebase.initializeApp({
  apiKey:'AIzaSyABZ7o6hfb8K9IJu7df32cAFhEyCA2QyoI',
  authDomain:'mumutori-letter.firebaseapp.com', projectId:'mumutori-letter',
  databaseURL:'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app',
  appId:'1:807204597036:web:3c5dd9d254973bc3495089', messagingSenderId:'807204597036'
});
firebase.messaging().onBackgroundMessage(payload => {
  const data = payload.data || {};
  if (data.kind !== 'mumutori') return;
  return showAppPush(data);
});
