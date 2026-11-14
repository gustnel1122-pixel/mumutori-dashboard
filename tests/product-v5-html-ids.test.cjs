'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

function idsReferencedByAppJs(appJs) {
  const ids=new Set();
  for (const m of appJs.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)) ids.add(m[1]);
  for (const t of ['p','s','m']) { ids.add('view-'+t); ids.add('tab-'+t); }
  return ids;
}
// app.js writes some elements' own markup (e.g. `<select id="sort">`) via
// innerHTML before reading them back in the same render pass; those don't
// need to pre-exist in the static page shell.
function idsSelfCreatedByAppJs(appJs) {
  return new Set([...appJs.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m=>m[1]));
}
function idsDefinedInHtml(html) {
  return new Set([...html.matchAll(/\sid="([a-zA-Z0-9_-]+)"/g)].map(m=>m[1]));
}

test('20261114_2105: app.js가 $()로 찾는 모든 id가 실제 화면 원본(fresh.html)에 있음', () => {
  const appJs=fs.readFileSync(path.join(root,'preview-v5/app.js'),'utf8');
  const freshHtml=fs.readFileSync(path.join(root,'preview-v5/fresh.html'),'utf8');
  const referenced=idsReferencedByAppJs(appJs);
  const defined=new Set([...idsDefinedInHtml(freshHtml), ...idsSelfCreatedByAppJs(appJs)]);
  const missing=[...referenced].filter(id=>!defined.has(id)).sort();
  assert.deepStrictEqual(missing, [], `fresh.html(=products.html 원본)에 없는 id: ${missing.join(', ')}`);
});

test('20261114_2105: app.js가 $()로 찾는 모든 id가 예시 화면(index.html)에도 있음', () => {
  const appJs=fs.readFileSync(path.join(root,'preview-v5/app.js'),'utf8');
  const indexHtml=fs.readFileSync(path.join(root,'preview-v5/index.html'),'utf8');
  const referenced=idsReferencedByAppJs(appJs);
  const defined=new Set([...idsDefinedInHtml(indexHtml), ...idsSelfCreatedByAppJs(appJs)]);
  const missing=[...referenced].filter(id=>!defined.has(id)).sort();
  assert.deepStrictEqual(missing, [], `index.html에 없는 id: ${missing.join(', ')}`);
});
