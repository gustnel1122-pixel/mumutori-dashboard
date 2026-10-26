"""Build independent GitHub Pages entrypoints; never modify business seed data."""
from pathlib import Path
import hashlib
import gzip
import json
import sys
sys.dont_write_bytecode=True     # 저장소 폴더에 __pycache__ 를 만들지 않는다(캐시 파일에는 이 PC의 경로가 들어간다)
import brand_public_check
R=Path(__file__).resolve().parent
TEXT_SUFFIXES={'.py','.js','.css','.svg','.html','.json','.webmanifest'}
def content_bytes(path):
    raw=path.read_bytes()
    return raw.replace(b'\r\n',b'\n') if path.suffix in TEXT_SUFFIXES else raw
# 브랜딩 공개 목록(src/branding-data.json)은 공개 저장소·공개 화면으로 나간다. 다른 것을 만들기 전에 구조를 검사한다:
# 허용한 칸·형식·값만 통과하고(brand_public_check.py), 하나라도 어긋나면 아무 파일도 만들지 않고 멈춘다.
# 주문번호·결제액·도안 원본 위치는 화면의 내 기록(브라우저 장부 erp.branding)에만 둔다. 예전 JS 자료 파일은 두지 않는다.
brand_problems=brand_public_check.check_file(R/'src/branding-data.json')
if (R/'src/branding-data.js').exists(): brand_problems.append('src/branding-data.js 가 있습니다 — 공개 목록은 src/branding-data.json 하나만 둡니다')
if brand_problems: raise SystemExit('빌드 중단: 브랜딩 공개 목록 검사 실패\n - '+'\n - '.join(brand_problems))
from _tools.pwa_icons import generate as generate_icons
generate_icons(R)
# Existing published seed is byte-preserved. Rebuilding never appends data.
seed=R/'data/seed.json'
if seed.exists(): (R/'data/seed.json.gz').write_bytes(gzip.compress(seed.read_bytes(),mtime=0))
pages={'index':('overview','운영 홈'),'finance':('finance','재무'),'bank':('bank','재무 · 계좌별'),'products':('products','상품'),'purchases':('purchases','구매·원가'),'sourcing':('sourcing','소싱'),'sales':('sales','판매·정산'),'stock':('stock','물류·재고'),'partners':('partners','거래처'),'audit':('audit','변경 이력'),'settings':('settings','설정·백업'),'branding':('branding','브랜딩'),'characters':('characters','캐릭터'),'agents':('agents','AI 조직도')}
private_documents=['letter-hub.html']
version_files=[R/'build.py',R/'manifest.webmanifest',R/'offline.html']
version_files += [R/name for name in private_documents]
version_files += [p for folder in ['src','assets','_tools'] for p in (R/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc']
# Include paths as well as bytes: renaming/removing a resource must change the worker.
version=hashlib.sha256(b''.join(p.relative_to(R).as_posix().encode()+b'\0'+content_bytes(p)+b'\0' for p in sorted(version_files))).hexdigest()[:12]
PWA_HEAD='''<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="assets/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="무무토리"><meta name="mobile-web-app-capable" content="yes"><link rel="stylesheet" href="src/pwa.css?v={v}"><script src="src/pwa.js?v={v}" defer></script>'''.replace('{v}',version)
# 소싱 보드만 Firebase(공유 소싱 장부)와 1688 사진에 연결한다. 다른 부서 페이지의 CSP는 그대로.
EXTRA={'sourcing':(' https://*.alicdn.com',' https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app https://*.asia-southeast1.firebasedatabase.app wss://*.asia-southeast1.firebasedatabase.app'),
       # 캐릭터 만들기(2026-10-14): 함께 보는 저장을 위해 같은 장부 주소 하나만 허용한다(로그인 도구·다른 주소 없음).
       'characters':('',' https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app')}
# 2026-10-07 보안 정리: 소싱 보드는 사장님 구글 로그인(Firebase Auth) 후에만 읽고 쓴다. 로그인 도구는 assets/vendor/firebase에 고정 버전.
# 로그인 창(구글)·토큰 발급 주소만 추가로 허용한다. 다른 부서 페이지는 그대로.
AUTH={'sourcing','finance','overview','bank'}   # overview(홈): 공용 장부 이번 달 · 확인 필요를 읽기만(10/20 구글 로그인 방식으로 정해짐) · bank(재무 '계좌별', 10/23 총괄 #15): 같은 장부를 계좌마다 읽기만
# 2026-10-19 재무: 맨 위 '수기 입력 · 확인 필요' 패널이 공용 장부(hub/financeV1, 사장님 로그인 전용)에 읽고 쓴다 — 장부 주소 · 로그인 주소만 더한다.
EXTRA['finance']=('',' https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app')
EXTRA['overview']=EXTRA['finance']
EXTRA['bank']=EXTRA['finance']
PAGE_HEAD={'finance':'<link rel="stylesheet" href="src/fin-form.css?v={v}">','bank':'<link rel="stylesheet" href="src/fin-form.css?v={v}">'}
PAGE_TAGS={'finance':'<script src="src/fin-core.js?v={v}"></script><script type="module" src="src/fin-panel.js?v={v}"></script>',
           'bank':'<script src="src/fin-core.js?v={v}"></script><script type="module" src="src/fin-accounts.js?v={v}"></script>',
           'overview':'<script src="src/fin-core.js?v={v}"></script><script type="module" src="src/home-fin.js?v={v}"></script>'}   # 홈: 공용 장부 이번 달 · 확인 필요(읽기만, 구글 로그인)
AUTH_CONNECT=' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com'
AUTH_SCRIPT=' https://apis.google.com'
AUTH_FRAME='https://mumutori-letter.firebaseapp.com https://accounts.google.com'
AUTH_TAGS='<script src="assets/vendor/firebase/firebase-app-compat.js"></script><script src="assets/vendor/firebase/firebase-auth-compat.js"></script>'
for filename,(page,title) in pages.items():
    extra_img,extra_connect=EXTRA.get(page,('',''))
    auth=page in AUTH
    extra_connect+=AUTH_CONNECT if auth else ''
    extra_script=AUTH_SCRIPT if auth else ''
    frame=AUTH_FRAME if auth else "'none'"
    auth_tags=(AUTH_TAGS if auth else '')+PAGE_TAGS.get(page,'').replace('{v}',version)
    page_head=PAGE_HEAD.get(page,'').replace('{v}',version)
    html=f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#174d3c"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'{extra_script}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:{extra_img}; font-src 'self'; connect-src 'self'{extra_connect}; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-src {frame}; form-action 'none'; base-uri 'self'"><title>{title} — 무무토리 스튜디오</title><link rel="icon" href="assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="src/erp.css?v={version}">{page_head}{PWA_HEAD}</head>
<body data-page="{page}" data-build="{version}"><a class="skip-link" href="#main-content">본문으로 이동</a><div id="root"><div class="loading-state" role="status"><span class="loading-flower">✳</span><b>mumutori studio.</b><p>오늘의 기록을 불러오는 중이에요.</p></div></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div><noscript>이 ERP는 JavaScript가 필요합니다. 브라우저 설정에서 허용해 주세요.</noscript><script src="src/demo.js?v={version}"></script>{auth_tags}<script src="src/legacy-route.js?v={version}"></script><script src="src/erp-core.js?v={version}"></script><script type="module" src="src/erp-app.js?v={version}"></script></body></html>'''
    (R/f'{filename}.html').write_text(html,encoding='utf-8',newline=chr(10))
quick=(R/'src/quick-shell.html').read_text(encoding='utf-8').replace('{{PWA_HEAD}}',PWA_HEAD).replace('{{VERSION}}',version)
(R/'quick.html').write_text(quick,encoding='utf-8',newline=chr(10))
# Public operations pages share versioned source templates; keep their source in src.
operations_pages={'palsibo-shopping':'shopping-shell.html','store-opening':'store-opening-shell.html','project-hub':'project-hub-shell.html'}
for name,template in operations_pages.items():
    shell=(R/'src'/template).read_text(encoding='utf-8').replace('{{PWA_HEAD}}',PWA_HEAD).replace('{{VERSION}}',version)
    (R/f'{name}.html').write_text(shell,encoding='utf-8',newline=chr(10))
# A strict allowlist keeps all JSON/seed, login, finance code and APIs out of Cache Storage.
excluded={'fbauth.js','home-fin.js','finance.js','bank.js','overview.js'}
assets={p.relative_to(R).as_posix():hashlib.sha256(content_bytes(p)).hexdigest()
        for folder in ['src','assets'] for p in sorted((R/folder).rglob('*'))
        if p.is_file() and p.suffix in {'.js','.css','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2'}
        and p.name not in excluded and not p.name.startswith(('fin-','quick')) and 'vendor' not in p.parts}
assets['offline.html']=hashlib.sha256(content_bytes(R/'offline.html')).hexdigest()
assets['manifest.webmanifest']=hashlib.sha256(content_bytes(R/'manifest.webmanifest')).hexdigest()
# Network-backed/private screens fall back to the neutral offline screen, never cached HTML.
cached_pages={f'{name}.html':hashlib.sha256(content_bytes(R/f'{name}.html')).hexdigest()
              for name in pages if name not in {'index','finance','bank','sourcing','characters','branding'}}
cached_pages.update({f'{name}.html':hashlib.sha256(content_bytes(R/f'{name}.html')).hexdigest() for name in operations_pages})
worker=(R/'_tools/sw-template.js').read_text(encoding='utf-8').replace('__PWA_VERSION__',version).replace('__PWA_ASSETS__',json.dumps(assets,ensure_ascii=False,sort_keys=True)).replace('__PWA_PAGES__',json.dumps(cached_pages,sort_keys=True)).replace('__PWA_DOCUMENTS__',json.dumps([name+'.html' for name in pages]+[name+'.html' for name in operations_pages]+['quick.html','offline.html']+private_documents))
(R/'sw.js').write_text(worker,encoding='utf-8',newline=chr(10))
print(f'Built {len(pages)+len(operations_pages)+1} independent pages + service worker · {version}; seed unchanged')

