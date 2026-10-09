// 소싱 보드의 낙관적 반영·실패 시 되돌리기(2026-10-09 보완).
// 저장이 실패하면 '이번에 바꾼 칸'만, 그 칸이 아직 이번에 넣은 값일 때만 되돌린다 —
// 저장을 기다리는 동안 다른 기기에서 실시간으로 들어온 변경(다른 칸, 또는 같은 칸의 더 새 값)은 지우지 않는다.
export function getAt(tree,path){let o=tree;for(const k of String(path).split('/').filter(Boolean)){if(o==null||typeof o!=='object')return undefined;o=o[k];}return o;}
export function setIn(tree,path,value){
  const keys=String(path).split('/').filter(Boolean);if(!keys.length)return value&&typeof value==='object'?value:{};
  tree=tree&&typeof tree==='object'?tree:{};let o=tree;
  for(const k of keys.slice(0,-1)){if(!o[k]||typeof o[k]!=='object')o[k]={};o=o[k];}
  const last=keys.at(-1);if(value===null||value===undefined)delete o[last];else o[last]=value;return tree;
}
export function touchedPaths(method,path,body){
  if(method==='GET')return [];
  if(method==='PATCH')return Object.entries(body||{}).map(([k,v])=>[path+'/'+k,v]);
  return [[path,method==='DELETE'?null:body]];
}
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export function remember(tree,touched){return touched.map(([p])=>structuredClone(getAt(tree,p)??null));}
export function revertTouched(tree,touched,prior){
  touched.forEach(([p,v],i)=>{if(same(getAt(tree,p),v))tree=setIn(tree,p,prior[i]);});
  return tree;
}
