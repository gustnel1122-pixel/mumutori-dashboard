'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const storeModule = import('../preview-v5/private-store.js');

function auth(initial = 'owner') {
  let user = initial ? {uid: initial} : null;
  const listeners = new Set();
  return {
    current: () => user,
    dbUrl: async path => 'https://mock.invalid/' + path,
    onAuth(cb) { listeners.add(cb); cb(user); return () => listeners.delete(cb); },
    set(uid) { user = uid ? {uid} : null; for (const cb of [...listeners]) cb(user); }
  };
}
function response(value, status = 200, etag = '"v1"') {
  return {ok: status >= 200 && status < 300, status,
    headers: {get: name => name.toLowerCase() === 'etag' ? etag : null},
    json: async () => value};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('미리보기는 자동으로 서버에 접속하지 않으며 쓰기를 허용하지 않음', async () => {
  const {createPrivateStore} = await storeModule;
  let calls = 0;
  const state = createPrivateStore({auth: auth(), fetchImpl: async () => { calls++; }, onData() {}});
  assert.equal(calls, 0);
  await assert.rejects(state.openEditor('products', 'example'), /미리보기/);
  assert.equal(calls, 0);
});

test('계정 교체 시 즉시 비우고 이전 계정의 늦은 응답을 표시하지 않음', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth('a'), states = [], requests = [];
  const store = createPrivateStore({auth: a, onData: v => states.push(v), fetchImpl: (_url, opts) => new Promise(resolve => requests.push({resolve, opts}))});
  store.start(); await tick();
  assert.equal(requests.length, 1);
  a.set('b'); assert.equal(states.at(-1), null); await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].opts.signal.aborted, true);
  requests[0].resolve(response({products: {a: {id: 'a'}}})); await tick();
  assert.ok(!states.some(x => x?.products?.some(p => p.id === 'a')));
  requests[1].resolve(response({products: {b: {id: 'b'}}})); await tick();
  assert.equal(states.at(-1).products[0].id, 'b');
  a.set(null); assert.equal(states.at(-1), null);
  store.stop();
});

test('권한 거부와 잘못된 응답은 기존 자료를 지움', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(), states = [], statuses = [];
  let value = response({products: [{id: 'one'}]});
  const store = createPrivateStore({auth:a, fetchImpl:async () => value, onData:v => states.push(v), onStatus:v => statuses.push(v)});
  store.start(); await tick(); assert.equal(states.at(-1).products[0].id, 'one');
  value = response(null, 403); await store.refresh();
  assert.equal(states.at(-1), null); assert.equal(statuses.at(-1), 'denied');
  value = response({products: [{id: 17}]}); await store.refresh();
  assert.equal(states.at(-1), null); assert.equal(statuses.at(-1), 'unavailable');
  store.stop();
});

test('빈 자료는 빈 목록이고 신원 없이 불러오지 않음', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(null), states = []; let calls = 0;
  const store = createPrivateStore({auth:a, fetchImpl:async () => { calls++; return response(null); }, onData:v => states.push(v)});
  store.start(); await tick(); assert.equal(calls, 0); assert.equal(states.at(-1), null);
  a.set('owner'); await tick();
  assert.deepEqual(states.at(-1), {products: [], materials: [], sets: []});
  store.stop();
});

test('조건부 저장은 원본 필드를 보존하고 ETag를 사용', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(), calls = [];
  const store = createPrivateStore({auth:a, allowWrites:true, onData() {}, fetchImpl:async (url, opts) => {
    calls.push({url, opts});
    return opts.method === 'GET' ? response({id:'p', oldField:'keep'}, 200, '"etag"') : response(null);
  }});
  const editor = await store.openEditor('products', 'p');
  await editor.save({name:'예시', id:'other'});
  const put = calls[1].opts;
  assert.equal(put.headers['If-Match'], '"etag"');
  assert.deepEqual(JSON.parse(put.body), {id:'p', oldField:'keep', name:'예시'});
  await assert.rejects(editor.save({name:'again'}), /로그인이 바뀌어/);
});

test('동시 변경 412 후 자동 재시도하지 않음', async () => {
  const {createPrivateStore} = await storeModule;
  let writes = 0;
  const store = createPrivateStore({auth:auth(), allowWrites:true, onData(){}, fetchImpl:async (_url, opts) => {
    if (opts.method === 'PUT') { writes++; return response(null, 412); }
    return response({id:'p'});
  }});
  const editor = await store.openEditor('products', 'p');
  await assert.rejects(editor.save({name:'x'}), /다른 곳/);
  await assert.rejects(editor.save({name:'x'}), /로그인이 바뀌어/);
  assert.equal(writes, 1);
});

test('로그아웃 후 저장 차단 및 모호한 네트워크 실패 시 재시도 금지', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(); let writes = 0;
  const store = createPrivateStore({auth:a, allowWrites:true, onData(){}, fetchImpl:async (_url, opts) => {
    if (opts.method === 'PUT') { writes++; throw Error('network'); }
    return response({id:'p'});
  }});
  const one = await store.openEditor('products', 'p');
  a.set(null);
  await assert.rejects(one.save({name:'x'})); assert.equal(writes, 0);
  a.set('owner');
  const two = await store.openEditor('products', 'p');
  await assert.rejects(two.save({name:'x'}));
  await assert.rejects(two.save({name:'x'})); assert.equal(writes, 1);
});

test('편집 권한이 거부되면 이전 화면 자료를 지우고 중지하면 편집 요청도 취소', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(), states = [];
  let denied = false;
  const store = createPrivateStore({auth:a, allowWrites:true, onData:v => states.push(v), fetchImpl:async (url, opts) => {
    if (url.endsWith('/products/p')) return response(null, denied ? 403 : 200);
    return response({products:[{id:'p'}]});
  }});
  store.start(); await tick(); assert.equal(states.at(-1).products[0].id, 'p');
  denied = true;
  await assert.rejects(store.openEditor('products', 'p'), /볼 수 없어요/);
  assert.equal(states.at(-1), null);
  denied = false;
  const editor = await store.openEditor('products', 'p');
  store.stop();
  await assert.rejects(editor.save({name:'x'}));
});

test('같은 계정의 전체 조회 권한이 철회되면 열려 있던 편집기도 취소', async () => {
  const {createPrivateStore} = await storeModule;
  const a = auth(), states = [], statuses = [];
  let readDenied = false, writes = 0;
  const store = createPrivateStore({auth: a, allowWrites: true, onData: v => states.push(v), onStatus: v => statuses.push(v), fetchImpl: async (url, opts) => {
    if (opts.method === 'PUT') { writes++; return response(null); }
    if (url.endsWith('/products/p')) return response({id: 'p', name: '예시'});
    return readDenied ? response(null, 403) : response({products: [{id: 'p', name: '예시'}]});
  }});
  store.start(); await tick();
  const editor = await store.openEditor('products', 'p');
  readDenied = true;
  await store.refresh();
  assert.equal(states.at(-1), null);
  assert.equal(statuses.at(-1), 'denied');
  await assert.rejects(editor.save({name: '바뀐 예시'}), /로그인이 바뀌어/);
  assert.equal(writes, 0);
  store.stop();
});
