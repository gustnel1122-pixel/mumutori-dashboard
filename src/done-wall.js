// 쌓이는 판(20261117_1030 3번) — 총괄 운영실 맨 아래. 사장님 피드백(11/17): "매일 새로운 걸 갱신해서
// 보는 것도 좋은데 쌓여가는 느낌이 없어" — 11/16부터 줄지 않는 숫자(결과 폴더 파일을 세어서) + 끝난 일을
// 날짜순으로 쌓는 벽. 자료: _tools\done_wall_sync.py → hub/doneWall/counts·hub/doneWall/wall.
// chongwal-ops.js·revenue-plan.js·workroom.js와도 분리된 자료·코드 경로(반복 원칙).
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}

const STR_MAX=200,SHORT_MAX=60;
function str(v,max){if(typeof v!=='string')return '';return v.length>max?v.slice(0,max):v;}
function isDataUri(s){return typeof s==='string'&&s.length<200_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);}

const CATEGORY_ORDER=['doneJobs','detailPages','onlineListed','seoFixed','posters','goodsDesigns','emoticons'];

export function validatedCounts(x){
  if(x==null)return null;
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const counts={};
  for(const key of CATEGORY_ORDER){
    const c=x.counts?.[key];
    counts[key]={jobs:Number.isFinite(c?.jobs)?c.jobs:0,items:Number.isFinite(c?.items)?c.items:0};
  }
  const daily=Array.isArray(x.daily)?x.daily.slice(-14).map(d=>({
    date:str(d?.date,20),count:Number.isFinite(d?.count)?d.count:0,
  })):[];
  const labels={};
  for(const key of CATEGORY_ORDER)labels[key]=str(x.labels?.[key],SHORT_MAX)||key;
  return {counts,daily,labels,since:str(x.since,20)};
}

export function validatedWall(x){
  if(x==null)return null;
  if(typeof x!=='object'||Array.isArray(x))throw Error('format');
  const entries=Array.isArray(x.entries)?x.entries.slice(-300).map(e=>{
    if(!e||typeof e!=='object')throw Error('format');
    const out={job:str(e.job,80),title:str(e.title,STR_MAX),sent:str(e.sent,30),result:str(e.result,400)};
    if(e.image!=null){if(!isDataUri(e.image))throw Error('format');out.image=e.image;}
    return out;
  }):[];
  return {entries};
}

function statTile(label,count,daily){
  const tile=el('div','dw-tile');
  tile.append(el('strong','dw-tile-num',String(count.items)));
  tile.append(el('span','dw-tile-label',label));
  return tile;
}

function dailyBars(daily){
  const wrap=el('div','dw-bars');
  const max=Math.max(1,...daily.map(d=>d.count));
  for(const d of daily){
    const col=el('div','dw-bar-col');
    const bar=el('div','dw-bar');
    bar.style.height=Math.max(2,Math.round(d.count/max*36))+'px';
    col.append(bar);
    const day=d.date?d.date.slice(5).replace('-','/'):'';
    col.append(el('small','dw-bar-day',day));
    col.title=`${d.date}: ${d.count}건`;
    wrap.append(col);
  }
  return wrap;
}

function wallRow(entry){
  const row=el('div','dw-wall-row');
  if(entry.image){
    const img=document.createElement('img');img.className='dw-wall-img';img.src=entry.image;img.alt='';img.loading='lazy';
    row.append(img);
  }
  const body=el('div','dw-wall-body');
  body.append(el('p','dw-wall-title',entry.title||entry.job));
  if(entry.result)body.append(el('p','note',entry.result));
  if(entry.sent)body.append(el('small','sub',entry.sent));
  row.append(body);
  return row;
}

function render(host,state){
  host.replaceChildren();
  if(state.loading){host.append(el('p','note',state.loading));return;}
  if(state.error){host.append(el('p','note error',state.error));return;}
  const {counts,wall}=state;
  if(!counts&&!wall){host.append(el('p','note','아직 쌓인 자료가 없어요.'));return;}
  if(counts){
    if(counts.since)host.append(el('p','note',`${counts.since}부터 줄지 않는 숫자예요.`));
    const grid=el('div','dw-tiles');
    for(const key of CATEGORY_ORDER)grid.append(statTile(counts.labels[key],counts.counts[key],counts.daily));
    host.append(grid);
    if(counts.daily.length){
      host.append(el('p','ops-block-title','지난 14일 전체 일감 활동'));
      host.append(dailyBars(counts.daily));
    }
  }
  if(wall&&wall.entries.length){
    host.append(el('h4','ops-block-title','끝난 일 벽'));
    const list=el('div','dw-wall-list');
    for(const entry of wall.entries.slice().reverse())list.append(wallRow(entry));
    host.append(list);
  }
}

export function mountDoneWall(host){
  let closed=false,epoch=0,currentAuth=null,currentUser=null,unsubscribe=()=>{};
  const active=v=>!closed&&host.isConnected&&epoch===v;
  const state={loading:'불러오는 중이에요.',error:null,counts:null,wall:null};
  function draw(){render(host,state);}
  async function load(){
    const version=++epoch;
    if(!currentUser?.uid){state.loading='로그인하면 보여요.';state.error=null;draw();return;}
    state.loading='불러오는 중이에요.';state.error=null;draw();
    try{
      const [cUrl,wUrl]=await Promise.all([currentAuth.dbUrl('hub/doneWall/counts'),currentAuth.dbUrl('hub/doneWall/wall')]);
      const [cr,wr]=await Promise.all([fetch(cUrl,{cache:'no-store'}),fetch(wUrl,{cache:'no-store'})]);
      if(!active(version))return;
      if(cr.status===401||cr.status===403||wr.status===401||wr.status===403){state.loading=null;state.error='이 계정의 접근 권한을 확인해 주세요.';draw();return;}
      if(!cr.ok||!wr.ok)throw Error('load');
      state.counts=validatedCounts(await cr.json());
      state.wall=validatedWall(await wr.json());
      state.loading=null;state.error=null;
      draw();
    }catch(_){if(active(version)){state.loading=null;state.error='불러오지 못했어요. 연결을 확인해 주세요.';draw();}}
  }
  import('./fbauth.js?v=access20261028').then(auth=>{
    if(closed||!host.isConnected)return;
    unsubscribe=auth.onAuth(user=>{currentAuth=auth;currentUser=user;load();});
  }).catch(()=>{if(!closed&&host.isConnected){state.loading=null;state.error='로그인 연결을 확인해 주세요.';draw();}});
  return ()=>{closed=true;++epoch;unsubscribe();host.replaceChildren();};
}
