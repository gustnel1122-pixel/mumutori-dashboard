import {current,onAuth,signIn,dbUrl} from './fbauth.js?v=access20261028';
import {SHEET,SIZE,newSheet,clonePages,rangeSelection,fillFrom,stats,labelErrors,toEngine,readCatalog,readUsed,rememberUsed} from './labels-core.mjs';
const $=id=>document.getElementById(id);
const state={pages:[newSheet()],locked:[0],page:0,selected:new Set(),catalog:[],candidate:null,history:[],version:0,readyVersion:-1,pdf:null,bytes:null,meta:null,decoded:null,pdfUrl:null,worker:null,busy:false,user:'',loaded:false,rendering:false};
let rules,timer,searchTimer,toastTimer,authSequence=0,paintSequence=0;
const fields=['name','barcode','material','origin','age','seller','sellerRole','originWord'];
const say=text=>{$('label-toast').textContent=text;$('label-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('label-toast').hidden=true,3500);};
function mobileMode(picker){$('label-workspace').classList.toggle('show-picker',picker);$('tab-picker').setAttribute('aria-selected',String(picker));$('tab-sheet').setAttribute('aria-selected',String(!picker));}
$('tab-picker').onclick=()=>mobileMode(true);$('tab-sheet').onclick=()=>mobileMode(false);
function formValue(){return Object.fromEntries(fields.map(k=>[k,$('field-'+k).value.trim()]));}
function edit(p){state.candidate=p;for(const k of fields)$('field-'+k).value=p[k]||'';validateForm(false);renderProducts();}
function validateForm(show=true){const p=formValue(),errors=labelErrors(p);if(show)$('field-errors').textContent=errors.join(' ');for(const k of fields){const el=$('field-'+k);el.classList.toggle('invalid-field',['name','barcode','material','origin','age','seller'].includes(k)&&(!p[k]||(k==='barcode'&&errors.some(t=>t.includes('바코드')))));}return errors;}
function renderProducts(){
 const list=$('product-results');list.replaceChildren();const q=$('product-search').value.trim().toLocaleLowerCase();
 const rows=state.catalog.filter(p=>($('all-products').checked||p.decision==='판매')&&(!q||p.name.toLocaleLowerCase().includes(q)||p.barcode.includes(q))).slice(0,35);
 if(!rows.length){const p=document.createElement('p');p.className='empty-results';p.textContent='이름이나 바코드를 다시 찾아 주세요. 판매 외 상품은 위 체크를 켜면 보여요.';list.append(p);return;}
 for(const p of rows){const b=document.createElement('button');b.type='button';b.className='product-choice'+(p.id===state.candidate?.id?' is-picked':'');b.dataset.barcode=p.barcode;const h=document.createElement('strong');h.textContent=p.name;const s=document.createElement('small');s.textContent=(p.barcode||'바코드 없음')+(p.variant?' · 디자인별 상품':'');b.append(h,s);const missing=labelErrors(p);if(missing.length){b.classList.add('needs-info');const t=document.createElement('small');t.className='missing';t.textContent=(!p.material?'재질 ':'')+(!p.origin?'제조국 ':'')+(!p.barcode?'바코드 ':'')+'확인 필요';b.append(t);}b.onclick=()=>edit(p);list.append(b);}
}
$('product-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderProducts,80);});$('all-products').onchange=renderProducts;
function checkpoint(){state.history.push({pages:clonePages(state.pages),locked:[...state.locked],page:state.page});if(state.history.length>30)state.history.shift();}
function changed(){state.version++;state.readyVersion=-1;state.decoded=null;clearTimeout(timer);refresh();timer=setTimeout(generate,350);}
function clearPdf(){state.pdf?.destroy?.();state.pdf=null;state.bytes=null;state.meta=null;if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;const canvas=$('pdf-canvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);}
function refresh(){
 const st=stats(state.pages);$('page-label').textContent=`${state.page+1} / ${state.pages.length}장`;$('prev-page').disabled=state.page===0;$('next-page').disabled=state.page===state.pages.length-1;$('undo').disabled=!state.history.length;
 $('selection-summary').textContent=`고른 칸 ${state.selected.size}개`;$('assign').textContent=`고른 ${state.selected.size}칸에 넣기`;
 $('document-summary').textContent=`${st.pages}장 · 라벨 ${st.total}칸 · 빈칸 ${st.blank}칸`;
 $('used-start').value=(state.locked[state.page]||0)+1;
 const ready=state.readyVersion===state.version&&!!state.pdfUrl&&!st.invalid;
 $('download-pdf').disabled=$('print-pdf').disabled=$('remember-print').disabled=!ready;
 const grid=$('cell-grid');grid.replaceChildren();
 for(let slot=0;slot<108;slot++){
  const p=state.pages[state.page][slot],row=Math.floor(slot/9),col=slot%9,button=document.createElement('button');button.type='button';button.className='label-cell';button.dataset.slot=String(slot);button.setAttribute('aria-label',`${slot+1}번 칸${p?' '+p.name:' 비어 있음'}`);button.setAttribute('aria-pressed',String(state.selected.has(slot)));button.title=button.getAttribute('aria-label');
  button.style.cssText=`left:${(SHEET.cx+col*22.5-10)/210*100}%;top:${(SHEET.cy+row*22.5-10)/297*100}%;width:${20/210*100}%;height:${20/297*100}%`;
  if(p)button.classList.add('has-label');if(state.selected.has(slot))button.classList.add('selected');button.disabled=slot<(state.locked[state.page]||0);
  if(p&&labelErrors(p).length){button.classList.add('needs-info');const span=document.createElement('span');span.className='cell-name';span.textContent=p.name+' · 정보 확인';button.append(span);}else button.textContent=state.readyVersion===state.version&&p?'':String(slot+1);
  button.addEventListener('keydown',event=>{
   if(event.key===' '||event.key==='Enter'){event.preventDefault();toggle(slot,event.shiftKey);grid.querySelector(`[data-slot="${slot}"]`)?.focus();return;}
   const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:9,ArrowUp:-9}[event.key];if(delta){event.preventDefault();const next=Math.max(state.locked[state.page]||0,Math.min(107,slot+delta));if(event.shiftKey){state.selected=new Set(rangeSelection(slot,next));refresh();}grid.querySelector(`[data-slot="${next}"]`)?.focus();}
  });grid.append(button);
 }
 if(st.invalid){clearPdf();$('render-status').textContent=`정보가 빈 라벨 ${st.invalid}칸이 있어요. 빨간 칸을 고르고 재질·제조국 등을 적어 주세요.`;$('decode-status').textContent='정보를 채우기 전에는 인쇄할 수 없어요.';$('preview-note').textContent='빨간 칸의 빠진 내용을 이 작업에서만 적어 넣을 수 있어요.';}
 else if(!st.total){clearPdf();$('render-status').textContent='상품을 넣을 칸을 먼저 골라 주세요.';$('decode-status').textContent='';$('preview-note').textContent='비어 있는 종이예요. 칸을 고르고 상품을 넣으면 실제 PDF가 여기에 보여요.';}
 else if(!ready){$('preview-note').textContent='미리보기를 새로 만들고 있어요. 완료된 PDF와 같은 화면이 여기에 보여요.';}
}
let anchor=0,drag=null;
function toggle(slot,shift=false){if(slot<(state.locked[state.page]||0))return;if(shift)state.selected=new Set(rangeSelection(anchor,slot).filter(s=>s>=(state.locked[state.page]||0)));else {if(state.selected.has(slot))state.selected.delete(slot);else state.selected.add(slot);anchor=slot;}const p=state.pages[state.page][slot];if(p)edit(p);refresh();}
$('cell-grid').addEventListener('pointerdown',e=>{const b=e.target.closest('.label-cell');if(!b||b.disabled||e.button!==0)return;e.preventDefault();const slot=+b.dataset.slot;drag={start:e.shiftKey?anchor:slot,last:slot,base:e.ctrlKey||e.metaKey?new Set(state.selected):new Set(),wasSelected:state.selected.has(slot),shift:e.shiftKey,moved:false};if(e.shiftKey)state.selected=new Set(rangeSelection(anchor,slot).filter(s=>s>=(state.locked[state.page]||0)));else {anchor=slot;state.selected=new Set([...drag.base,slot]);}refresh();});
document.addEventListener('pointermove',e=>{if(!drag)return;const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('.label-cell');if(!b||b.disabled)return;const slot=+b.dataset.slot;if(slot!==drag.last){drag.moved=true;drag.last=slot;state.selected=new Set([...drag.base,...rangeSelection(drag.start,slot).filter(s=>s>=(state.locked[state.page]||0))]);refresh();}});
document.addEventListener('pointerup',()=>{if(!drag)return;const slot=drag.last;if(!drag.shift&&!drag.moved&&drag.wasSelected&&drag.base.size===0)state.selected.delete(slot);const p=state.pages[state.page][slot];drag=null;if(p)edit(p);refresh();});
document.addEventListener('pointercancel',()=>{drag=null;});
$('select-all').onclick=()=>{state.selected=new Set(Array.from({length:108},(_,i)=>i).filter(s=>s>=(state.locked[state.page]||0)));refresh();};$('clear-selection').onclick=()=>{state.selected.clear();refresh();};
$('clear-cells').onclick=()=>{if(!state.selected.size)return say('비울 칸을 골라 주세요.');checkpoint();for(const s of state.selected)state.pages[state.page][s]=null;changed();};
$('undo').onclick=()=>{const p=state.history.pop();if(!p)return;Object.assign(state,p);state.selected.clear();changed();};
function pageTo(n){state.page=n;state.selected.clear();refresh();if(state.pdf&&state.readyVersion===state.version)paint();}
$('prev-page').onclick=()=>pageTo(state.page-1);$('next-page').onclick=()=>pageTo(state.page+1);
$('add-page').onclick=()=>{if(state.pages.length>=100)return say('한 번에100장까지 만들 수 있어요.');checkpoint();state.pages.push(newSheet());state.locked.push(0);state.page=state.pages.length-1;state.selected.clear();changed();};
$('zoom-sheet').onclick=()=>{const on=$('paper').classList.toggle('zoomed');$('zoom-sheet').setAttribute('aria-pressed',String(on));$('zoom-sheet').textContent=on?'판 맞춰 보기':'판 크게 보기';};
$('use-start').onclick=()=>{const start=+$('used-start').value;if(!Number.isInteger(start)||start<1||start>108)return say('시작 칸을1~108로 적어 주세요.');checkpoint();state.locked[state.page]=start-1;for(let s=0;s<start-1;s++)state.pages[state.page][s]=null;state.selected=new Set([...state.selected].filter(s=>s>=start-1));$('fill-start').value=start;changed();};
$('label-form').onsubmit=e=>{e.preventDefault();if(!state.selected.size)return say('먼저 종이에서 칸을 골라 주세요.');const p=formValue();checkpoint();for(const s of state.selected)state.pages[state.page][s]={...p};validateForm();changed();mobileMode(false);};
for(const k of fields)$('field-'+k).addEventListener('input',()=>validateForm());
$('field-origin').addEventListener('change',()=>{const domestic=['대한민국','한국'].includes($('field-origin').value.trim());$('field-sellerRole').value=domestic?'판매원':'수입·판매원';$('field-originWord').value=domestic?'제조국':'원산지';});
$('fill-range').onclick=()=>{const p=formValue();validateForm();const start=+$('fill-start').value,count=+$('fill-count').value;try{const next=fillFrom(state.pages,state.page,start,count,p,state.locked);checkpoint();const end=state.page*108+start-1+count;state.pages=next;while(state.locked.length<next.length)state.locked.push(0);state.page=Math.floor((end-1)/108);state.selected=new Set();$('fill-start').value=end%108+1;changed();mobileMode(false);say(`${count}칸을 이어 넣었어요.`);}catch(e){say(e.message);}};
function initWorker(){if(state.worker)return state.worker;const url=new URL('./labels-worker.js',import.meta.url);url.searchParams.set('v',document.body.dataset.build||'');const w=new Worker(url);w.onmessage=receive;w.onerror=()=>{state.busy=false;state.worker?.terminate();state.worker=null;$('render-status').textContent='라벨 도구를 불러오지 못했어요. 연결을 확인하고 칸을 다시 넣어 주세요.';};state.worker=w;return w;}
async function generate(){
 const st=stats(state.pages);if(!state.user||!st.total||st.invalid||state.busy)return;
 state.busy=true;state.rendering=true;$('render-status').textContent='라벨 도구를 준비하고 있어요.';$('decode-status').textContent='';
 initWorker().postMessage({id:state.version,pages:state.pages.map(p=>p.map(v=>v?toEngine(v):null))});
}
let pdfjsPromise;
async function pdfjs(){const lib=await(pdfjsPromise??=import('../assets/vendor/labels/pdf.min.mjs'));lib.GlobalWorkerOptions.workerSrc=new URL('../assets/vendor/labels/pdf.worker.min.mjs',import.meta.url).href;return lib;}
async function receive(event){
 const r=event.data;if(r.type==='status'){if(state.busy)$('render-status').textContent=r.text;return;}
 state.busy=false;state.rendering=false;if(r.id!==state.version){generate();return;}
 if(r.type==='error'){$('render-status').textContent=r.message||'라벨을 만들지 못했어요. 내용을 확인해 주세요.';$('decode-status').textContent='';return;}
 if(r.type!=='result'||!state.user)return;
 const version=state.version;
 try{
  const lib=await pdfjs();const pdf=await lib.getDocument({data:r.bytes.slice(),isEvalSupported:false,disableFontFace:true}).promise;
  if(version!==state.version||!state.user){pdf.destroy();generate();return;}
  clearPdf();state.pdf=pdf;state.bytes=r.bytes;state.meta=r.meta;
  await paint();$('render-status').textContent='PDF 안의 바코드를 다시 읽고 있어요.';
  state.rendering=true;state.decoded=await verifyPDF(pdf,r.meta,version);state.rendering=false;
  if(version!==state.version||!state.user){generate();return;}
  if(state.decoded.available&&state.decoded.passed!==r.meta.total){$('render-status').textContent='다시 읽히지 않은 칸이 있어요. 해당 상품의 문구를 확인해 주세요.';return;}
  state.pdfUrl=URL.createObjectURL(new Blob([r.bytes],{type:'application/pdf'}));state.readyVersion=version;
  $('render-status').textContent='미리보기와 같은 PDF가 준비됐어요.';$('preview-note').textContent='화면은 만들어진 PDF를 그대로 보여줘요. 선택 테두리와 칸 번호는 인쇄되지 않아요.';refresh();
 }catch(error){if(version!==state.version||!state.user)return;state.rendering=false;$('render-status').textContent='PDF 미리보기를 만들지 못했어요. 연결을 확인한 뒤 칸을 다시 넣어 주세요.';console.warn('Label preview unavailable',error?.name||'error');}
}
async function paint(){
 if(!state.pdf)return;const seq=++paintSequence,pi=state.page,pdf=state.pdf;
 const page=await pdf.getPage(pi+1),viewport=page.getViewport({scale:2});const off=document.createElement('canvas');off.width=Math.ceil(viewport.width);off.height=Math.ceil(viewport.height);await page.render({canvasContext:off.getContext('2d'),viewport}).promise;
 if(seq!==paintSequence||pi!==state.page||pdf!==state.pdf)return;const c=$('pdf-canvas');c.width=off.width;c.height=off.height;c.getContext('2d').drawImage(off,0,0);
}
async function verifyPDF(pdf,meta,version){
 if(!window.ZXing?.MultiFormatReader){$('decode-status').textContent='이 브라우저에서는 자동 판독을 사용할 수 없어요. PDF는 만들어졌어요.';return {available:false,passed:0,total:meta.total};}
 const hints=new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_8]],[ZXing.DecodeHintType.TRY_HARDER,true]]),reader=new ZXing.MultiFormatReader();let passed=0;const failed=[];
 for(let pi=0;pi<meta.pages;pi++){
  if(version!==state.version)return {available:true,passed,total:meta.total,stale:true};
  const page=await pdf.getPage(pi+1),vp=page.getViewport({scale:300/72}),full=document.createElement('canvas');full.width=Math.ceil(vp.width);full.height=Math.ceil(vp.height);await page.render({canvasContext:full.getContext('2d'),viewport:vp}).promise;
  for(const c of meta.cells.filter(c=>c.page===pi)){
   if(version!==state.version)return {available:true,passed,total:meta.total,stale:true};
   const row=Math.floor(c.slot/9),col=c.slot%9,scale=300/25.4,x=(15.7+col*22.5-10.7)*scale,y=(24.15+row*22.5-10.7)*scale,w=Math.round(21.4*scale),crop=document.createElement('canvas');crop.width=crop.height=w;crop.getContext('2d').drawImage(full,Math.round(x),Math.round(y),w,w,0,0,w,w);
   try{const rgba=crop.getContext('2d').getImageData(0,0,w,w).data,gray=new Uint8ClampedArray(w*w);for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=(rgba[j]+2*rgba[j+1]+rgba[j+2])/4;const bitmap=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(gray,w,w)));const found=reader.decode(bitmap,hints);if(found.getText()===c.barcode)passed++;else failed.push(c);}catch{failed.push(c);}finally{reader.reset();}
   $('decode-status').textContent=`${meta.total}칸 중 ${passed}칸 읽힘`;
   if((passed+failed.length)%20===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 reader.reset();return {available:true,passed,total:meta.total,failed};
}
function filename(){const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('');return `무무토리_라벨_${state.meta.total}칸_${state.meta.pages}장_${date}.pdf`;}
$('download-pdf').onclick=()=>{if(state.readyVersion!==state.version)return;const a=document.createElement('a');a.href=state.pdfUrl;a.download=filename();a.click();};
$('print-pdf').onclick=()=>{if(state.readyVersion===state.version)window.open(state.pdfUrl,'_blank','noopener');};
function storage(){try{return window.localStorage;}catch{return null;}}
function showRemembered(){const last=readUsed(storage());$('last-used').textContent=last?`지난번 ${last.slot}번까지 기억했어요.`:'';}
$('remember-print').onclick=()=>{let slot=0;for(const page of state.pages)for(let s=0;s<108;s++)if(page[s])slot=s+1;if(rememberUsed(storage(),slot)){showRemembered();say(`${slot}번까지 쓴 것으로 기억했어요.`);}else say('이 브라우저에는 기억할 수 없지만 라벨은 계속 만들 수 있어요.');};
function wipe(){++authSequence;state.user='';state.loaded=false;state.catalog=[];state.candidate=null;state.pages=[newSheet()];state.locked=[0];state.selected.clear();state.history=[];state.version++;state.readyVersion=-1;state.worker?.terminate();state.worker=null;state.busy=false;state.rendering=false;clearPdf();$('label-workspace').hidden=true;for(const k of fields)$('field-'+k).value='';$('product-results').replaceChildren();}
function authMessage(text,button,action){const root=$('auth-status');root.replaceChildren();const p=document.createElement('p');p.textContent=text;root.append(p);if(button){const b=document.createElement('button');b.textContent=button;b.onclick=async()=>{b.disabled=true;try{await action();}catch{$('auth-status').firstChild.textContent='연결하지 못했어요. 다시 시도해 주세요.';b.disabled=false;}};root.append(b);}root.hidden=false;}
onAuth(async user=>{
 if(!user?.uid){wipe();authMessage('운영홈에서 쓰는 계정으로 로그인해 주세요.','Google 로그인',signIn);return;}
 if(state.loaded&&state.user===user.uid)return;
 if(state.user&&state.user!==user.uid)wipe();const seq=++authSequence;state.user=user.uid;
 authMessage('상품 목록을 읽고 있어요.');
 try{
  rules??=await fetch(new URL('./labels-specs.json',import.meta.url),{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();});
  const catalog=await readCatalog({auth:{current,dbUrl},rules});if(seq!==authSequence||current()?.uid!==user.uid)return;
  state.catalog=catalog;state.loaded=true;$('auth-status').hidden=true;$('label-workspace').hidden=false;showRemembered();renderProducts();refresh();
 }catch{if(seq!==authSequence)return;wipe();authMessage('상품 목록을 불러오지 못했어요. 로그인과 접근 권한을 확인해 주세요.','다시 불러오기',()=>location.reload());}
});
// Local fixture harness only; never enables access to the authenticated catalog.
if(['127.0.0.1','localhost'].includes(location.hostname)&&window.__MMT_TEST_AUTH__)window.__labelsQA=Object.freeze({
 load(pages){checkpoint();state.pages=clonePages(pages);state.locked=pages.map(()=>0);state.page=0;state.selected.clear();changed();},
 snapshot(){return {pages:clonePages(state.pages),version:state.version,ready:state.readyVersion===state.version,busy:state.busy,rendering:state.rendering,meta:state.meta,decoded:state.decoded,stats:stats(state.pages),catalog:state.catalog.map(p=>({...p}))};},
 async exportTo(url){if(state.readyVersion!==state.version)throw Error('not ready');return fetch(url,{method:'POST',body:state.bytes});}
});
