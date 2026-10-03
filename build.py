"""Build the self-contained ERP, preserving the already-published bootstrap data."""
import base64
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
index = ROOT / 'index.html'
old = index.read_text()
payload = json.loads(re.search(r'<script id="dashboard-payload"[^>]*>(.*?)</script>', old, re.S)[1])
old_app = gzip.decompress(base64.b64decode(payload['data'])).decode()
seed = re.search(r'<script id="company-private-data"[^>]*>(.*?)</script>', old_app, re.S)[1]
json.loads(seed)
css = (ROOT / 'src/erp.css').read_text()
core = (ROOT / 'src/erp-core.js').read_text().replace('</script', '<\\/script')
app = (ROOT / 'src/erp-app.js').read_text().replace('</script', '<\\/script')
html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>무무토리 ERP · 재무·물류</title><style>' + css + '</style></head><body>'
        '<div id="root"></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div>'
        '<script id="company-private-data" type="application/json">' + seed + '</script>'
        '<script>' + core + '</script><script>' + app + '</script></body></html>')
encoded = base64.b64encode(gzip.compress(html.encode(), mtime=0)).decode()
outer = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self' about:; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>무무토리 ERP · 재무·물류</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f7f6}#loading{padding:40px}iframe{position:fixed;inset:0;border:0;width:100%;height:100dvh;background:white}</style></head><body><p id="loading" role="status">무무토리 ERP를 여는 중입니다…</p><script id="dashboard-payload" type="application/json">PAYLOAD</script><script>
(async()=>{try{const payload=JSON.parse(document.getElementById('dashboard-payload').textContent);const bytes=Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));const html=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();const frame=document.createElement('iframe');frame.title='무무토리 ERP';frame.srcdoc=html;document.body.appendChild(frame);document.getElementById('loading').remove();}catch(e){document.getElementById('loading').textContent='ERP를 열지 못했습니다. 최신 Chrome 또는 Edge에서 새로고침해 주세요.';}})();
</script></body></html>'''
index.write_text(outer.replace('PAYLOAD', json.dumps({'compression':'gzip','data':encoded}, separators=(',',':'))))
print(f'Built index.html: {index.stat().st_size:,} bytes; original bootstrap preserved')
