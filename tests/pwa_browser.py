"""Isolated PWA checks. Requires existing Python Playwright and Chromium/Chrome.

Run: python -B tests/pwa_browser.py --evidence ../evidence
No real Firebase access, login, ledger writes, install or deployment is performed.
The update test rebuilds a disposable copy, never the working tree.
"""
import argparse
import hashlib
import gzip
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = '/mumutori-dashboard/'
PAGES = ['index', 'finance', 'bank', 'products', 'purchases', 'sourcing', 'sales',
         'stock', 'partners', 'audit', 'settings', 'branding', 'characters', 'agents', 'quick']
KEY = 'mumutori-private-finance-v3'
FIXTURE = {
    'products': [{'id': 'TEST-01', 'name': '시연 상품', 'salesStatus': '판매 중', 'price': 5000,
                  'safetyStock': 1, 'active': True}],
    'bankTransactions': [{'id': 'test-bank', 'date': '2026-10-01', 'direction': '입금',
                          'amount': 5000, 'description': '시연 거래', 'accountLabel': 'test', 'category': '매출 수금'}],
    'finance': {'channelTransactions': [{'id': 'test-sale', 'date': '2026-10-01', 'orderId': 'TEST-SALE',
                 'channel': '직접 판매', 'productName': '시연 상품', 'sku': 'TEST-01', 'quantity': 1,
                 'salesGross': 5000, 'feeNet': 0, 'feeVAT': 0, 'settlementBase': 5000, 'linkedBankIds': []}]},
    'erp': {'accounts': [{'id': 'test', 'name': '시연 통장'}], 'warehouses': ['기본 창고'],
            'partners': [{'id': 'test-partner', 'name': '시연 거래처', 'kind': '기타'}],
            'movements': [{'id': 'test-count', 'type': '실사', 'qty': 3, 'sku': 'TEST-01',
                           'warehouse': '기본 창고', 'date': '2026-10-01', 'createdAt': 'test-count'}],
            'audit': [{'id': 'test-audit', 'at': '2026-10-01T00:00:00Z', 'action': '시연',
                       'type': 'product', 'recordId': 'TEST-01', 'fields': ['name']}]}}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if getattr(self.server, 'offline', False):
            self.close_connection = True
            self.connection.close()
            return
        path = unquote(urlsplit(self.path).path)
        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        if not path.startswith(PREFIX):
            self.send_error(404)
            return
        name = path[len(PREFIX):] or 'index.html'
        if name == 'data/seed.json.gz':
            body, kind = gzip.compress(json.dumps(FIXTURE).encode(), mtime=0), 'application/gzip'
        elif name in {'api/test.json', 'login.html', 'unknown.css'}:
            body, kind = b'{"synthetic":true}', 'application/json'
        else:
            target = (self.server.root / name).resolve()
            if not target.is_relative_to(self.server.root.resolve()) or not target.is_file():
                self.send_error(404)
                return
            body = target.read_bytes()
            kind = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
                    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
                    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp'}.get(target.suffix, self.guess_type(str(target)))
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        if name in self.server.private_paths:
            self.send_header('Cache-Control', 'private, no-store')
        else:
            # Exercise SW revalidation against the server, not the browser HTTP cache.
            self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"synthetic":true}')


class Server:
    def __init__(self, root):
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.http.root, self.http.private_paths = root, set()
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.origin = f'http://127.0.0.1:{self.http.server_port}'
        self.base = self.origin + PREFIX

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)


