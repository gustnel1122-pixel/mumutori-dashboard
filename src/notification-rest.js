// Private Firebase reads using the existing signed-in session; never log tokens or data.
(function(root){
  'use strict';
  function createReader({auth,fetch:fetcher,timeoutMs=7000}){
    const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
    const check=uid=>{if(!validId(uid)||auth.current()?.uid!==uid)throw Error('ACCOUNT_CHANGED');};
    async function read(uid,path,query){
      check(uid);
      const controller=new AbortController();let timer;
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('REST_TIMEOUT'));},timeoutMs);});
      try{
        return await Promise.race([(async()=>{
          const token=await auth.idToken();if(controller.signal.aborted)throw Error('REST_TIMEOUT');check(uid);
          if(typeof token!=='string'||!token)throw Error('AUTH_REQUIRED');
          const url=new URL(path+'.json',auth.BASE+'/');
          url.searchParams.set('auth',token);
          for(const [key,value] of Object.entries(query||{}))url.searchParams.set(key,value);
          let response;
          try{response=await fetcher(url.href,{method:'GET',cache:'no-store',signal:controller.signal});}
          catch(_){throw Error('REST_FAILED');}
          if(controller.signal.aborted)throw Error('REST_TIMEOUT');check(uid);
          if(response.status===401||response.status===403)throw Error('REST_DENIED');
          if(!response.ok)throw Error('REST_FAILED');
          const data=await response.json();check(uid);
          if(data===null)return {};
          if(typeof data!=='object'||Array.isArray(data))throw Error('REST_FAILED');
          return data;
        })(),deadline]);
      }finally{clearTimeout(timer);}
    }
    return Object.freeze({
      readEvents:uid=>read(uid,'activityHub/events',{orderBy:JSON.stringify('createdAt'),limitToLast:'100'}),
      readAll:uid=>read(uid,'notificationUserState/'+uid+'/reads')
    });
  }
  const api=Object.freeze({createReader});root.MumutoriNoticeRest=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
