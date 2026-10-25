// 캐릭터 만들기 화면의 '함께 보는 저장' — 소싱 보드와 같은 방식(SDK 없이 Firebase REST + EventSource, 로그인 없음).
// 자리: 공용 장부에서 로그인 없이 읽고 쓰게 열려 있는 칸(sourcing/meta) 아래 characterBoard. 보안 규칙은 바꾸지 않았다.
// 누구나 읽고 쓸 수 있는 자리이므로 원가·개인정보·비공개 주소는 넣지 않는다(화면이 받는 칸은 characters-core 의 정해진 칸뿐).
// 쓰기는 '고친 칸'만 보낸다(여러 칸을 한 번에 PATCH) — 두 사람이 서로 다른 칸을 고쳐도 덮어쓰지 않는다.
export const BOARD_URL='https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/sourcing/meta/characterBoard';
// 세계관 · 공통 프롬프트(총괄이 정본과 함께 쓰는 옆 칸 characterWorld) — 이 화면은 읽기만 한다(GET 한 번). 못 읽으면 null → 그 칸만 숨긴다.
export const WORLD_URL=BOARD_URL.replace(/characterBoard$/,'characterWorld');
export async function readWorld(){
  try{const r=await fetch(WORLD_URL+'.json',{cache:'no-store'});if(!r.ok)return null;const w=await r.json();return w&&typeof w==='object'&&!Array.isArray(w)?w:null;}catch(e){return null;}
}

export function setIn(tree,path,value){
  const keys=String(path).split('/').filter(Boolean);
  if(!keys.length)return value&&typeof value==='object'?value:null;
  tree=tree&&typeof tree==='object'?tree:{};let o=tree;
  for(const k of keys.slice(0,-1)){if(!o[k]||typeof o[k]!=='object')o[k]={};o=o[k];}
  const last=keys.at(-1);if(value===null||value===undefined)delete o[last];else o[last]=value;
  return tree;
}
// 실시간 연결이 보내 주는 변경(put = 그 자리를 통째로, patch = 적힌 칸만)을 내 사본에 반영한다.
export function applyEvent(tree,event,payload){
  const path=String(payload?.path||'/'),data=payload?.data;
  if(event==='put')return setIn(tree,path,data);
  for(const [k,v] of Object.entries(data||{}))tree=setIn(tree,path.replace(/\/$/,'')+'/'+k,v);
  return tree;
}
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

// onChange(tree): 내 사본이 바뀔 때(다른 기기의 변경 포함). onStatus(상태): connecting · ok · retry · poll · denied · offline
export function openStore({onChange,onStatus}){
  let tree=null,source=null,pollTimer=0,retryTimer=0,failures=0,pending={},inflight={},seed=null,chain=Promise.resolve(),state='connecting',lastError='';
  const status=s=>{if(s===state)return;state=s;onStatus?.(s);};
  // 다른 기기의 변경을 받은 뒤에도, 아직 보내지 못했거나 보내는 중인 내 변경은 그 위에 다시 얹는다(옛 값으로 되돌아가 보이지 않게).
  const overlay=()=>{for(const [p,v] of Object.entries({...inflight,...pending}))tree=setIn(tree,p,clone(v));};
  const got=next=>{tree=next;if(seed&&!hasCharacters(tree))tree=clone(seed);overlay();onChange(tree);};
  const hasCharacters=t=>!!(t&&t.characters&&Object.keys(t.characters).length);
  async function read(){
    const r=await fetch(BOARD_URL+'.json',{cache:'no-store'});
    if(r.status===401||r.status===403){status('denied');throw Error('denied');}
    if(!r.ok)throw Error('읽기 실패 '+r.status);
    return await r.json();
  }
  function poll(){status('poll');clearInterval(pollTimer);const once=()=>read().then(t=>{if(state==='offline')status('poll');got(t);}).catch(err=>{if(err.message!=='denied')status('offline');});once();pollTimer=setInterval(once,20000);}
  function listen(){
    if(!window.EventSource){poll();return;}
    source=new EventSource(BOARD_URL+'.json');
    for(const ev of ['put','patch'])source.addEventListener(ev,e=>{failures=0;if(state!=='offline'&&state!=='denied')status('ok');try{got(applyEvent(tree,ev,JSON.parse(e.data)));}catch(err){lastError=err.message;}});
    source.addEventListener('cancel',()=>{source.close();status('denied');});
    source.onerror=()=>{if(++failures>=3){source.close();poll();return;}if(failures>1)status('retry');};
  }
  async function request(method,body){
    const text=JSON.stringify(body);
    const r=await fetch(BOARD_URL+'.json',{method,headers:{'Content-Type':'application/json'},body:text,keepalive:text.length<50000});
    if(r.status===401||r.status===403)throw Error('denied');
    if(!r.ok)throw Error('저장 실패 '+r.status);
  }
  function fail(err,batch){
    lastError=err.message;inflight={};pending={...batch,...pending};status(err.message==='denied'?'denied':'offline');
    clearTimeout(retryTimer);if(err.message!=='denied')retryTimer=setTimeout(flush,5000);
  }
  // 모아 둔 변경을 한 번에 보낸다. 순서가 뒤바뀌지 않게 앞의 전송이 끝난 뒤에 보낸다.
  function flush(){
    clearTimeout(retryTimer);
    chain=chain.then(async()=>{
      if(!Object.keys(pending).length)return;
      const batch=pending;pending={};inflight=batch;
      try{
        if(seed){   // 함께 보는 곳이 비어 있을 때의 첫 저장: 그 사이 다른 분이 먼저 채웠으면 내 변경만 얹고, 아니면 전체를 올린다
          const now=await read();
          if(hasCharacters(now)){seed=null;tree=now;overlay();onChange(tree);await request('PATCH',batch);}
          else{const full=clone(seed);for(const [p,v] of Object.entries(batch))setIn(full,p,clone(v));await request('PUT',full);seed=null;}
        }else await request('PATCH',batch);
        inflight={};if(state==='offline')status(source&&source.readyState!==2?'ok':'poll');
      }catch(err){fail(err,batch);}
    });
    return chain;
  }
  listen();
  return {
    tree:()=>tree,
    isEmpty:()=>!hasCharacters(tree),
    pendingCount:()=>Object.keys(pending).length+Object.keys(inflight).length,
    lastError:()=>lastError,
    // updates: {'characters/<id>/memo':'값', …}. full(): 함께 보는 곳이 비어 있을 때 올릴 전체 자료(화면의 기본 캐릭터 포함).
    write(updates,full){
      if(!hasCharacters(tree)&&!seed&&full){seed=clone(full());tree=clone(seed);}
      for(const [p,v] of Object.entries(updates)){pending[p]=clone(v);tree=setIn(tree,p,clone(v));}
      return tree;
    },
    flush,
    // 전체를 바꾼다(파일 불러오기 · 예전 내용 올리기). 실패하면 던진다.
    async replace(full){
      pending={};inflight={};seed=null;clearTimeout(retryTimer);
      let error=null;await (chain=chain.then(()=>request('PUT',full)).catch(err=>{error=err;}));
      if(error){lastError=error.message;throw error;}
      tree=clone(full);if(state==='offline')status(source&&source.readyState!==2?'ok':'poll');onChange(tree);
    },
    close(){source?.close();clearInterval(pollTimer);clearTimeout(retryTimer);}
  };
}
