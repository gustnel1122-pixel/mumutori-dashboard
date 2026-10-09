// Recommendation admission only: evidence records are not a guarantee of safety or legal compliance.
const text=v=>String(v??'');
const vals=v=>v&&typeof v==='object'?Object.values(v):[];
export function identity(id,url){
  try{const u=new URL(url);const m=u.pathname.match(/^\/offer\/(\d+)\.html\/?$/);if(u.protocol==='https:'&&/^(detail\.)?(m\.)?1688\.com$/i.test(u.hostname)&&m)return '1688:'+m[1];}catch{}
  if(url)return '';
  return /^\d+$/.test(text(id))?'1688:'+id:'';
}
export const originalUrl=(id,url)=>{const k=identity(id,url);return k?'https://detail.1688.com/offer/'+k.slice(5)+'.html':'';};
export function snapshot(id,it){return JSON.stringify([identity(id,it.url),text(it.name),text(it.nameCn),text(it.desc),text(it.img),text(it.material),text(it.model),text(it.age),text(it.use),text(it.shop?.company),text(it.shop?.url),['years','grade','repeat','supplierId','registration'].map(f=>text(it.shop?.[f])),vals(it.sourceImages),vals(it.options).map(o=>[text(o.spec),text(o.img),text(o.model),text(o.material),text(o.age),text(o.use)])]);}
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
export const recommendable=(id,it,marks={})=>!exclusion(id,it,marks)&&!['hold','excluded'].includes(it.preferenceApplications?.status)&&reviewProblems(id,it).length===0;


