// 'AI에게 물어보기' 상자: 열어 둔 채로 목록이 다시 그려져도(60초 새로고침 등) 닫히지 않아야 한다. (사장님 11/2)
// 실행: node tests/ai-editor-open.browser.cjs  (저장소 루트에서, Playwright + python3 필요)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
(async () => {
  const root = path.resolve(__dirname, '..'); const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch(); const page = await browser.newPage();
  try {
    const harness = `<!doctype html><meta charset="utf-8"><div id="app"><section id="needs"><div class="f-needs-rows"></div></section><div id="recent"></div></div>
<script src="/src/fin-core.js"></script>
<script type="module">
  import { renderLists, bindListActions } from '/src/fin-form.js';
  const book = { entries: { e1: { id: 'e1', kind: 'out', amount: 3600, date: '2026-11-02', vendor: '편의점 택배', method: '카카오뱅크 체크카드', category: '', status: 'ok' } }, sales: {}, meta: {} };
  const draw = () => renderLists({ book, needsRoot: document.querySelector('#needs'), recentRoot: document.querySelector('#recent') });
  bindListActions(document.querySelector('#app'), { store: () => ({}), book: () => book, onRedraw: draw });
  window.__draw = draw; draw(); window.__ready = true;
</script>`;
    await page.route(`http://127.0.0.1:${port}/__ai_editor_test.html`, r => r.fulfill({ body: harness, contentType: 'text/html; charset=utf-8' }));
    await page.goto(`http://127.0.0.1:${port}/__ai_editor_test.html`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 5000 });
    const sel = '#needs details.q-ai-editor';
    assert.strictEqual(await page.$eval(sel, d => d.open), false, '처음엔 닫혀 있음');
    await page.click(`${sel} > summary`);
    assert.strictEqual(await page.$eval(sel, d => d.open), true, '누르면 열림');
    await page.evaluate(() => window.__draw()); await page.evaluate(() => window.__draw());
    assert.strictEqual(await page.$eval(sel, d => d.open), true, '다시 그려도 열린 채');
    await page.click(`${sel} > summary`); await page.evaluate(() => window.__draw());
    assert.strictEqual(await page.$eval(sel, d => d.open), false, '닫으면 다시 그려도 닫힌 채');
    console.log('# pass 4\n# fail 0');
  } catch (e) { console.error(e); console.log('# fail 1'); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
