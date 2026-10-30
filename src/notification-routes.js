// Shared by pages and the service worker. Only opaque record keys enter links.
(function(root){'use strict';
const home='/mumutori-dashboard/index.html', key=/^[A-Za-z0-9_-]{1,100}$/;
function work(kind,id=''){if(!/^(letter|finance|ledger|bank|cart|board|order|login|home|tasks|spec)$/.test(kind))return '';if(id&&!key.test(id))return '';const v='nav1_'+kind+'_'+id;return v.length<=80?v:'';}
function fromWork(value){const raw=String(value||'');if(raw.length>80)return '';const m=/^nav1_(letter|finance|ledger|bank|cart|board|order|login|home|tasks|spec)_([A-Za-z0-9_-]*)$/.exec(raw);if(!m)return '';const id=m[2];switch(m[1]){case'letter':return '/mumutori-dashboard/letter-hub.html'+(id?'?letter='+id:'')+'#inbox';case'finance':case'ledger':return '/mumutori-dashboard/finance.html'+(id?'?entry='+id:'');case'bank':return '/mumutori-dashboard/finance.html#fin-needs';case'cart':return '/mumutori-dashboard/sourcing.html?tab=cart';case'board':return '/mumutori-dashboard/sourcing.html?tab=items';case'order':return '/mumutori-offline-pages/index.html'+(id?'?item='+id:'');case'login':return '/mumutori-dashboard/settings.html#app-push-settings';case'tasks':case'spec':return '/mumutori-dashboard/letter-hub.html#'+m[1];case'home':return home+'#notifications';default:return '';}}
function safeDestination(input){if(!input)return '';try{const u=new URL(String(input),'https://route.invalid/mumutori-dashboard/');if(u.origin!=='https://route.invalid')return '';const allowed=new Set(['index.html','finance.html','quick.html','settings.html','letter-hub.html','sourcing.html','bank.html']);if(u.pathname.startsWith('/mumutori-dashboard/')&&allowed.has(u.pathname.slice('/mumutori-dashboard/'.length))||u.pathname==='/mumutori-offline-pages/index.html'){const v=new URL(u.pathname,'https://route.invalid');for(const name of ['entry','letter','item','notice']){const x=u.searchParams.get(name);if(x&&key.test(x))v.searchParams.set(name,x);}if(u.searchParams.get('push')==='1')v.searchParams.set('push','1');if(u.pathname==='/mumutori-dashboard/index.html'&&u.searchParams.get('detail')==='1')v.searchParams.set('detail','1');if(u.pathname.endsWith('/sourcing.html')&&['items','cart','orders','reorder'].includes(u.searchParams.get('tab')))v.searchParams.set('tab',u.searchParams.get('tab'));if(['#inbox','#tasks','#spec','#app-push','#app-push-settings','#notifications','#fin-needs'].includes(u.hash))v.hash=u.hash;return v.pathname+v.search+v.hash;}}catch{}return '';}
function safe(input){return safeDestination(input)||home;}
function addNotice(out,eventId){const u=new URL(out,'https://route.invalid');if(key.test(eventId||''))u.searchParams.set('notice',eventId);return u.pathname+u.search+u.hash;}
function destination(event={}){
  let out=fromWork(event.workId)||safeDestination(event.route);
  if(!out){const screen=String(event.screen||'');const action=String(event.action||'');
    if(screen==='소싱')out='/mumutori-dashboard/sourcing.html?tab='+(/장바구니/.test(action)?'cart':'items');
    else if(screen==='은행')out='/mumutori-dashboard/finance.html#fin-needs';
    else if(screen==='장부')out='/mumutori-dashboard/finance.html'+(/은행.*확인|확인.*은행/.test(action)?'#fin-needs':'');
    else if(screen==='레터')out='/mumutori-dashboard/letter-hub.html#inbox';
    else if(screen==='로그인')out='/mumutori-dashboard/settings.html#app-push-settings';
    else if(screen==='주문판')out='/mumutori-offline-pages/index.html';
  }
  return out?addNotice(out,event.eventId):'';
}
function route(event={}){return destination(event)||addNotice(home,event.eventId);}
root.MumutoriRoutes={work,fromWork,safe,destination,route};
})(typeof self==='undefined'?globalThis:self);
