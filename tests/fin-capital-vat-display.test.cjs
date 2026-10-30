const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../src/fin-core.js');
const classifier=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../src/fin-classify.js'),'utf8')).toString('base64'));
const row=(id,kind,category,extra={})=>({id,kind,category,date:'2026-10-30',amount:1000,method:'계좌이체',status:'ok',vatTreatment:'review',ai:{status:'applied'},...extra});
test('capital inflow suppresses only the VAT-related AI check',()=>{
  const capital=row('capital','in','자금 충전');
  assert(!F.checkReasons(capital).includes('AI 확인'));
  assert(F.checkReasons({...capital,ai:{status:'review'}}).includes('AI 확인'));
  assert(F.checkReasons(row('sale','in','매출')).includes('AI 확인'));
  assert(F.checkReasons(row('expense','out','자금 충전')).includes('AI 확인'));
  assert(F.checkReasons(row('expense2','out','매입')).includes('AI 확인'));
});
test('capital does not enter taxable sales or expense VAT totals',()=>{
  const capital=row('capital','in','자금 충전'),sale=row('sale','in','매출',{amount:1100}),expense=row('expense','out','매입',{amount:300});
  const totals=F.summarize({entries:{capital,sale,expense}},'month',new Date('2026-10-30T03:00:00Z'));
  assert.equal(totals.sales,1100);assert.equal(totals.ownerIn,1000);assert.equal(totals.vatSales,100);
  assert.equal(totals.spend,300);assert.equal(totals.vatReview,1);
});
test('capital is shown as VAT not applicable without modifying any stored field',async()=>{
  const C=await classifier,source=fs.readFileSync(require.resolve('../src/fin-form.js'),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+(?=(const|function)\b)/g,'');
  const ctx={window:{FinCore:F},document:{activeElement:null},localStorage:{getItem:()=>null,setItem:()=>{}},location:{search:''},URLSearchParams,AI_LABEL:C.AI_LABEL,VAT_LABEL:C.VAT_LABEL,console};
  vm.createContext(ctx);vm.runInContext(source+'\nthis.runLists=renderLists;',ctx);
  const entries={capital:row('capital','in','자금 충전'),sale:row('sale','in','매출'),expense:row('expense','out','매입')};
  const before=JSON.stringify(entries),recent={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],dataset:{}};
  ctx.runLists({book:{entries},recentRoot:recent});
  assert.equal(JSON.stringify(entries),before,'render must not edit stored data');
  assert.equal((recent.innerHTML.match(/부가세 해당 없음/g)||[]).length,1);
  assert.equal((recent.innerHTML.match(/부가세 확인 필요/g)||[]).length,2);
});
