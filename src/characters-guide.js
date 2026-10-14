// 캐릭터 만들기 화면의 '처음이면 읽기' 가이드 — 캐릭터 만드는 순서와 AI 쓰는 법(사장님 2026-10-14 요청).
// 읽는 사람은 이 화면을 처음 보는 분이다. 화면 글만 있고 자료는 건드리지 않는다. 칸 이름은 화면의 실제 칸 이름과 같아야 한다(시험이 대조한다).
// shared: 적은 내용을 여러 기기가 함께 보는 방식일 때 true(그때는 저장되는 곳에 대한 설명이 달라진다).
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OPEN_KEY='mumutori-character-guide';   // 접어 둔 것을 기억하는 표시(이 브라우저에만, 글자 하나)

// 프로필 칸 이름(화면과 같은 글자) → 짧은 예시. 쓰는 모양을 보여 주려고 지어낸 것이지 정해진 설정이 아니다.
export const FIELD_EXAMPLES=[
  ['이름','도토리'],
  ['역할','주인공'],
  ['성격 (키워드 3개)','느긋함 · 호기심 · 다정함 (한 칸에 낱말 하나씩)'],
  ['말투 · 대사 예시','"안녕, 나는 도토리야." / "천천히 해도 괜찮아." — 짧고 다정한 반말로 두세 줄'],
  ['좋아하는 것','햇볕 드는 창가에서 낮잠 자기'],
  ['싫어하는 것','비 오는 날, 서두르는 것'],
  ['색 (HEX)','몸 #FDE9BE, 모자 #6A3906 (#과 여섯 자리 — 적으면 옆에 색 견본이 뜹니다)'],
  ['비율','머리와 몸이 1:1, 팔다리는 짧게'],
  ['꼭 지킬 특징','모자 꼭지가 한쪽으로 살짝 기울어 있다'],
  ['하면 안 되는 것','눈썹 그리지 않기, 화난 표정 넣지 않기'],
  ['세계관 속 관계','씨앗 친구들의 맏이, 해바라기씨와 단짝'],
  ['메모','10/14 사장님 확인 — 모자 색을 조금 더 짙게']
];
export const BRAND_COLORS='크림 베이지 #EFE9E4, 버터 #FDE9BE, 짙은 갈색 #6A3906 · #74380F';
const PROMPT_PROFILE=`아래는 우리 브랜드 캐릭터 '[캐릭터 이름]'의 프로필 메모야.
뜻은 바꾸지 말고, 처음 보는 사람도 이해하게 짧고 쉬운 문장으로 다듬어 줘.
- 칸 이름은 그대로 두고, 칸마다 한두 문장으로
- 없는 설정을 새로 지어내지 말 것. 빠진 것 같으면 맨 아래에 '확인할 것'으로 따로 적어 줘
- '말투 · 대사 예시'는 한 줄짜리 대사 3개로

[여기에 프로필 칸에 적은 내용을 붙여 넣기]`;
const PROMPT_SHEET=`우리 브랜드 캐릭터 '[캐릭터 이름]'의 기준 그림을 만들어 줘.
- 같은 캐릭터를 정면 · 옆 · 뒤에서 본 모습, 한 장에 한 방향씩 모두 3장
- 생김새: [프로필의 '생김새 규칙' 네 칸(색 · 비율 · 꼭 지킬 특징 · 하면 안 되는 것)을 그대로 붙여 넣기]
- 스타일: 입체감 있는 3D 오브젝트(손으로 빚은 작은 인형 같은 느낌), 부드러운 조명
- 배경: 완전히 투명(배경·바닥·바닥 그림자 없음), PNG
- 색: 브랜드 색 안에서 — ${BRAND_COLORS}
- 글자 · 로고 · 테두리 · 다른 물건은 넣지 말 것
- 이미 있는 캐릭터나 상표와 닮지 않은, 처음 보는 생김새로`;
const PROMPT_NEXT=`(앞에서 고른 기준 그림을 첨부하고)
첨부한 그림과 똑같은 캐릭터로 그려 줘. 생김새 · 색 · 비율은 바꾸지 마.
- 바꿀 것: [표정 3가지 — 예: 웃음 / 놀람 / 졸림]  또는  [자세 3가지 — 예: 손 흔들기 / 앉기 / 달리기]
- 한 장에 하나씩 모두 3장, 크기와 보는 방향은 첨부한 그림과 같게
- 배경은 완전히 투명(PNG), 입체감 있는 3D 오브젝트 스타일 그대로
- 글자 · 로고 · 다른 물건은 넣지 말 것`;

