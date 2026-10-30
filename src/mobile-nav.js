// Mobile navigation only. It does not read or change ledger or alert data.
(() => {
  'use strict';
  const version = encodeURIComponent(document.body.dataset.build || '');
  const own = document.currentScript && new URL('.', document.currentScript.src);
  if (!own || document.querySelector('.mmt-mobile-nav')) return;
  for (const file of ['mobile-nav.css','mobile-refresh.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL(file+'?v='+version, own).href;
    document.head.append(link);
  }
  const menus = [
    ['자주 쓰는 업무', [['운영 홈','index.html'],['빠른 장부','quick.html'],['재무 · 장부','finance.html'],['계좌별','bank.html'],['확인 필요','finance.html#fin-needs'],['옛 기록','finance.html#legacy']]],
    ['상품과 운영', [['소싱 보드','sourcing.html'],['판매 · 정산','sales.html'],['물류 · 재고','stock.html'],['상품','products.html'],['구매 · 원가','purchases.html'],['거래처','partners.html']]],
    ['프로젝트와 만들기', [['프로젝트','project-hub.html'],['매장 준비','store-opening.html'],['브랜딩','branding.html'],['캐릭터','characters.html'],['오프라인 주문판','https://gustnel1122-pixel.github.io/mumutori-offline-pages/'],['레터 페이지','letter-hub.html']]],
    ['함께 관리', [['조직도','agents.html'],['변경 이력','audit.html'],['설정 · 백업','settings.html']]]
  ];
  const icons={home:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',ledger:'M5 3h14v18H5z M8 8h8M8 12h8M8 16h8',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',task:'M4 5h16v15H4z M8 9h8M8 13h8M8 17h5',all:'M4 6h16M4 12h16M4 18h16'};
  const tabs=[['home','홈'],['ledger','장부'],['bell','알림'],['task','일감'],['all','전체']];
  const path=location.pathname.split('/').pop() || 'index.html';
  const active=path==='index.html'?'home':['quick.html','finance.html','bank.html'].includes(path)?'ledger':'all';
  const nav=document.createElement('nav'); nav.className='mmt-mobile-nav'; nav.setAttribute('aria-label','모바일 주요 메뉴');
  for(const [id,label] of tabs){const b=document.createElement('button');b.type='button';b.dataset.tab=id;b.setAttribute('aria-label',label);if(active===id){b.classList.add('is-active');b.setAttribute('aria-current','page');}b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[id]}"></path></svg><span>${label}</span>`;nav.append(b);}
  const sheet=document.createElement('dialog');sheet.className='mmt-mobile-all';sheet.setAttribute('aria-label','전체 메뉴');
  const drag=document.createElement('div');drag.className='mmt-drag';drag.setAttribute('aria-hidden','true');sheet.append(drag);
  const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');
  title.textContent='전체 메뉴';close.type='button';close.className='mmt-close';close.setAttribute('aria-label','전체 메뉴 닫기');close.textContent='×';head.append(title,close);sheet.append(head);
  const note=document.createElement('p');note.setAttribute('role','status');sheet.append(note);
  for(const [heading,links] of menus){const h=document.createElement('h3');h.textContent=heading;sheet.append(h);const grid=document.createElement('div');grid.className='mmt-links';for(const [label,url] of links){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.href=url;grid.append(b);}sheet.append(grid);}
  document.body.append(nav,sheet);document.body.classList.add('mmt-mobile-ready');

  // Only transient in-memory values; never persist the contents of a draft.
  const initial=new WeakMap(),modified=new Set(),touchedForms=new Set();
  const valueOf=el=>el.type==='file' ? String(el.files?.length||0) : el.type==='checkbox'||el.type==='radio' ? String(el.checked) : el.isContentEditable ? el.textContent : el.value;
  const editable=el=>el instanceof Element && (el.matches('textarea,select,input:not([type=hidden]):not([type=search]),[contenteditable=true]')) && !el.matches('[data-filter],.search,#mobile-nav');
  document.addEventListener('focusin',e=>{const el=e.target;if(editable(el)&&!initial.has(el))initial.set(el,valueOf(el));},true);
  document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);
  // The quick ledger stores its selected method/category inside JS, not an input.
  document.addEventListener('click',e=>{const button=e.target.closest?.('form .f-category,form [data-method]');if(button?.form)touchedForms.add(button.form);},true);
  document.addEventListener('reset',e=>{if(e.target instanceof HTMLFormElement)touchedForms.delete(e.target);},true);
  function changed(e){const el=e.target;if(!editable(el))return;if(!initial.has(el)){const v=el.type==='checkbox'||el.type==='radio'?String(el.defaultChecked):el.type==='file'?'0':el.defaultValue??'';initial.set(el,v);}if(valueOf(el)!==initial.get(el))modified.add(el);else modified.delete(el);}
  function draft(){for(const form of touchedForms){if(!form.isConnected)touchedForms.delete(form);else return true;}for(const el of modified){if(!el.isConnected||valueOf(el)===initial.get(el)){modified.delete(el);continue;}return true;}return [...document.querySelectorAll('input[type=file]')].some(el=>el.files?.length);}
  function activeWork(){
    if(draft())return true;
    if(document.querySelector('[data-busy="1"], [aria-busy="true"], .f-save:disabled, #submit-record:disabled'))return true;
    return [...document.querySelectorAll('.overlay,[role=dialog],dialog[open]')].some(el=>el!==sheet&&!el.classList.contains('mmt-notice-panel')&&el.getClientRects().length);
  }
  function warn(){note.textContent='작성하거나 저장 중인 내용이 있어요. 먼저 저장하거나 닫은 뒤 이동해 주세요.';if(!sheet.open)window.alert(note.textContent);}
  function go(href){const target=new URL(href,location.href);if(target.href===location.href){closeSheet();return;}if(activeWork()){warn();return;}location.assign(target.href);}
  function closeSheet(){if(!sheet.open)return;try{sheet.close();}catch(_){sheet.removeAttribute('open');}if(history.state?.mmtMobileSheet)history.back();}
  function openSheet(){note.textContent='';if(sheet.open)return;try{sheet.showModal();}catch(_){sheet.setAttribute('open','');}history.pushState({...history.state,mmtMobileSheet:true},'',location.href);}
  sheet.addEventListener('cancel',e=>{e.preventDefault();closeSheet();});
  window.addEventListener('popstate',()=>{if(sheet.open){try{sheet.close();}catch(_){sheet.removeAttribute('open');}}});
  window.addEventListener('beforeunload',e=>{if(activeWork()){e.preventDefault();e.returnValue='';}});
  close.addEventListener('click',closeSheet);sheet.addEventListener('click',e=>{const b=e.target.closest('button[data-href]');if(b)go(b.dataset.href);else if(e.target===sheet)closeSheet();});
  function tasks(){const task=document.querySelector('.task-panel');if(task){task.id='mobile-tasks';if(location.hash==='#mobile-tasks')task.scrollIntoView({block:'start'});return true;}return false;}
  if(location.hash==='#mobile-tasks'&&!tasks()){const observer=new MutationObserver(()=>{if(tasks())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000);}
  nav.addEventListener('click',e=>{const tab=e.target.closest('button[data-tab]')?.dataset.tab;if(!tab)return;
    if(tab==='all'){openSheet();return;}
    if(tab==='bell'){const bell=document.querySelector('.mmt-notice-bell');if(bell)bell.click();else window.alert('알림을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.');return;}
    if(tab==='task'){if(path==='index.html'&&tasks()){document.getElementById('mobile-tasks').scrollIntoView({block:'start',behavior:'smooth'});return;}go('index.html#mobile-tasks');return;}
    if(tab==='home'){if(path==='index.html'){window.scrollTo({top:0,behavior:'smooth'});return;}go('index.html');return;}
    if(tab==='ledger'){if(path==='quick.html'){window.scrollTo({top:0,behavior:'smooth'});return;}go('quick.html');}
  });
  window.MumutoriMobileNav=Object.freeze({hasActiveWork:activeWork});
})();
