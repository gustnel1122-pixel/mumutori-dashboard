// Only fixed, non-identifying error codes are recorded. Logging never blocks the UI.
(function(root){
  'use strict';
  const codes=new Set(['EVENTS_FAILED','EVENTS_TIMEOUT','EVENTS_DENIED','READ_STATE_FAILED','READ_STATE_TIMEOUT','READ_STATE_DENIED','PANEL_OPEN_FAILED']);
  const base='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app';
  const attempted=new Set();
  async function record(code){
    let key;
    try{
      if(!codes.has(code))return false;
      const auth=root.firebase?.auth?.(),user=auth?.currentUser,uid=user?.uid;
      const version=String(root.document?.body?.dataset?.build||'');
      if(!uid||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[a-f0-9]{12}$/.test(version))return false;
      key=uid+'/'+code+'/'+version;if(attempted.has(key))return false;attempted.add(key);
      const token=await user.getIdToken();
      if(!token||auth.currentUser!==user||auth.currentUser?.uid!==uid)throw Error('account-changed');
      const endpoint=base+'/clientDiagnostics/'+code+'.json?auth='+encodeURIComponent(token);
      const controller=root.AbortController?new root.AbortController():null;
      const timer=controller?root.setTimeout(()=>controller.abort(),8000):null;
      let response;
      try{response=await root.fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,version,createdAt:{'.sv':'timestamp'}}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',...(controller?{signal:controller.signal}:{})});}
      finally{if(timer!==null)root.clearTimeout(timer);}
      if(!response.ok)throw Error('request-failed');
      return true;
    }catch(_){if(key)attempted.delete(key);return false;}
  }
  root.MumutoriNoticeDiagnostics=Object.freeze({record});
})(globalThis);
