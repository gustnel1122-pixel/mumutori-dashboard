"""Build independent GitHub Pages entrypoints; never modify business seed data."""
from pathlib import Path
import hashlib
import gzip
R=Path(__file__).resolve().parent
# Existing published seed is byte-preserved. Rebuilding never appends data.
seed=R/'data/seed.json'
if seed.exists(): (R/'data/seed.json.gz').write_bytes(gzip.compress(seed.read_bytes(),mtime=0))
pages={'index':('overview','운영 홈'),'finance':('finance','재무'),'bank':('bank','자금'),'products':('products','상품'),'purchases':('purchases','구매·원가'),'sourcing':('sourcing','소싱'),'sales':('sales','판매·정산'),'stock':('stock','물류·재고'),'partners':('partners','거래처'),'audit':('audit','변경 이력'),'settings':('settings','설정·백업')}
version=hashlib.sha256(b''.join(p.read_bytes() for p in sorted((R/'src').rglob('*')) if p.is_file())).hexdigest()[:12]
# 소싱 보드만 Firebase(공유 소싱 장부)와 1688 사진에 연결한다. 다른 부서 페이지의 CSP는 그대로.
EXTRA={'sourcing':(' https://*.alicdn.com',' https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app https://*.asia-southeast1.firebasedatabase.app wss://*.asia-southeast1.firebasedatabase.app')}
# 2026-10-07 보안 정리: 소싱 보드는 사장님 구글 로그인(Firebase Auth) 후에만 읽고 쓴다. 로그인 도구는 assets/vendor/firebase에 고정 버전.
# 로그인 창(구글)·토큰 발급 주소만 추가로 허용한다. 다른 부서 페이지는 그대로.
AUTH={'sourcing'}
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
    auth_tags=AUTH_TAGS if auth else ''
    html=f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#174d3c"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'{extra_script}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:{extra_img}; font-src 'self'; connect-src 'self'{extra_connect}; object-src 'none'; frame-src {frame}; form-action 'none'; base-uri 'self'"><title>{title} — 무무토리 스튜디오</title><link rel="icon" href="assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="src/erp.css?v={version}"></head>
<body data-page="{page}" data-build="{version}"><a class="skip-link" href="#main-content">본문으로 이동</a><div id="root"><div class="loading-state" role="status"><span class="loading-flower">✳</span><b>mumutori studio.</b><p>오늘의 기록을 불러오는 중이에요.</p></div></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div><noscript>이 ERP는 JavaScript가 필요합니다. 브라우저 설정에서 허용해 주세요.</noscript>{auth_tags}<script src="src/legacy-route.js?v={version}"></script><script src="src/erp-core.js?v={version}"></script><script type="module" src="src/erp-app.js?v={version}"></script></body></html>'''
    (R/f'{filename}.html').write_text(html,encoding='utf-8',newline=chr(10))
print(f'Built {len(pages)} independent pages · {version}; seed unchanged')
