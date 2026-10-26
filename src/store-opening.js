const {PROJECTS,PROJECT_UPDATED_AT}=await import(`./project-data.js?v=${document.body.dataset.build}`);
const data=PROJECTS.find(p=>p.id==='offline');
if(data){const list=document.getElementById('store-status');list.replaceChildren(...data.status.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));document.getElementById('store-next').textContent=data.next;document.getElementById('store-reviewed').textContent=PROJECT_UPDATED_AT+' 기준';}
