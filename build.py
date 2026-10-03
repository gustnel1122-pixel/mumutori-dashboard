"""Build independent GitHub Pages entrypoints; never modify business seed data."""
from pathlib import Path
import hashlib
import gzip
R=Path(__file__).resolve().parent
# Existing published seed is byte-preserved. Rebuilding never appends data.
seed=R/'data/seed.json'
if seed.exists(): (R/'data/seed.json.gz').write_bytes(gzip.compress(seed.read_bytes(),mtime=0))
pages={'index':('overview','운영 홈'),'finance':('finance','재무'),'bank':('bank','자금'),'products':('products','상품'),'purchases':('purchases','구매·원가'),'sales':('sales','판매·정산'),'stock':('stock','물류·재고'),'partners':('partners','거래처'),'audit':('audit','변경 이력'),'settings':('settings','설정·백업')}
version=hashlib.sha256(b''.join(p.read_bytes() for p in sorted((R/'src').rglob('*')) if p.is_file())).hexdigest()[:12]
for filename,(page,title) in pages.items():
    html=f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#174d3c"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'self'"><title>{title} — 무무토리 스튜디오</title><link rel="icon" href="assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="src/erp.css?v={version}"></head>
<body data-page="{page}" data-build="{version}"><a class="skip-link" href="#main-content">본문으로 이동</a><div id="root"><div class="loading-state" role="status"><span class="loading-flower">✳</span><b>mumutori studio.</b><p>오늘의 기록을 불러오는 중이에요.</p></div></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div><noscript>이 ERP는 JavaScript가 필요합니다. 브라우저 설정에서 허용해 주세요.</noscript><script src="src/legacy-route.js?v={version}"></script><script src="src/erp-core.js?v={version}"></script><script type="module" src="src/erp-app.js?v={version}"></script></body></html>'''
    (R/f'{filename}.html').write_text(html)
print(f'Built {len(pages)} independent pages · {version}; seed unchanged')