INIT = """(() => {
  window.__MMT_TEST_AUTH__ = {email:''};
  window.__MMT_TEST_FIN__ = {entries:{}, sales:{}, meta:{}};
  class FakeEventSource extends EventTarget {
    constructor() { super(); this.readyState=1; setTimeout(() => this.dispatchEvent(new MessageEvent('put', {data:JSON.stringify({path:'/',data:null})})), 20); }
    close() { this.readyState=2; }
  }
  window.EventSource = FakeEventSource;
  localStorage.setItem('mumutori-private-finance-v3', JSON.stringify(FIXTURE_VALUE));
  window.__PWA_EVENTS__=[];
  navigator.serviceWorker.addEventListener('message', e => window.__PWA_EVENTS__.push({event:'message',type:e.data?.type,version:e.data?.version,sameController:e.source===navigator.serviceWorker.controller}));
  navigator.serviceWorker.addEventListener('controllerchange', () => window.__PWA_EVENTS__.push({event:'controllerchange'}));
  document.addEventListener('securitypolicyviolation', e => { window.__PWA_CSP__ = [...(window.__PWA_CSP__ || []), e.violatedDirective]; });
})();""".replace('FIXTURE_VALUE', json.dumps(FIXTURE, ensure_ascii=False))


def isolate(context, origin, external):
    def route(request_route):
        request = request_route.request
        if request.url.startswith(origin + '/'):
            request_route.continue_()
            return
        # All foreign requests terminate here, including writes. Never pass through.
        external.append({'method': request.method, 'host': urlsplit(request.url).hostname})
        if request.method not in {'GET', 'OPTIONS'}:
            raise AssertionError('Unexpected external write attempt')
        request_route.fulfill(status=200, content_type='application/json', body='null',
                             headers={'Access-Control-Allow-Origin': '*'})
    context.route('**/*', route)
    context.add_init_script(INIT)


def observe(page, errors):
    page.on('pageerror', lambda error: errors.append({'kind': 'runtime', 'text': str(error)}))
    page.on('console', lambda message: errors.append({'kind': 'console', 'text': message.text}) if message.type == 'error' else None)


