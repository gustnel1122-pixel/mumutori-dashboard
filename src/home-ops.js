// 운영홈 작은 카드 — '총괄 운영실 — 실행 중 N · 사장님 OK 기다림 N · 막힘 N'(20261117_0004, 사장님 지시).
// hub/chongwalOps를 읽기만 해서 #home-ops-line에 넣고 누르면 agents.html#ops-room으로 보낸다.
// home-fin.js와 같은 자리에서 같은 방식(로그인 뒤 읽기 · ERP가 홈을 다시 그릴 때마다 다시 넣기)으로 돈다.
// 자료·검사 로직은 chongwal-ops.js 것을 그대로 가져다 쓴다(같은 기능 안 공유는 괜찮음 — agents-daily.js와는
// 여전히 공유하지 않는다는 2326·0004 원칙은 그대로).
import { onAuth, dbUrl } from './fbauth.js?v=access20261028';
import { validatedOps, countHomeStats } from './chongwal-ops.js?v=access20261028';

let view=null, signedIn=false;

function render(){
  const elLine=document.getElementById('home-ops-line');
  if(!elLine)return;
  if(view){
    if(elLine.dataset.live!==view.key)elLine.outerHTML=view.html;
  }else{
    const key=signedIn?'empty':'login-needed';
    if(elLine.dataset.live!==key){
      elLine.dataset.live=key;
      elLine.innerHTML=`<span class="task-dept tone-green">운영실</span><b>총괄 운영실<small class="task-basis">${signedIn?'아직 자료가 없어요':'로그인하면 보여요'}</small></b><strong>보기<em>↗</em></strong>`;
    }
  }
}

async function load(){
  try{
    const url=await dbUrl('hub/chongwalOps');
    const r=await fetch(url,{method:'GET',cache:'no-store'});
    if(!r.ok){view=null;render();return;}
    const raw=await r.json();
    const data=validatedOps(raw);
    if(!data){view=null;render();return;}
    const c=countHomeStats(data);
    const key=[c.running,c.waitingOwnerOk,c.blocked].join('|');
    view={key,html:`<a class="task-link${c.blocked?' task-hot':''}" id="home-ops-line" data-live="${key}" href="agents.html#ops-room"><span class="task-dept tone-green">운영실</span><b>총괄 운영실<small class="task-basis">실행 전략 · 자리별 일 흐름</small></b><strong>실행 중 ${c.running}<em>· OK 기다림 ${c.waitingOwnerOk} · 막힘 ${c.blocked}</em></strong><span class="task-arrow">↗</span></a>`};
    render();
  }catch(_){view=null;render();}
}

onAuth(user=>{signedIn=!!user;if(user)load();else{view=null;render();}});
new MutationObserver(render).observe(document.getElementById('root'), { childList: true, subtree: true });
render();
