const {PROJECTS,PROJECT_UPDATED_AT}=await import(`./project-data.js?v=${document.body.dataset.build}`);
const data=PROJECTS.find(p=>p.id==='offline');
if(data){const list=document.getElementById('store-status');list.replaceChildren(...data.status.map(s=>{const li=document.createElement('li');li.textContent=/11\/10|11월 10/.test(s)?'확인 필요 · '+s:s;return li;}));document.getElementById('store-next').textContent=data.next;document.getElementById('store-reviewed').textContent=PROJECT_UPDATED_AT+' 기준';}
