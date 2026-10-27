// Imported by sw.js: Firebase Messaging and the PWA share one registration/scope.
// Always display our data-only push, even when a different PWA screen is open.
// Firebase otherwise forwards to visible tabs that may not load the messaging SDK.
function showAppPush(data){
  return self.registration.showNotification(String(data.title || '무무토리 알림').slice(0,80), {
    body:String(data.body || '').slice(0,180),
    icon:new URL('assets/icon-192.png',self.registration.scope).href,
    badge:new URL('assets/icon-192.png',self.registration.scope).href,
    tag:String(data.eventId || 'mumutori').slice(0,100),
    data:{mumutori:true, route:data.route || 'index.html'}
  });
}
self.addEventListener('push',event=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(payload?.data?.kind!=='mumutori')return;
  event.stopImmediatePropagation();
  event.waitUntil(showAppPush(payload.data));
});
// Register our click handler before Firebase's handler (data-only messages).
self.addEventListener('notificationclick', event => {
  if (!event.notification.data?.mumutori) return;
  event.stopImmediatePropagation();
  event.notification.close();
  const root = self.registration.scope;
  const route = event.notification.data.route;
  const file = ['letter-hub.html','quick.html','settings.html','index.html'].includes(route) ? route : 'index.html';
  const target = new URL(file, root).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const same = windows.find(client => client.url.split('#')[0].split('?')[0] === target);
    if (same) return same.focus();
    return self.clients.openWindow(target);
  })());
});
importScripts('assets/vendor/firebase/firebase-app-compat.js','assets/vendor/firebase/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:'AIzaSyABZ7o6hfb8K9IJu7df32cAFhEyCA2QyoI',
  authDomain:'mumutori-letter.firebaseapp.com', projectId:'mumutori-letter',
  appId:'1:807204597036:web:3c5dd9d254973bc3495089', messagingSenderId:'807204597036'
});
firebase.messaging().onBackgroundMessage(payload => {
  const data = payload.data || {};
  if (data.kind !== 'mumutori') return;
  return showAppPush(data);
});
