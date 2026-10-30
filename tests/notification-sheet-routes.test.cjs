'use strict';
// No production events, identifiers, credentials or network access.
const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx={URL};ctx.globalThis=ctx;vm.runInNewContext(fs.readFileSync('src/notification-routes.js','utf8'),ctx);const R=ctx.MumutoriRoutes;
test('explicit authorized destination wins over conflicting legacy words',()=>{
 const info=R.destinationInfo({workId:'nav1_finance_row_1',eventId:'event_1',screen:'레터',title:'레터 접수'});
 assert(info.url.includes('/finance.html'));assert(info.url.includes('entry=row_1'));assert.equal(info.inferred,false);
});
test('legacy home events use both title and body without inventing a record ID',()=>{
 for(const [e,part] of [
  [{title:'장부 확인',body:'가상 설명'},'/finance.html'],
  [{action:'가상 안내',body:'일감을 확인해 주세요.'},'#mobile-tasks'],
  [{action:'장바구니 확인',body:'가상 설명'},'/sourcing.html']
 ]){const info=R.destinationInfo({...e,workId:'nav1_home_',screen:'운영홈',eventId:'e_1'});assert(info.url.includes(part));assert.equal(info.inferred,true);assert(!/entry=|letter=|item=/.test(info.url));}
});
test('ambiguous and untrusted content cannot leak into or control navigation',()=>{
 for(const e of [
  {action:'장부와 일감 확인',body:'두 업무를 살펴봐 주세요.'},
  {action:'가상 안내',body:'https://evil.invalid/finance?token=private'},
  {route:'https://evil.invalid/finance.html?token=private',action:'알림'}
 ]){const info=R.destinationInfo({...e,workId:'nav1_home_',screen:'운영홈',eventId:'e_1'});assert(info.url.startsWith('/mumutori-dashboard/index.html'));assert(!/evil|token|private/.test(info.url));}
});
test('conflicting legacy screen and title do not guess a specific target',()=>{
 const info=R.destinationInfo({workId:'nav1_home_',screen:'장부',action:'레터 접수 확인',eventId:'e_1'});
 assert(info.url.startsWith('/mumutori-dashboard/index.html'));assert.equal(info.kind,'inbox');
});
