// The organization data is fetched only after authentication. No organizational
// content or owner identity is bundled into the publicly served application.
export function mountOrgchart(host){
  let closed=false,epoch=0,unsubscribe=()=>{},abort=null,selected=null,lastFocus=null,data=null,nodes=null,disposeMap=()=>{};
  const $=(s,root=host)=>root.querySelector(s);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
  const active=version=>!closed&&host.isConnected&&epoch===version;
  const clean=()=>{if(abort)abort.abort();abort=null;disposeMap();disposeMap=()=>{};data=null;nodes=null;selected=null;host.replaceChildren();};
  const message=(text,retry,label='다시 불러오기')=>{
    host.replaceChildren();const p=el('p','orgx-message',text);p.setAttribute('role','status');host.append(p);
    if(retry){const b=el('button','orgx-retry',label);b.type='button';b.onclick=retry;host.append(b);}
  };
  function validated(x){
    if(!x||!Array.isArray(x.groups)||!Array.isArray(x.nodes)||!Array.isArray(x.edges)||x.groups.length!==7||x.nodes.length>200||x.edges.length>1000)throw Error('format');
    const ids=new Set(),groups=new Set();
    for(const g of x.groups){if(!g||typeof g.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(g.id)||typeof g.label!=='string'||g.label.length>100||groups.has(g.id))throw Error('format');groups.add(g.id);}
    for(const n of x.nodes){if(!n||typeof n.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(n.id)||ids.has(n.id)||!groups.has(n.group)||typeof n.label!=='string'||n.label.length>100||!Array.isArray(n.steps)||n.steps.length!==3||n.steps.some(s=>typeof s!=='string'||s.length>300))throw Error('format');for(const k of ['description','requestedBy','result','status','engine'])if(n[k]!=null&&(typeof n[k]!=='string'||n[k].length>500))throw Error('format');ids.add(n.id);}
    for(const edge of x.edges)if(!edge||!ids.has(edge.from)||!ids.has(edge.to))throw Error('format');
    return x;
  }
  function renderMap(){
    host.replaceChildren();nodes=new Map(data.nodes.map(n=>[n.id,n]));
    const layout=el('div','orgx-layout'),map=el('div','orgx-map'),columns=el('div','orgx-columns'),desktop=el('aside','orgx-desktop-detail'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('orgx-lines');svg.setAttribute('aria-hidden','true');map.append(svg,columns);layout.append(map,desktop);
    const sheet=el('dialog','orgx-sheet');sheet.setAttribute('aria-label','업무 설명');const grab=el('div','orgx-grab'),mobile=el('div','orgx-mobile-detail');sheet.append(grab,mobile);host.append(layout,sheet);
    const related=id=>[...new Set(data.edges.filter(e=>e.from===id||e.to===id).map(e=>e.from===id?e.to:e.from))].filter(x=>nodes.has(x));
    function detail(id,mob){
      const n=nodes.get(id),box=el('div','orgx-detail');if(!n)return box;
      if(mob){const close=el('button','orgx-close','×');close.type='button';close.setAttribute('aria-label','설명 닫기');close.onclick=closeSheet;box.append(close);}
      box.append(el('div','orgx-tag',data.groups.find(g=>g.id===n.group)?.label||''),el('h3','',n.label),el('p','orgx-subtitle',n.description||''));
      if(n.status&&n.group!=='people'&&n.group!=='drive')box.append(el('span','orgx-status',n.status));
      box.append(el('h4','','이 업무는 이렇게 진행돼요'));const ol=el('ol');n.steps.forEach((step,i)=>{const li=el('li');li.append(el('span','',String(i+1)),document.createTextNode(step));ol.append(li);});box.append(ol,el('h4','','누가 시키고 어디에 남나요?'));
      const dl=el('dl');for(const [k,v] of [['지시',n.requestedBy||'확인 필요'],['결과',n.result||'확인 필요'],['엔진·모델',n.engine||'확인 필요']]){const row=el('div');row.append(el('dt','',k),el('dd','',v));dl.append(row);}box.append(dl,el('h4','','이어진 항목'));
      const links=el('div','orgx-related');for(const other of related(id)){const b=el('button','',nodes.get(other).label);b.type='button';b.onclick=()=>select(other);links.append(b);}if(!links.children.length)links.append(el('p','orgx-subtitle','연결 확인 필요'));box.append(links);return box;
    }
    function update(){const hi=new Set(selected?[selected,...related(selected)]:[]);for(const b of columns.querySelectorAll('.orgx-node')){const id=b.dataset.id;b.classList.toggle('is-selected',id===selected);b.classList.toggle('is-related',!!selected&&id!==selected&&hi.has(id));b.classList.toggle('is-dim',!!selected&&!hi.has(id));b.setAttribute('aria-pressed',String(id===selected));}for(const p of svg.querySelectorAll('path')){const on=!!selected&&(p.dataset.from===selected||p.dataset.to===selected);p.classList.toggle('is-highlight',on);p.classList.toggle('is-dim',!!selected&&!on);}desktop.replaceChildren(detail(selected,false));mobile.replaceChildren(detail(selected,true));}
    function select(id){if(!nodes.has(id))return;selected=id;update();if(matchMedia('(max-width:720px)').matches&&!sheet.open){lastFocus=document.activeElement;try{sheet.showModal();}catch(_){sheet.setAttribute('open','');}}}
    function closeSheet(){try{sheet.close();}catch(_){sheet.removeAttribute('open');}lastFocus?.focus?.();}
    sheet.addEventListener('close',()=>lastFocus?.focus?.());sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet();});
    for(const [i,g] of data.groups.entries()){const sec=el('section','orgx-group'),head=el('h3','orgx-group-head');head.append(el('span','',i+1),document.createTextNode(g.label));sec.append(head);const items=el('div','orgx-items');for(const n of data.nodes.filter(n=>n.group===g.id)){const b=el('button','orgx-node');b.type='button';b.dataset.id=n.id;b.setAttribute('aria-pressed','false');b.append(el('strong','',n.label));if(n.status&&n.group!=='people'&&n.group!=='drive')b.append(el('small','',n.status));b.onclick=()=>select(n.id);items.append(b);}sec.append(items);columns.append(sec);}
    desktop.append(el('p','orgx-empty','항목을 누르면 설명과 연결된 업무가 보여요.'));
    function draw(){if(!host.isConnected||matchMedia('(max-width:720px)').matches)return;const r=map.getBoundingClientRect();svg.setAttribute('width',String(map.scrollWidth));svg.setAttribute('height',String(map.scrollHeight));svg.replaceChildren();for(const e of data.edges){const a=columns.querySelector(`[data-id="${CSS.escape(e.from)}"]`),b=columns.querySelector(`[data-id="${CSS.escape(e.to)}"]`);if(!a||!b)continue;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),x1=x.right-r.left+map.scrollLeft,y1=x.top+x.height/2-r.top+map.scrollTop,x2=y.left-r.left+map.scrollLeft,y2=y.top+y.height/2-r.top+map.scrollTop,mid=(x1+x2)/2;const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);p.classList.add('orgx-connector');p.dataset.from=e.from;p.dataset.to=e.to;svg.append(p);}if(selected)update();}
    window.addEventListener('resize',draw);map.addEventListener('scroll',draw);requestAnimationFrame(draw);disposeMap=()=>{window.removeEventListener('resize',draw);map.removeEventListener('scroll',draw);if(sheet.open)closeSheet();};
  }
  async function begin(auth,user){
    const version=++epoch;clean();
    if(!user?.uid){message('로그인하면 사장님 전용 조직도를 볼 수 있어요.',()=>{try{Promise.resolve(auth.signIn()).catch(()=>message('로그인 연결을 확인해 주세요.',()=>begin(auth,auth.current())));}catch(_){message('로그인 연결을 확인해 주세요.',()=>begin(auth,auth.current()));}},'로그인');return;}
    message('조직도를 불러오는 중이에요.');const controller=new AbortController();abort=controller;let timer=setTimeout(()=>controller.abort(),10000);
    try{const url=await auth.dbUrl('orgChartPrivate/data');if(!active(version)||auth.current()?.uid!==user.uid)return;const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});if(!active(version)||auth.current()?.uid!==user.uid)return;if(response.status===401||response.status===403){message('사장님 계정으로만 조직도를 볼 수 있어요.');return;}if(!response.ok)throw Error('load');const result=validated(await response.json());if(!active(version)||auth.current()?.uid!==user.uid)return;data=result;renderMap();}
    catch(_){if(active(version))message('조직도를 불러오지 못했어요. 연결을 확인해 주세요.',()=>begin(auth,auth.current()));}
    finally{clearTimeout(timer);if(abort===controller)abort=null;}
  }
  if(!document.querySelector('link[data-orgx-style]')){const link=el('link');link.rel='stylesheet';link.dataset.orgxStyle='';link.href='src/orgchart-private.css?v='+encodeURIComponent(document.body.dataset.build||'');document.head.append(link);}
  import('./fbauth.js?v=access20261028').then(auth=>{if(closed||!host.isConnected)return;unsubscribe=auth.onAuth(user=>begin(auth,user));}).catch(()=>{if(!closed&&host.isConnected)message('로그인 연결을 확인해 주세요.');});
  return ()=>{closed=true;++epoch;unsubscribe();clean();};
}
