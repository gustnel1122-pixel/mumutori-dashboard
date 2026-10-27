// Public status only. Private ledger, Drive IDs and customer records never enter this feed.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={active:'진행',waiting:'대기',paused:'멈춤',unknown:'확인 필요',done:'완료'};
export const koreaDate=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function ageDays(last,today=koreaDate()){
  if(!last || !/^\d{4}-\d{2}-\d{2}$/.test(last))return null;
  return Math.max(0,Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(last+'T00:00:00Z'))/86400000));
}
export function needsAttention(p,today,threshold=7){
  const age=ageDays(p.lastActivity,today);
  return p.state!=='done' && (age===null || age>=threshold || p.state==='unknown');
}
const {PROJECT_FEED:data}=await import(`./project-feed.js?v=${document.body.dataset.build}`);
function row(p,today,threshold){
  const age=ageDays(p.lastActivity,today),stale=needsAttention(p,today,threshold);
  const current=p.stage===5?'5단계 완료':p.stages[p.stage]+' 단계';
  const ageLabel=age===null?'진행일 미확인':age>=threshold?`${age}일 새 움직임 없음`:`최근 ${p.lastActivity.slice(5).replace('-','/')}`;
  return `<article class="pg-row${stale?' pg-stale':''}" data-progress-row data-project="${esc(p.id)}" data-state="${esc(p.state)}" data-attention="${stale}" data-search="${esc([p.name,p.includesLabel,p.status,p.next,...p.owners].join(' ').toLocaleLowerCase())}"><div class="pg-row-main"><div class="pg-project"><b>${esc(p.name)}</b><small class="pg-includes">포함: ${esc(p.includesLabel)}</small><span><i class="pg-state pg-${esc(p.state)}">${esc(labels[p.state])}</i><small${stale?' class="pg-age-alert"':''}>${esc(ageLabel)}</small></span></div><div class="pg-pipeline" role="img" aria-label="${esc(p.name+' · '+p.stage+' / 5개 관문 완료 · '+current)}">${p.stages.map((s,i)=>`<span class="pg-step${i<p.stage?' pg-done':i===p.stage?' pg-current':''}"><i aria-hidden="true">${i<p.stage?'✓':i+1}</i><span>${esc(s)}</span></span>`).join('')}</div><div class="pg-now"><span>${esc(p.status)}</span><small>다음 · ${esc(p.next)}</small></div></div></article>`;
}

