const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/erp-core.js');
function fixture(){return C.migrate({products:[{id:'A',name:'상품 A',salesStatus:'판매 중'},{id:'B',name:'상품 B',salesStatus:'판매 중'}],purchaseLines:[],bankTransactions:[],finance:{},erp:{accounts:[{id:'main',name:'사업 통장'}],warehouses:['기본 창고','보조 창고']}});}
const bank=(over={})=>({id:'b',date:'2026-10-03',direction:'입금',amount:10000,description:'판매처',accountLabel:'main',category:'매출 수금',...over});
const move=(id,type,qty,over={})=>({id,type,qty,sku:'A',warehouse:'기본 창고',date:'2026-10-03',createdAt:id,...over});
const sale=(over={})=>({id:'s',date:'2026-10-03',orderId:'S1',channel:'직접 판매',productName:'상품 A',sku:'A',quantity:2,salesGross:10000,feeNet:0,feeVAT:0,settlementBase:10000,linkedBankIds:[],...over});
test('personal funding and loan collection never become sales; paired transfers stay internal',()=>{
  let d=fixture();d.bankTransactions=[bank({description:'김현수',category:'사업주 투입'}),bank({id:'b2',description:'백다희',category:'매출 수금'}),bank({id:'b3',description:'김현수',category:'대여금 회수'}),bank({id:'b4',description:'김현수',category:'계좌이체',transferId:'t'})];
  d=C.migrate(d);assert.deepEqual(d.bankTransactions.map(x=>x.category),['자금 충전','자금입금·용도 확인','대여금 회수','계좌이체']);
  assert.equal(C.financeSummary(d).salesGross,0);assert.equal(C.financeSummary(d).inflow,30000);assert.equal(C.eligibleBank(d,sale()).length,0);
  assert.throws(()=>C.record(d,'bank',bank({id:'bad',description:'백다희'}),{isNew:true}),/매출/);
});
test('migration preserves prior user edits and unrecognized source data',()=>{const d=fixture();d.products[0].name='수정한 상품';d.other={source:42};assert.equal(C.migrate(d).products[0].name,'수정한 상품');assert.equal(C.migrate(d).other.source,42);});
test('unknown costs stay unknown; known cost allocates once across units',()=>{const p={purchase:10000,shipping:2000,customs:null};assert.equal(C.purchaseCost(p).net,null);p.customs=1000;p.vatCredit=1000;p.lines=[{qty:2,amountCNY:20},{qty:2,amountCNY:20}];assert.equal(C.allocation(p,p.lines[0]),3000);});
test('allocation never mixes KRW with CNY weights',()=>{const p={purchase:10000,shipping:0,customs:0,lines:[{qty:1,amountCNY:10,amountKRW:2000},{qty:1,amountCNY:10}]};assert.equal(C.allocation(p,p.lines[0]),null);});
test('stock needs a count; chronological negative balances and invalid transfers are rejected',()=>{
  let d=fixture();d=C.record(d,'movement',move('1','입고',4),{isNew:true});assert.equal(C.stock(d,'A').qty,null);
  d=C.record(d,'movement',move('2','실사',5),{isNew:true});d=C.record(d,'movement',move('3','출고',2),{isNew:true});assert.equal(C.stock(d,'A').qty,3);
  assert.throws(()=>C.record(d,'movement',move('4','출고',4),{isNew:true}),/음수/);
  assert.throws(()=>C.record(d,'movement',move('4','창고이동',1,{toWarehouse:'기본 창고'}),{isNew:true}),/다른/);
  d=C.record(d,'movement',move('4','실사',0,{warehouse:'보조 창고'}),{isNew:true});d=C.record(d,'movement',move('5','창고이동',2,{toWarehouse:'보조 창고'}),{isNew:true});
  assert.equal(C.stock(d,'A').qty,1);assert.equal(C.stock(d,'A','보조 창고').qty,2);
});
test('changing or cancelling a receipt cannot hide an earlier negative balance behind a later count',()=>{
  let d=fixture();for(const m of [move('1','실사',0),move('2','입고',5),move('3','출고',5),move('4','실사',3)])d=C.record(d,'movement',m,{isNew:true});
  assert.throws(()=>C.toggleVoid(d,'movement','2','중복'),/음수/);
  assert.throws(()=>C.record(d,'movement',move('2','입고',5,{sku:'B'})),/음수/);
});
test('purchase receipts and sales shipments cannot exceed document quantities',()=>{
  let d=fixture();d=C.record(d,'purchase',{orderNo:'P1',date:'2026-10-03',vendor:'구매처',purchase:10000,shipping:0,customs:0,lines:[{id:'l',sku:'A',qty:3}]},{isNew:true});
  d=C.record(d,'movement',move('1','입고',3,{sourceType:'purchase',sourceId:'P1'}),{isNew:true});
  assert.throws(()=>C.record(d,'movement',move('2','입고',1,{sourceType:'purchase',sourceId:'P1'}),{isNew:true}),/중복 입고/);
  assert.throws(()=>C.toggleVoid(d,'purchase','P1','취소'),/입출고/);
  d=C.record(d,'sale',sale(),{isNew:true});d=C.record(d,'movement',move('3','출고',2,{sourceType:'sale',sourceId:'s'}),{isNew:true});
  assert.throws(()=>C.record(d,'movement',move('4','출고',1,{sourceType:'sale',sourceId:'s'}),{isNew:true}),/중복 출고/);
});
test('cash receipts are exclusive, and changing linked cash to personal funding is blocked',()=>{
  let d=C.record(fixture(),'bank',bank(),{isNew:true});d=C.record(d,'sale',sale({linkedBankIds:['b']}),{isNew:true});assert.equal(C.saleTotals(d,d.finance.channelTransactions[0]).due,0);
  assert.throws(()=>C.record(d,'sale',sale({id:'s2',linkedBankIds:['b']}),{isNew:true}),/연결/);
  assert.throws(()=>C.record(d,'bank',bank({description:'김현수',category:'자금 충전'})),/연결/);
  assert.throws(()=>C.toggleVoid(d,'bank','b','오류'),/해제/);
});
test('CSV accepts display names, quoted amounts and deduplicates; owner names stay funding',()=>{
  const text='날짜,계좌,구분,금액,내용,분류,메모\r\n2026-10-03,사업 통장,입금,"10,000",김현수,매출 수금,"충전, 확인"\r\n2026-10-03,사업 통장,입금,10000,김현수,매출 수금,반복';
  const r=C.csvImport(text,fixture());assert.equal(r.rows.length,1);assert.equal(r.duplicates,1);assert.equal(r.rows[0].category,'자금입금·용도 확인');assert.equal(r.rows[0].accountLabel,'main');
  assert.throws(()=>C.csvImport('날짜,계좌,구분,금액,내용\n2026-99-99,사업 통장,입금,1000,판매',fixture()),/날짜/);
});
test('backup merge keeps current edits unless explicit overwrite is selected',()=>{const d=fixture(),other=C.clone(d);other.products[0].name='다른 이름';assert.equal(C.mergeBackup(d,other).data.products[0].name,'상품 A');assert.equal(C.mergeBackup(d,other,true).data.products[0].name,'다른 이름');assert.equal(C.validateBackup(d).products.length,2);});

