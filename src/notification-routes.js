// Shared by pages and the service worker. Only opaque record keys enter links.
(function(root){'use strict';
const home='/mumutori-dashboard/index.html', key=/^[A-Za-z0-9_-]{1,100}$/;
function work(kind,id=''){if(!/^(letter|finance|ledger|bank|cart|board|order|login|home|tasks|spec)$/.test(kind))return '';if(id&&!key.test(id))return '';const v='nav1_'+kind+'_'+id;return v.length<=80?v:'';}
function fromWork(value){const raw=String(value||'');if(raw.length>80)return '';const m=/^nav1_(letter|finance|ledger|bank|cart|board|order|login|home|tasks|spec)_([A-Za-z0-9_-]*)$/.exec(raw);if(!m)return '';const id=m[2];switch(m[1]){case'letter':return '/mumutori-dashboard/letter-hub.html'+(id?'?letter='+id:'')+'#inbox';case'finance':case'ledger':return '/mumutori-dashboard/finance.html'+(id?'?entry='+id:'');case'bank':return '/mumutori-dashboard/finance.html#fin-needs';case'cart':return '/mumutori-dashboard/sourcing.html?tab=cart';case'board':return '/mumutori-dashboard/sourcing.html?tab=items';case'order':return '/mumutori-offline-pages/index.html'+(id?'?item='+id:'');case'login':return '/mumutori-dashboard/settings.html#app-push-settings';case'tasks':case'spec':return '/mumutori-dashboard/letter-hub.html#'+m[1];case'home':return home+'#notifications';default:return '';}}
function safeDestination(input){if(!input)return '';try{const u=new URL(String(input),'https://route.invalid/mumutori-dashboard/');if(u.origin!=='https://route.invalid')return '';const allowed=new Set(['index.html','finance.html','quick.html','settings.html','letter-hub.html','sourcing.html','bank.html']);if(u.pathname.startsWith('/mumutori-dashboard/')&&allowed.has(u.pathname.slice('/mumutori-dashboard/'.length))||u.pathname==='/mumutori-offline-pages/index.html'){const v=new URL(u.pathname,'https://route.invalid');for(const name of ['entry','letter','item','notice']){const x=u.searchParams.get(name);if(x&&key.test(x))v.searchParams.set(name,x);}if(u.searchParams.get('push')==='1')v.searchParams.set('push','1');if(u.pathname==='/mumutori-dashboard/index.html'&&u.searchParams.get('detail')==='1')v.searchParams.set('detail','1');if(u.pathname.endsWith('/sourcing.html')&&['items','cart','orders','reorder'].includes(u.searchParams.get('tab')))v.searchParams.set('tab',u.searchParams.get('tab'));if(['#inbox','#tasks','#spec','#app-push','#app-push-settings','#notifications','#fin-needs','#mobile-tasks'].includes(u.hash))v.hash=u.hash;return v.pathname+v.search+v.hash;}}catch{}return '';}
function safe(input){return safeDestination(input)||home;}
function addNotice(out,eventId){const u=new URL(out,'https://route.invalid');if(key.test(eventId||''))u.searchParams.set('notice',eventId);return u.pathname+u.search+u.hash;}
const destinations={finance:['/mumutori-dashboard/finance.html','장부 탭 열기'],bank:['/mumutori-dashboard/finance.html#fin-needs','장부 확인 열기'],letter:['/mumutori-dashboard/letter-hub.html#inbox','레터 접수함 열기'],login:['/mumutori-dashboard/settings.html#app-push-settings','설정 열기'],cart:['/mumutori-dashboard/sourcing.html?tab=cart','장바구니 열기'],board:['/mumutori-dashboard/sourcing.html?tab=items','소싱 보드 열기'],order:['/mumutori-offline-pages/index.html','주문판 열기'],tasks:['/mumutori-dashboard/index.html#mobile-tasks','일감 탭 열기'],inbox:[home+'#notifications','알림함 열기']};
function pathKind(value){try{const u=new URL(value,'https://route.invalid');if(u.pathname.endsWith('/finance.html')||u.pathname.endsWith('/quick.html')||u.pathname.endsWith('/bank.html'))return u.hash==='#fin-needs'?'bank':'finance';if(u.pathname.endsWith('/settings.html'))return 'login';if(u.pathname.endsWith('/letter-hub.html'))return u.hash==='#tasks'||u.hash==='#spec'?'tasks':'letter';if(u.pathname.endsWith('/sourcing.html'))return u.searchParams.get('tab')==='cart'?'cart':'board';if(u.pathname==='/mumutori-offline-pages/index.html')return 'order';if(u.hash==='#mobile-tasks')return 'tasks';return 'inbox';}catch{return 'inbox';}}
function destinationInfo(event={}){
  const result=(out,kind,inferred)=>({url:addNotice(out,event.eventId),label:inferred?destinations[kind][1]:'보러가기',kind,inferred});
  // A bundled notification can represent several unrelated screens.
  if(event.batchMultiple===true||event.multiple===true)return result(destinations.inbox[0],'inbox',true);
  const workRoute=fromWork(event.workId),route=safeDestination(event.route);
  // A generic home route is commonly the old default rather than a real target.
  for(const out of [workRoute,route])if(out&&pathKind(out)!=='inbox')return result(out,pathKind(out),false);
  const screen=String(event.screen||'').trim(),text=[event.title,event.action,event.body,event.type,event.kind].map(x=>String(x||'').slice(0,500)).join(' ');
  let kind='';
  if(screen==='장부')kind=/은행.*확인|확인.*은행/.test(text)?'bank':'finance';
  else if(screen==='은행')kind='bank';else if(screen==='레터')kind='letter';else if(screen==='로그인')kind='login';
  else if(screen==='주문판')kind='order';else if(screen==='소싱')kind=/장바구니/.test(text)?'cart':'board';
  else if(screen==='일감'||screen==='할 일')kind='tasks';
  const groups=[];
  if(/장부|은행|입출금|카카오뱅크|토스뱅크|현대카드/.test(text))groups.push(/은행.*확인|확인.*은행/.test(text)?'bank':'finance');
  if(/레터|접수함/.test(text))groups.push('letter');
  if(/로그인|로그아웃/.test(text))groups.push('login');
  if(/장바구니|소싱/.test(text))groups.push(/장바구니/.test(text)?'cart':'board');
  if(/주문판/.test(text))groups.push('order');
  if(/일감|할\s*일(?:을|이|에)?\s*(?:확인|등록|추가|완료|대기|목록)|승인함|승인\s*(?:요청|대기)/.test(text))groups.push('tasks');
  const family=x=>x==='bank'?'finance':x==='cart'?'board':x;
  // A screen name is not an authoritative route. Conflicting clues must not
  // silently steer the owner to an unrelated part of the app.
  if(kind&&groups.some(g=>family(g)!==family(kind)))kind='inbox';
  else if(!kind&&groups.length===1)kind=groups[0];
  return kind?result(destinations[kind][0],kind,true):result(destinations.inbox[0],'inbox',true);
}
function destination(event={}){const info=destinationInfo(event);if(info.kind==='inbox'&&info.inferred&&!fromWork(event.workId)&&!safeDestination(event.route))return '';return info.url;}
function route(event={}){return destination(event)||addNotice(home,event.eventId);}
root.MumutoriRoutes={work,fromWork,safe,destination,destinationInfo,route};
})(typeof self==='undefined'?globalThis:self);
