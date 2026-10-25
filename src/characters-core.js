// 캐릭터 만들기 화면의 자료 규칙 — 화면 코드와 떼어 둔 순수 계산(브라우저 없이도 같은 결과).
// 자료는 함께 보는 곳(src/characters-sync.js — 소싱 보드와 같은 방식)에 저장된다. toRemote/fromRemote 가 그 모양과 화면 모양을 오간다.
// STORAGE_KEY 는 2026-10-14 오전까지 쓰던 '이 브라우저에만 저장' 칸이다. 이제는 예전 내용을 올릴 때만 읽는다(지우지 않는다).
export const STORAGE_KEY='mumutori-character-board-v1';
export const MOVED_KEY=STORAGE_KEY+'-moved';
export const SCHEMA='mumutori-characters/1';
export const STATUS=[['todo','할 일'],['doing','작업 중'],['done','확정']];
// 캐릭터마다 만들어야 하는 그림 칸
export const GROUPS=[
  {id:'sheet',label:'기준 시트',hint:'같은 캐릭터를 네 방향에서 본 그림',slots:[['sheet-front','정면'],['sheet-34','비스듬히(3/4)'],['sheet-side','옆'],['sheet-back','뒤']]},
  {id:'face',label:'표정 6종',hint:'어떤 표정인지 옆 칸에 적어 주세요',slots:[1,2,3,4,5,6].map(n=>['face-'+n,'표정 '+n])},
  {id:'pose',label:'대표 포즈 3종',hint:'이 캐릭터다운 자세',slots:[1,2,3].map(n=>['pose-'+n,'포즈 '+n])},
  {id:'web',label:'투명 PNG(웹용)',hint:'배경이 없는 그림 — 홈페이지에 올릴 것',slots:[['web-3d','투명 PNG']]}   // 칸 id 'web-3d'는 저장된 자료와 맞추려고 그대로(10/25 2D 손그림으로 바뀜)
];
export const SLOTS=GROUPS.flatMap(g=>g.slots.map(([id,label])=>({id,label,group:g.id})));
const SLOT_IDS=SLOTS.map(s=>s.id);
// 처음 열면 보이는 캐릭터(이름·역할만 채워 둔다. 나머지는 만드는 분이 적는다)
const STARTERS=[['dotori','도토리','주인공'],['sunflower','해바라기씨','씨앗 친구'],['chickpea','병아리콩','씨앗 친구'],['pumpkin','호박씨','씨앗 친구'],['peanut','땅콩','씨앗 친구'],['seed','작은 씨앗','씨앗 친구']];
const LIMIT={name:30,role:40,trait:20,voice:600,likes:200,dislikes:200,colors:200,ratio:120,must:400,never:400,relations:600,memo:1000,link:500,note:60,by:30};
const THUMB_MAX=90000;   // 미리보기 한 장의 글자 수 한도(작게 줄인 그림만 받는다)
const THUMB_RE=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)?v.slice(0,24):'';

export function emptyCharacter(id,name='',role=''){
  return {id,name,role,traits:['','',''],voice:'',likes:'',dislikes:'',look:{colors:'',ratio:'',must:'',never:''},relations:'',memo:'',
    images:Object.fromEntries(SLOT_IDS.map(s=>[s,{status:'todo',link:'',note:'',thumb:''}])),cover:'web-3d',lock:null,log:[]};
}
export function defaultBoard(){return {schema:SCHEMA,savedAt:'',characters:STARTERS.map(([id,name,role])=>emptyCharacter(id,name,role))};}

// 저장된 자료·가져온 파일을 정해진 모양으로 맞춘다. 모르는 칸은 버리고, 길이는 자른다.
export function normalizeCharacter(raw,index=0){
  const r=obj(raw),id=/^[A-Za-z0-9_-]{1,40}$/.test(r.id)?r.id:'c'+(index+1);
  const c=emptyCharacter(id,str(r.name,LIMIT.name),str(r.role,LIMIT.role));
  const traits=r.traits&&typeof r.traits==='object'?r.traits:[];c.traits=[0,1,2].map(i=>str(traits[i],LIMIT.trait));
  for(const k of ['voice','likes','dislikes','relations','memo'])c[k]=str(r[k],LIMIT[k]);
  const look=obj(r.look);for(const k of ['colors','ratio','must','never'])c.look[k]=str(look[k],LIMIT[k]);
  const images=obj(r.images);
  for(const s of SLOT_IDS){const im=obj(images[s]),thumb=typeof im.thumb==='string'&&im.thumb.length<=THUMB_MAX&&THUMB_RE.test(im.thumb)?im.thumb:'';
    c.images[s]={status:STATUS.some(([k])=>k===im.status)?im.status:'todo',link:str(im.link,LIMIT.link),note:str(im.note,LIMIT.note),thumb};}
  c.cover=SLOT_IDS.includes(r.cover)?r.cover:'web-3d';
  const lock=obj(r.lock);c.lock=iso(lock.at)&&str(lock.by,LIMIT.by).trim()?{at:iso(lock.at),by:str(lock.by,LIMIT.by).trim()}:null;
  c.log=(Array.isArray(r.log)?r.log:Object.values(obj(r.log))).map(obj).filter(l=>['lock','unlock'].includes(l.action)&&iso(l.at)).slice(-20).map(l=>({action:l.action,at:iso(l.at),by:str(l.by,LIMIT.by)}));
  return c;
}
export function normalizeBoard(raw){
  const list=Array.isArray(obj(raw).characters)?raw.characters:null;
  if(!list)return defaultBoard();
  const seen=new Set(),characters=[];
  list.slice(0,60).forEach((r,i)=>{const c=normalizeCharacter(r,i);while(seen.has(c.id))c.id+='x';seen.add(c.id);characters.push(c);});
  return {schema:SCHEMA,savedAt:iso(obj(raw).savedAt).slice(0,16),characters};
}

