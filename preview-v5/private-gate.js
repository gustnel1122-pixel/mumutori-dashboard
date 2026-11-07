// Dormant, dependency-injected authorization gate for the future operational
// entry point. Merely importing this module makes no network request.
// Database rules, rather than an account list in public JS, decide access.
const ROOT = 'productCatalogPrivate/data';
const OPTIONS = {method:'GET', cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error'};

export function createPrivateGate({auth, fetchImpl, mountFrame, removeFrame, showStatus}) {
  if (!auth || typeof auth.current !== 'function' || typeof auth.onAuth !== 'function' ||
      typeof auth.dbUrl !== 'function' || typeof fetchImpl !== 'function' ||
      typeof mountFrame !== 'function' || typeof removeFrame !== 'function' || typeof showStatus !== 'function') {
    throw Error('상품 관리 연결을 준비하지 못했어요.');
  }
  let version = 0, stopped = false, unsubscribe = null, controller = null;
  const currentUid = () => auth.current()?.uid || '';
  const valid = (uid, sequence) => !stopped && sequence === version && currentUid() === uid;
  const clear = () => { controller?.abort(); controller = null; removeFrame(); };
  const transition = async user => {
    const sequence = ++version, uid = user?.uid || '';
    // Even a same-account refresh tears down the old frame until the server
    // reconfirms access; pending input is never mistaken for a saved change.
    clear();
    if (stopped) return;
    if (!uid || uid !== currentUid()) { showStatus('login'); return; }
    const request = new AbortController(); controller = request;
    showStatus('checking');
    try {
      const url = await auth.dbUrl(ROOT);
      if (!valid(uid, sequence)) return;
      const response = await fetchImpl(url, {...OPTIONS, signal:request.signal});
      if (!valid(uid, sequence)) return;
      if (response.status === 401 || response.status === 403) { showStatus('denied'); return; }
      if (!response.ok) { showStatus('unavailable'); return; }
      // This is an access check only; do not keep private response data here.
      await response.body?.cancel();
      if (!valid(uid, sequence)) return;
      mountFrame(); showStatus('ready');
    } catch (_) {
      if (valid(uid, sequence)) { clear(); showStatus('unavailable'); }
    }
  };
  return Object.freeze({
    start() {
      if (stopped || unsubscribe) throw Error('연결 상태를 확인해 주세요.');
      unsubscribe = auth.onAuth(transition);
      if (typeof unsubscribe !== 'function') throw Error('로그인 상태를 확인하지 못했어요.');
    },
    retry() { return transition(auth.current()); },
    deny() { if (!stopped) { ++version; clear(); showStatus('denied'); } },
    stop() { if (!stopped) { stopped = true; ++version; clear(); unsubscribe?.(); showStatus('stopped'); } }
  });
}
