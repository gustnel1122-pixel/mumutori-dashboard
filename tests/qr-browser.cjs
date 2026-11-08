/* QR 현황 화면 시험 — 레터 사이트 넘김 페이지는 가짜 응답만 쓴다. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const file = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file)); }
  catch (_) { res.writeHead(404).end(); }
});
const goPage = (url) => `<!doctype html><meta http-equiv="refresh" content="0; url=${url}"><script>var GO = '${url}'; location.replace(GO);</script>`;
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch(); const report = [];
  try {
    for (const [name, width, reply] of [['기록대로', 1280, goPage('https://pf.kakao.com/_lqpZX')], ['기록과 다름', 390, goPage('https://mumutori.com/about')], ['확인 못 함', 390, null]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await page.route(/letter\.mumutori\.com\/go\/table\//, (r) => reply ? r.fulfill({ status: 200, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: reply }) : r.abort());
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)(?!letter\.mumutori\.com)/, (r) => r.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/qr.html`);
      await page.locator('.qr-card').first().waitFor({ timeout: 8000 });
      assert.equal(await page.locator('.qr-card').count(), 7);
      assert.ok((await page.locator('#qr-table').textContent()).includes('go/table'));
      const live = page.locator('#qr-table .qr-live');
      await page.waitForFunction(() => /is-(same|diff|unknown)/.test(document.querySelector('#qr-table .qr-live').className), null, { timeout: 8000 });
      const cls = await live.getAttribute('class');
      if (name === '기록대로') assert.ok(cls.includes('is-same') && (await live.textContent()).includes('기록대로'));
      if (name === '기록과 다름') assert.ok(cls.includes('is-diff') && (await live.textContent()).includes('mumutori.com/about'));
      if (name === '확인 못 함') assert.ok(cls.includes('is-unknown'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no overflow');
      if (process.env.QA_OUTPUT) await page.screenshot({ path: path.join(process.env.QA_OUTPUT, `qr-${width}-${name === '기록대로' ? 'same' : name === '기록과 다름' ? 'diff' : 'unknown'}.png`), fullPage: true });
      assert.deepEqual(errs, []);
      report.push(`${width}px ${name}: 카드 7개 · 테이블 QR go/table 실제 가는 곳 확인 → ${cls.match(/is-\w+/)[0]} · 가로 넘침 없음`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ passed: report }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
