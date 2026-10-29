// Explicit, private-data-free confirmation for bank REVIEW cards on PC and phone.
export function mountBankReviewUI({host,getBook,getStore,getUid,onSuccess}){
  let busy=false;
  const dialog=document.createElement('dialog');dialog.className='fin-review-dialog';dialog.setAttribute('aria-labelledby','fin-review-title');
  dialog.innerHTML='<form><h2 id="fin-review-title">은행 알림 확인하기</h2><p class="fin-review-bank"></p><p>은행 알림에 빠진 내용을 직접 입력해 주세요. 비슷한 기록이나 확인이 필요한 시각이 있으면 저장을 멈춥니다.</p><label>입금 또는 출금<select name="direction" required><option value="">선택해 주세요</option><option value="in">입금</option><option value="out">출금</option></select></label><label>금액(원)<input name="amount" type="number" inputmode="numeric" min="1" max="100000000" step="1" required></label><p class="fin-review-message" role="status" aria-live="polite"></p><div class="fin-review-actions"><button type="button" data-review-close>취소</button><button type="submit" data-review-confirm>확정하기</button></div></form>';host.append(dialog);
  const form=dialog.querySelector('form'),message=dialog.querySelector('.fin-review-message'),close=dialog.querySelector('[data-review-close]'),submit=dialog.querySelector('[data-review-confirm]');
  close.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  function open(id){
    const review=getBook().bankReviews?.[id],uid=getUid();if(!uid||!getStore()||!review||review.status!=='REVIEW'||busy)return;
    form.reset();form.dataset.reviewId=id;form.dataset.uid=uid;message.textContent='';
    dialog.querySelector('.fin-review-bank').textContent=review.src==='kakaobank'?'카카오뱅크 사업자 통장':review.src==='tossbank'?'토스뱅크 사업자 통장':'은행';
    if(!dialog.open)dialog.showModal();
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const id=form.dataset.reviewId,uid=form.dataset.uid,direction=form.elements.direction.value,text=form.elements.amount.value.trim(),amount=Number(text);
    if(!['in','out'].includes(direction)||!/^[0-9]+$/.test(text)||!Number.isSafeInteger(amount)||amount<1||amount>100000000){message.textContent='입금 또는 출금과 1원 이상 1억 원 이하의 금액을 정확히 입력해 주세요.';return;}
    const store=getStore();if(!uid||uid!==getUid()||!store||getBook().bankReviews?.[id]?.status!=='REVIEW'){message.textContent='기록 또는 로그인 상태가 바뀌었어요. 새로고침 후 다시 확인해 주세요.';return;}
    busy=true;submit.disabled=true;close.disabled=true;message.textContent='장부를 다시 확인하고 있어요.';
    const timer=setTimeout(()=>{if(uid===getUid()&&dialog.open)message.textContent='서버 응답을 기다리고 있어요. 저장 여부를 확인할 때까지 기다려 주세요.';},8000);
    try{const result=await store.confirmBankReview(id,{direction,amount});if(uid!==getUid())return;if(result?.status!=='confirmed')throw Error('unconfirmed');dialog.close();onSuccess?.();}
    catch(err){if(uid===getUid())message.textContent=err?.code==='REVIEW_CANDIDATE'?'비슷한 장부 기록이나 확인이 필요한 시각이 있어 저장하지 않았어요. 사장님이 장부를 먼저 확인해 주세요.':'저장 여부를 확인하지 못했어요. 새로고침해 장부를 먼저 확인해 주세요.';}
    finally{clearTimeout(timer);busy=false;submit.disabled=false;close.disabled=false;}
  });
  return {
    accountChanged(){if(dialog.open)dialog.close();},
    decorate(needsRoot,recentRoot){
      if([needsRoot,recentRoot].some(r=>r?.contains(document.activeElement)&&document.activeElement.matches('[data-ai-note]')))return;
      const reviews=Object.entries(getBook().bankReviews||{}).filter(([,r])=>r&&r.status==='REVIEW').sort((a,b)=>(Number(b[1].ts)||0)-(Number(a[1].ts)||0));
      const rows=needsRoot.querySelectorAll('.q-bank-review');if(rows.length!==reviews.length)return;
      rows.forEach((row,index)=>{const [id]=reviews[index];if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||row.querySelector('.q-review-open'))return;const b=document.createElement('button');b.type='button';b.className='q-btn q-review-open';b.textContent='확인하기';b.dataset.reviewId=id;b.addEventListener('click',()=>open(id));row.append(b);});
    }
  };
}
