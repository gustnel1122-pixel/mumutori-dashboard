const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function api(){const ctx={Promise,Map,Set,AbortController,setTimeout,clearTimeout};ctx.globalThis=ctx;vm.runInNewContext(fs.readFileSync('src/activity-client.js','utf8'),ctx);return ctx.MumutoriActivity;}
const id='a'.repeat(32),user={uid:'u',getIdToken:async()=>'token'};
test('each screen supplies a safe explicit destination and specific work IDs take precedence',()=>{
 const r=api().createReporter({uuid:()=>id});
 for(const [screen,action,want] of [['장부','기록 저장','nav1_finance_'],['소싱','장바구니 변경','nav1_cart_'],['소싱','댓글 저장','nav1_board_'],['주문판','파일 첨부','nav1_order_'],['운영홈','기록 저장','nav1_home_'],['pc','기록 저장','nav1_home_']])
   assert.equal(r.make(screen,action).workId,want);
 assert.equal(r.make('장부','기록 저장','nav1_finance_opaque').workId,'nav1_finance_opaque');
 assert.equal(r.make('장부','기록 저장','nav1_bank_opaque').workId,'nav1_bank_opaque');
 assert.equal(r.make('소싱','댓글 저장','https://not-allowed.invalid/private').workId,'nav1_board_');
});
test('new and preconstructed events carry only destination metadata and keep retry deduplication',async()=>{
 const writes=[],r=api().createReporter({user:()=>user,uuid:()=>id,fetch:async(_u,opt)=>{writes.push(JSON.parse(opt.body));return{ok:true}}});
 assert.equal(await r.record({screen:'장부',action:'기록 저장',amount:123,comment:'private'}),true);
 assert.equal(writes[0].workId,'nav1_finance_');assert(!JSON.stringify(writes[0]).includes('private'));
 const old={eventId:'act_'+('b'.repeat(32)),screen:'소싱',action:'장바구니 변경',workId:'web_'+('b'.repeat(32))};
 assert.equal(await r.record(old),true);assert.equal(await r.record(old),true);assert.equal(writes.length,2);assert.equal(writes[1].workId,'nav1_cart_');
});
