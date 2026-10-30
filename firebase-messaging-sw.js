importScripts('src/notification-routes.js','src/notification-state.js');
// Imported by sw.js: Firebase Messaging and the PWA share one registration/scope.
// Always display our data-only push, even when a different PWA screen is open.
// Firebase otherwise forwards to visible tabs that may not load the messaging SDK.
function showAppPush(data){
  // New server payloads distinguish a locationless single item from a batch.
  // Old payloads retain conservative routing and are checked again on click.
  const intent=['route','detail','inbox'].includes(data.intent)?data.intent:'';
  const validId=/^[A-Za-z0-9_-]{1,100}$/.test(String(data.eventId||''));
  const inbox=self.MumutoriRoutes.safe('/mumutori-dashboard/index.html?notice='+encodeURIComponent(validId?String(data.eventId):'')+'#notifications');
  const detail=self.MumutoriRoutes.safe('/mumutori-dashboard/index.html?notice='+encodeURIComponent(validId?String(data.eventId):'')+(validId?'&detail=1':'')+'#notifications');
  const destination=typeof self.MumutoriRoutes.destination==='function'?self.MumutoriRoutes.destination(data):self.MumutoriRoutes.route(data);
  const route=intent==='detail'?detail:intent==='inbox'?inbox:intent==='route'?(destination||inbox):(destination||detail);
  return self.registration.showNotification(String(data.title || '무무토리 알림').slice(0,80), {
    body:String(data.body || '').slice(0,180),
    icon:new URL('assets/icon-192.png',self.registration.scope).href,
    badge:new URL('assets/icon-192.png',self.registration.scope).href,
    tag:String(data.eventId || 'mumutori').slice(0,100),
    actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],
    data:{mumutori:true, route,intent,eventId:data.eventId||'',uid:data.uid||''}
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
async function pushBodyTarget(data,user){
  const original=self.MumutoriRoutes.safe(data.route);
  if(['route','detail','inbox'].includes(data.intent))return original;
  const url=new URL(original,self.registration.scope);
  // Old server messages use the same home route for a batch and an unknown
  // single item. Consult their existing metadata; never infer from title text.
  if(!url.pathname.endsWith('/mumutori-dashboard/index.html')||url.hash!=='#notifications'||!/^[A-Za-z0-9_-]{1,100}$/.test(String(data.eventId||'')))return original;
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('pending'));},2000);});
  const same=()=>firebase.auth().currentUser?.uid===data.uid;
  try{
    return await Promise.race([(async()=>{
      const token=await user.getIdToken();if(!token||!same()||controller.signal.aborted)throw Error('account-changed');
      const base='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/';
      const read=async path=>{const u=new URL(path+'.json',base);u.searchParams.set('auth',token);const r=await fetch(u.href,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});if(!r.ok)throw Error('unavailable');return r.json();};
      const [batch,event]=await Promise.all([read('notificationBatches/'+data.eventId),read('activityHub/events/'+data.eventId)]);
      if(!same()||controller.signal.aborted)throw Error('account-changed');
      // A missing batch record could be an older grouped push, so do not
      // infer that it was a single notification from the first event alone.
      if(!batch||batch.multiple!==false)return original;
      if(!event||typeof event!=='object'||Array.isArray(event))return original;
      const destination=self.MumutoriRoutes.destination({...event,eventId:data.eventId});
      return destination||self.MumutoriRoutes.safe('/mumutori-dashboard/index.html?notice='+encodeURIComponent(data.eventId)+'&detail=1#notifications');
    })(),deadline]);
  }catch(_){return original;}
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
  event.waitUntil((async () => {
    try{
      const user=await workerUser();
      if(!user||!data.uid||user.uid!==data.uid||firebase.auth().currentUser?.uid!==data.uid)throw Error('account-changed');
      const targetUrl=new URL(await pushBodyTarget(data,user),self.registration.scope);
      // The worker writes the receiving user's read state. Prevent the landing
      // page from writing under a different account if a switch races opening.
      if(/^[A-Za-z0-9_-]{1,100}$/.test(String(data.eventId||'')))targetUrl.searchParams.set('push','1');
      const target=targetUrl.href;
      if(firebase.auth().currentUser?.uid!==data.uid)throw Error('account-changed');
      event.notification.close();
      // Never navigate another document that may contain a draft.
      const navigate=(async()=>{
        const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
        if(firebase.auth().currentUser?.uid!==data.uid)throw Error('account-changed');
        const same=windows.find(client=>client.url===target);
        const opened=await (same ? same.focus() : self.clients.openWindow(target));
        if(!opened)throw Error('window-unavailable');
      })().catch(()=>self.registration.showNotification('알림을 열지 못했어요',{
        body:'앱 알림함에서 다시 확인해 주세요.',tag:event.notification.tag,
        icon:new URL('assets/icon-192.png',self.registration.scope).href,
        actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],data
      }));
      // Reading is attempted in parallel and cannot hold up opening the target.
      const mark=data.eventId?boundedAction(self.MumutoriNoticeState.write(data.uid,data.eventId,'read')):Promise.resolve();
      await Promise.allSettled([navigate,mark]);
    }catch(_){
      event.notification.close();
      await self.registration.showNotification('알림 계정을 확인해 주세요',{
        body:'받은 계정으로 앱에 로그인한 뒤 알림함에서 확인해 주세요.',tag:event.notification.tag,
        icon:new URL('assets/icon-192.png',self.registration.scope).href,
        actions:[{action:'read',title:'읽음'},{action:'explain',title:'무슨 말이야?'}],data
      });
    }
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