def wait_js(page, function, arg=None, timeout=15):
    """Poll through CDP evaluation; never eval a string inside the CSP page."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if page.evaluate(function, arg):
                return
        except Exception as error:
            if 'Execution context was destroyed' not in str(error):
                raise
        page.wait_for_timeout(50)
    raise AssertionError('Timed out waiting for browser condition')


MEASURE = """() => {
  const visible = el => {const r=el.getBoundingClientRect(), s=getComputedStyle(el);return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden' && !el.closest('[hidden]');};
  const target = el => ['checkbox','radio'].includes(el.type) ? (el.closest('label') || document.querySelector('label[for="'+CSS.escape(el.id)+'"]') || el) : el;
  const describe = el => ({tag:el.tagName, text:(el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0,70),
    cls:el.className, targetTag:target(el).tagName, width:Math.round(target(el).getBoundingClientRect().width*10)/10, height:Math.round(target(el).getBoundingClientRect().height*10)/10});
  return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
    smallControls:[...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).filter(el=>{const r=target(el).getBoundingClientRect();return r.width<43.5 || r.height<43.5;}).map(describe),
    tables:[...document.querySelectorAll('table')].filter(visible).map(el=>{let p=el.parentElement;while(p&&p!==document.body&&!/auto|scroll/.test(getComputedStyle(p).overflowX))p=p.parentElement;return {width:el.scrollWidth, containerWidth:p?.clientWidth, localScroll:!!p&&p!==document.body&&el.scrollWidth>p.clientWidth};}),
    csp:window.__PWA_CSP__||[]};
}"""


def mobile_checks(browser, server, evidence, report):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    external, errors = [], []
    isolate(context, server.origin, external)
    page = context.new_page()
    observe(page, errors)
    pages = []
    for name in PAGES:
        page.goto(server.base + name + '.html?demo=1', wait_until='load')
        if name == 'quick':
            page.locator('#q-app').wait_for(state='visible')
        else:
            page.locator('h1').first.wait_for()
        page.wait_for_timeout(180)
        metric = page.evaluate(MEASURE)
        metric['page'] = name
        metric['h1'] = page.locator('h1').first.inner_text() if name != 'quick' else page.locator('.q-top b').inner_text()
        metric['head'] = page.evaluate("""() => ({manifest:document.querySelector('link[rel=manifest]')?.getAttribute('href'),pwa:!!document.querySelector('script[src*="pwa.js"]'),build:document.body.dataset.build})""")
        assert metric['head']['manifest'] == 'manifest.webmanifest' and metric['head']['pwa'], name + ' missing PWA head'
        assert not metric['csp'], name + ' CSP violation'
        assert metric['scrollWidth'] <= metric['width'] + 1, name + ' document overflows 390px'
        assert not metric['smallControls'], name + ' touch target below 44px (0.5px rounding tolerance)'
        pages.append(metric)
        page.screenshot(path=str(evidence / (name + '-390.png')), full_page=True, animations='disabled')
        page.screenshot(path=str(evidence / (name + '-390-viewport.png')), full_page=False, animations='disabled')
        print(f"390 {name}: {metric['scrollWidth']}px, small controls={len(metric['smallControls'])}, tables={len(metric['tables'])}", flush=True)
    report['mobile'] = pages
    report['mobile_errors'] = errors
    report['external_requests_intercepted'] = external
    assert not errors, f'Mobile runtime/console errors: {errors}'
    context.close()


def cache_urls(page):
    return page.evaluate("""async () => {const out=[];for(const name of await caches.keys()){if(name.startsWith('mumutori-pwa:')){const c=await caches.open(name);out.push(...(await c.keys()).map(r=>r.url));}}return out;}""")


def sw_checks(context, server, evidence, report):
    external, errors = [], []
    report['sw_errors_including_offline'] = errors
    isolate(context, server.origin, external)
    page = context.new_page()
    observe(page, errors)
    page.goto(server.base + 'products.html')
    page.locator('h1').wait_for()
    wait_js(page, '() => !!navigator.serviceWorker.controller')
    registration = page.evaluate("""async () => {const r=await navigator.serviceWorker.ready;return {scope:r.scope,updateViaCache:r.updateViaCache,script:r.active.scriptURL};}""")
    assert registration['scope'] == server.base
    assert registration['updateViaCache'] == 'none'
    assert page.locator('#pwa-update').is_hidden(), 'First installation falsely reported as update'
    page.reload()
    page.locator('h1').wait_for()
    wait_js(page, """async () => (await caches.keys()).some(n=>n.startsWith('mumutori-pwa:')) && (await (await caches.open((await caches.keys()).find(n=>n.startsWith('mumutori-pwa:')))).keys()).some(r=>r.url.endsWith('/products.html'))""")
    page.wait_for_timeout(350)
    cdp = context.new_cdp_session(page)
    manifest = cdp.send('Page.getAppManifest')
    install = cdp.send('Page.getInstallabilityErrors')
    report['manifest'] = {'url': manifest.get('url'), 'errors': manifest.get('errors'),
                          'data': json.loads(manifest.get('data', '{}')), 'installability': install}
    assert not manifest.get('errors'), manifest.get('errors')
    assert not install.get('installabilityErrors'), install
    assert report['manifest']['data']['scope'] == './'
    report['registration'] = registration
    # Positive static caching plus negative seed/API/finance/login/query/method checks.
    page.evaluate("""async () => {
      await fetch('assets/icon-192.png');
      for (const path of ['data/seed.json.gz','api/test.json','login.html','unknown.css','src/fbauth.js','src/fin-core.js','quick.html','finance.html','bank.html','index.html','src/pwa.js?auth=synthetic','assets/icon-512.png?token=synthetic']) await fetch(path);
      await fetch('src/erp-core.js', {headers:{Authorization:'Bearer synthetic'}});
      await fetch('api/test.json', {method:'POST',body:'synthetic'});
    }""")
    page.wait_for_timeout(300)
    urls = cache_urls(page)
    forbidden = ['seed', 'api/', 'login', 'unknown', 'fbauth', 'fin-core', 'quick.html', 'finance.html', 'bank.html', 'index.html', '?auth=', '?token=']
    assert not [url for url in urls if any(token in url for token in forbidden)], urls
    assert any(url.endswith('/assets/icon-192.png') for url in urls)
    # Cache-Control/private prevents storing an otherwise allowlisted digest.
    server.http.private_paths.add('assets/icon-maskable-512.png')
    page.evaluate("""async () => {for(const name of await caches.keys())if(name.startsWith('mumutori-pwa:'))await (await caches.open(name)).delete(new URL('assets/icon-maskable-512.png',location.href));}""")
    page.evaluate("fetch('assets/icon-maskable-512.png').then(r=>r.arrayBuffer())")
    page.wait_for_timeout(120)
    assert not any(url.endswith('/assets/icon-maskable-512.png') for url in cache_urls(page))
    server.http.private_paths.clear()
    report['cache_urls'] = cache_urls(page)
    report['cache_exclusions'] = forbidden + ['Authorization header', 'POST', 'Cache-Control: private,no-store']
    # Offline cached local-only screen; public seed is deliberately never a fallback ledger.
    context.set_offline(True)
    server.http.offline = True
    # Current Chromium request emulation and navigator.onLine can be independent.
    # Override the target's network state as well to reproduce physical disconnection.
    cdp.send('Network.enable')
    try:
        cdp.send('Network.overrideNetworkState', {'offline':True,'latency':0,'downloadThroughput':0,'uploadThroughput':0})
    except Exception as err:
        if "wasn't found" not in str(err): raise
        cdp.send('Network.emulateNetworkConditions', {'offline':True,'latency':0,'downloadThroughput':0,'uploadThroughput':0})
    page.reload(wait_until='load')
    page.locator('body[data-page=products] h1').wait_for()
    report['offline_probe'] = page.evaluate("""() => ({online:navigator.onLine,connection:document.querySelector('.pwa-connection')?.outerHTML,pwaScripts:[...document.scripts].filter(s=>s.src.includes('/pwa.js')).map(s=>s.src),h1:document.querySelector('h1')?.textContent})""")
    page.screenshot(path=str(evidence / 'offline-probe-390.png'), full_page=True)
    page.locator('.pwa-connection').wait_for(state='visible', timeout=5000)
    assert page.get_by_text('시연 상품', exact=True).first.is_visible()
    page.screenshot(path=str(evidence / 'offline-cached-products-390.png'), full_page=True)
    report['offline_cached'] = 'products.html rendered synthetic browser ledger; offline notice visible'
    for name in ['finance.html', 'quick.html', 'index.html', 'settings.html?filter=synthetic']:
        page.goto(server.base + name, wait_until='load')
        page.get_by_role('heading', name='연결 안 됨').wait_for()
        assert page.locator('#pwa-retry').is_visible()
    page.screenshot(path=str(evidence / 'offline-neutral-390.png'), full_page=True)
    report['offline_neutral'] = ['finance.html', 'quick.html', 'index.html', 'query navigation without cached shell']
    server.http.offline = False
    context.set_offline(False)
    try:
        cdp.send('Network.overrideNetworkState', {'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
    except Exception as err:
        if "wasn't found" not in str(err): raise
        cdp.send('Network.emulateNetworkConditions', {'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
    bypass = []
    for name in ['login.html', 'api/test.json', 'products.html?auth=synthetic']:
        response = page.goto(server.base + name, wait_until='load')
        bypass.append({'path':name,'from_service_worker':response.from_service_worker})
        assert not response.from_service_worker, 'Sensitive/unknown navigation intercepted: ' + name
    page.goto(server.base + 'offline.html')
    iframe_responses = []
    page.on('response', lambda response: iframe_responses.append(response.from_service_worker) if response.url.endswith('/login.html') else None)
    page.evaluate("""() => {const iframe=document.createElement('iframe');iframe.src='login.html';document.body.append(iframe);}""")
    page.wait_for_timeout(180)
    assert iframe_responses == [False], iframe_responses
    report['navigation_bypass'] = bypass + [{'path':'iframe/login.html','from_service_worker':False}]
    # Expected offline JS network failures are captured separately from online/CSP checks.
    report['sw_errors_including_offline'] = errors
    context.close()


def update_checks(browser, root, evidence, report):
    with tempfile.TemporaryDirectory(prefix='pwa-update-') as tmp:
        copy = Path(tmp) / 'app'
        shutil.copytree(root, copy, ignore=shutil.ignore_patterns('.git', '__pycache__', '*.pyc'))
        with Server(copy) as server:
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            external, errors = [], []
            pending = {}
            context.on('request', lambda request: pending.__setitem__(id(request),request.url))
            context.on('requestfinished', lambda request: pending.pop(id(request),None))
            context.on('requestfailed', lambda request: pending.pop(id(request),None))
            isolate(context, server.origin, external)
            first, second = context.new_page(), context.new_page()
            for page in [first, second]:
                observe(page, errors)
                page.goto(server.base + 'products.html')
                page.locator('h1').wait_for()
                wait_js(page, '() => !!navigator.serviceWorker.controller')
            before = first.locator('body').get_attribute('data-build')
            first.evaluate("""async () => {await caches.open('pwa-test-unrelated');const i=document.createElement('input');i.id='unsaved-pwa-test';i.value='보존할 시험 초안';document.body.append(i);}""")
            source = copy / 'src/pwa.css'
            source.write_text(source.read_text(encoding='utf-8') + '\n/* isolated update test */\n', encoding='utf-8', newline='\n')
            built = subprocess.run([sys.executable, '-B', 'build.py'], cwd=copy, capture_output=True, text=True, encoding='utf-8', check=True)
            first.evaluate('(async () => (await navigator.serviceWorker.ready).update())()')
            first.wait_for_timeout(300)
            report['update_probe'] = first.evaluate("""async () => {const r=await navigator.serviceWorker.getRegistration();return {build:document.body.dataset.build,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state,updateHidden:document.getElementById('pwa-update').hidden,caches:await caches.keys()};}""")
            report['update_probe']['build_output'] = built.stdout.strip()
            first.wait_for_timeout(500)
            report['update_probe']['messages'] = first.evaluate('window.__PWA_EVENTS__')
            report['update_probe']['pending_requests'] = list(pending.values())
            report['update_probe']['workers'] = []
            for worker in context.service_workers:
                try:
                    report['update_probe']['workers'].append(worker.evaluate("({version:VERSION,active:self.registration.active?.state,waiting:self.registration.waiting?.state})"))
                except Exception as error:
                    report['update_probe']['workers'].append({'error':str(error)})
            print(json.dumps(report['update_probe'],ensure_ascii=False),flush=True)
            for page in [first, second]:
                page.locator('#pwa-update').wait_for(state='visible')
            assert first.locator('#unsaved-pwa-test').input_value() == '보존할 시험 초안'
            assert first.locator('body').get_attribute('data-build') == before
            names = first.evaluate('caches.keys()')
            own = [name for name in names if name.startswith('mumutori-pwa:')]
            assert len(own) == 1 and not own[0].endswith(before), names
            assert 'pwa-test-unrelated' in names
            first.screenshot(path=str(evidence / 'update-banner-390.png'), full_page=True)
            first.locator('#pwa-update').click()
            wait_js(first, '(before) => document.body.dataset.build !== before', arg=before)
            after = first.locator('body').get_attribute('data-build')
            assert first.locator('#pwa-update').is_hidden()
            assert second.locator('#pwa-update').is_visible()
            report['update'] = {'before': before, 'after': after, 'two_tab_banner': True,
                                'unsaved_input_preserved_until_click': True, 'old_own_cache_deleted': True,
                                'unrelated_cache_preserved': True, 'build_output': built.stdout.strip(),
                                'errors': errors}
            assert not errors, errors
            context.close()


def newline_checks(browser, root, report):
    """Windows working-tree CRLF and deployed Git LF must identify one build."""
    text_types = {'.py','.js','.css','.svg','.html','.json','.md','.webmanifest'}
    report['newline_compatibility'] = {}
    for ending in ['LF', 'CRLF']:
        with tempfile.TemporaryDirectory(prefix='pwa-newline-') as tmp:
            copy = Path(tmp) / 'app'
            shutil.copytree(root, copy, ignore=shutil.ignore_patterns('.git','__pycache__','*.pyc'))
            for path in copy.rglob('*'):
                if path.is_file() and path.suffix in text_types:
                    data = path.read_bytes().replace(b'\r\n', b'\n')
                    path.write_bytes(data if ending == 'LF' else data.replace(b'\n', b'\r\n'))
            subprocess.run([sys.executable,'-B','build.py'], cwd=copy, capture_output=True,
                           text=True, encoding='utf-8', check=True)
            assert (copy/'sw.js').read_text(encoding='utf-8') == (root/'sw.js').read_text(encoding='utf-8'), ending+' checkout changes service worker/version'
            for name in PAGES:
                assert (copy/(name+'.html')).read_text(encoding='utf-8') == (root/(name+'.html')).read_text(encoding='utf-8'), ending+' checkout changes generated page: '+name
            for name in ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png']:
                assert (copy/'assets'/name).read_bytes() == (root/'assets'/name).read_bytes(), ending+' checkout changes icon: '+name
            with Server(copy) as server:
                context = browser.new_context()
                external = []
                isolate(context, server.origin, external)
                page = context.new_page()
                page.goto(server.base + 'products.html')
                wait_js(page, '() => !!navigator.serviceWorker.controller')
                registration = page.evaluate("""async () => {const r=await navigator.serviceWorker.ready;return {scope:r.scope,state:r.active.state};}""")
                assert registration['state'] == 'activated' and registration['scope'] == server.base
                context.close()
            report['newline_compatibility'][ending] = {'build_identical':True,'service_worker_activated':True,'service_worker_sha256':hashlib.sha256((copy/'sw.js').read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path, default=ROOT.parent / 'evidence')
    parser.add_argument('--browser-channel', default='chrome')
    parser.add_argument('--browser-executable', default=None)
    parser.add_argument('--phase', choices=['all','mobile','sw','update'], default='all')
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'mode': 'fresh browser profiles; synthetic fixtures; no external pass-through'}
    if args.phase != 'all' and (evidence / 'pwa-report.json').exists():
        report.update(json.loads((evidence / 'pwa-report.json').read_text(encoding='utf-8')))
    report.pop('failure', None)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, channel=None if args.browser_executable or args.browser_channel == "default" else args.browser_channel, executable_path=args.browser_executable,
                args=['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'])
            report['browser'] = browser.version
            with Server(ROOT) as server:
                if args.phase in {'all','mobile'}:
                    mobile_checks(browser, server, evidence, report)
                # Incognito intentionally disables installation. Use a disposable profile
                # for the browser's actual installability check; never install the app.
                with tempfile.TemporaryDirectory(prefix='pwa-profile-') as profile:
                    persistent = playwright.chromium.launch_persistent_context(profile, headless=True,
                        channel=None if args.browser_executable or args.browser_channel == "default" else args.browser_channel, executable_path=args.browser_executable, viewport={'width':390,'height':844},
                        args=['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'])
                    try:
                        if args.phase in {'all','sw'}:
                            sw_checks(persistent, server, evidence, report)
                    finally:
                        persistent.close()
            if args.phase in {'all','update'}:
                update_checks(browser, ROOT, evidence, report)
                newline_checks(browser, ROOT, report)
            browser.close()
        report['status'] = 'passed'
    except Exception as error:
        report['status'], report['failure'] = 'failed', str(error)
        raise
    finally:
        (evidence / 'pwa-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'failure': report.get('failure')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