// sku2(2026-10-09 보완): 옵션 사진 없는 옵션은 그 옵션을 입증하는 추가 증빙(optionEvidence)을 검토본에 넣는다. PC sourcing_policy.py와 같은 규칙·지문.
export const POLICY_VERSION='2026-10-09-sku2';
export const keyOfSpec=s=>{let h=5381;for(const c of String(s))h=((h*33)^c.charCodeAt(0))>>>0;return h.toString(36);};
export const optionEvidence=(it,spec)=>{const ev=it.optionEvidence?.[keyOfSpec(spec)];return ev&&typeof ev==='object'?ev:{};};
const timeOk=v=>/(Z|[+-]\d\d:\d\d)$/.test(text(v).trim())&&Number.isFinite(Date.parse(v));
export function optionEvidenceProblems(it,spec){
 const o=vals(it.options).find(x=>x.spec===spec);if(!o)return ['장부에 없는 선택 옵션'];if(o.img)return [];
 const ev=optionEvidence(it,spec);if(!Object.keys(ev).length)return ['옵션 사진 없음 — 이 옵션을 입증하는 추가 증빙 필요(대표 사진으로 대체 불가)'];
 const issues=[],images=vals(ev.images);
 if(ev.spec!==spec)issues.push('증빙이 가리키는 옵션 불일치');
 if(!evidence(images))issues.push('증빙 사진 주소 오류(https 필요)');else if(!images.some(u=>u!==it.img))issues.push('대표 사진만으로는 옵션 확인 불가 — 옵션을 보여 주는 증빙 필요');
 if(!text(ev.note).trim()||!text(ev.by).trim()||!timeOk(ev.at))issues.push('증빙 설명·등록자·시각 누락');
 return issues;
}
export function skuSnapshot(id,it,spec){const o=vals(it.options).find(o=>o.spec===spec);if(!o)return '';const ev=optionEvidence(it,spec);return JSON.stringify([POLICY_VERSION,identity(id,it.url),text(it.name),text(it.nameCn),text(it.desc),['company','url','supplierId','registration'].map(f=>text(it.shop?.[f])),text(spec),text(o.img),text(it.img),vals(it.sourceImages),['model','material','use','age'].map(f=>text(it[f])),['model','material','use','age'].map(f=>text(o[f]||it[f])),[text(ev.spec),vals(ev.images),text(ev.note)]]);}
export function skuReviewProblems(id,it,spec,r=it.skuReviews?.[keyOfSpec(spec)]||{}){
 const o=vals(it.options).find(o=>o.spec===spec),issues=[];if(!o)return ['장부에 없는 선택 옵션'];
 if(r.status!=='consider')issues.push(({in_review:'검수 중',need_info:'추가 정보 필요',not_recommended:'권장하지 않음'})[r.status]||'선택 옵션 미검수');
 if(r.policyVersion!==POLICY_VERSION||r.fingerprint!==skuSnapshot(id,it,spec))issues.push('선택 옵션·공급자·사진·재질·용도·증빙 변경 — 재검수');
 if(!r.by||!r.requestId||!r.resultId)issues.push('검수자·요청·결과 식별 누락');
 const at=Date.parse(r.at),end=Date.parse(r.expiresAt);if(!timeOk(r.at)||!timeOk(r.expiresAt))issues.push('검수 유효기간 누락');else if(at>Date.now()||end<=Date.now()||end<=at||end-at>7*86400000)issues.push('검수 유효기간 만료·오류');
 const seen=vals(r.reviewedImages);
 if(o.img){if(r.imagesObserved!==true||!seen.includes(o.img))issues.push('실제 선택 옵션 사진 확인 필요');}
 else{issues.push(...optionEvidenceProblems(it,spec));const evImages=vals(optionEvidence(it,spec).images);if(r.imagesObserved!==true||!evImages.length||evImages.some(u=>!seen.includes(u)))issues.push('옵션 증빙 사진 확인 기록 필요');}
 const c=r.classification||{};if(['category','use','age','materials','regime','rationale'].some(f=>!text(c[f]).trim()||/^(unknown|미확인|불명)$/i.test(text(c[f]).trim())))issues.push('선택 옵션 분류·용도·연령·재질·제도 근거 부족');
 for(const f of ['product','supplier','ip','regulatory']){const x=r.checks?.[f]||{};if(!['supported',...(f==='regulatory'?['not_applicable']:[])].includes(x.status)||!text(x.note).trim()||!evidence(x.evidence))issues.push(f+' 정밀검수 근거 부족');}
 if(vals(r.flags).some(f=>!f||f.status!=='resolved'||!f.note||!evidence(f.evidence)))issues.push('미해소 위험 신호');if(it.warn&&!text(r.riskResolution).trim())issues.push('위험 신호 해소 근거 없음');return [...new Set(issues)];
}
export function orderProblems(lines,items,marks={},watcher=null,queue={}){const issues=[];if(watcher&&(watcher.version!==POLICY_VERSION||Date.now()-Date.parse(watcher.at)>1200000||!Number.isFinite(Date.parse(watcher.at))))issues.push('PC검수 차단 적용 대기 — 새 감시기 버전 확인 필요');for(const l of lines){const it=items[l.offerId]||{};if(vals(queue).some(q=>q.offerId===l.offerId&&q.spec===l.spec&&q.fingerprint===skuSnapshot(l.offerId,it,l.spec)&&['manual_pending','in_review'].includes(q.status)))issues.push('수동 정밀검수 대기·진행 중');const r=it.skuReviews?.[keyOfSpec(l.spec)]||{},reqs=Object.entries(queue||{}).filter(([,q])=>q.offerId===l.offerId&&q.spec===l.spec&&q.status!=='cancelled');if(reqs.some(([,q])=>!timeOk(q.at)))issues.push('검수 요청 시각 확인 불가');else if(reqs.length){const [lid,lq]=reqs.reduce((a,b)=>Date.parse(b[1].at)>Date.parse(a[1].at)?b:a);if(lq.status==='completed'&&(lid!==r.requestId||lq.resultId!==r.resultId))issues.push('더 최신 검수 요청의 결과와 현재 결과가 다름');}if(exclusion(l.offerId,it,marks))issues.push('추천 제외 품목');issues.push(...reviewProblems(l.offerId,it),...skuReviewProblems(l.offerId,it,l.spec));if(!Number.isInteger(Number(l.qty))||Number(l.qty)<1)issues.push('수량 오류');}return [...new Set(issues)];}
