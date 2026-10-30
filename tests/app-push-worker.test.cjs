const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
function setup(){const handlers={},shown=[],opened=[],focused=[];
const root='https://example.invalid/mumutori-dashboard/';
const state={uid:'owner',writes:[],fail:false,windows:null,fastTimeout:false,batch:null,event:null,fetchCalls:0};
const auth={get currentUser(){return state.uid?{uid:state.uid,getIdToken:async()=> 'synthetic-token'}:null;},onAuthStateChanged(fn){queueMicrotask(()=>fn(auth.currentUser));return()=>{};}};
const ctx={URL,AbortController,fetch:async input=>{state.fetchCalls++;if(state.onFetch)state.onFetch();if(state.readFailure)throw Error('offline');const pathname=new URL(input).pathname;return{ok:true,json:async()=>pathname.includes('/notificationBatches/')?state.batch:state.event};},setTimeout:(fn,ms)=>setTimeout(fn,state.fastTimeout&&ms===8000?15:ms),clearTimeout,importScripts(...names){for(const n of names)if(n==='src/notification-routes.js')vm.runInContext(fs.readFileSync(n,'utf8'),ctx);},firebase:{initializeApp(){},auth(){return auth;},messaging(){return{onBackgroundMessage(fn){handlers.background=fn;}};}},self:{MumutoriNoticeState:{async write(...args){if(state.hold)return new Promise(()=>{});if(state.fail)throw Error('offline');state.writes.push(args);}},registration:{scope:root,showNotification:async(t,o)=>shown.push({title:t,...o})},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>state.windows??[{url:root+'quick.html',focus:async()=>focused.push(true)}],openWindow:async u=>opened.push(u)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('firebase-messaging-sw.js','utf8'),ctx);return{handlers,shown,opened,focused,root,state};}
test('data-only push displays exactly once while any screen is visible; unknown payload ignored',async()=>{const s=setup();let stopped=0,promise;
s.handlers.push({data:{json:()=>({data:{kind:'mumutori',title:'시험',body:'본문',route:'quick.html',eventId:'same-id'}})},stopImmediatePropagation(){stopped++;},waitUntil(p){promise=p;}});await promise;
assert.equal(stopped,1);assert.equal(s.shown.length,1);assert.equal(s.shown[0].tag,'same-id');
s.handlers.push({data:{json:()=>({data:{kind:'foreign'}})},stopImmediatePropagation(){throw Error('must ignore');}});assert.equal(s.shown.length,1);});
test('notification click focuses its existing screen and never opens an external URL',async()=>{const s=setup();let promise;s.state.windows=[{url:s.root+'quick.html?push=1',focus:async()=>s.focused.push(true)}];
const click=route=>s.handlers.notificationclick({notification:{data:{mumutori:true,uid:'owner',eventId:'event_0',route},close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
click('quick.html');await promise;assert.equal(s.focused.length,1);assert.equal(s.opened.length,0);
click('finance.html?entry=row-17#inbox');await promise;assert.equal(s.opened.pop(),s.root+'finance.html?entry=row-17&push=1#inbox');click('https://evil.invalid/?token=private');await promise;assert.deepEqual(s.opened,[s.root+'index.html?push=1']);});
test('action buttons write as target account without opening a window; failure is visible',async()=>{const s=setup();let promise,closed=0;
const click=(action,uid='owner')=>s.handlers.notificationclick({action,notification:{data:{mumutori:true,uid,eventId:'e1',route:'quick.html'},tag:'e1',close(){closed++;}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
click('explain');await promise;assert.deepEqual(s.state.writes,[['owner','e1','explain']]);assert.equal(closed,1);assert.equal(s.opened.length,0);assert.equal(s.focused.length,0);
click('read','another');await promise;assert.equal(s.state.writes.length,1);assert.equal(closed,1);assert.match(s.shown.at(-1).title,/처리하지 못했어요/);
s.state.fail=true;click('read');await promise;assert.equal(closed,1);assert.match(s.shown.at(-1).title,/처리하지 못했어요/);});
test('offline pending action reports waiting without opening or claiming success',async()=>{const s=setup();s.state.hold=true;let promise,closed=false;s.handlers.notificationclick({action:'explain',notification:{data:{mumutori:true,uid:'owner',eventId:'e1'},tag:'e1',close(){closed=true;}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;assert.equal(closed,false);assert.match(s.shown.at(-1).title,/기다리고 있어요/);assert.equal(s.opened.length,0);});
test('body opens its target without navigating an existing draft and marks only the matching user',async()=>{
const s=setup();let navigated=0,promise;s.state.windows=[{url:s.root+'finance.html?entry=older',navigate:async()=>{navigated++;throw Error('must not navigate');},focus:async()=>{throw Error('wrong window');}}];
const click=(uid,route)=>s.handlers.notificationclick({notification:{data:{mumutori:true,uid,eventId:'evt_1',route},close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
click('owner','finance.html?entry=newer&notice=evt_1');await promise;
assert.equal(navigated,0);assert.equal(s.opened[0],s.root+'finance.html?entry=newer&notice=evt_1&push=1');assert.deepEqual(s.state.writes,[['owner','evt_1','read']]);
click('other','quick.html?notice=evt_1');await promise;assert.equal(s.state.writes.length,1);assert.equal(s.opened.length,1);assert.match(s.shown.at(-1).title,/계정/);
});
test('a slow read never holds up opening the destination',async()=>{
const s=setup();s.state.hold=true;s.state.fastTimeout=true;s.state.windows=[];let promise;
s.handlers.notificationclick({notification:{data:{mumutori:true,uid:'owner',eventId:'evt_2',route:'finance.html?entry=e2&notice=evt_2'},close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
await new Promise(r=>setTimeout(r,5));assert.equal(s.opened[0],s.root+'finance.html?entry=e2&notice=evt_2&push=1');await promise;
});
test('locationless push retains its opaque event key for an inbox explanation',async()=>{
const s=setup();let promise;s.handlers.push({data:{json:()=>({data:{kind:'mumutori',title:'시험',eventId:'event_7',screen:'운영홈'}})},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
assert.equal(s.shown[0].data.route,'/mumutori-dashboard/index.html?notice=event_7&detail=1#notifications');
});
test('each push type opens the same safe location as its card; grouped home remains the inbox',async()=>{
const cases=[
 ['nav1_finance_row1','/mumutori-dashboard/finance.html?entry=row1&notice=event_1'],
 ['nav1_bank_','/mumutori-dashboard/finance.html?notice=event_1#fin-needs'],
 ['nav1_letter_letter1','/mumutori-dashboard/letter-hub.html?letter=letter1&notice=event_1#inbox'],
 ['nav1_login_','/mumutori-dashboard/settings.html?notice=event_1#app-push-settings'],
 ['nav1_cart_','/mumutori-dashboard/sourcing.html?tab=cart&notice=event_1'],
 ['nav1_home_','/mumutori-dashboard/index.html?notice=event_1#notifications']
];
for(const [workId,expected] of cases){
 const s=setup();s.state.windows=[];let promise;
 s.handlers.push({data:{json:()=>({data:{kind:'mumutori',title:'시험',eventId:'event_1',uid:'owner',workId}})},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 assert.equal(s.shown[0].data.route,expected);
 s.handlers.notificationclick({notification:{data:s.shown[0].data,close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 const actual=new URL(s.opened[0]),wanted=new URL(expected,s.root);wanted.searchParams.set('push','1');actual.searchParams.sort();wanted.searchParams.sort();assert.equal(actual.pathname+actual.search+actual.hash,wanted.pathname+wanted.search+wanted.hash);
 assert.deepEqual(s.state.writes,[['owner','event_1','read']]);
}
});
test('legacy home pushes use batch metadata without guessing; uncertain lookup stays at inbox',async()=>{
async function run(batch,event,readFailure=false){
 const s=setup();s.state.windows=[];s.state.batch=batch;s.state.event=event;s.state.readFailure=readFailure;let promise;
 s.handlers.push({data:{json:()=>({data:{kind:'mumutori',uid:'owner',eventId:'event_1',route:'/mumutori-dashboard/index.html#notifications'}})},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 s.handlers.notificationclick({notification:{data:s.shown[0].data,close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 return new URL(s.opened[0]);
}
let result=await run({multiple:true},{screen:'운영홈'});assert.equal(result.hash,'#notifications');assert.equal(result.searchParams.get('detail'),null);
result=await run({multiple:false},{screen:'운영홈'});assert.equal(result.hash,'#notifications');assert.equal(result.searchParams.get('detail'),'1');assert.equal(result.searchParams.get('notice'),'event_1');
result=await run({multiple:false},{screen:'은행'});assert.equal(result.pathname,'/mumutori-dashboard/finance.html');assert.equal(result.hash,'#fin-needs');assert.equal(result.searchParams.get('notice'),'event_1');
result=await run(null,{screen:'은행'});assert.equal(result.hash,'#notifications');assert.equal(result.searchParams.get('detail'),null);
result=await run(null,{screen:'운영홈'},true);assert.equal(result.hash,'#notifications');assert.equal(result.searchParams.get('detail'),null);
});
test('wrong or changed account never opens a notice or writes read state',async()=>{
const s=setup();s.state.windows=[];let promise;
const click=uid=>s.handlers.notificationclick({notification:{data:{mumutori:true,uid,eventId:'event_1',route:'/mumutori-dashboard/index.html?notice=event_1#notifications'},close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
click('other');await promise;assert.equal(s.opened.length,0);assert.equal(s.state.writes.length,0);assert.match(s.shown.at(-1).title,/계정/);
s.state.batch={multiple:false};s.state.event={screen:'운영홈'};s.state.onFetch=()=>{s.state.uid='other';};click('owner');await promise;
assert.equal(s.opened.length,0);assert.equal(s.state.writes.length,0);assert.match(s.shown.at(-1).title,/계정/);
});
test('new fixed intents distinguish a target, a single explanation and a bundled inbox',async()=>{
async function run(intent,route){const s=setup();s.state.windows=[];let promise;
 s.handlers.push({data:{json:()=>({data:{kind:'mumutori',uid:'owner',eventId:'event_1',intent,route}})},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 s.handlers.notificationclick({notification:{data:s.shown[0].data,close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});await promise;
 return {s,url:new URL(s.opened[0])};}
let a=await run('route','/mumutori-dashboard/finance.html?entry=row1');assert.equal(a.url.pathname,'/mumutori-dashboard/finance.html');assert.equal(a.url.searchParams.get('entry'),'row1');assert.equal(a.url.searchParams.get('push'),'1');assert.equal(a.s.state.fetchCalls,0);
let b=await run('detail','/mumutori-dashboard/index.html#notifications');assert.equal(b.url.hash,'#notifications');assert.equal(b.url.searchParams.get('detail'),'1');assert.equal(b.url.searchParams.get('notice'),'event_1');assert.equal(b.s.state.fetchCalls,0);
let c=await run('inbox','/mumutori-dashboard/finance.html?entry=row1');assert.equal(c.url.pathname,'/mumutori-dashboard/index.html');assert.equal(c.url.hash,'#notifications');assert.equal(c.url.searchParams.get('detail'),null);assert.equal(c.s.state.fetchCalls,0);
let d=await run('unrecognized','/mumutori-dashboard/index.html#notifications');assert.equal(d.url.hash,'#notifications');assert.equal(d.url.searchParams.get('detail'),null);assert.equal(d.s.state.fetchCalls,2);
});
