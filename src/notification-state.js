// Shared by the page and service worker. Auth credentials stay inside Firebase SDK.
(function(root){
  'use strict';
  const BASE='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app';
  const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
  let loading;
  async function database(){
    if(!root.firebase?.database){
      if(!root.document)throw Error('database-unavailable');
      loading ||= new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('assets/vendor/firebase/firebase-database-compat.js',document.baseURI).href;s.onload=resolve;s.onerror=()=>reject(Error('database-unavailable'));document.head.append(s);});
      await loading;
    }
    return root.firebase.app().database(BASE);
  }
  function check(uid,id){if(!validId(uid)||!validId(id)||root.firebase?.auth()?.currentUser?.uid!==uid)throw Error('account-changed');}
  async function readAll(uid){check(uid,'ok');const db=await database();check(uid,'ok');const snap=await db.ref(`notificationUserState/${uid}/reads`).once('value');check(uid,'ok');return snap.val()||{};}
  async function readEvents(uid){
    check(uid,'ok');const db=await database();check(uid,'ok');const ref=db.ref('activityHub/events');let snap;
    try{snap=await ref.orderByChild('createdAt').limitToLast(100).once('value');}
    catch(e){if(!/index/i.test(String(e?.message||e)))throw e;snap=await ref.once('value');}
    check(uid,'ok');return snap.val()||{};
  }
  async function pushRequest(uid,method,path,value){
    check(uid,'ok');if(!/^[A-Za-z0-9_/-]+$/.test(path)||!['GET','PUT','DELETE'].includes(method))throw Error('invalid-request');
    const db=await database();check(uid,'ok');const ref=db.ref(`appPush/${path}`);let result;
    if(method==='GET')result=(await ref.once('value')).val();
    else if(method==='PUT'){await ref.set(value);result=value;}
    else{await ref.remove();result=null;}
    check(uid,'ok');return result;
  }
  async function write(uid,id,action){
    check(uid,id);if(!['read','explain'].includes(action))throw Error('invalid-action');
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
