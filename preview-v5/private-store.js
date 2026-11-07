// This adapter is dormant until explicitly started. Authorization is decided
// by the existing database rules, never by a list of accounts in client code.
// The preview does not instantiate this module and writes are off by default.
const ROOT = 'productCatalogPrivate/data';
const BUCKETS = new Set(['products', 'materials', 'sets']);
const ID = /^[A-Za-z0-9가-힣_-]{1,100}$/;
const fetchOptions = {cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'};

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Existing catalog fields are deliberately preserved. This prevents a v5
// editor from erasing fields owned by v4 or another device.
function parseSnapshot(value) {
  if (value === null) return {products: [], materials: [], sets: []};
  if (!record(value)) throw Error('상품 자료 형식을 확인해 주세요.');
  const out = {};
  for (const bucket of BUCKETS) {
    const source = value[bucket];
    if (source == null) { out[bucket] = []; continue; }
    if (!record(source) && !Array.isArray(source)) throw Error('상품 자료 형식을 확인해 주세요.');
    const values = Array.isArray(source) ? source : Object.values(source);
    if (values.length > 2000 || values.some(item => !record(item) || typeof item.id !== 'string' || !ID.test(item.id))) {
      throw Error('상품 자료 형식을 확인해 주세요.');
    }
    out[bucket] = values;
  }
  return out;
}

export function createPrivateStore({auth, fetchImpl, onData, onStatus = () => {}, allowWrites = false}) {
  if (!auth || typeof auth.current !== 'function' || typeof auth.onAuth !== 'function' ||
      typeof auth.dbUrl !== 'function' || typeof fetchImpl !== 'function' || typeof onData !== 'function') {
    throw Error('상품 자료 연결을 준비하지 못했어요.');
  }
  let generation = 0, stopped = false, pending = null, activeUid = '';
  const editors = new Set();
  let unsubscribe = null;

  const currentUid = () => auth.current()?.uid || '';
  const clear = () => { activeUid = ''; onData(null); };
  const denied = () => {
    ++generation; pending?.abort(); pending = null;
    // A rejected catalogue read invalidates every editor created under the
    // former permission, even if the account itself has not changed.
    for (const close of [...editors]) close();
    clear(); onStatus('denied');
  };
  const same = (uid, request) => !stopped && generation === request && currentUid() === uid;
  const load = async user => {
    const request = ++generation;
    pending?.abort();
    pending = null;
    const uid = user?.uid || '';
    if (!uid || uid !== activeUid) clear();
    if (!uid || stopped || currentUid() !== uid) return;
    const controller = new AbortController();
    pending = controller;
    onStatus('loading');
    try {
      const url = await auth.dbUrl(ROOT);
      if (!same(uid, request)) return;
      const response = await fetchImpl(url, {...fetchOptions, method: 'GET', signal: controller.signal});
      if (!same(uid, request)) return;
      if (response.status === 401 || response.status === 403) { denied(); return; }
      if (!response.ok) throw Error('read failed');
      const value = await response.json();
      if (!same(uid, request)) return;
      const parsed = parseSnapshot(value);
      if (!same(uid, request)) return;
      activeUid = uid;
      onData(parsed);
      onStatus('ready');
    } catch (_) {
      if (same(uid, request)) { clear(); onStatus('unavailable'); }
    }
  };

  return {
    start() {
      if (unsubscribe || stopped) throw Error('상품 자료 연결 상태를 확인해 주세요.');
      unsubscribe = auth.onAuth(load);
      if (typeof unsubscribe !== 'function') throw Error('로그인 상태를 확인하지 못했어요.');
    },
    refresh() { return load(auth.current()); },
    stop() {
      if (stopped) return;
      stopped = true; ++generation; pending?.abort(); unsubscribe?.();
      for (const close of [...editors]) close();
      clear(); onStatus('stopped');
    },
    // This API is intentionally unreachable in the local preview. The caller
    // must opt in after operational approval and verify database permissions.
    async openEditor(bucket, id) {
      if (!allowWrites) throw Error('미리보기에서는 저장할 수 없어요.');
      if (stopped || !BUCKETS.has(bucket) || typeof id !== 'string' || !ID.test(id)) {
        throw Error('상품 정보를 확인해 주세요.');
      }
      const uid = currentUid();
      if (!uid) throw Error('다시 로그인한 뒤 확인해 주세요.');
      const controller = new AbortController();
      let alive = true, saving = false;
      const unwatch = auth.onAuth(user => { if (user?.uid !== uid) { alive = false; controller.abort(); } });
      const valid = () => {
        if (!alive || stopped || currentUid() !== uid) throw Error('로그인이 바뀌어 저장을 멈췄어요.');
      };
      const close = () => { if (alive) { alive = false; controller.abort(); } unwatch?.(); editors.delete(close); };
      editors.add(close);
      const path = `${ROOT}/${bucket}/${encodeURIComponent(id)}`;
      try {
        const url = await auth.dbUrl(path); valid();
        const response = await fetchImpl(url, {...fetchOptions, method: 'GET', headers: {'X-Firebase-ETag': 'true'}, signal: controller.signal});
        valid();
        if (response.status === 401 || response.status === 403) { denied(); throw Error('이 계정은 상품 자료를 볼 수 없어요.'); }
        if (!response.ok) throw Error('상품 정보를 읽지 못했어요.');
        const etag = response.headers.get('ETag'), previous = await response.json(); valid();
        if (!etag || (previous !== null && !record(previous))) throw Error('상품 정보를 확인하지 못했어요.');
        return {
          previous: clone(previous || {}),
          cancel: close,
          async save(fields) {
            valid();
            if (saving) throw Error('이미 저장하고 있어요.');
            if (!record(fields)) throw Error('입력한 내용을 확인해 주세요.');
            saving = true;
            try {
              const freshUrl = await auth.dbUrl(path); valid();
              const next = {...(previous || {}), ...clone(fields), id};
              const result = await fetchImpl(freshUrl, {...fetchOptions, method: 'PUT', headers: {'Content-Type': 'application/json', 'If-Match': etag}, body: JSON.stringify(next), signal: controller.signal});
              valid();
              if (result.status === 412) { close(); throw Error('다른 곳에서 바뀌었어요. 다시 불러와 주세요.'); }
              if (result.status === 401 || result.status === 403) { close(); denied(); throw Error('이 계정은 저장할 수 없어요.'); }
              if (!result.ok) { close(); throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.'); }
              close();
            } catch (error) {
              // Network failure may follow a successful write: close the editor
              // instead of silently retrying an ambiguous mutation.
              if (alive) close();
              if (error?.name === 'AbortError') throw Error('저장 결과를 확인하지 못했어요. 다시 불러와 주세요.');
              throw error;
            } finally { saving = false; }
          }
        };
      } catch (error) {
        close();
        if (error?.name === 'AbortError') throw Error('로그인이 바뀌어 작업을 멈췄어요.');
        throw error;
      }
    }
  };
}
