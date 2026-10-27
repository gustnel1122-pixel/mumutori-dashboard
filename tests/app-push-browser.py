"""Isolated owner/blocked settings, registration, remote-test and disable workflow.
All auth, FCM registration and RTDB are synthetic; never contacts production APIs.
"""
import importlib.util, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pwa_support',ROOT/'tests/pwa_browser.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
evidence=ROOT.parent/'push-settings-evidence';evidence.mkdir(exist_ok=True)
with sync_playwright() as pw, mod.Server(ROOT) as server:
    browser=pw.chromium.launch(headless=True,executable_path=__import__('os').environ.get('ERP_CHROME'))
    for width in [390,1280]:
        context=browser.new_context(viewport={'width':width,'height':844},permissions=['notifications'])
        context.add_init_script("window.__MMT_TEST_AUTH__={email:'owner@example.invalid',uid:'owner1',token:'synthetic-id-token'};window.permissionAsks=0;Object.defineProperty(Notification,'permission',{get:()=>localStorage.getItem('synthetic-permission')||'default'});Notification.requestPermission=async()=>{window.permissionAsks++;localStorage.setItem('synthetic-permission','granted');return 'granted';};")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        records={};writes=[]
        def network(route):
            req=route.request
            if req.url.startswith(server.origin):return route.continue_()
            if '.firebasedatabase.app/appPush/' not in req.url:return route.abort()
            path=req.url.split('/appPush/')[1].split('.json')[0]
            if req.method=='GET':value={'enabled':True,'schema':'push-v1'} if path=='config' else records.get(path)
            elif req.method=='PUT':
                value=json.loads(req.post_data);records[path]=value;writes.append(path)
            elif req.method=='DELETE':records.pop(path,None);value=None
            else:raise AssertionError('unexpected method')
            route.fulfill(status=200,content_type='application/json',body=json.dumps(value),headers={'Access-Control-Allow-Origin':'*'})
        context.route('**/*',network)
        page.route('**/assets/vendor/firebase/firebase-messaging-compat.js',lambda r:r.fulfill(content_type='application/javascript',body="firebase.messaging=Object.assign(()=>({getToken:async o=>{if(!o.serviceWorkerRegistration||!o.vapidKey)throw Error('options missing');return 'synthetic-fcm-token-for-ui-test';},onMessage:fn=>()=>{},deleteToken:async()=>true}),{isSupported:async()=>true});"))
        page.goto(server.base+'settings.html')
        page.wait_for_function("() => navigator.serviceWorker.controller !== null")
        page.get_by_role('button',name='알림 받기',exact=True).wait_for()
        assert page.evaluate('window.permissionAsks')==0
        assert not writes
        page.get_by_role('button',name='알림 받기',exact=True).click()
        page.get_by_text('이 기기로 알림을 받아요.',exact=False).wait_for()
        assert len([p for p in writes if p.startswith('devices/')])==1
        page.get_by_role('button',name='시험 알림 보내기',exact=True).click()
        page.get_by_text('시험 알림을 요청했어요.',exact=False).wait_for()
        assert len([p for p in writes if p.startswith('requests/')])==1
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not page.evaluate("[...document.querySelectorAll('[data-push-action]')].some(e=>e.getBoundingClientRect().height<43.5)")
        page.locator('body').click(position={'x':2,'y':2})
        page.screenshot(path=str(evidence/f'settings-{width}.png'),full_page=True)
        page.reload();page.get_by_text('이 기기로 알림을 받아요.',exact=False).wait_for()
        page.get_by_role('button',name='이 기기 알림 끄기',exact=True).click()
        page.get_by_text('이 기기의 알림을 껐어요.',exact=True).wait_for()
        assert not [p for p in records if p.startswith('devices/')]
        assert page.evaluate('window.permissionAsks')==0 # Already granted; no permission prompt on reload.
        assert not errors,errors
        # Missing/unpublished owner rules must block registration before prompting.
        context.unroute('**/*',network)
        def blocked(route):
            if route.request.url.startswith(server.origin):return route.continue_()
            route.fulfill(status=401,content_type='application/json',body='{"error":"Permission denied"}',headers={'Access-Control-Allow-Origin':'*'})
        context.route('**/*',blocked)
        page.reload();page.get_by_text('알림 서버 연결이 아직 준비되지 않았거나',exact=False).wait_for()
        assert not page.get_by_role('button',name='알림 받기',exact=True).is_enabled()
        assert page.evaluate('window.permissionAsks')==0
        context.close()
    browser.close()
print('PASS synthetic settings flow at 390/1280px, no prompt on load, persisted registration/test/disable, blocked backend, no live API access.')
