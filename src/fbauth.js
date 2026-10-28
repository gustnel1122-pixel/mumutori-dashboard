import './google-login.js?v=access20261028';
// 공동 운영 구글 로그인 — 소싱 보드(Firebase sourcing/)는 2026-10-07부터 로그인한 사장님과 admins에 등록된 사람만 읽고 쓴다.
// 로그인 도구(Firebase Auth compat 12.19.0)는 assets/vendor/firebase에 고정 버전으로 넣어 두었다(외부 스크립트를 막는 CSP 유지).
// 데이터는 SDK 없이 REST·EventSource에 ?auth=<ID 토큰>으로 접속한다. 실제 보호는 Firebase 규칙이 맡는다.
// 웹 apiKey는 비밀번호가 아니라 프로젝트 식별자다(레터 저장소 firebase-config.js와 같은 값).
const CONFIG={apiKey:'AIzaSyABZ7o6hfb8K9IJu7df32cAFhEyCA2QyoI',authDomain:'mumutori-letter.firebaseapp.com',projectId:'mumutori-letter',appId:'1:807204597036:web:3c5dd9d254973bc3495089',messagingSenderId:'807204597036'};
export const BASE='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app';
const listeners=new Set();
let auth=null,user=null,ready=null;

function init(){
  if(ready)return ready;
  ready=new Promise(resolve=>{
    const fake=window.__MMT_TEST_AUTH__;   // 브라우저 시험 전용(가짜 토큰) — 실제 접근은 규칙이 막는다
    if(fake){user=fake.email?{uid:fake.uid||'test-owner',email:fake.email,displayName:fake.name||'',getIdToken:async()=>fake.token||'test'}:null;resolve();return;}
    const fb=window.firebase;
    if(!fb?.initializeApp||!fb.auth){resolve();return;}
    const app=fb.apps.length?fb.app():fb.initializeApp(CONFIG);
    auth=app.auth();
    // Keep the account inside the Home Screen app's own storage; no popup/redirect on page load.
    if(auth.setPersistence&&fb.auth.Auth?.Persistence?.LOCAL) auth.setPersistence(fb.auth.Auth.Persistence.LOCAL).catch(()=>{});
    auth.getRedirectResult?.().catch(()=>{});
    let first=true;
    auth.onIdTokenChanged(u=>{user=u;for(const f of listeners){try{f(current());}catch(e){}}if(first){first=false;resolve();}});
  });
  return ready;
}
export function current(){return user?{uid:user.uid||'',email:user.email||'',name:user.displayName||''}:null;}
export function signIn(){
  const start=()=>{if(!auth)throw Error('로그인 도구를 불러오지 못했습니다. 새로고침해 주세요.');return window.MumutoriLogin.signIn(auth,window.firebase);};
  // init has normally completed before a button is shown: preserve Safari's click gesture.
  return auth?start():init().then(start);
}
export async function signOut(){await init();if(auth)await auth.signOut();}
export async function idToken(){await init();return user?await user.getIdToken():'';}
// 로그인 상태가 바뀌거나 ID 토큰이 새로 발급될 때(약 1시간마다) 부른다 → 실시간 연결을 새 토큰으로 다시 잇는다.
export function onAuth(fn){listeners.add(fn);init().then(()=>fn(current())).catch(()=>fn(null));return ()=>listeners.delete(fn);}
export async function dbUrl(path){const t=await idToken();return `${BASE}/${path}.json`+(t?`?auth=${encodeURIComponent(t)}`:'');}
