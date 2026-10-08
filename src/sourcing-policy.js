// Recommendation admission only: evidence records are not a guarantee of safety or legal compliance.
const text=v=>String(v??'');
const vals=v=>v&&typeof v==='object'?Object.values(v):[];
export function identity(id,url){
  try{const u=new URL(url);const m=u.pathname.match(/^\/offer\/(\d+)\.html\/?$/);if(u.protocol==='https:'&&/^(detail\.)?(m\.)?1688\.com$/i.test(u.hostname)&&m)return '1688:'+m[1];}catch{}
  if(url)return '';
  return /^\d+$/.test(text(id))?'1688:'+id:'';
}
export const originalUrl=(id,url)=>{const k=identity(id,url);return k?'https://detail.1688.com/offer/'+k.slice(5)+'.html':'';};
export function snapshot(id,it){return JSON.stringify([identity(id,it.url),text(it.name),text(it.nameCn),text(it.desc),text(it.img),text(it.material),text(it.model),text(it.age),text(it.use),text(it.shop?.company),text(it.shop?.url),['years','grade','repeat','supplierId','registration'].map(f=>text(it.shop?.[f])),vals(it.sourceImages),vals(it.options).map(o=>[text(o.spec),text(o.img),text(o.model),text(o.material),text(o.age)])]);}
export function exclusion(id,it,marks={}){const k=identity(id,it.url);return Object.entries(marks).find(([mid,m])=>{const x=m?.exclusion;return x?.active===true&&k&&(x.identity===k||identity(x.offerId||mid,x.sourceUrl)===k);});}
const evidence=x=>Array.isArray(x)&&x.length>0&&x.every(u=>{try{return new URL(u).protocol==='https:';}catch{return false;}});
export function reviewProblems(id,it){
 const r=it.review||{},issues=[];const k=identity(id,it.url);
 if(!k||(/^\d+$/.test(text(id))&&k!=='1688:'+id))issues.push('원본 상품 식별 불일치');
 if(r.status!=='approved')issues.push(r.status==='hold'?'보류':r.status==='in_review'?'검수 중':'미검수');
 if(!r.by||!r.at||!Number.isFinite(Date.parse(r.at)))issues.push('검수자·시각 누락');
 if(r.snapshot!==snapshot(id,it))issues.push('상품·공급자·이미지·옵션 변경 또는 검토본 없음 — 재검수');
 const images=[it.img,...vals(it.sourceImages),...vals(it.options).map(o=>o.img)].filter(Boolean);
 if(!images.length||!Array.isArray(r.reviewedImages)||images.some(u=>!r.reviewedImages.includes(u)))issues.push('실제 검토 이미지 기록 부족');
 if(!Array.isArray(r.reviewedOptions)||vals(it.options).some(o=>!r.reviewedOptions.includes(o.spec)))issues.push('검토 옵션·모델 기록 부족');
 const c=r.classification||{};
 if(['category','use','age','materials','regime','rationale'].some(f=>!text(c[f]).trim()||/^(unknown|미확인|불명)$/i.test(text(c[f]).trim())))issues.push('분류·연령·용도·재질·적용 제도 근거 부족');
 for(const f of ['product','supplier','ip','regulatory']){const x=r.checks?.[f]||{};if(!['supported',...(f==='regulatory'?['not_applicable']:[])].includes(x.status)||!text(x.note).trim()||!evidence(x.evidence))issues.push(f+' 검토 근거 부족');}
 if(vals(r.flags).some(f=>!f||f.status!=='resolved'||!text(f.note).trim()||!evidence(f.evidence)))issues.push('미해소 위험 신호');
 if((it.warn||vals(r.flags).length)&&!text(r.riskResolution).trim())issues.push('위험 신호 해소 근거 없음');
 if(r.reason)issues.push(text(r.reason));
 return [...new Set(issues)];
}
export const recommendable=(id,it,marks={})=>!exclusion(id,it,marks)&&reviewProblems(id,it).length===0;
