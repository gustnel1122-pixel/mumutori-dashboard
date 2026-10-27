// One public feed for the graph, project cards and legacy-link resolution.
export const PROJECT_IDS=['offline','letter','mall','smartstore','coupang','product','marketing','finance','brand','support','ops'];
export function validateProgress(data){
  if(!data||data.schemaVersion!==1||!Array.isArray(data.projects)||data.projects.length!==PROJECT_IDS.length||!Array.isArray(data.milestones)||!Array.isArray(data.agents))throw Error('큰 프로젝트 자료 형식 확인 필요');
  const ids=new Set(),members=new Set();
  for(const p of data.projects){
    if(ids.has(p.id)||!PROJECT_IDS.includes(p.id)||!Number.isInteger(p.stage)||p.stage<0||p.stage>5||!Array.isArray(p.stages)||p.stages.length!==5||!['active','waiting','paused','unknown','done'].includes(p.state)||!Array.isArray(p.owners)||!Array.isArray(p.includes)||!p.includes.length||typeof p.includesLabel!=='string'||!p.includesLabel)throw Error('큰 프로젝트 단계 형식 확인 필요');
    ids.add(p.id);
    for(const id of p.includes){if(members.has(id)||id==='buttermilk')throw Error('포함 항목 중복/제외 항목 확인 필요');members.add(id);}
  }
  return data;
}
let feed=null;
try{
  const response=await fetch(new URL('./project-progress.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('자료 읽기 실패');
  feed=validateProgress(await response.json());
}catch{/* Keep the rest of the operations home available. */}
export const PROJECT_FEED=feed;
export function resolveProjectId(id){
  if(id==='characters'||id==='buttermilk')return 'brand';
  return feed?.projects.find(p=>p.id===id||p.includes.includes(id))?.id||null;
}
