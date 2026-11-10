'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const modelPromise = import('../preview-v5/model.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const materials = [
  {id: 'tag', kind: '상품에 붙음', unitCost: 30, currency: 'KRW', stock: 50},
  {id: 'pack', kind: '포장', unitCost: 80, currency: 'KRW', stock: 30},
  {id: 'box', kind: '박스', unitCost: 100, currency: 'KRW', stock: 10},
];
const product = {
  unitCostCurrency: 'KRW',
  id: 'p', kind: 'single', salePrice: 1000, stock: 6,
  receipts: [{quantity: 4, saleQuantity: 4, eventQuantity: 0, unitCost: 200, currency: 'KRW'}, {quantity: 6, saleQuantity: 6, eventQuantity: 0, unitCost: 400, currency: 'KRW'}],
  links: [{materialId: 'tag', quantity: 2, always: true}],
};

test('상품 입고 가중원가, 수수료, 소진율 및 번 돈', async () => {
  const {calcProduct, FEES} = await modelPromise;
  const x = calcProduct(product, materials, {channel: 'smart'});
  assert.equal(x.received, 10); assert.equal(x.unitCost, 320);
  assert.equal(x.materialCost, 60); assert.equal(x.cost, 380);
  assert.equal(x.sold, 4); assert.equal(x.sellRate, 40);
  near(x.profitPerUnit, 1000 * (1 - FEES.smart) - 380);
  near(x.earned, 4 * (1000 * (1 - FEES.smart) - 380));
  near(x.roas.smart, 1000 / (1000 * (1 - 0.0662) - 380) * 100);
  near(x.roas.own, 1000 / (1000 * (1 - 0.0363) - 380) * 100);
});

test('부자재 원가 제외 선택과 자사몰 수수료', async () => {
  const {calcProduct} = await modelPromise;
  const x = calcProduct(product, materials, {channel: 'own', includeMaterials: false});
  assert.equal(x.cost, 320); assert.equal(x.materialCost, 60);
  near(x.profitPerUnit, 1000 * (1 - 0.0363) - 320);
});

test('미입력 단가가 있어도 입고 수량과 소진율은 독립 계산', async () => {
  const {calcProduct} = await modelPromise;
  const x = calcProduct({...product, receipts: [{quantity: 10, saleQuantity: 10, eventQuantity: 0, unitCost: '', currency: 'KRW'}]}, materials);
  assert.equal(x.unitCost, null); assert.equal(x.cost, null);
  assert.equal(x.received, 10); assert.equal(x.sellRate, 40);
  assert.equal(x.earned, null); assert.equal(x.roas.smart, null);
});

test('재고가 입고 수량보다 크거나 없는 경우 판매량과 번 돈은 미확인', async () => {
  const {calcProduct} = await modelPromise;
  for (const stock of [11, null, -1, 1.5]) {
    const x = calcProduct({...product, stock}, materials);
    assert.equal(x.sold, null); assert.equal(x.sellRate, null); assert.equal(x.earned, null);
  }
});

test('최소 ROAS는 금액·수수료 입력과 양의 분모가 필요', async () => {
  const {minimumRoas} = await modelPromise;
  for (const args of [[0, 0, 0], [100, 100, 0], [100, 110, 0], ['', 10, 0], [100, null, 0], [100, 10, 1]]) {
    assert.equal(minimumRoas(...args), null);
  }
  near(minimumRoas(100, 0, 0), 100);
});

test('등록된 부자재만 연결하고 박스·중복·잘못된 개수는 거부', async () => {
  const {validateMaterialLinks, calcProduct} = await modelPromise;
  const cases = [[{materialId: 'missing', quantity: 1}], [{materialId: 'box', quantity: 1}], [{materialId: 'tag', quantity: 0}], [{materialId: 'tag', quantity: 1.5}], [{materialId: 'tag', quantity: 1}, {materialId: 'tag', quantity: 1}]];
  for (const links of cases) {
    assert.equal(validateMaterialLinks(links, materials).valid, false);
    const calculated=calcProduct({...product, links: links.map(x => ({...x, always: true}))}, materials);
    if (['missing','box'].includes(links[0].materialId)) assert.equal(calculated.partialCost,true);
    else assert.equal(calculated.cost,null);
  }
  assert.equal(validateMaterialLinks([{materialId: 'tag', quantity: 1}], materials).valid, true);
  assert.equal(validateMaterialLinks([{materialId: 'parcel', quantity: 1}], [{id: 'parcel', kind: '포장', name: '택배박스'}]).valid, false);
});

