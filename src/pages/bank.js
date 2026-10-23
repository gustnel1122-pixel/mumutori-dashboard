export default function renderPage(ctx){
  const {head,finTabs}=ctx;
  // 재무 안의 '계좌별' 탭(총괄 #15: 재무 · 통장 하나로). 공용 장부 하나에서 계좌마다 본다 — fin-accounts.js가 이 자리에 붙는다.
  // 이 PC 브라우저의 옛 통장 기록은 '옛 기록(10/03 이전 · 이 PC만)'에서 읽기만 한다(새 입력 없음).
  return head('재무 · 계좌별','같은 장부에서 통장 · 카드 · 쿠팡 정산마다 들어온 돈 · 나간 돈 · 잔액을 봐요. 입력은 장부 · 요약에서 해요.',' <a class="inline-link" href="quick.html">폰 빠른 장부 <span aria-hidden="true">↗</span></a>')+finTabs()+
    `<section class="panel" id="fin-accounts-panel" aria-label="계좌별"></section>`;
}