export function learningCounts(records,today=koreaDate()){
  const inside=records.filter(r=>r.date<=today&&ageDays(r.date,today)<7);
  return ['completed','rework','correction'].map(kind=>{
    const keys=inside.filter(r=>r.kind===kind).map(r=>kind==='correction'?r.eventId:r.taskId);
    return keys.length?new Set(keys).size:null;
  });
}
export function renderLearning(learning,today=koreaDate()){
  if(!learning)return '';
  const start=new Date(Date.parse(today+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
  const stale=ageDays(learning.checkedAt.slice(0,10),today)>1;
  return `<section class="pg-learning" id="learning" aria-labelledby="learning-title"><header><h3 id="learning-title">담당별 지난 7일</h3><small>${esc(start.slice(5))} ~ ${esc(today.slice(5))} · 한국 시간</small></header><table><caption class="sr-only">확인된 학습·결과 기록의 건수</caption><thead><tr><th scope="col">담당</th><th scope="col">끝낸 일</th><th scope="col">다시 한 일</th><th scope="col">사장님이<br>고친 횟수</th></tr></thead><tbody>${learning.roles.map(r=>`<tr data-learning-role="${esc(r.id)}"><th scope="row">${esc(r.name)}</th>${learningCounts(r.records,today).map(n=>`<td>${n===null?'-':n}</td>`).join('')}</tr>`).join('')}</tbody></table><p>${esc(learning.basis)}</p><small>기록 대조 ${esc(learning.checkedAt.slice(5,16).replace('T',' '))} KST · 02:10·13:10 갱신 예약${stale?' · 최근 기록 재확인 필요':''}</small></section>`;
}

export function renderProgress(){
  if(!data)return `<section class="pg-board" id="progress" aria-label="지금 하는 일"><h2>지금 하는 일</h2><p role="status">프로젝트 자료를 불러오지 못했어요. 연결 후 새로고침해 주세요. 아래 운영 링크는 이용할 수 있어요.</p></section>`;
  const today=koreaDate(),all=data.projects,attention=all.filter(p=>needsAttention(p,today,data.staleAfterDays)).length;
  const openingLabel=String(Number(data.openingDate.slice(5,7)))+'/'+Number(data.openingDate.slice(8));
  const dday=Math.ceil((Date.parse(data.openingDate+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  const checkedAge=ageDays(data.checkedAt,today),snapshotStale=checkedAge===null||checkedAge>1;
  return `<section class="pg-board" id="progress" aria-labelledby="pg-title"><header class="pg-heading"><div><span class="pg-eyebrow">PROJECT OVERVIEW</span><h2 id="pg-title">지금 하는 일<span>.</span></h2><p>큰 프로젝트별 단계와 다음 할 일을 한눈에 보세요.</p></div><div class="pg-updated"><time datetime="${esc(data.updatedAt)}">점검 ${esc(data.updatedAt.slice(5,16).replace('T',' '))} KST</time><span>${esc(data.automation.schedule)} 갱신 예약</span></div></header>${snapshotStale?`<p class="pg-snapshot-warning" role="status">${checkedAge??'?'}일 전 점검 자료예요. 자동 갱신 결과를 확인해 주세요.</p>`:''}<div class="pg-stats"><span><b>${all.length}</b>전체</span><span><b>${all.filter(p=>p.state==='active').length}</b>진행</span><span><b>${all.filter(p=>p.state==='waiting').length}</b>대기</span><span><b>${all.filter(p=>p.state==='paused').length}</b>멈춤</span><span class="pg-stat-alert"><b>${attention}</b>재확인</span><span class="pg-dday"><b>${dday>0?'D−'+dday:dday===0?'D-DAY':esc(openingLabel)}</b>${dday<0?'오픈 여부 확인':'오픈 목표'}</span></div><div class="pg-milestone-head"><b>${esc(openingLabel)}까지의 일정</b><small>● 확정 기준 · ○ 제안 · × 이전 일정</small></div><ol class="pg-timeline">${data.milestones.map(m=>`<li class="${m.kind==='confirmed'?'pg-confirmed ':m.kind==='previous'?'pg-previous ':''}${m.date===today?'pg-today ':''}${m.date<today?'pg-past':''}"><time datetime="${esc(m.date)}">${esc(m.date.slice(5).replace('-','/'))}</time><i aria-hidden="true"></i><b>${esc(m.label)}</b><small>${m.kind==='confirmed'?'확정 기준':m.kind==='previous'?'이전 일정':'제안'}</small></li>`).join('')}</ol><div class="pg-toolbar"><div role="group" aria-label="프로젝트 상태 필터">${[['all','전체'],['attention','재확인'],['active','진행'],['waiting','대기'],['paused','멈춤']].map(([id,label])=>`<button type="button" data-pg-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><label class="pg-search"><span class="sr-only">프로젝트 검색</span><input type="search" data-pg-search placeholder="프로젝트·담당 검색" aria-label="프로젝트·담당 검색"></label></div><p class="pg-legend">✓ 완료한 관문 · 테두리 칸은 현재 단계 · <span>빨간 표시 = ${data.staleAfterDays}일 이상 새 움직임 없음 / 진행일 미확인 / 상태 확인 필요</span></p><p class="pg-result-count" data-pg-count role="status" aria-live="polite">${all.length}개 프로젝트</p><div class="pg-rows">${all.map(p=>row(p,today,data.staleAfterDays)).join('')}</div><p class="pg-empty" data-pg-empty hidden>해당하는 프로젝트가 없어요.</p>${renderLearning(data.learning,today)}<footer class="pg-footer"><div class="pg-agents">${data.agents.map(a=>`<span><i class="pg-dot-${esc(a.tone)}"></i><b>${esc(a.name)}</b>${esc(a.doing)}</span>`).join('')}</div><p>${esc(data.note)}</p><p class="pg-automation">${esc(data.automation.status)}${data.automation.lastVerifiedRun?' · 마지막 실행 확인 '+esc(data.automation.lastVerifiedRun):''}</p></footer></section>`;
}
function filterBoard(board){
  const selected=board.querySelector('[data-pg-filter][aria-pressed="true"]')?.dataset.pgFilter||'all';
  const search=(board.querySelector('[data-pg-search]')?.value||'').trim().toLocaleLowerCase();
  let count=0;
  board.querySelectorAll('[data-progress-row]').forEach(row=>{
    const match=(selected==='all'||(selected==='attention'?row.dataset.attention==='true':row.dataset.state===selected))&&row.dataset.search.includes(search);
    row.hidden=!match;if(match)count++;
  });
  board.querySelector('[data-pg-empty]').hidden=count>0;
  board.querySelector('[data-pg-count]').textContent=`${count}개 프로젝트`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-pg-filter]');if(!button)return;
  const board=button.closest('.pg-board');
  board.querySelectorAll('[data-pg-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  filterBoard(board);
});
document.addEventListener('input',event=>{if(event.target.matches('[data-pg-search]'))filterBoard(event.target.closest('.pg-board'));});