const prompt=(id,title,text)=>`<div class="cb-help-prompt"><div class="cb-help-prompthead"><b>${title}</b><button type="button" data-cb-copy="${id}">복사</button></div><pre id="${id}" tabindex="0">${esc(text)}</pre></div>`;

export function guideHtml({shared=false}={}){
  let open=true;try{open=localStorage.getItem(OPEN_KEY)!=='closed';}catch(e){}
  return `<details class="cb-help" id="cb-help" ${open?'open':''}>
  <summary><b>처음이면 읽기</b> — 캐릭터 만드는 법과 AI 쓰는 법 <small>(누르면 접고 펼칩니다)</small></summary>
  <div class="cb-help-body">
    <p>이 화면은 무무토리 캐릭터(도토리와 씨앗 친구들)의 <b>프로필</b>과 <b>그림</b>을 하나씩 만들어 <b>확정</b>하는 곳입니다. 아래 순서대로 하면 됩니다. 적은 내용은 적는 즉시 저장됩니다.</p>

    <section id="cb-help-steps"><h3>1. 전체 순서</h3>
    <ol class="cb-help-steps">
      <li><b>캐릭터 고르기</b><span>이 안내 아래에 있는 캐릭터 단추(도토리, 해바라기씨 …)에서 만들 캐릭터를 누릅니다. 목록에 없으면 <b>＋ 캐릭터 추가</b>를 누르고 이름부터 적습니다.</span></li>
      <li><b>프로필 칸 채우기</b><span><b>프로필</b> 칸에 이름 · 역할 · 성격 · 말투 · 생김새 규칙을 적습니다. 무엇을 어떻게 적는지는 아래 <b>2. 칸별 작성 예시</b>를 보세요.</span></li>
      <li><b>기준 이미지 만들기(AI)</b><span>프로필의 '생김새 규칙'을 AI에 붙여 넣어 <b>기준 시트</b>(정면 · 비스듬히 · 옆 · 뒤)부터 만듭니다. 만든 그림은 <b>그림 체크리스트</b>의 같은 이름 칸에 ① <b>미리보기 올리기</b> ② <b>파일 위치</b>에 파일 이름 적기 ③ <b>상태</b>를 '작업 중'으로 바꿉니다. 방법은 아래 <b>3. AI 쓰는 법</b>.</span></li>
      <li><b>사장님 확인</b><span>기준 시트와 대표 그림(3D 투명 PNG)이 되면 사장님께 봐 달라고 합니다. ${shared?'사장님이 이 화면을 열면 지금 적은 그대로 보입니다.':"맨 위 <b>파일로 내보내기</b>로 받은 파일을 보내면, 사장님이 이 화면의 <b>파일 불러오기</b>로 열어 봅니다."} 고칠 곳을 들으면 프로필과 그림을 고치고, 통과한 그림 칸은 <b>상태</b>를 '확정'으로 바꿉니다.</span></li>
      <li><b>'확정'으로 잠그기</b><span>사장님이 좋다고 하면 <b>확정하는 분 이름</b>에 본인 이름을 적고 <b>확정(고정)하기</b>를 누릅니다. 프로필과 대표 그림이 잠기고 확정한 날짜와 이름이 남습니다. 이름 · 역할 · 대표 그림이 있어야 눌립니다.</span></li>
      <li><b>자사몰 교체용으로 넘기기</b><span>맨 위 <b>확정 목록 내보내기</b>로 받은 파일과 그림 원본을 구글 드라이브의 <b>무무토리 &gt; 캐릭터 &gt; 확정</b> 폴더에 넣습니다. 자사몰 담당이 그 폴더를 보고 홈페이지의 캐릭터 그림을 바꿉니다.</span></li>
    </ol></section>

    <section id="cb-help-fields"><h3>2. 프로필 칸별 작성 예시</h3>
    <p class="cb-help-note">쓰는 모양을 보여 주려고 <b>지어낸 예시</b>입니다. 정해진 설정이 아니니 그대로 베끼지 말고 캐릭터에 맞게 적어 주세요. 모르는 칸은 비워 두어도 됩니다.</p>
    <dl class="cb-help-fields">${FIELD_EXAMPLES.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>

    <section id="cb-help-ai"><h3>3. AI 쓰는 법</h3>
    <p>AI(예: ChatGPT)에게 보내는 요청 글은 아래 틀을 <b>복사</b>해서 [ ] 안만 바꿔 쓰면 됩니다.</p>
    <h4>(가) 프로필 문장 다듬기</h4>
    ${prompt('cb-prompt-profile','프로필 다듬기 요청 글',PROMPT_PROFILE)}
    <p class="cb-help-note">AI가 다듬어 준 글은 그대로 붙이지 말고, 뜻이 바뀌지 않았는지 읽어 본 뒤 프로필 칸에 옮겨 적습니다.</p>
    <h4>(나) 그림 만들기</h4>
    <ul class="cb-help-list">
      <li><b>브랜드 방향</b>: 배경은 <b>투명</b>, 모양은 <b>입체 3D 오브젝트</b>, 색은 <b>브랜드 색</b>(${BRAND_COLORS}).</li>
      <li><b>한 번에 3장까지만</b> 요청합니다. 한꺼번에 많이 시키면 캐릭터 생김새가 달라집니다.</li>
      <li><b>기준 시트를 먼저</b> 만듭니다: 정면 · 옆 · 뒤 3장 → 마음에 드는 그림을 고릅니다 → 다음 요청에서 비스듬히(3/4)와 표정을 만듭니다.</li>
      <li><b>같은 캐릭터로 이어 가려면</b> 고른 기준 그림을 <b>첨부</b>하고 "첨부한 그림과 똑같은 캐릭터로"라고 요청합니다. 새 대화를 열었으면 그림을 다시 첨부합니다.</li>
    </ul>
    ${prompt('cb-prompt-sheet','① 기준 시트 요청 글 (처음 한 번)',PROMPT_SHEET)}
    ${prompt('cb-prompt-next','② 이어서 요청하는 글 (표정 · 포즈 · 웹용 그림)',PROMPT_NEXT)}
    <h4>(다) 만든 그림 저장하기</h4>
    <ul class="cb-help-list">
      <li><b>파일 이름</b>: <code>캐릭터이름_칸이름_v번호.png</code> — 예: <code>도토리_정면_v1.png</code>, <code>도토리_표정1-웃음_v2.png</code>, <code>도토리_3D투명_v1.png</code>. 고쳐서 다시 만들면 번호를 올리고, 예전 파일은 지우지 않습니다.</li>
      <li><b>올리는 곳</b>: 만드는 중인 그림은 구글 드라이브 <b>무무토리 &gt; 캐릭터 &gt; 작업중</b>, 확정한 그림은 <b>무무토리 &gt; 캐릭터 &gt; 확정</b>. 폴더가 보이지 않으면 사장님께 폴더를 함께 쓰게 해 달라고 부탁합니다.</li>
      <li><b>이 화면에는</b>: 그 그림 칸의 <b>파일 위치</b>에 파일 이름을 적고, <b>미리보기 올리기</b>로 그림을 올립니다. 미리보기는 작게 줄인 것이라 원본을 대신하지 못합니다.</li>
      <li><b>투명 PNG인지 확인</b>: ① 파일 이름 끝이 <code>.png</code>인지 봅니다(<code>.jpg</code>는 투명이 안 됩니다). ② 이 화면의 미리보기 칸에 올렸을 때 그림 뒤로 <b>바둑판무늬가 비치면 투명</b>이고, 흰 네모로 꽉 차 보이면 투명이 아닙니다. ③ 가장자리에 흰 테두리가 남지 않았는지 봅니다.</li>
    </ul></section>

    <section id="cb-help-dont"><h3>4. 하지 말 것</h3>
    <ul class="cb-help-list cb-help-dont">
      <li><b>다른 회사 캐릭터와 닮게 만들지 않습니다.</b> 닮았다는 생각이 들면 쓰지 않고 다시 만듭니다.</li>
      <li><b>AI 요청 글에 유명 캐릭터나 브랜드 이름을 넣지 않습니다</b>("○○처럼"도 안 됩니다). 원하는 느낌은 모양 · 색 · 질감을 말로 풀어 씁니다.</li>
      <li><b>확정(🔒)된 프로필과 대표 그림을 마음대로 바꾸지 않습니다.</b> 고쳐야 하면 사장님께 먼저 묻고, 잠금 해제 → 고치기 → 다시 확정 순서로 합니다.</li>
      <li><b>개인정보(실명 · 연락처 · 주소)와 원가 · 매입가는 어느 칸에도 적지 않습니다.</b> ${shared?'이 화면에 적은 내용은 로그인하지 않아도 볼 수 있는 곳에 저장되기 때문입니다.':'이 화면의 내용은 파일로 여러 사람에게 전해지기 때문입니다.'} AI 요청 글에도 넣지 않습니다.</li>
    </ul></section>

    <section id="cb-help-ask"><h3>5. 막히면</h3>
    <ul class="cb-help-list">
      <li><b>사장님께 메시지로 묻습니다.</b> 물을 때는 ① 캐릭터 이름 ② 어느 칸인지 ③ 무엇이 막혔는지를 적고 ④ 화면 사진(캡처)을 함께 보냅니다.</li>
      <li>보고판을 함께 쓰고 있다면 보고판에 질문을 남겨도 됩니다.</li>
      <li>급하지 않은 것은 그 캐릭터의 <b>메모</b> 칸에 "[질문] …"으로 적어 둡니다. 잠긴(확정된) 캐릭터는 메모를 고칠 수 없으니 직접 묻습니다.</li>
      <li>화면이 이상하면(저장이 안 됨, 그림이 안 올라감) 맨 위 <b>파일로 내보내기</b>로 지금 내용을 먼저 받아 둔 뒤 새로고침하고, 그래도 안 되면 사장님께 알립니다.</li>
    </ul></section>
    <p class="cb-help-end"><button type="button" data-cb-help-close>이 안내 접기</button><span>맨 위의 <b>처음이면 읽기</b>를 누르면 언제든 다시 펼칠 수 있습니다.</span></p>
  </div></details>`;
}

// 접어 둔 것을 기억하고, '복사' 단추를 움직인다. 이 모듈을 처음 불러올 때 한 번만 붙인다.
document.addEventListener('toggle',e=>{if(e.target?.id!=='cb-help')return;try{if(e.target.open)localStorage.removeItem(OPEN_KEY);else localStorage.setItem(OPEN_KEY,'closed');}catch(err){}},true);
document.addEventListener('click',async e=>{
  if(e.target.closest?.('[data-cb-help-close]')){const d=document.getElementById('cb-help');if(d){d.open=false;d.scrollIntoView({block:'start'});d.querySelector('summary')?.focus();}return;}
  const b=e.target.closest?.('[data-cb-copy]');if(!b)return;
  const pre=document.getElementById(b.dataset.cbCopy);if(!pre)return;
  let ok=false;try{await navigator.clipboard.writeText(pre.textContent);ok=true;}catch(err){}
  if(!ok){const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);}   // 복사가 막힌 브라우저에서는 글을 골라 준다(직접 복사)
  b.textContent=ok?'복사했습니다':'글을 골랐습니다 — 복사해 주세요';setTimeout(()=>{b.textContent='복사';},2500);
});