test('세트 재고는 구성별 요구 수량과 중복 상품 수량을 합산하여 계산', async () => {
  const {calcSet} = await modelPromise;
  const second = {...product, id: 'p2', stock: 9, unitCost: 500, currency: 'KRW', links: []};
  const set = {salePrice: 3000, components: [{id: 'p', quantity: 1}, {id: 'p', quantity: 1}, {id: 'p2', quantity: 3}], materials: [{materialId: 'pack', quantity: 1}]};
  const x = calcSet(set, [product, second], materials);
  assert.equal(x.stock, 3); assert.equal(x.cost, 380 * 2 + 500 * 3 + 80);
  assert.ok(x.roas.smart > 0);
});

test('세트 구성에는 상품 택만 포함하고 개별 포장은 빼고 세트 포장을 한 번만 더함', async () => {
  const {calcProduct, calcSet} = await modelPromise;
  const item = {...product, links: [
    {materialId: 'tag', quantity: 2, always: true},
    {materialId: 'pack', quantity: 1, always: true},
  ]};
  const set = {salePrice: 2000, components: [{id: 'p', quantity: 2}], materials: [{materialId: 'pack', quantity: 1}]};
  assert.equal(calcProduct(item, materials).cost, 320 + 60 + 80);
  assert.equal(calcSet(set, [item], materials).cost, (320 + 60) * 2 + 80);
  assert.equal(calcSet(set, [item], materials, {includeMaterials: false}).cost, 320 * 2);
  assert.equal(calcSet({...set, materials: [{materialId: 'tag', quantity: 1}]}, [item], materials).cost, null);
});

test('원가 누락은 세트 재고를 가리지 않고 재고 누락은 원가를 가리지 않음', async () => {
  const {calcSet} = await modelPromise;
  const noCost = {...product, receipts: [{quantity: 10, saleQuantity: 10, eventQuantity: 0, unitCost: '', currency: 'KRW'}]};
  const set = {salePrice: 1000, components: [{id: 'p', quantity: 2}], materials: []};
  const a = calcSet(set, [noCost], materials);
  assert.equal(a.stock, 3); assert.equal(a.cost, null);
  const b = calcSet(set, [{...product, stock: null}], materials);
  assert.equal(b.stock, null); assert.equal(b.cost, 760);
});

test('등록되지 않은 구성 상품이나 잘못된 수량은 안전하게 미확인', async () => {
  const {calcSet} = await modelPromise;
  for (const components of [[], [{id: 'missing', quantity: 1}], [{id: 'p', quantity: 0}], [{id: 'p', quantity: 0.5}]]) {
    const x = calcSet({salePrice: 1000, components}, [product], materials);
    assert.equal(x.cost, null); assert.equal(x.stock, null);
    assert.ok(x.issues.length);
  }
});

test('이벤트/불량 입고는 판매 소진과 번 돈에서 빼고 원가를 따로 계산', async () => {
  const {calcProduct} = await modelPromise;
  const input = {...product, stock: 6, receipts: [
    {quantity: 5, saleQuantity: 0, eventQuantity: 5, unitCost: 200, currency: 'KRW'},
    {quantity: 10, saleQuantity: 10, eventQuantity: 0, unitCost: 400, currency: 'KRW'},
  ]};
  const x = calcProduct(input, materials, {channel: 'smart'});
  assert.equal(x.received, 15); assert.equal(x.saleReceived, 10); assert.equal(x.eventReceived, 5);
  assert.equal(x.eventCost, 1000); assert.equal(x.unitCost, 400);
  assert.equal(x.sold, 4); assert.equal(x.sellRate, 40);
  near(x.earned, 4 * (1000 * (1 - 0.0662) - 460));
});

test('미분류 기존 입고 및 불일치는 판매량을 추정하지 않음', async () => {
  const {calcProduct, receiptAllocation} = await modelPromise;
  assert.equal(receiptAllocation({quantity: 10, saleQuantity: 7, eventQuantity: 4}), null);
  assert.equal(receiptAllocation({quantity: 10, saleQuantity: 9, eventQuantity: -1}), null);
  assert.equal(receiptAllocation({quantity: 10, saleQuantity: 9.5, eventQuantity: 0.5}), null);
  for (const receipt of [{quantity: 10, unitCost: 200, currency: 'KRW'}, {quantity: 10, saleQuantity: 7, eventQuantity: 4, unitCost: 200, currency: 'KRW'}]) {
    const x = calcProduct({...product, receipts: [receipt]}, materials);
    assert.equal(x.received, 10); assert.equal(x.saleReceived, null); assert.equal(x.eventCost, null);
    assert.equal(x.sold, null); assert.equal(x.sellRate, null); assert.equal(x.earned, null);
  }
});