const brand=(over={})=>({id:'STAMP-T1',kind:'도장',name:'시험 도장',status:'candidate',...over});
test('branding records live in the private ledger: created lazily, validated, audited by field name only',()=>{
  let d=fixture();assert.equal(d.erp.branding,undefined,'브랜딩을 쓰지 않는 장부에는 칸을 만들지 않는다');
  const others=x=>JSON.stringify({products:x.products,bank:x.bankTransactions,partners:x.erp.partners,accounts:x.erp.accounts,movements:x.erp.movements});
  const before=others(d);
  d=C.record(d,'branding',brand({orderNo:'ORD-SECRET-1',artSource:'private-folder/logo-v01.ai'}),{isNew:true,action:'등록'});
  assert.equal(d.erp.branding.length,1);assert.equal(others(d),before,'다른 장부는 그대로');
  assert.equal(d.erp.audit[0].type,'branding');assert.ok(d.erp.audit[0].fields.includes('orderNo'));
  assert.ok(!JSON.stringify(d.erp.audit).includes('ORD-SECRET-1')&&!JSON.stringify(d.erp.audit).includes('private-folder'),'변경 이력에는 칸 이름만 남고 값은 남지 않는다');
  assert.throws(()=>C.record(d,'branding',brand(),{isNew:true}),/이미 존재/);
  assert.throws(()=>C.record(d,'branding',brand({id:'bad id'}),{isNew:true}),/품목 ID/);
  assert.throws(()=>C.record(d,'branding',brand({id:'X1',name:' '}),{isNew:true}),/이름/);
  assert.throws(()=>C.record(d,'branding',brand({id:'X1',url:'javascript:alert(1)'}),{isNew:true}),/주소/);
  assert.throws(()=>C.record(d,'branding',brand({id:'X1',kind:'없는 종류'}),{isNew:true}),/종류/);
  assert.throws(()=>C.record(d,'branding',brand({id:'X1',paid:-1}),{isNew:true}),/실제 결제액/);
  assert.throws(()=>C.record(d,'branding',brand({status:'ordered'})),/발주일/);
  assert.throws(()=>C.record(d,'branding',brand({status:'received',orderDate:'2026-10-20'})),/수령일/);
  assert.throws(()=>C.record(d,'branding',brand({status:'inuse'})),/수령일이나 사용 근거/);
  assert.throws(()=>C.record(d,'branding',brand({status:'received',orderDate:'2026-10-20',receivedDate:'2026-10-19'})),/빠릅니다/);
  assert.equal(C.record(d,'branding',brand({status:'inuse',useEvidence:'2026-09부터 매장 포장에 사용'})).erp.branding[0].status,'inuse','지금 쓰는 물건은 사용 근거로 기록할 수 있다');
  d=C.record(d,'branding',brand({status:'inuse',orderDate:'2026-10-20',receivedDate:'2026-10-24',testResult:'합격',paid:34000}));
  assert.equal(d.erp.branding[0].status,'inuse');assert.equal(d.erp.branding[0].orderNo,'ORD-SECRET-1','수정해도 앞서 적은 칸은 남는다');
  d=C.toggleVoid(d,'branding','STAMP-T1','잘못 등록');assert.equal(d.erp.branding[0].voided,true);d=C.toggleVoid(d,'branding','STAMP-T1');assert.equal(d.erp.branding[0].voided,false);
  assert.equal(C.migrate(d).erp.branding.length,1,'다시 읽어도 보존');
  const odd=fixture();odd.erp.branding={unknown:true};assert.throws(()=>C.record(odd,'branding',brand(),{isNew:true}),/형식/);assert.deepEqual(C.migrate(odd).erp.branding,{unknown:true},'모르는 형식은 덮어쓰지 않는다');
});
test('backup and merge carry branding records without touching other ledgers',()=>{
  const base=fixture(),withBrand=C.record(base,'branding',brand({option:'검정'}),{isNew:true});
  const restored=C.mergeBackup(base,C.validateBackup(C.clone(withBrand)));assert.equal(restored.data.erp.branding.length,1);assert.equal(restored.report.added,1);assert.deepEqual(restored.data.products,base.products);
  const changed=C.record(withBrand,'branding',brand({option:'청색'}));
  assert.equal(C.mergeBackup(withBrand,changed).data.erp.branding[0].option,'검정');assert.equal(C.mergeBackup(withBrand,changed,true).data.erp.branding[0].option,'청색');
  assert.equal(C.mergeBackup(withBrand,base).data.erp.branding.length,1,'브랜딩 기록이 없는 백업을 병합해도 내 기록은 남는다');
  assert.equal(C.mergeBackup(base,base).data.erp.branding,undefined,'양쪽에 없으면 칸을 만들지 않는다');
  const dup=C.clone(withBrand);dup.erp.branding.push(C.clone(dup.erp.branding[0]));assert.throws(()=>C.validateBackup(dup),/중복/);
  const bad=C.clone(base);bad.erp.branding='x';assert.throws(()=>C.validateBackup(bad),/브랜딩/);
});
test('backup import applies the same branding evidence rules as direct entry and leaves the ledger untouched on refusal',()=>{
  const base=C.record(fixture(),'branding',brand({option:'검정'}),{isNew:true}),snapshot=JSON.stringify(base);
  const withRows=rows=>{const b=C.clone(base);b.erp.branding=rows;return b;};
  const unproven={id:'SYN-UNPROVEN',name:'Synthetic unproven use',kind:'도장',status:'inuse'};
  assert.throws(()=>C.record(base,'branding',unproven,{isNew:true}),/수령일이나 사용 근거/,'직접 등록은 거절');
  assert.throws(()=>C.validateBackup(withRows([unproven])),/SYN-UNPROVEN[\s\S]*수령일이나 사용 근거[\s\S]*현재 자료는 바뀌지 않았습니다/,'가져오기 검사도 같은 이유로 거절하고 어느 기록인지 알려 준다');
  assert.throws(()=>C.mergeBackup(base,C.migrate(withRows([unproven]))),/SYN-UNPROVEN/,'검사를 건너뛰고 병합을 불러도 거절');
  assert.throws(()=>C.mergeBackup(base,C.migrate(withRows([unproven])),true),/SYN-UNPROVEN/,'가져온 자료 우선으로 병합해도 거절');
  assert.throws(()=>C.mergeBackup(base,C.migrate(withRows([...base.erp.branding,unproven]))),/SYN-UNPROVEN/,'정상 기록과 섞여 있어도 전체를 거절');
  assert.equal(JSON.stringify(base),snapshot,'거절되면 현재 장부는 글자 하나 바뀌지 않는다');
  for(const [row,re] of [[{...unproven,id:'SYN-ORD',status:'ordered'},/발주일/],[{...unproven,id:'SYN-RCV',status:'received'},/수령일/],[{...unproven,id:'SYN-URL',status:'candidate',url:'javascript:alert(1)'},/주소/],
    [{...unproven,id:'bad id',status:'candidate'},/품목 ID/],[{...unproven,id:'SYN-VOID',voided:true},/사용 근거/],[{...unproven,id:'SYN-KIND',status:'candidate',kind:'없는 종류'},/종류/],[null,/형식/],['x',/형식/],[[],/형식/]])
    assert.throws(()=>C.validateBackup(withRows([row])),re);
  // 호환: 정상 기록은 예전 규칙 그대로 병합되고, 모르는 칸은 보존된다. 브랜딩이 없는 예전 백업은 그대로 통과한다.
  const proven={...unproven,id:'SYN-PROVEN',useEvidence:'2026-09부터 사용',futureField:{keep:1}},good=withRows([...base.erp.branding,proven]);
  const merged=C.mergeBackup(base,C.validateBackup(good));assert.equal(merged.report.added,1);assert.equal(merged.report.conflicts,0);assert.deepEqual(merged.data.erp.branding.find(r=>r.id==='SYN-PROVEN').futureField,{keep:1});
  assert.equal(merged.data.erp.branding.find(r=>r.id==='STAMP-T1').option,'검정');assert.deepEqual(merged.data.products,base.products);
  const noBrand=fixture();assert.equal(C.validateBackup(C.clone(noBrand)).erp.branding,undefined);assert.equal(C.mergeBackup(base,noBrand).data.erp.branding.length,1);
  const empty=fixture();empty.erp.branding=[];assert.deepEqual(C.validateBackup(C.clone(empty)).erp.branding,[]);
  // 취소해 둔 기록을 복구할 때도 같은 검증
  const stale=C.clone(base);stale.erp.branding.push({...unproven,id:'SYN-STALE',voided:true,voidReason:'x'});assert.throws(()=>C.toggleVoid(stale,'branding','SYN-STALE'),/사용 근거/);
});
