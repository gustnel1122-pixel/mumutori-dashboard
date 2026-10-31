import {current,onAuth,signIn} from './fbauth.js?v=access20261028';

const mount=document.getElementById('store-preparation');
const refPath='productCatalogPrivate/storePreparation';
let ref=null,listener=null,session=0,activeUid='',snapshot=null;
const expanded=new Set();
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
function reset(){if(ref&&listener)ref.off('value',listener);ref=null;listener=null;snapshot=null;activeUid='';mount.replaceChildren()}
function message(text,login=false){reset();const p=E('p',text,'prep-message');mount.append(p);if(login){const b=E('button','Google 로그인','prep-button');b.type='button';b.onclick=async()=>{b.disabled=true;try{await signIn()}catch(_){p.textContent='로그인을 완료하지 못했어요. 다시 시도해 주세요.';b.disabled=false}};mount.append(b)}}
function textBlock(parent,value,cls){if(Array.isArray(value)){for(const x of value)textBlock(parent,x,cls)}else if(value!==undefined&&value!==null&&String(value).trim())parent.append(E('p',value,cls))}
function save(updates){const version=session,uid=activeUid;if(!ref||!uid)return;ref.update(updates).catch(()=>{if(version===session&&current()?.uid===uid){const status=mount.querySelector('[data-status]');if(status)status.textContent='저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.'}})}
function section(title){const el=E('section');el.append(E('h3',title));return el}
function render(data){
 const src=data?.source,shared=data?.state||{};if(!src||!Array.isArray(src.steps)||src.steps.length!==26){mount.replaceChildren(E('p','준비 순서 자료를 확인하고 있어요.','prep-message'));return}
 snapshot=data;const body=E('div'),tools=E('div',undefined,'prep-tools'),status=E('p','두 분이 함께 보는 준비 순서예요.','prep-muted');status.dataset.status='';
 const title=E('h2','준비 순서'),count=E('p',undefined,'prep-muted');let finished=0;
 for(const step of src.steps)if(step.items.every(item=>shared.checks?.[item[0]]===true))finished++;
 count.textContent=`${finished} / 26 완료`;
 const input=E('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 const importButton=E('button','기록 불러오기','prep-button');importButton.type='button';importButton.onclick=()=>input.click();
 input.onchange=async()=>{try{const f=input.files?.[0];if(!f)return;if(f.size>1000000)throw Error();const d=JSON.parse(await f.text());if(d.project!=='mumutori-preparation'||d.version!==1||!d.states||typeof d.states!=='object'||Array.isArray(d.states))throw Error();const ids=[...src.steps.flatMap(s=>s.items.map(x=>x[0])),...src.later.map(x=>x[0])];if(!confirm('불러온 기록으로 현재 체크 상태를 바꿀까요?'))return;const changes={};for(const id of ids)changes['state/checks/'+id]=d.states[id]==='완료';save(changes);status.textContent='기록을 저장하고 있어요.'}catch(_){status.textContent='다희 님 준비 순서에서 저장한 기록 파일을 골라 주세요.'}finally{input.value=''}};
 tools.append(importButton,input);body.append(title,status,count,tools);
 const warning=E('p','오픈일과 중앙 테이블 크기는 기존 기록과 달라 확인 필요예요. 아래 원문과 기존 기록은 그대로 두었습니다.','prep-warning');body.append(warning);
 const list=E('div',undefined,'prep-list');
 src.steps.forEach((step,index)=>{const details=E('details',undefined,'prep-step');details.open=expanded.has(index);details.ontoggle=()=>{if(details.open)expanded.add(index);else expanded.delete(index)};
  const summary=E('summary'),num=E('span',String(index+1).padStart(2,'0'),'prep-num'),name=E('span',step.title,'prep-step-title'),check=E('input');check.type='checkbox';check.checked=step.items.every(item=>shared.checks?.[item[0]]===true);check.setAttribute('aria-label',`${index+1}번 ${step.title} 전체 완료`);check.onclick=e=>e.stopPropagation();check.onchange=()=>{const update={};for(const item of step.items)update['state/checks/'+item[0]]=check.checked;save(update)};summary.append(num,name,E('span',shared.owners?.[index]||step.owner||'확인 필요','prep-owner-chip'),check,E('span','⌄','prep-plus'));details.append(summary);
  const inner=E('div',undefined,'prep-body'),ownerRow=E('div',undefined,'prep-owner-row'),ownerLabel=E('label','누가 할지'),select=E('select',undefined,'prep-owner');
  const selected=shared.owners?.[index]||step.owner||'확인 필요';for(const v of [...new Set([step.owner,selected,'사장님','다희','함께','확인 필요'].filter(Boolean))]){const opt=E('option',v);opt.value=v;select.append(opt)}select.value=selected;select.setAttribute('aria-label',`${index+1}번 담당`);select.onchange=()=>save({['state/owners/'+index]:select.value});ownerRow.append(ownerLabel,select);inner.append(ownerRow);
  for(const item of step.items){const row=E('label'),box=E('input');box.type='checkbox';box.checked=shared.checks?.[item[0]]===true;box.onchange=()=>save({['state/checks/'+item[0]]:box.checked});const content=E('span');content.append(E('b',item[1]));if(item[2])content.append(E('span',item[2],'prep-detail'));row.append(box,content);inner.append(row)}
  if(step.budget&&src.budget){const b=E('div',undefined,'prep-budget');b.append(E('b',src.budget.title),E('p',src.budget.description));const table=E('table'),tbody=E('tbody');for(const row of src.budget.rows){const tr=E('tr');tr.append(E('td',row[1]),E('td',`${row[2]}만원`),E('td',row[3]));tbody.append(tr)}table.append(tbody);b.append(table,E('small',src.budget.foot));inner.append(b)}
  details.append(inner);list.append(details)});body.append(list);
 const corners=section('코너 이름'),cornerList=E('div',undefined,'prep-corners');for(const row of src.corners||[]){const el=E('div',undefined,'prep-corner');el.append(E('b',row[0]),E('p',row[1]));cornerList.append(el)}corners.append(cornerList);body.append(corners);
 const later=section('오픈 후 천천히 추가할 것');for(const item of src.later||[]){const label=E('label'),box=E('input');box.type='checkbox';box.checked=shared.checks?.[item[0]]===true;box.onchange=()=>save({['state/checks/'+item[0]]:box.checked});const content=E('span');content.append(E('b',item[1]),E('span',item[2],'prep-detail'));label.append(box,content);later.append(label)}body.append(later);
 const info=E('details');info.append(E('summary','매장 정보'));for(const text of src.info||[])info.append(E('p',text,'prep-muted'));for(const item of src.sections||[]){const part=E('section');part.append(E('h4',item.title));for(const key of ['sub','caption','facts','dims','notice'])textBlock(part,item[key],'prep-muted');info.append(part)}body.append(info);
 mount.replaceChildren(body);
}
function connect(user){const version=++session;reset();if(!user?.uid){message('사장님 또는 다희 님 계정으로 로그인하면 준비 순서와 예산 메모를 볼 수 있어요.',true);return}activeUid=user.uid;mount.append(E('p','준비 순서를 불러오고 있어요.','prep-message'));
 try{ref=window.firebase.database().ref(refPath);listener=shot=>{if(version!==session||current()?.uid!==user.uid)return;render(shot.val())};ref.on('value',listener,()=>{if(version===session)message('준비 순서를 볼 수 없어요. 계정과 연결을 확인해 주세요.')})}catch(_){if(version===session)message('연결을 확인한 뒤 다시 불러와 주세요.')}
}
onAuth(connect);
