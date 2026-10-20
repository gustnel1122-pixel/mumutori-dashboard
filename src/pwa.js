// UI only: no ledger, login token or browser business data is read or stored here.
(() => {
  'use strict';
  const base = new URL('../', document.currentScript.src);
  const pageVersion = document.body.dataset.build;
  let registration = null, reloadOnControl = false;
  const notices = document.createElement('div');
  notices.className = 'pwa-notices';
  const connection = document.createElement('p');
  connection.className = 'pwa-connection';
  connection.setAttribute('role', 'status');
  const update = document.createElement('button');
  update.type = 'button';
  update.className = 'pwa-update';
  update.id = 'pwa-update';
  update.hidden = true;
  update.textContent = '새 버전이 있어요 · 눌러서 새로고침';
  update.addEventListener('click', () => {
    if (registration?.waiting) {
      reloadOnControl = true;
      registration.waiting.postMessage({type: 'PWA_SKIP_WAITING'});
    } else location.reload();
  });
  notices.append(connection, update);
  document.body.append(notices);
  const showConnection = () => {
    connection.hidden = navigator.onLine;
    connection.textContent = '오프라인이에요 · 공용 장부 확인과 저장은 인터넷 연결 후 해 주세요.';
  };
  showConnection();
  window.addEventListener('online', showConnection);
  window.addEventListener('offline', showConnection);
  document.getElementById('pwa-retry')?.addEventListener('click', () => location.reload());
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const checkVersion = () => navigator.serviceWorker.controller?.postMessage({type: 'PWA_VERSION'});
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.source !== navigator.serviceWorker.controller) return;
    if (event.data?.type === 'PWA_VERSION' && pageVersion) update.hidden = event.data.version === pageVersion;
  });
  // skipWaiting + claim changes the controller. Keep unsaved fields until the user reloads.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControl) location.reload();
    else checkVersion();
  });
  navigator.serviceWorker.register(new URL('sw.js', base), {scope: base.href, updateViaCache: 'none'})
    .then(found => {
      registration = found;
      checkVersion();
      const promote = worker => {
        if (worker?.state === 'installed' && navigator.serviceWorker.controller) {
          update.hidden = false;
          worker.postMessage({type: 'PWA_SKIP_WAITING'});
        }
      };
      promote(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          promote(worker);
          if (worker.state === 'activated') checkVersion();
        });
      });
      const check = () => { if (navigator.onLine) registration.update().catch(() => {}); };
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      window.addEventListener('pageshow', check);
      check();
    }).catch(() => {
      connection.hidden = false;
      connection.textContent = '앱 준비를 마치지 못했어요. 연결을 확인한 뒤 다시 열어 주세요.';
    });
})();
