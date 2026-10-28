// Read the sourcing agent's leading labels without changing stored descriptions.
export function sourcingBadges(value){
  const text=String(value||'').trim(),prefix=text.match(/^(?:【[^】]+】\s*)+/)?.[0]||'';
  const tags=[...prefix.matchAll(/【([^】]+)】/g)].map(m=>m[1]);
  const risk=tags.includes('꼭 확인')?'check':tags.includes('안전')?'safe':'';
  const price=tags.some(t=>/^최저가/.test(t))?'lowest':tags.includes('원래 링크 그대로')?'original':'';
  if(!risk&&!price)return null;
  const parts=text.slice(prefix.length).split(/\s*\|\s*|\n+/);
  const extras=tags.filter(t=>!['꼭 확인','안전','원래 링크 그대로'].includes(t)&&!/^최저가/.test(t));
  return {risk,price,reason:parts.shift()?.trim()||'',detail:[...extras.map(t=>'【'+t+'】'),...parts].join(' | ').trim()};
}