test('단가 미확인은 이벤트 원가와 가중 판매 원가를 0으로 처리하지 않음', async () => {
  const {calcProduct} = await modelPromise;
  const x = calcProduct({...product, receipts: [{quantity:10,saleQuantity:8,eventQuantity:2,unitCost:null, currency: 'KRW'}]}, materials);
  assert.equal(x.saleReceived,8); assert.equal(x.eventReceived,2);
  assert.equal(x.eventCost,null); assert.equal(x.unitCost,null); assert.equal(x.earned,null);
});

test('위안·혼합 통화 입고는 환산 없이 원화 원가와 ROAS·번 돈으로 쓰지 않음', async () => {
  const {calcProduct, receiptCurrency} = await modelPromise;
  const cny={quantity:10,saleQuantity:8,eventQuantity:2,unitCost:12.5,currency:'CNY'};
  const krw={quantity:5,saleQuantity:5,eventQuantity:0,unitCost:500,currency:'KRW'};
  for(const receipts of [[cny],[cny,krw],[{...cny,currency:undefined,unitCostCurrency:'CNY'}]]){
    const x=calcProduct({...product,unitCost:null, currency: 'KRW',stock:3,receipts},materials);
    assert.equal(x.unitCost,null); assert.equal(x.cost,null); assert.equal(x.roas.smart,null); assert.equal(x.earned,null);
    assert.equal(x.eventCost,null);
  }
  assert.equal(receiptCurrency({unitCostCurrency:'CNY'}),'CNY');
  assert.equal(receiptCurrency({}),null);
  assert.equal(receiptCurrency({currency:'USD'}),null);
});

test('기존 원가가 있어도 위안 판매용 입고는 환산 근거 없이 원화로 계산하지 않음', async () => {
  const {calcProduct, receiptCurrency} = await modelPromise;
  const cnySale={quantity:10,saleQuantity:8,eventQuantity:2,unitCost:12.5,currency:'CNY'};
  const cnyEvent={quantity:4,saleQuantity:0,eventQuantity:4,unitCost:12.5,currency:'CNY'};
  const krwSale={quantity:10,saleQuantity:10,eventQuantity:0,unitCost:400,currency:'KRW'};
  for (const receipt of [cnySale,{...cnySale,currency:'',unitCostCurrency:'CNY'}, {...cnySale,currency:'USD'}]) {
    const x=calcProduct({...product,unitCost:500, currency: 'KRW',stock:3,receipts:[receipt]},materials);
    assert.equal(x.unitCost,null); assert.equal(x.cost,null); assert.equal(x.roas.smart,null); assert.equal(x.earned,null);
  }
  const eventOnly=calcProduct({...product,unitCost:500, currency: 'KRW',stock:6,receipts:[cnyEvent,krwSale]},materials);
  assert.equal(eventOnly.unitCost,500); assert.equal(eventOnly.cost,560); assert.notEqual(eventOnly.earned,null);
  assert.equal(receiptCurrency({currency:'',unitCostCurrency:'CNY'}),'CNY');
  assert.equal(receiptCurrency({currency:'',unitCostCurrency:'USD'}),null);
  assert.equal(receiptCurrency({currency:'KRW',unitCostCurrency:'CNY'}),null);
});

test('위안 부자재와 세트 포장을 환산 없이 원화 원가에 더하지 않음', async () => {
  const {calcProduct, calcSet} = await modelPromise;
  for(const currency of ['CNY','USD']){
    const tag={id:'foreign-tag',kind:'item',unitCost:6,currency};
    const pack={id:'foreign-pack',kind:'pack',unitCost:8,currency};
    const item={...product,links:[{materialId:'foreign-tag',quantity:1,always:true}]};
    const set={salePrice:3000,components:[{id:'p',quantity:1}],materials:[{materialId:'foreign-pack',quantity:1}]};
    const itemCalc=calcProduct(item,[tag,pack]);
    assert.equal(itemCalc.cost,calcProduct(item,[tag,pack],{includeMaterials:false}).cost); assert.equal(itemCalc.partialCost,true); assert.equal(itemCalc.roas.smart,null); assert.equal(itemCalc.earned,null);
    assert.equal(calcProduct(item,[tag,pack],{includeMaterials:false}).cost,320);
    const packSet=calcSet(set,[{...item,links:[]}],[tag,pack]);
    assert.equal(packSet.cost,calcProduct({...item,links:[]},[tag,pack]).cost); assert.equal(packSet.partialCost,true); assert.equal(packSet.roas.smart,null);
  }
  const oldTag={id:'legacy',kind:'item',unitCost:6, currency: 'KRW'};
  assert.equal(calcProduct({...product,links:[{materialId:'legacy',quantity:1,always:true}]},[oldTag]).cost,326);
});
