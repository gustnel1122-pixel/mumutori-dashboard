// Explicit, private-data-free confirmation for bank REVIEW cards on PC and phone.
export function mountBankReviewUI({host,getBook,getStore,getUid,onSuccess}){
  let busy=false,saving=false,sessionEpoch=0;
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
    const version=sessionEpoch,id=form.dataset.reviewId,uid=form.dataset.uid,direction=form.elements.direction.value,text=form.elements.amount.value.trim(),amount=Number(text);
    if(!['in','out'].includes(direction)||!/^[0-9]+$/.test(text)||!Number.isSafeInteger(amount)||amount<1||amount>100000000){message.textContent='입금 또는 출금과 1원 이상 1억 원 이하의 금액을 정확히 입력해 주세요.';return;}
    const store=getStore();if(!uid||uid!==getUid()||!store||getBook().bankReviews?.[id]?.status!=='REVIEW'){message.textContent='기록 또는 로그인 상태가 바뀌었어요. 새로고침 후 다시 확인해 주세요.';return;}
    busy=true;submit.disabled=true;close.disabled=true;message.textContent='장부를 다시 확인하고 있어요.';
    const timer=setTimeout(()=>{if(uid===getUid()&&version===sessionEpoch&&dialog.open)message.textContent='서버 응답을 기다리고 있어요. 저장 여부를 확인할 때까지 기다려 주세요.';},8000);
    try{const result=await store.confirmBankReview(id,{direction,amount});if(uid!==getUid()||version!==sessionEpoch)return;if(result?.status!=='confirmed')throw Error('unconfirmed');dialog.close();onSuccess?.('bank');}
    catch(err){if(uid===getUid()&&version===sessionEpoch)message.textContent=err?.code==='REVIEW_CANDIDATE'?'비슷한 장부 기록이나 확인이 필요한 시각이 있어 저장하지 않았어요. 사장님이 장부를 먼저 확인해 주세요.':'저장 여부를 확인하지 못했어요. 새로고침해 장부를 먼저 확인해 주세요.';}
    finally{clearTimeout(timer);busy=false;submit.disabled=false;close.disabled=false;}
  });
  const choiceDialog=document.createElement('dialog');choiceDialog.className='fin-review-dialog fin-match-dialog';choiceDialog.setAttribute('aria-labelledby','fin-match-title');
  choiceDialog.innerHTML='<form><h2 id="fin-match-title">같은 거래인지 확인하기</h2><p>기존 기록과 같은 거래라면 해당 기록을 선택해 주세요. 다른 거래임을 확인한 경우에만 별도로 추가해 주세요.</p><div class="fin-match-summary"></div><p class="fin-match-card-warning" hidden>카드 알림을 별도 추가하면 가맹점과 분류가 자동으로 복원되지 않아요. 추가한 뒤 직접 확인해 주세요.</p><fieldset class="fin-match-options"><legend>확인한 내용</legend><div class="fin-match-candidates"></div><label class="fin-review-option"><input type="radio" name="decision" value="add"> 다른 거래로 별도 추가</label></fieldset><p class="fin-match-message" role="status" aria-live="polite"></p><div class="fin-review-actions"><button type="button" data-match-close>취소</button><button type="submit" data-match-confirm disabled>선택한 내용 확정</button></div></form>';host.append(choiceDialog);
  const choiceForm=choiceDialog.querySelector('form'),choiceMessage=choiceDialog.querySelector('.fin-match-message'),choiceClose=choiceDialog.querySelector('[data-match-close]'),choiceConfirm=choiceDialog.querySelector('[data-match-confirm]');
  choiceClose.onclick=()=>{if(!saving)choiceDialog.close();};choiceDialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  function safeSummary(r){
    const kind=r.kind==='in'?'입금':r.kind==='out'?'출금':r.kind==='move'?'계좌 이동':'방향 확인 필요';
    const date=/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')?r.date:'날짜 확인 필요',time=/^\d{2}:\d{2}$/.test(r.time||'')?r.time:'';
    const method=window.FinCore?.ALL_METHODS?.includes(r.method)?r.method:'수단 확인 필요';
    const amount=Number.isSafeInteger(r.amount)&&r.amount>0&&r.amount<=100000000?r.amount.toLocaleString('ko-KR')+'원':'금액 확인 필요';
    const account=value=>window.FinCore?.ACCOUNTS?.some(a=>a.name===value)?value:'';
    const own=account(r.account),from=account(r.from),to=account(r.to);
    const accounts=r.kind==='move'?['보낸 계좌: '+(from||'확인 필요'),'받은 계좌: '+(to||'확인 필요')]:[];
    if(own)accounts.push('계좌: '+own);
    return [date,time,method,kind,amount,...accounts].filter(Boolean).join(' · ');
  }
  async function openChoice(type,id){
    const version=sessionEpoch,uid=getUid(),store=getStore(),reviews=type==='alert'?getBook().alertReviews:getBook().importReviews,review=reviews?.[id];
    if(!uid||!store||!review||review.status!=='REVIEW'||busy)return;
    choiceForm.reset();choiceForm.dataset.reviewId=id;choiceForm.dataset.uid=uid;choiceForm.dataset.type=type;
    choiceDialog.querySelector('.fin-match-summary').textContent='확인할 기록을 다시 불러오고 있어요.';choiceDialog.querySelector('.fin-match-card-warning').hidden=true;
    const candidates=choiceDialog.querySelector('.fin-match-candidates');candidates.replaceChildren();choiceMessage.textContent='기존 기록을 확인하고 있어요.';choiceConfirm.disabled=true;
    if(!choiceDialog.open)choiceDialog.showModal();busy=true;
    const timer=setTimeout(()=>{if(uid===getUid()&&version===sessionEpoch&&choiceDialog.open)choiceMessage.textContent='서버 응답을 기다리고 있어요.';},8000);
    try{
      const result=await (type==='alert'?store.listAlertReviewCandidates(id):store.listImportReviewCandidates(id));
      if(uid!==getUid()||version!==sessionEpoch||!choiceDialog.open)return;
      if(!result?.review||!Array.isArray(result.candidates))throw Error('invalid-candidates');
      const list=result.candidates;choiceDialog.querySelector('.fin-match-summary').textContent=(type==='alert'?'알림 기록: ':'가져온 기록: ')+safeSummary(result.review);
      choiceDialog.querySelector('.fin-match-card-warning').hidden=!(type==='alert'&&['현대카드','토스체크','카뱅체크'].includes(result.review.method));
      const counts=new Map();for(const item of list){if(item.status==='void')continue;const key=safeSummary(item);counts.set(key,(counts.get(key)||0)+1);}
      let ambiguous=false;
      for(const item of list){
        if(!/^[A-Za-z0-9_-]{1,100}$/.test(item?.id||''))continue;
        const label=document.createElement('label');label.className='fin-review-option';
        const duplicate=item.status!=='void'&&(counts.get(safeSummary(item))||0)>1;ambiguous ||= duplicate;
        const account=value=>window.FinCore?.ACCOUNTS?.some(a=>a.name===value),incompleteMove=item.kind==='move'&&(!account(item.from)||!account(item.to)||item.from===item.to);
        const input=document.createElement('input');input.type='radio';input.name='decision';input.value='same:'+item.id;input.disabled=item.status==='void'||duplicate||incompleteMove;
        const text=document.createElement('span');text.textContent='기존 기록: '+safeSummary(item)+(item.status==='void'?' · 취소된 기록(선택 불가)':incompleteMove?' · 출발·도착 계좌 확인 필요(선택 불가)':duplicate?' · 같은 표시의 기록이 여러 건(선택 불가)':'');label.append(input,text);candidates.append(label);
      }
      choiceMessage.textContent=ambiguous?'같은 표시의 기록이 여러 건 있어 선택할 수 없어요. 기존 장부를 먼저 확인해 주세요.':list.length?'내용을 비교한 뒤 선택해 주세요.':'비교할 기존 기록이 없습니다. 다른 거래인지 확인해 주세요.';choiceConfirm.disabled=false;
    }catch(_){if(uid===getUid()&&version===sessionEpoch)choiceMessage.textContent='기존 기록을 확인하지 못했어요. 다시 열어 확인해 주세요.';}
    finally{clearTimeout(timer);busy=false;}
  }
  choiceForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const version=sessionEpoch,uid=choiceForm.dataset.uid,id=choiceForm.dataset.reviewId,type=choiceForm.dataset.type,selection=choiceForm.querySelector('input[name="decision"]:checked')?.value||'',store=getStore();
    if(!uid||uid!==getUid()||!store||!selection){choiceMessage.textContent='같은 거래인지 직접 선택해 주세요.';return;}
    const choice=selection==='add'?{action:'add'}:selection.startsWith('same:')?{action:'same',candidateId:selection.slice(5)}:null;
    if(!choice){choiceMessage.textContent='확인한 내용을 다시 선택해 주세요.';return;}
    busy=true;saving=true;choiceConfirm.disabled=true;choiceClose.disabled=true;choiceMessage.textContent='장부를 다시 확인하고 있어요.';
    const timer=setTimeout(()=>{if(uid===getUid()&&version===sessionEpoch&&choiceDialog.open)choiceMessage.textContent='서버 응답을 기다리고 있어요. 저장 여부를 확인할 때까지 기다려 주세요.';},8000);
    try{const result=await (type==='alert'?store.resolveAlertReview(id,choice):store.resolveImportReview(id,choice));if(uid!==getUid()||version!==sessionEpoch)return;if(result?.status!=='RESOLVED')throw Error('unconfirmed');choiceDialog.close();onSuccess?.(type);}
    catch(error){if(uid===getUid()&&version===sessionEpoch)choiceMessage.textContent=error?.code==='IMPORT_SOURCE_REQUIRED'?'가져오기 정보가 부족해 저장하지 않았어요. 원본 CSV를 보관하고 다시 확인해 주세요.':error?.code==='IMPORT_ACCOUNT_REVIEW'?'출발·도착 계좌를 확인할 수 없어 저장하지 않았어요. 원본 기록을 보관하고 계좌를 다시 확인해 주세요.':'기록이 바뀌었거나 저장 여부를 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요.';}
    finally{clearTimeout(timer);busy=false;saving=false;choiceConfirm.disabled=false;choiceClose.disabled=false;}
  });
  function extraReviews(){return [['alert',getBook().alertReviews||{}],['import',getBook().importReviews||{}]].flatMap(([type,items])=>Object.entries(items).filter(([id,r])=>/^[A-Za-z0-9_-]+$/.test(id)&&id.length<=(type==='import'?100:80)&&r?.status==='REVIEW').map(([id,r])=>({type,id,review:r})));}
  const pcKey=id=>/^(?:sale_(?:smartstore|coupang|sixshop)_\d{8}|meta_coupangSettle|meta_coupangCal)$/.test(id);
  function collectorReviews(){return Object.entries(getBook().meta?.pcCollectorReviews||{}).filter(([,r])=>r?.status==='REVIEW');}
  const pcDialog=document.createElement('dialog');pcDialog.className='fin-review-dialog fin-pc-review-dialog';pcDialog.setAttribute('aria-labelledby','fin-pc-review-title');
  pcDialog.innerHTML='<form><h2 id="fin-pc-review-title">매출·정산 자동 갱신 확인</h2><p>기존 자료와 새 제안을 비교한 뒤 직접 선택해 주세요.</p><p class="fin-pc-target"></p><div class="fin-pc-values"></div><fieldset class="fin-match-options"><legend>확인한 내용</legend><label class="fin-review-option"><input type="radio" name="decision" value="keep"> 기존 자료 유지</label><label class="fin-review-option"><input type="radio" name="decision" value="apply"> 새 제안 적용</label></fieldset><p class="fin-pc-message" role="status" aria-live="polite"></p><div class="fin-review-actions"><button type="button" data-pc-close>취소</button><button type="submit" data-pc-confirm disabled>선택한 내용 확정</button></div></form>';host.append(pcDialog);
  const pcForm=pcDialog.querySelector('form'),pcMessage=pcDialog.querySelector('.fin-pc-message'),pcConfirm=pcDialog.querySelector('[data-pc-confirm]'),pcClose=pcDialog.querySelector('[data-pc-close]');
  pcClose.onclick=()=>{if(!saving)pcDialog.close();};pcDialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  function drawPcValues(target,current,proposal){
    const root=pcDialog.querySelector('.fin-pc-values');root.replaceChildren();
    const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'확인 필요';
    const number=(v,unit='원')=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR')+unit:'확인 필요';
    function detail(parent,label,value){const row=document.createElement('p');row.className='fin-pc-row';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);parent.append(row);}
    function section(title,value){
      const box=document.createElement('section');box.className='fin-pc-box';const h=document.createElement('h3');h.textContent=title;box.append(h);
      if(!value||typeof value!=='object'){const p=document.createElement('p');p.textContent='기록 없음';box.append(p);root.append(box);return;}
      if(target==='daily-sales')for(const [key,label,unit] of [['gross','매출','원'],['orders','주문','건'],['cancel','취소','원'],['fee','수수료','원']])detail(box,label,number(value[key],unit));
      if(target==='settlement'){
        detail(box,'다음 정산일',date(value.nextDate));
        detail(box,'기준 기간 시작',date(value.periodStart));detail(box,'기준 기간 끝',date(value.periodEnd));
        for(const [key,label] of [['nextAmount','예상 지급'],['revenue','매출'],['cost','비용'],['profit','차액'],['ads','광고'],['fulfillment','물류'],['fee','수수료']])detail(box,label,number(value[key]));
      }
      if(target==='calendar'){
        detail(box,'다음 지급일',date(value.next?.date));detail(box,'다음 지급액',number(value.next?.amount));
        const weeks=Array.isArray(value.weeks)?value.weeks.slice(0,12):[];
        if(!weeks.length)detail(box,'정산 주차','확인 필요');
        for(const [index,week] of weeks.entries()){
          const sub=document.createElement('div');sub.className='fin-pc-week';const name=document.createElement('strong');name.textContent=(index+1)+'주차 · '+date(week?.start)+' ~ '+date(week?.end);sub.append(name);
          for(const [key,label] of [['sales','매출'],['ads','광고'],['fulfillment','물류'],['fee','수수료'],['cost','비용'],['payout','지급액']])detail(sub,label,number(week?.[key]));
          detail(sub,'70% 지급일',date(week?.pay70?.date));detail(sub,'70% 지급액',number(week?.pay70?.amount));detail(sub,'30% 지급일',date(week?.pay30?.date));detail(sub,'30% 지급액',number(week?.pay30?.amount));box.append(sub);
        }
      }
      root.append(box);
    }
    section('기존 자료',current);section('새 제안',proposal);
  }
  async function openPc(id){
    const version=sessionEpoch,uid=getUid(),store=getStore(),review=getBook().meta?.pcCollectorReviews?.[id];if(!uid||!store||!pcKey(id)||review?.status!=='REVIEW'||busy)return;
    pcForm.reset();pcForm.dataset.reviewId=id;pcForm.dataset.uid=uid;pcDialog.querySelector('.fin-pc-target').textContent='확인할 내용을 다시 불러오고 있어요.';pcDialog.querySelector('.fin-pc-values').replaceChildren();pcMessage.textContent='';pcConfirm.disabled=true;
    if(!pcDialog.open)pcDialog.showModal();busy=true;
    const timer=setTimeout(()=>{if(uid===getUid()&&version===sessionEpoch&&pcDialog.open)pcMessage.textContent='서버 응답을 기다리고 있어요.';},8000);
    try{
      const data=await store.listPcCollectorReview(id);if(uid!==getUid()||version!==sessionEpoch||!pcDialog.open)return;
      if(!['daily-sales','settlement','calendar'].includes(data?.target))throw Error('invalid-target');
      const names={smartstore:'스마트스토어',coupang:'쿠팡',sixshop:'식스샵'},target=data.target==='daily-sales'?(names[data.channel]||'판매처 확인 필요')+' · '+(/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')?data.date:'날짜 확인 필요'):data.target==='settlement'?'쿠팡 정산 예정':'쿠팡 정산 달력';
      pcDialog.querySelector('.fin-pc-target').textContent=target;drawPcValues(data.target,data.current,data.proposal);pcMessage.textContent='내용을 비교한 뒤 선택해 주세요.';pcConfirm.disabled=false;
    }catch(_){if(uid===getUid()&&version===sessionEpoch)pcMessage.textContent='자료를 확인하지 못해 저장하지 않았어요. 기존 데이터는 그대로이며 연결과 값의 형식을 확인해 주세요.';}
    finally{clearTimeout(timer);busy=false;}
  }
  pcForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const version=sessionEpoch,uid=pcForm.dataset.uid,id=pcForm.dataset.reviewId,action=pcForm.querySelector('input[name="decision"]:checked')?.value||'',store=getStore();
    if(!uid||uid!==getUid()||!store||!['keep','apply'].includes(action)){pcMessage.textContent='기존 유지 또는 새 제안 적용을 직접 선택해 주세요.';return;}
    busy=true;saving=true;pcConfirm.disabled=true;pcClose.disabled=true;pcMessage.textContent='기존 자료와 제안을 다시 확인하고 있어요.';
    const timer=setTimeout(()=>{if(uid===getUid()&&version===sessionEpoch&&pcDialog.open)pcMessage.textContent='서버 응답을 기다리고 있어요. 확인이 끝날 때까지 기다려 주세요.';},8000);
    try{const result=await store.resolvePcCollectorReview(id,{action});if(uid!==getUid()||version!==sessionEpoch)return;if(result?.status!=='RESOLVED'||result.action!==action)throw Error('unconfirmed');pcDialog.close();onSuccess?.('collector',action);}
    catch(_){if(uid===getUid()&&version===sessionEpoch)pcMessage.textContent='자료가 바뀌었거나 저장 여부를 확인하지 못했어요. 다시 열어 비교해 주세요.';}
    finally{clearTimeout(timer);busy=false;saving=false;pcConfirm.disabled=false;pcClose.disabled=false;}
  });
  return {
    accountChanged(){
      sessionEpoch++;
      if(dialog.open)dialog.close();if(choiceDialog.open)choiceDialog.close();if(pcDialog.open)pcDialog.close();
      form.reset();choiceForm.reset();pcForm.reset();
      dialog.querySelector('.fin-review-bank').textContent='';message.textContent='';
      choiceDialog.querySelector('.fin-match-summary').textContent='';choiceDialog.querySelector('.fin-match-candidates').replaceChildren();choiceMessage.textContent='';
      pcDialog.querySelector('.fin-pc-target').textContent='';pcDialog.querySelector('.fin-pc-values').replaceChildren();pcMessage.textContent='';
    },
    decorate(needsRoot,recentRoot){
      const extra=extraReviews(),collector=collectorReviews(),collectorCount=collector.length;
      if([needsRoot,recentRoot].some(r=>r?.contains(document.activeElement)&&document.activeElement.matches('[data-ai-note]')))return extra.length+collectorCount;
      const reviews=Object.entries(getBook().bankReviews||{}).filter(([,r])=>r&&r.status==='REVIEW').sort((a,b)=>(Number(b[1].ts)||0)-(Number(a[1].ts)||0));
      const rows=needsRoot.querySelectorAll('.q-bank-review');
      if(rows.length===reviews.length)rows.forEach((row,index)=>{const [id]=reviews[index];if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||row.querySelector('.q-review-open'))return;const b=document.createElement('button');b.type='button';b.className='q-btn q-review-open';b.textContent='확인하기';b.dataset.reviewId=id;b.addEventListener('click',()=>open(id));row.append(b);});
      const target=needsRoot.querySelector('.f-needs-rows')||needsRoot;target.querySelectorAll('.q-match-review,.q-collector-review').forEach(n=>n.remove());
      for(const {type,id,review} of extra){const row=document.createElement('div');row.className='q-line q-match-review';const details=document.createElement('div'),title=document.createElement('b'),desc=document.createElement('small');title.textContent=type==='alert'?'알림 기록 확인 필요':'가져온 기록 확인 필요';desc.textContent=safeSummary(review)+' · 직접 확인 전에는 장부 합계에 반영되지 않습니다.';details.append(title,desc);const button=document.createElement('button');button.type='button';button.className='q-btn q-review-open';button.dataset.matchType=type;button.dataset.matchId=id;button.textContent='확인하기';button.addEventListener('click',()=>openChoice(type,id));row.append(details,button);target.append(row);}
      for(const [id] of collector){const row=document.createElement('div');row.className='q-line q-collector-review';const text=document.createElement('b');text.textContent='매출·정산 자동 갱신 보류 · 기존 자료 보존';row.append(text);if(pcKey(id)){const button=document.createElement('button');button.type='button';button.className='q-btn q-review-open';button.dataset.pcReviewId=id;button.textContent='확인하기';button.addEventListener('click',()=>openPc(id));row.append(button);}target.append(row);}
      if(extra.length||collectorCount)needsRoot.hidden=false;return extra.length+collectorCount;
    }
  };
}
