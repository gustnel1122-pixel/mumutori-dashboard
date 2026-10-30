// Stores only account-scoped opaque record identities, never names, prices or tokens.
const key=uid=>'mmt-product-confirmed-v1:'+uid;
export function confirmedLinks(uid){
  if(!uid)return {};
  try{const x=JSON.parse(localStorage.getItem(key(uid))||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?Object.assign(Object.create(null),x):Object.create(null);}catch(_){return Object.create(null);}
}
export function confirmLink(uid,id,identity){
  if(!uid||!/^[A-Za-z0-9가-힣_-]{1,100}$/.test(id)||!/^[a-f0-9-]{36}$/.test(identity))return false;
  try{const links=confirmedLinks(uid);links[id]=identity;localStorage.setItem(key(uid),JSON.stringify(links));return true;}catch(_){return false;}
}
