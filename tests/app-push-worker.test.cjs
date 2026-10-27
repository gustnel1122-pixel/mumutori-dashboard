const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
function setup(){const handlers={},shown=[],opened=[],focused=[];
const root='https://example.invalid/mumutori-dashboard/';
const ctx={URL,importScripts(){},firebase:{initializeApp(){},messaging(){return{onBackgroundMessage(fn){handlers.background=fn;}};}},self:{registration:{scope:root,showNotification:async(t,o)=>shown.push({title:t,...o})},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:root+'quick.html',focus:async()=>focused.push(true)}],openWindow:async u=>opened.push(u)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('firebase-messaging-sw.js','utf8'),ctx);return{handlers,shown,opened,focused,root};}
test('data-only push displays exactly once while any screen is visible; unknown payload ignored',async()=>{const s=setup();let stopped=0,promise;
s.handlers.push({data:{json:()=>({data:{kind:'mumutori',title:'시험',body:'본문',route:'quick.html',eventId:'same-id'}})},stopImmediatePropagation(){stopped++;},waitUntil(p){promise=p;}});await promise;
assert.equal(stopped,1);assert.equal(s.shown.length,1);assert.equal(s.shown[0].tag,'same-id');
s.handlers.push({data:{json:()=>({data:{kind:'foreign'}})},stopImmediatePropagation(){throw Error('must ignore');}});assert.equal(s.shown.length,1);});
test('notification click focuses its existing screen and never opens an external URL',async()=>{const s=setup();let promise;
const click=route=>s.handlers.notificationclick({notification:{data:{mumutori:true,route},close(){}},stopImmediatePropagation(){},waitUntil(p){promise=p;}});
click('quick.html');await promise;assert.equal(s.focused.length,1);assert.equal(s.opened.length,0);
click('https://evil.invalid/?token=private');await promise;assert.deepEqual(s.opened,[s.root+'index.html']);});
