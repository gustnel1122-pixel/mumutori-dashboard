"""Isolated phone/desktop interaction checks; all network responses come from local files."""
from pathlib import Path
import json
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT.parent/'classification-private'
fixture={'entries':{'sample':{'id':'sample','kind':'out','amount':11000,'date':'2026-10-27','time':'10:00','method':'현대카드','vendor':'시험 구독','category':'','status':'needs-category','evidence':'카드','source':'alert','createdAt':'2026-10-27T01:00:00Z'}},'sales':{},'meta':{}}
with sync_playwright() as p:
 for width in [390,1280]:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--no-zygote','--single-process'])
  ctx=browser.new_context(viewport={'width':width,'height':844},service_workers='block')
  page=ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   u=urlsplit(r.request.url)
   if u.hostname!='ledger.test':r.abort();return
   f=ROOT/u.path.lstrip('/')
   if not f.is_file():r.fulfill(status=404,body='');return
   mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}.get(f.suffix,'application/octet-stream')
   r.fulfill(status=200,content_type=mime,body=f.read_bytes())
  page.route('**/*',route)
  page.add_init_script('window.__MMT_TEST_AUTH__={email:"test@example.invalid"};window.__MMT_TEST_FIN__='+json.dumps(fixture))
  page.goto('https://ledger.test/quick.html');page.locator('#q-needs-list [data-pick]').wait_for()
  assert page.locator('#q-needs-list [data-fixmethod]').count()==0
  assert page.locator('[data-fixcat]').count()==0
  page.locator('#q-needs-list [data-pick]').click()
  assert page.get_by_role('dialog').is_visible()
  assert page.get_by_role('button',name='매입 팔 물건을 사 온 돈',exact=True).is_visible()
  if width==390:
   box=page.get_by_role('dialog').bounding_box();assert abs(box['y']+box['height']-844)<2
  page.screenshot(path=str(EVIDENCE/f'picker-{width}.png'))
  page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0
  page.locator('#q-needs-list summary').click()
  page.locator('#q-needs-list [data-ai-note]').fill('업무용 프로그램 구독료야')
  page.locator('#q-needs-list [data-ai-save]').click()
  page.wait_for_function('window.__MMT_TEST_FIN__.entries.sample.ai?.status==="pending"')
  assert page.locator('#q-needs-list').inner_text().count('AI 분류 대기')==1
  assert page.evaluate('window.__MMT_TEST_FIN__.entries.sample.category')==''
  # Timer redraws do not discard a note being typed.
  page.locator('#q-needs-list summary').click()
  page.locator('#q-needs-list [data-ai-note]').fill('다시 적는 중')
  page.evaluate("window.dispatchEvent(new Event('focus'))")
  assert page.locator('#q-needs-list [data-ai-note]').input_value()=='다시 적는 중'
  page.locator('#q-needs-list [data-pick]').click()
  page.get_by_role('button',name='구독료 업무에 쓰는 멤버십·프로그램 이용료',exact=True).click()
  page.wait_for_function('window.__MMT_TEST_FIN__.entries.sample.category==="구독료"')
  assert page.evaluate('window.__MMT_TEST_FIN__.entries.sample.method')=='현대카드'
  # Seed an AI result in the isolated fixture only, then reload and use real undo UI.
  a=page.evaluate("""async()=>{const C=await import('/src/fin-classify.js');let e=window.__MMT_TEST_FIN__.entries.sample;e=C.requestAi(e,'포장용 소모품','test-request','now');e=C.applyDecision(e,{id:e.id,requestId:'test-request',basisHash:'hash',action:'apply',category:'소모품',vatTreatment:'review',reason:'포장용 소모품입니다. 세액 확인 필요.',confidence:'high',policyVersion:C.POLICY_VERSION},'later');return e;}""")
  fixture2={'entries':{'sample':a},'meta':{},'sales':{}}
  ctx.close();browser.close()
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--no-zygote','--single-process'])
  ctx2=browser.new_context(viewport={'width':width,'height':844},service_workers='block');q=ctx2.new_page();q.route('**/*',route)
  q.add_init_script('window.__MMT_TEST_AUTH__={email:"test@example.invalid"};window.__MMT_TEST_FIN__='+json.dumps(fixture2))
  q.goto('https://ledger.test/quick.html');q.locator('[data-ai-undo]').first.click()
  q.wait_for_function('window.__MMT_TEST_FIN__.entries.sample.ai.status==="undone"')
  assert q.evaluate('window.__MMT_TEST_FIN__.entries.sample.category')=='구독료'
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  ctx2.close();browser.close();print(f'PASS {width}: picker, descriptions, known method, note-only save, manual override, AI undo, no overflow')
