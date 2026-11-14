'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const model=import(pathToFileURL(path.resolve(__dirname,'../preview-v5/model.js')).href);
const one=Number(true),zero=Number(false),two=one+one,three=two+one;
const known=(id,kind='부자재')=>({id,kind,currency:'KRW',unitCost:one});
const base=()=>({id:'fixture',unitCost:one,unitCostCurrency:'KRW',salePrice:three,stock:one,links:[]});
const link=id=>({materialId:id,quantity:one,always:true});
test('known materials sum while unknown and product kinds are excluded and flagged',async()=>{
 const {calcProduct,validateMaterialLinks}=await model;
 const materials=[known('general'),known('attached','item'),known('pack','pack'),{...known('unknown'),kind:'unknown'},{...known('product'),kind:'상품'}];
 const p={...base(),links:materials.map(m=>link(m.id))}, c=calcProduct(p,materials);
 assert.equal(c.materialCost,three);assert.equal(c.cost,one+three);assert.equal(c.partialCost,true);assert.equal(c.roas.smart,null);assert.equal(c.profitPerUnit,null);assert.ok(c.issues.includes('일부 부자재 제외 · 확인 필요'));
 assert.equal(validateMaterialLinks([link('general')],materials).valid,true);assert.equal(validateMaterialLinks([link('unknown')],materials).valid,false);assert.equal(validateMaterialLinks([link('product')],materials).valid,false);
});
test('known general set materials sum; omitted unknown is visible and does not claim a full margin',async()=>{
 const {calcSet}=await model;const materials=[known('general'),{...known('unknown'),kind:'unknown'}];const p=base();
 const set={components:[{id:p.id,quantity:one}],materials:[link('general'),link('unknown')],salePrice:three};
 const c=calcSet(set,[p],materials);assert.equal(c.cost,two);assert.equal(c.partialCost,true);assert.equal(c.roas.smart,null);assert.ok(c.issues.includes('일부 부자재 제외 · 확인 필요'));
 const included=calcSet({...set,materials:[link('general')]},[p],materials);assert.equal(included.cost,two);assert.equal(included.partialCost,false);
});
test('confirmed material currency must be explicit and a missing currency is excluded with a warning',async()=>{
 const {calcProduct}=await model;const m={id:'no-currency',kind:'부자재',unitCost:one},p={...base(),links:[link(m.id)]};
 const c=calcProduct(p,[m]);assert.equal(c.cost,one);assert.equal(c.partialCost,true);assert.ok(c.issues.includes('부자재 통화 확인 필요'));
});
test('missing currency differs from missing cost; foreign and cancelled rows cannot silently convert',async()=>{
 const {calcProduct,receiptCurrency}=await model;
 const missing=calcProduct({...base(),unitCostCurrency:undefined},[]);assert.equal(missing.unitCost,null);assert.equal(missing.costReason,'통화 확인 필요');
 const noCost=calcProduct({...base(),unitCost:null,unitCostCurrency:undefined},[]);assert.equal(noCost.unitCost,null);assert.equal(noCost.costReason,'원가 확인 필요');
 const row={quantity:one,saleQuantity:one,eventQuantity:zero,unitCost:one};
 const receipt=calcProduct({...base(),unitCost:null,unitCostCurrency:undefined,receipts:[row]},[]);assert.equal(receipt.unitCost,null);assert.equal(receipt.costReason,'통화 확인 필요');
 const foreign=calcProduct({...base(),unitCost:null,receipts:[{...row,currency:'CNY'}]},[]);assert.equal(foreign.unitCost,null);
 const cancelled=calcProduct({...base(),receipts:[{...row,currency:'CNY',status:'구매취소'}]},[]);assert.equal(cancelled.unitCost,one);
 assert.equal(receiptCurrency({}),null);
});

test('a provisional unitCost is flagged (not silently recalculated) once a lot is cancelled',async()=>{
 const {calcProduct}=await model;
 const provisionalBase={...base(),unitCostBasis:'회차 지출 배분(잠정 · 11/10)'};
 const clean=calcProduct({...provisionalBase,receipts:[{quantity:one,saleQuantity:one,eventQuantity:zero,status:'배대지 창고'}]},[]);
 assert.equal(clean.provisional,true);assert.equal(clean.unitCost,one);assert.ok(!clean.issues.includes('구매취소 있음 · 잠정 원가 다시 확인'));assert.ok(!clean.costNotes.includes('구매취소 있음 · 잠정 원가 다시 확인'));
 const stale=calcProduct({...provisionalBase,receipts:[{quantity:one,saleQuantity:one,eventQuantity:zero,status:'구매취소'}]},[]);
 assert.equal(stale.provisional,true);assert.equal(stale.unitCost,one);assert.ok(stale.issues.includes('구매취소 있음 · 잠정 원가 다시 확인'));assert.ok(stale.costNotes.includes('구매취소 있음 · 잠정 원가 다시 확인'));
});
test('existing unclassified connections may be preserved or removed but never created or edited',async()=>{
 const {validateMaterialLinkUpdate,calcProduct}=await model;
 const materials=[known('known'),{...known('legacy'),kind:'unknown'},{...known('other'),kind:'상품'}];
 const old=[link('legacy'),link('other')];
 assert.equal(validateMaterialLinkUpdate([old[1]],old,materials).valid,true);
 assert.equal(validateMaterialLinkUpdate([...old,link('known')],old,materials).valid,true);
 assert.equal(validateMaterialLinkUpdate([old[0]],[],materials).valid,false);
 assert.equal(validateMaterialLinkUpdate([{...old[0],quantity:two}],old,materials).valid,false);
 assert.equal(validateMaterialLinkUpdate([old[1],old[1]],old,materials).valid,false);
 const p={...base(),links:[...old,link('known'),link('missing')]};const c=calcProduct(p,materials);
 assert.equal(c.cost,two);assert.equal(c.partialCost,true);assert.ok(c.issues.includes('일부 부자재 제외 · 확인 필요'));
});
