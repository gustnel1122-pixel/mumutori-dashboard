const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
function setup(){
 const data={},auth={currentUser:{uid:'owner'}};let failBatch=false,failWrite=false,pauseWrite=false,releaseWrite;
 const valueAt=path=>path.split('/').reduce((o,k)=>o?.[k],data);
 const setAt=(path,v)=>{const p=path.split('/'),last=p.pop();let o=data;for(const k of p)o=o[k]||={};o[last]=v;};
 const db={ref:path=>({
  orderByChild(){return this;},limitToLast(){return this;},
  async once(){if(failBatch&&path.startsWith('notificationBatches/'))throw Error('offline');const v=valueAt(path);return{val:()=>v??null,exists:()=>v!=null};},
  async set(value){if(failWrite)throw Error('offline');if(pauseWrite)await new Promise(resolve=>{releaseWrite=resolve;});setAt(path,value);},async remove(){setAt(path,null);},
  async update(changes){if(failWrite)throw Error('offline');for(const [key,v] of Object.entries(changes))setAt(path+'/'+key,v);},
  async transaction(fn){const old=valueAt(path),v=fn(old??null);if(v!==undefined)setAt(path,v);return{committed:v!==undefined};}
 })};
 const database=Object.assign(()=>db,{ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}});
 const firebase={database,auth:()=>auth,app:()=>({database:()=>db})};
 const ctx={firebase};vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/notification-state.js','utf8'),ctx);
 return {api:ctx.MumutoriNoticeState,data,auth,setAt,failBatch:()=>{failBatch=true;},failWrite:()=>{failWrite=true;},pauseWrite:()=>{pauseWrite=true;},releaseWrite:()=>releaseWrite()};
}
test('UID-scoped read, bundled reads and repeat explanation use one request',async()=>{const s=setup();s.setAt('notificationBatches/group',{members:{a:true,b:true}});
 await Promise.all([s.api.write('owner','group','explain'),s.api.write('owner','group','explain')]);
 assert.deepEqual(Object.keys(s.data.notificationUserState.owner.reads).sort(),['a','b','group']);
 assert.deepEqual(Object.keys(s.data.notificationUserState.owner.explain),['group']);assert.equal(s.data.notificationUserState.owner.explain.group.status,'pending');
 assert.deepEqual(Object.keys(await s.api.readAll('owner')).sort(),['a','b','group']);});
test('wrong UID and failed bundle/write do not claim success',async()=>{let s=setup();await assert.rejects(s.api.write('other','a','read'));assert.equal(s.data.notificationUserState,undefined);
 s=setup();s.failBatch();await assert.rejects(s.api.write('owner','a','read'));assert.equal(s.data.notificationUserState,undefined);
 s=setup();s.failWrite();await assert.rejects(s.api.write('owner','a','explain'));assert.equal(s.data.notificationUserState,undefined);
 s=setup();s.setAt('notificationBatches/a',{members:{b:false}});await assert.rejects(s.api.write('owner','a','read'));assert.equal(s.data.notificationUserState,undefined);});
test('SDK event and push operations remain account scoped',async()=>{const s=setup();s.setAt('activityHub/events/e',{createdAt:1});s.setAt('appPush/config',{enabled:true});assert.equal((await s.api.readEvents('owner')).e.createdAt,1);assert.equal((await s.api.pushRequest('owner','GET','config')).enabled,true);await s.api.pushRequest('owner','PUT','devices/owner/d',{x:1});assert.equal(s.data.appPush.devices.owner.d.x,1);await assert.rejects(s.api.pushRequest('other','GET','config'));s.auth.currentUser={uid:'other'};await assert.rejects(s.api.readEvents('owner'));});
test('an account change during a delayed write never reports success for the new user',async()=>{const s=setup();s.pauseWrite();const pending=s.api.pushRequest('owner','PUT','devices/owner/d',{x:1});await new Promise(resolve=>setImmediate(resolve));s.auth.currentUser={uid:'other'};s.releaseWrite();await assert.rejects(pending,/account-changed/);});