export const isLocked=c=>!!c.lock;
// 확정하면 잠기는 것: 프로필 전체와 대표 그림 칸. 다른 그림 칸은 확정 뒤에도 이어서 채울 수 있다.
export const slotLocked=(c,slot)=>isLocked(c)&&c.cover===slot;
export function progress(c){
  const all=SLOT_IDS.length,done=SLOT_IDS.filter(s=>c.images[s].status==='done').length,doing=SLOT_IDS.filter(s=>c.images[s].status==='doing').length;
  return {all,done,doing};
}
// 확정 전에 꼭 있어야 하는 것(없으면 무엇이 빠졌는지 쉬운 말로 돌려준다)
export function missingForLock(c){
  const miss=[];
  if(!c.name.trim())miss.push('이름');
  if(!c.role.trim())miss.push('역할');
  const cover=c.images[c.cover];
  if(!cover.thumb&&!cover.link.trim())miss.push('대표 그림(미리보기를 올리거나 파일 위치를 적어 주세요)');
  return miss;
}
export function lockCharacter(c,by,now){
  const who=String(by||'').trim().slice(0,LIMIT.by);
  if(isLocked(c))throw Error('이미 확정된 캐릭터입니다.');
  if(!who)throw Error('확정하는 분의 이름을 적어 주세요.');
  const miss=missingForLock(c);if(miss.length)throw Error('확정하려면 먼저 채워 주세요: '+miss.join(', '));
  return {...c,lock:{at:now,by:who},log:[...c.log,{action:'lock',at:now,by:who}].slice(-20)};
}
export function unlockCharacter(c,by,now){
  if(!isLocked(c))throw Error('잠겨 있지 않은 캐릭터입니다.');
  return {...c,lock:null,log:[...c.log,{action:'unlock',at:now,by:String(by||'').trim().slice(0,LIMIT.by)}].slice(-20)};
}

// 확정된 캐릭터만 넘기는 파일(자사몰 목업 담당이 읽는다). 확정하지 않은 캐릭터와 작업 기록은 넣지 않는다.
export function exportConfirmed(board,now){
  return {schema:SCHEMA,kind:'confirmed',exportedAt:now,characters:board.characters.filter(isLocked).map(c=>({
    id:c.id,name:c.name,role:c.role,traits:c.traits.filter(Boolean),voice:c.voice,likes:c.likes,dislikes:c.dislikes,look:{...c.look},relations:c.relations,memo:c.memo,
    confirmedAt:c.lock.at,confirmedBy:c.lock.by,
    cover:{slot:c.cover,label:SLOTS.find(s=>s.id===c.cover).label,link:c.images[c.cover].link,thumb:c.images[c.cover].thumb},
    images:SLOTS.map(s=>({slot:s.id,label:s.label,note:c.images[s.id].note,status:c.images[s.id].status,link:c.images[s.id].link})).filter(i=>i.status!=='todo'||i.link)
  }))};
}
export function exportAll(board,now){return {schema:SCHEMA,kind:'backup',exportedAt:now,characters:board.characters};}
// 전체 저장 파일을 다시 읽는다. 모양이 다르면 통째로 거절한다(일부만 받지 않는다).
export function parseBackup(text){
  let data;try{data=JSON.parse(text);}catch(e){throw Error('파일을 읽지 못했습니다. 이 화면에서 받은 저장 파일이 맞는지 확인해 주세요.');}
  if(obj(data).schema!==SCHEMA||!Array.isArray(data.characters))throw Error('이 화면에서 받은 저장 파일이 아닙니다.');
  if(data.kind==='confirmed')throw Error("이 파일은 '확정 목록' 파일입니다. 가져오기에는 '전체 저장 파일'을 써 주세요.");
  if(!data.characters.length)throw Error('파일에 캐릭터가 하나도 없습니다.');
  return normalizeBoard(data);
}
// 함께 보는 곳의 모양: 캐릭터를 번호(id)로 찾는 묶음 + 순서(order). 한 사람이 한 칸을 고쳐도 다른 사람이 고친 칸을 덮어쓰지 않게 칸 단위로 쓴다.
export const remoteCharacter=(c,order)=>{const {id,...rest}=c;return {...rest,order};};
export function toRemote(board,now){return {schema:SCHEMA,savedAt:now,characters:Object.fromEntries(board.characters.map((c,i)=>[c.id,remoteCharacter(c,i)]))};}
export const hasRemote=tree=>!!(tree&&typeof tree==='object'&&tree.characters&&typeof tree.characters==='object'&&Object.keys(tree.characters).length);
export function fromRemote(tree){
  if(!hasRemote(tree))return defaultBoard();
  const list=Object.entries(tree.characters).filter(([,c])=>c&&typeof c==='object').map(([id,c])=>({...c,id}))
    .sort((a,b)=>(Number.isFinite(a.order)?a.order:1e9)-(Number.isFinite(b.order)?b.order:1e9)||String(a.id).localeCompare(String(b.id)));
  return normalizeBoard({savedAt:tree.savedAt,characters:list});
}
export const newId=(board,now=Date.now())=>{let id='c'+now.toString(36);while(board.characters.some(c=>c.id===id))id+='x';return id;};
