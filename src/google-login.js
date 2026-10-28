// Shared Google login policy. Authorization is always checked by the server, never an email list.
(function(root){'use strict';
function installed(){return !!(root.navigator?.standalone||root.matchMedia?.('(display-mode: standalone)').matches);}
function sameAuthOrigin(auth){try{return new URL('https://'+auth.app.options.authDomain).origin===root.location.origin;}catch{return false;}}
function redirectPreferred(auth){return installed()&&(/iPhone|iPad|iPod/.test(root.navigator?.userAgent||'')||root.navigator?.platform==='MacIntel'&&root.navigator.maxTouchPoints>1)&&sameAuthOrigin(auth);}
function message(error){const code=String(error?.code||'');
 if(code==='auth/popup-blocked')return 'Google 로그인 창이 차단됐어요. Safari 설정에서 팝업 차단을 확인하고 이 앱에서 다시 눌러 주세요.';
 if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')return 'Google 로그인을 마치지 않았어요. 이 앱에서 다시 눌러 주세요.';
 if(code==='auth/unauthorized-domain')return '이 주소의 Google 로그인 연결을 확인해야 해요. 운영 담당에게 알려 주세요.';
 if(code==='auth/network-request-failed')return '인터넷 연결을 확인한 뒤 Google 로그인을 다시 눌러 주세요.';
 return 'Google 로그인을 완료하지 못했어요. 잠시 후 다시 눌러 주세요.';
}
function signIn(auth,fb){
 try{const provider=new fb.auth.GoogleAuthProvider();provider.setCustomParameters?.({prompt:'select_account'});
 // Cross-origin redirect loses the auth helper's storage on Safari. Use the documented popup flow there.
 if(redirectPreferred(auth))return Promise.resolve(auth.signInWithRedirect(provider));
 return Promise.resolve(auth.signInWithPopup(provider)).catch(error=>{
   if(error?.code==='auth/popup-blocked'&&sameAuthOrigin(auth))return auth.signInWithRedirect(provider);
   throw Error(message(error));
 });
 }catch(error){return Promise.reject(Error(message(error)));}
}
root.MumutoriLogin={installed,sameAuthOrigin,redirectPreferred,signIn,message};
})(typeof window==='undefined'?globalThis:window);
