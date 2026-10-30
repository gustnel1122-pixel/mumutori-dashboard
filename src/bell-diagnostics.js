// Only fixed, non-identifying error codes are recorded. Logging never blocks the UI.
(function(root){
  'use strict';
  const codes=new Set(['EVENTS_FAILED','EVENTS_TIMEOUT','EVENTS_DENIED','READ_STATE_FAILED','READ_STATE_TIMEOUT','READ_STATE_DENIED','PANEL_OPEN_FAILED']);
  const base='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app';
  const attempted=new Set();
  let loading;
  async function database(){
    if(!root.firebase?.database){
      if(!root.document)throw Error('unavailable');
      loading ||= new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('assets/vendor/firebase/firebase-database-compat.js',document.baseURI).href;s.onload=resolve;s.onerror=()=>reject(Error('unavailable'));document.head.append(s);});
      await loading;
    }
    return root.firebase.app().database(base);
  }
  async function record(code){
    try{
      if(!codes.has(code))return false;
      const user=root.firebase?.auth()?.currentUser,uid=user?.uid;
      const version=String(root.document?.body?.dataset?.build||'');
      if(!uid||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[a-f0-9]{12}$/.test(version))return false;
      const key=code+'/'+version;if(attempted.has(key))return false;attempted.add(key);
      const db=await database();if(root.firebase?.auth()?.currentUser?.uid!==uid)return false;
      await db.ref('clientDiagnostics/'+code).set({code,version,createdAt:root.firebase.database.ServerValue.TIMESTAMP});
      return true;
    }catch(_){return false;}
  }
  root.MumutoriNoticeDiagnostics=Object.freeze({record});
})(globalThis);
