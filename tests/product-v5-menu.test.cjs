'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('all normal product entry points lead to products.html and legacy remains explicit',async()=>{
  const {hrefFor,departmentCards}=await import('../src/departments.js');
  assert.equal(hrefFor('products'),'products.html');
  const cards=departmentCards();
  assert.match(cards,/href="products\.html"/);
  assert.doesNotMatch(cards,/새 상품 관리 v5|products-preview\.html/);
  assert.match(read('src/mobile-nav.js'),/\['상품','products\.html'\]/);
  assert.match(read('src/project-data.js'),/\['상품','products\.html'\]/);
  assert.doesNotMatch(read('src/project-progress.json'),/products-preview\.html/);
  assert.match(read('products.html'),/href="products-preview\.html">옛 상품 화면/);
  assert.match(read('preview-v5/fresh.html'),/href="\.\.\/products-preview\.html">옛 상품 화면/);
  assert.match(read('products-preview.html'),/preview-v4\/gate\.js/);
});

test('product v5 is a network-only app entry and receives the current build',()=>{
  const page=read('products.html');
  const version=page.match(/data-build="([a-f0-9]{12})"/)[1];
  assert.ok(page.includes('preview-v5/fresh-entry.js?v='+version));
  assert.ok(page.includes('preview-v5/styles.css?v='+version));
  assert.match(page,/src\/pwa\.js\?v=/);
  const worker=read('sw.js');
  const pages=JSON.parse(worker.match(/const PAGES = (\{[^\n]*\});/)[1]);
  const docs=JSON.parse(worker.match(/const DOCUMENTS = (\[[^\n]*\]);/)[1]);
  assert.equal(Object.hasOwn(pages,'products.html'),false);
  assert.ok(docs.includes('products.html'));
  assert.ok(docs.includes('products-preview.html'));
  assert.match(worker,new RegExp("const VERSION = '"+version+"'"));
});
