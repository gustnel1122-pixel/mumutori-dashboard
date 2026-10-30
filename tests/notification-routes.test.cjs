const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');const ctx={URL};ctx.globalThis=ctx;vm.runInNewContext(fs.readFileSync('src/notification-routes.js','utf8'),ctx);const R=ctx.MumutoriRoutes;
test('exact opaque IDs survive route, source activity and push notification paths',()=>{for(const[k,id,part]of[['letter','-full_receipt-11','letter=-full_receipt-11'],['finance','row_22','entry=row_22'],['order','central-table','item=central-table'],['cart','','tab=cart'],['board','','tab=items']]){const workId=R.work(k,id),u=R.route({workId,eventId:'event-1'});assert(u.includes(part));assert(u.includes('notice=event-1'));const a=new URL(R.safe(u),'https://test.invalid'),b=new URL(u,'https://test.invalid');a.searchParams.sort();b.searchParams.sort();assert.equal(a.href,b.href);}assert.equal(R.work('finance','customer@name'),'');assert.equal(R.work('order','a'.repeat(80)),'');});
test('route allowlist rejects external hosts, traversals, secrets and arbitrary query data',()=>{for(const s of['https://evil.invalid/finance.html','//evil.invalid','javascript:alert(1)','../private.html','/mumutori-dashboard/../private.html'])assert.equal(R.safe(s),'/mumutori-dashboard/index.html');assert.equal(R.safe('finance.html?entry=row_1&token=private&share=secret#unknown'),'/mumutori-dashboard/finance.html?entry=row_1');assert.equal(R.safe('/mumutori-offline-pages/index.html?item=central-table&share=secret'),'/mumutori-offline-pages/index.html?item=central-table');});
test('click destinations use known screens and leave unknown activities for explanation',()=>{
  for(const [event,part] of [
    [{workId:'nav1_letter_letter_1'},'letter-hub.html?letter=letter_1#inbox'],
    [{workId:'nav1_finance_row_1'},'finance.html?entry=row_1'],
    [{workId:'nav1_bank_review_1'},'finance.html#fin-needs'],
    [{workId:'nav1_login_'},'settings.html#app-push-settings'],
    [{workId:'nav1_cart_'},'sourcing.html?tab=cart'],
    [{workId:'nav1_board_'},'sourcing.html?tab=items'],
    [{workId:'nav1_order_item_1'},'index.html?item=item_1'],
    [{screen:'소싱',action:'장바구니 확인'},'sourcing.html?tab=cart'],
    [{screen:'장부',action:'은행 알림 확인 필요'},'finance.html#fin-needs'],
    [{screen:'레터'},'letter-hub.html#inbox'],
    [{screen:'로그인'},'settings.html#app-push-settings']
  ])assert(R.destination(event).includes(part));
  assert.equal(R.destination({screen:'운영홈',action:'업무 처리 완료'}),'');
  assert.equal(R.destination({route:'https://evil.invalid/sourcing.html?secret=1'}),'');
  assert.equal(R.destination({workId:'nav1_finance_'+ 'a'.repeat(81)}),'');
  assert.equal(R.destination({workId:'nav1_bank_r',eventId:'ev_1'}),'/mumutori-dashboard/finance.html?notice=ev_1#fin-needs');
  assert.equal(R.destination({route:'finance.html?entry=row_1&token=private#fin-needs'}),'/mumutori-dashboard/finance.html?entry=row_1#fin-needs');
  assert.equal(R.safe('/mumutori-dashboard/index.html?notice=ev_1&detail=1#notifications'),'/mumutori-dashboard/index.html?notice=ev_1&detail=1#notifications');
  assert.equal(R.safe('/mumutori-dashboard/index.html?detail=other&token=secret'),'/mumutori-dashboard/index.html');
  assert.equal(R.safe('/mumutori-dashboard/finance.html?detail=1'),'/mumutori-dashboard/finance.html');
  assert.equal(R.safe('/mumutori-dashboard/finance.html?entry=row_1&notice=ev_1&push=1#fin-needs'),'/mumutori-dashboard/finance.html?entry=row_1&notice=ev_1&push=1#fin-needs');
  assert.equal(R.safe('/mumutori-offline-pages/index.html?item=item_1&push=1'),'/mumutori-offline-pages/index.html?item=item_1&push=1');
  assert.equal(R.safe('/mumutori-dashboard/index.html?push=2&token=secret'),'/mumutori-dashboard/index.html');
  assert.equal(R.safe('https://evil.invalid/finance.html?push=1'),'/mumutori-dashboard/index.html');
  assert.equal(R.route({screen:'운영홈',eventId:'ev_2'}),'/mumutori-dashboard/index.html?notice=ev_2');
});
