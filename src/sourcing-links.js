// Display-only 1688 links: never alter the stored option descriptions.
export function sourcingUrl(value){
  try{const u=new URL(String(value||''));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!u.port&&(u.hostname==='1688.com'||u.hostname.endsWith('.1688.com'))?(u.protocol='https:',u.href):'';}catch{return '';}
}
const LINK=/(최저가[^:：|\n]*|원래\s*링크)\s*[:：]\s*(https?:\/\/[^\s|<>"']+)/g;
export function sourcingLinks(...texts){
  const out={lowest:'',original:''};
  for(const text of texts)for(const m of String(text||'').matchAll(LINK)){const key=m[1].startsWith('최저가')?'lowest':'original';out[key]||=sourcingUrl(m[2]);}
  return out;
}
export function sourcingText(text){return String(text||'').replace(LINK,(_,label)=>label.startsWith('최저가')?label.trim():'').replace(/\s*\|\s*$/,'').trim();}
