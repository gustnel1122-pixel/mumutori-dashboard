const {SHOPPING_KEY,SHOPPING_ITEMS,SHOPPING_IMAGES}=await import(`./shopping-data.js?v=${document.body.dataset.build}`);
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({version:1,updatedAt:null,checked:{},notes:{}});
function load(){try{const d=JSON.parse(localStorage.getItem(SHOPPING_KEY)||'null');if(d?.version===1&&d.checked&&typeof d.checked==='object'&&!Array.isArray(d.checked)&&d.notes&&typeof d.notes==='object'&&!Array.isArray(d.notes))return d;}catch{}return fresh();}
let state=load(),filter='today',storageFailed=false;
const intros={today:'오늘 현장에서 치수·보유 수량을 확인하고, 부족분만 구매할 후보 10줄이에요. 실제 판매처와 재고는 확인이 필요해요.',verify:'먼저 확인하면 중복 구매를 줄일 수 있어요. 추가 후보는 필요한 경우에만 준비하세요.',owned:'기록에서 보유·재사용이 확인된 물건이에요. 새로 사지 않고 상태·반입 여부만 확인하세요.',elsewhere:'현장 치수와 기존 주문을 확인한 뒤 온라인·제작 업체·자체 출력으로 준비할 항목이에요.'};
function saveField(kind,id,value){
  const next=storageFailed?state:load();next[kind][id]=value;next.updatedAt=new Date().toISOString();state=next;
  try{localStorage.setItem(SHOPPING_KEY,JSON.stringify(next));storageFailed=false;$('save-status').textContent='이 브라우저에 저장했어요. 다른 기기·기존 구매표와는 따로예요.';}
  catch{storageFailed=true;$('save-status').textContent='이 브라우저에서 저장이 막혔어요. 현재 화면에만 남아 있으니 체크 결과를 복사해 두세요.';}
  updateProgress();
}
function updateProgress(){const today=SHOPPING_ITEMS.filter(i=>i.group==='today');const done=today.filter(i=>state.checked[i.id]===true).length;$('progress-count').textContent=`${done} / ${today.length}`;$('progress-bar').max=today.length;$('progress-bar').value=done;$('progress-bar').textContent=Math.round(done/today.length*100)+'%';}
function render(){
  const hide=$('hide-completed').checked;
  const items=SHOPPING_ITEMS.filter(i=>i.group===filter&&!(hide&&state.checked[i.id]===true));
  const zones=[...new Set(items.map(i=>i.zone))];
  $('items').innerHTML=`<p class="group-intro">${esc(intros[filter])}</p>`+(items.length?zones.map(zone=>`<h2 class="zone-title">${esc(zone)}</h2><div class="items-grid">${items.filter(i=>i.zone===zone).map(item=>{
    const done=state.checked[item.id]===true;
    const owned=item.group==='owned';
    return `<article class="shopping-item${done?' is-done':''}" data-item="${item.id}"><div class="item-top">${owned?'<span class="owned-mark" aria-hidden="true">✓</span>':`<input type="checkbox" class="item-check" id="check-${item.id}" data-check="${item.id}" ${done?'checked':''} aria-label="${esc(item.name)} 준비 끝">`}<div class="item-title"><h3>${owned?esc(item.name):`<label for="check-${item.id}">${esc(item.name)}</label>`}</h3><span class="qty">${esc(item.qty)}</span></div></div><span class="status-pill">${done?'내 체크: 준비 끝':esc(item.status)}</span><dl class="item-detail"><dt>쓰는 곳 · </dt><dd>${esc(item.use)}</dd><dt>그림 자리 · </dt><dd>${item.image?`<a href="#figure-${item.image}">${esc(item.figure)} ↗</a>`:esc(item.figure)}</dd></dl><p class="item-note">${esc(item.note)}</p>${owned?'':`<label class="memo" for="note-${item.id}">치수·보유 수량·현장 메모<textarea id="note-${item.id}" data-note="${item.id}" rows="2" maxlength="600" placeholder="예: 기존 1개 있음 / 높이 확인">${esc(typeof state.notes[item.id]==='string'?state.notes[item.id]:'')}</textarea></label>`}</article>`;
  }).join('')}</div>`).join(''):'<p class="empty-note">이 목록은 모두 체크했어요. 다른 구분도 확인해 보세요.</p>');
  updateProgress();
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});render();}));
$('hide-completed').addEventListener('change',render);
$('items').addEventListener('change',event=>{const id=event.target.dataset.check;if(id){saveField('checked',id,event.target.checked);render();}});
$('items').addEventListener('input',event=>{const id=event.target.dataset.note;if(id)saveField('notes',id,event.target.value);});
$('reference-images').innerHTML=Object.entries(SHOPPING_IMAGES).map(([key,img])=>`<figure id="figure-${key}"><a href="${img.src}" target="_blank" rel="noopener"><img src="${img.src}" alt="다희 님 ${esc(img.label)} 시안" loading="lazy"></a><figcaption><b>${esc(img.label)}</b>${esc(img.caption)}<br><a href="${img.src}" target="_blank" rel="noopener">그림 크게 보기 ↗</a></figcaption></figure>`).join('');
$('copy-summary').addEventListener('click',async()=>{
 const selected=SHOPPING_ITEMS.filter(i=>i.group!=='owned'&&(state.checked[i.id]===true||state.notes[i.id]));
 const text='무무토리 · 10/26 팔시보 현장 체크\n'+(selected.length?selected.map(i=>`${state.checked[i.id]===true?'[준비 끝]':'[확인 메모]'} ${i.name} (${i.qty})${state.notes[i.id]?' — '+state.notes[i.id]:''}`).join('\n'):'아직 체크·메모가 없어요.');
 try{await navigator.clipboard.writeText(text);$('save-status').textContent='체크 결과를 복사했어요. 대화창에 붙여 넣으면 운영 기록에 반영할 수 있어요.';}
 catch{let box=$('copy-fallback');if(!box){box=document.createElement('textarea');box.id='copy-fallback';box.setAttribute('aria-label','복사할 체크 결과');box.className='copy-fallback';box.rows=8;$('save-status').after(box);}box.value=text;box.focus();box.select();$('save-status').textContent='아래 글을 선택해 복사해 주세요.';}
});
window.addEventListener('storage',e=>{if(e.key===SHOPPING_KEY){state=load();render();}});
render();
