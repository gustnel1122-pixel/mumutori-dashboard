import './notification-routes.js';
import './notification-state.js';
let signIn=()=>Promise.reject(Error('offline')),current=()=>null;
const R=globalThis.MumutoriRoutes,make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const bell=make('button','','mmt-notice-bell');bell.type='button';bell.setAttribute('aria-label','알림');bell.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 1v1"/></svg>';const badge=make('span','','mmt-notice-count');badge.hidden=true;bell.append(badge);
const panel=make('dialog','','mmt-notice-panel');panel.setAttribute('aria-label','알림 목록');const head=make('div','','mmt-notice-head'),title=make('strong','알림'),refresh=make('button','새로고침'),close=make('button','닫기');head.append(title,refresh,close);const info=make('p','','mmt-notice-info'),list=make('div','','mmt-notice-list');panel.append(head,info,list);document.body.append(bell,panel);
let me=null,events=[],read=new Set(),readKnown=false,readRevision=0,epoch=0,busy=false,notice='';const running=new Set();
async function mark(id,action='read'){
  if(!me||!id)return false;const uid=me.uid,version=epoch,key=uid+'/'+id;if(running.has(key))return false;running.add(key);paint();
  const timer=setTimeout(()=>{if(version===epoch){notice='서버 응답을 기다리고 있어요. 중복 요청을 막기 위해 잠시 기다려 주세요.';paint();}},8000);
  try{const ids=await globalThis.MumutoriNoticeState.write(uid,id,action);if(version!==epoch||current()?.uid!==uid)return false;for(const member of ids)read.add(member);readRevision++;notice=action==='explain'?'쉬운 말로 다시 알려 달라고 요청했어요.':'';paint();return true;}
  catch(_){if(version===epoch){notice='알림을 처리하지 못했어요. 연결을 확인하고 다시 눌러 주세요.';paint();}return false;}
  finally{clearTimeout(timer);running.delete(key);if(version===epoch)paint();}
}
function paint(){
  const n=events.filter(e=>!read.has(e.eventId)).length;badge.hidden=!readKnown||!n;badge.textContent=n>99?'99+':String(n);bell.setAttribute('aria-label',readKnown&&n?'알림 · 안 읽음 '+n+'개':'알림');list.replaceChildren();
  info.textContent=!me?'로그인하면 함께 쓰는 알림을 볼 수 있어요.':`${readKnown?'안 읽음 '+n:'읽음 상태 확인 중'} · 최근 100건${notice?' · '+notice:''}`;
  if(!me){const b=make('button','Google 로그인','mmt-notice-row');b.onclick=()=>signIn().catch(()=>{info.textContent='로그인을 완료하지 못했어요. 다시 눌러 주세요.';});list.append(b);return;}
  for(const e of events){
    const isRead=read.has(e.eventId),card=make('div','','mmt-notice-card'),b=make('button','','mmt-notice-row'+(readKnown?(isRead?' is-read':' unread'):''));b.type='button';b.dataset.eventId=e.eventId;b.setAttribute('aria-label',(readKnown?(isRead?'읽음 · ':'안 읽음 · '):'읽음 상태 확인 중 · ')+String(e.action||'알림').slice(0,160));
    b.append(make('strong',String(e.action||'알림').slice(0,160)),make('small',[String(e.actor||'운영').slice(0,40),String(e.screen||'운영홈').slice(0,30),new Date(Number(e.createdAt)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})].join(' · ')));
    b.disabled=running.has(me.uid+'/'+e.eventId);b.onclick=async()=>{if(await mark(e.eventId))location.assign(R.route(e));};
    const actions=make('div','','mmt-notice-actions');
    for(const [action,label] of [['read','읽음'],['explain','무슨 말이야?']]){const button=make('button',label);button.type='button';button.disabled=running.has(me.uid+'/'+e.eventId);button.dataset.noticeAction=action;button.setAttribute('aria-label',`${String(e.action||'알림').slice(0,80)} · ${label}`);button.onclick=()=>mark(e.eventId,action);actions.append(button);}
    card.append(b,actions);list.append(card);
  }
  if(!events.length)list.append(make('p','아직 알림이 없어요.','mmt-notice-info'));
}
async function update(){
  if(!me||busy)return;const mine=me.uid,version=epoch,revision=readRevision;busy=true;
  const live=()=>version===epoch&&current()?.uid===mine;
  const timeout=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),10000);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
  const fail=e=>{if(!live())return;notice=/permission_denied|permission denied/i.test(String(e?.code||e?.message))?'이 계정의 알림 권한을 확인하지 못했어요.':'일부 알림 정보를 불러오지 못했어요. 새로고침해 주세요.';paint();};
  try{
    notice='';
    const eventTask=timeout(globalThis.MumutoriNoticeState.readEvents(mine)).then(raw=>{
      if(!live())return;events=Object.entries(raw||{}).filter(([id,e])=>/^[A-Za-z0-9_-]{1,100}$/.test(id)&&e&&typeof e==='object'&&Number.isFinite(Number(e.createdAt))).map(([eventId,e])=>({...e,eventId})).sort((a,b)=>b.createdAt-a.createdAt).slice(0,100);paint();
      const clicked=new URLSearchParams(location.search).get('notice');if(clicked&&events.some(e=>e.eventId===clicked)&&!read.has(clicked))void mark(clicked);
    }).catch(fail);
    const readTask=timeout(globalThis.MumutoriNoticeState.readAll(mine)).then(serverRead=>{
      if(!live())return;const next=new Set(Object.keys(serverRead||{}));if(revision!==readRevision)for(const id of read)next.add(id);read=next;readKnown=true;paint();
    }).catch(fail);
    await Promise.all([eventTask,readTask]);
  }finally{if(version===epoch)busy=false;}
}
bell.onclick=()=>{panel.showModal();update();};close.onclick=()=>{panel.close();bell.focus();};refresh.onclick=()=>update();panel.addEventListener('click',e=>{if(e.target===panel&&e.clientX<panel.getBoundingClientRect().left)panel.close();});
paint();import('./fbauth.js?v=access20261028').then(auth=>{signIn=auth.signIn;current=auth.current;auth.onAuth(u=>{epoch++;busy=false;me=u;events=[];read=new Set();readKnown=false;readRevision=0;notice='';paint();update();});}).catch(()=>{info.textContent='연결 후 알림을 확인할 수 있어요.';});document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});setInterval(()=>{if(!document.hidden)update();},60000);if(location.hash==='#notifications')panel.showModal();
