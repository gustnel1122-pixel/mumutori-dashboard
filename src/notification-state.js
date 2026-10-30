// Shared by the page and service worker. Auth credentials stay inside Firebase SDK.
(function(root){
  'use strict';
  const BASE='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app';
  const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
  let loading;
  async function database(){
    if(!root.firebase?.database){
      if(!root.document)throw Error('database-unavailable');
      loading ||= new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('assets/vendor/firebase/firebase-database-compat.js',document.baseURI).href;s.onload=resolve;s.onerror=()=>reject(Error('database-unavailable'));document.head.append(s);}).catch(e=>{loading=undefined;throw e;});
      await loading;
    }
    return root.firebase.app().database(BASE);
  }
  function check(uid,id){if(!validId(uid)||!validId(id)||root.firebase?.auth()?.currentUser?.uid!==uid)throw Error('account-changed');}
  async function sdkReadAll(uid){check(uid,'ok');const db=await database();check(uid,'ok');const snap=await db.ref(`notificationUserState/${uid}/reads`).once('value');check(uid,'ok');return snap.val()||{};}
  async function sdkReadEvents(uid){
    check(uid,'ok');const db=await database();check(uid,'ok');const ref=db.ref('activityHub/events');let snap;
    try{snap=await ref.orderByChild('createdAt').limitToLast(100).once('value');}
    catch(e){if(!/index/i.test(String(e?.message||e)))throw e;snap=await ref.once('value');}
    check(uid,'ok');return snap.val()||{};
  }
  async function restReader(){
    if(!root.document)throw Error('database-unavailable');
    const build=encodeURIComponent(root.document.body?.dataset?.build||'unknown');
    const [,auth]=await Promise.all([import('./notification-rest.js?v='+build),import('./fbauth.js?v=access20261028')]);
    return root.MumutoriNoticeRest.createReader({auth,fetch:root.fetch.bind(root)});
  }
  async function readWithFallback(uid,method,sdk){
    check(uid,'ok');
    try{const reader=await restReader();const data=await reader[method](uid);check(uid,'ok');return data;}
    catch(e){
      if(e?.message==='REST_DENIED'){const denied=Error('permission denied');denied.code='permission_denied';throw denied;}
      if(e?.message==='ACCOUNT_CHANGED'||e?.message==='AUTH_REQUIRED')throw Error('account-changed');
      check(uid,'ok');
      let timer;
      try{return await Promise.race([sdk(uid),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('sdk-timeout')),2000);})]);}
      catch(_){check(uid,'ok');if(e?.message==='REST_TIMEOUT')throw Error('timeout');throw Error('read-failed');}
      finally{clearTimeout(timer);}
    }
  }
  const readAll=uid=>readWithFallback(uid,'readAll',sdkReadAll);
  const readEvents=uid=>readWithFallback(uid,'readEvents',sdkReadEvents);
  async function pushRequest(uid,method,path,value){
    check(uid,'ok');if(!/^[A-Za-z0-9_/-]+$/.test(path)||!['GET','PUT','DELETE'].includes(method))throw Error('invalid-request');
    const db=await database();check(uid,'ok');const ref=db.ref(`appPush/${path}`);let result;
    if(method==='GET')result=(await ref.once('value')).val();
    else if(method==='PUT'){await ref.set(value);result=value;}
    else{await ref.remove();result=null;}
    check(uid,'ok');return result;
  }
  // Read acknowledgements use HTTPS so a blocked SDK long-poll cannot trap a tap.
  // The multi-location PATCH keeps a grouped notification's members together.
  async function readViaRest(uid,id){
    check(uid,id);
    const user=root.firebase?.auth()?.currentUser;
    if(!user||typeof user.getIdToken!=='function'||typeof root.fetch!=='function')throw Error('rest-unavailable');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    const same=()=>{check(uid,id);if(root.firebase?.auth()?.currentUser!==user)throw Error('account-changed');};
    try{
      const token=await Promise.race([user.getIdToken(),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]);
      same();if(!token)throw Error('rest-unavailable');
      const endpoint=path=>{const u=new URL(BASE+'/'+path+'.json');u.searchParams.set('auth',token);return u.href;};
      const batchResponse=await root.fetch(endpoint('notificationBatches/'+id),{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      same();if(!batchResponse.ok)throw Error('read-failed');
      const batch=await batchResponse.json();same();
      const members=batch?.members;
      if(members!==undefined&&(members===null||typeof members!=='object'||Array.isArray(members)))throw Error('invalid-batch');
      const ids=new Set([id]);
      for(const [member,value] of Object.entries(members||{})){if(!validId(member)||value!==true)throw Error('invalid-batch');ids.add(member);}
      if(ids.size>250)throw Error('batch-too-large');
      const changes={};for(const member of ids)changes[member]={at:{'.sv':'timestamp'}};
      const result=await root.fetch(endpoint('notificationUserState/'+uid+'/reads'),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      same();if(!result.ok)throw Error('read-failed');
      return [...ids];
    }finally{clearTimeout(timer);}
  }
  async function write(uid,id,action){
    check(uid,id);if(!['read','explain'].includes(action))throw Error('invalid-action');
    if(action==='read'){
      try{return await readViaRest(uid,id);}
      catch(e){if(e?.message==='invalid-batch'||e?.message==='batch-too-large'||e?.message==='account-changed')throw e;check(uid,id);}
    }
    const db=await database();check(uid,id);
    const base=`notificationUserState/${uid}`;
    const batch=(await db.ref(`notificationBatches/${id}`).once('value')).val();
    check(uid,id);
    const members=batch?.members;
    if(members!==undefined&&(members===null||typeof members!=='object'||Array.isArray(members)))throw Error('invalid-batch');
    const ids=new Set([id]);
    for(const [member,value] of Object.entries(members||{})){if(!validId(member)||value!==true)throw Error('invalid-batch');ids.add(member);}
    if(ids.size>250)throw Error('batch-too-large');
    const changes={};for(const member of ids)changes[member]={at:root.firebase.database.ServerValue.TIMESTAMP};
    await db.ref(`${base}/reads`).update(changes);
    check(uid,id);
    if(action==='explain'){
      const ref=db.ref(`${base}/explain/${id}`),value={status:'pending',createdAt:root.firebase.database.ServerValue.TIMESTAMP};
      if(!(await ref.once('value')).exists()){
        try{await ref.transaction(v=>v===null?value:undefined,undefined,false);}
        catch(e){check(uid,id);if(!(await ref.once('value')).exists())throw e;}
      }
      check(uid,id);
    }
    return [...ids];
  }
  root.MumutoriNoticeState={readAll,readEvents,pushRequest,write};
})(globalThis);
