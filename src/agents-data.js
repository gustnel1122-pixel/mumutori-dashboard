// 무무토리 AI 조직도 — 공개 저장소이므로 역할·범위·연결 방식만 적는다.
// 세션 ID·주소·파일 경로·원가 같은 내부 정보는 넣지 않는다(정본은 옵시디언 00_인덱스/에이전트 조직도).
// 담당 변경이 승인되면 운영·페이지 담당이 이 파일과 정본 기록을 함께 맞추고 총괄이 확인한다.
export const ORG_UPDATED='2026-10-26';
export const ORG_EDITOR='운영·페이지 담당 ChatGPT(사장님 10/26 10:58 지시)';

// status: active(연결·검증됨) | ready(켜면 쓸 수 있음) | pending(연결 시험 전) | idle(쉬는 중) | retired(종료)
export const OWNER={id:'owner',name:'김현수 사장님',role:'결정·승인·로그인',scope:['상품·수량·예산 결정','발주·결제·계약 승인','보안 설정·로그인'],status:'active'};

export const HUB={id:'hub',seat:'총괄@무무토리',name:'총괄 Claude',kind:'Claude · claude.ai',role:'전체 흐름 총괄',
  scope:['사장님 지시를 담당에게 전달','진행·결과 확인','총괄 보고판에 보고'],
  channel:'사장님과 대화창으로 직접',status:'active',since:'2026-10-11'};

export const AGENTS=[
  {id:'sourcing',seat:'소싱@무무토리',name:'소싱 Claude',kind:'Claude Code · VS Code',team:'소싱·발주',role:'1688 소싱·장바구니·상품 검수',
   scope:['소싱 보드 화면','추천 제외·취향 규칙','선택 옵션 검수','보드 자동 처리기 관리'],
   out:['총괄 보고판','발주·결제(사장님 승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-11 09:35',note:'연결 시험 통과'},
  {id:'watcher',seat:'소싱-자동@무무토리',name:'보드 자동 처리기',kind:'PC 프로그램',team:'소싱·발주',role:'보드 요청 자동 처리',
   scope:['신청서 작성 요청 처리(신청하기 X)','검수 요청을 소싱 Claude에 전달'],
   out:['신청·결제'],channel:'소싱 보드 버튼 → 자동 실행',status:'active',checked:'2026-10-11 08:39',note:'로그 기준 연결 유지'},
  {id:'dotori',seat:'운영·페이지@무무토리',name:'운영·페이지 담당 ChatGPT · 도토리',kind:'ChatGPT',team:'운영·페이지',role:'운영 홈·프로젝트 페이지 구현·점검·기록',
   scope:['운영 홈과 프로젝트 페이지 연결·최신 상태 반영','승인된 GitHub 페이지 수정·검수·배포 확인','매일 21:10 페이지 점검·운영 기록','ChatGPT 순찰·소식 브리핑으로 정기 감시 이관','다른 담당 결과 재검증','공동 기록 정리','지원사업 사이트','조사: 버터 집기 업체·도장/포장재·KC','일일 보고로 실행계획 작성'],
   out:['로그인·결제·가입·주문','손님·업체 연락','파일 삭제','민감정보 공개'],channel:'ChatGPT 프로젝트에 총괄이 지시하고 운영 기록으로 확인',status:'active',checked:'2026-10-26',note:'사장님 10/26 10:58 지시로 운영·GitHub 페이지 작업 이관. 총괄 Claude는 지시·확인·보고판을 맡고 기존 조사·검증 업무도 유지'},
  {id:'codex-vscode',seat:'검토@무무토리',name:'검토·시험 담당',kind:'OpenAI Codex · VS Code',team:'개발',role:'Claude Code가 만든 것을 검토·시험',
   scope:['담당 Claude가 만든 코드·화면 읽기 검토','회귀 시험','고칠 점은 글로 남김(직접 고치지 않음)'],
   out:['상품 변경·물품 발주','보안 설정 변경','push·배포','업체 연락·메일 발송','개인정보 전송'],
   channel:'VS Code Codex 창 · 권한 \'승인 요청(Ask for approval)\'만',status:'ready',checked:'2026-10-16 07:15',note:'10/16 새 자리 · 코드 검토는 이 자리로 옮김'},
  {id:'codex',seat:'Codex앱@무무토리',name:'Codex 앱',kind:'OpenAI Codex · PC 앱',team:'개발',role:'범위를 정한 작업',
   scope:['범위를 정해 받은 작업(메일 초안·DNS 확인 같은 일)'],
   out:['push·배포(사장님 승인 필요)'],channel:'PC Codex 앱(무무토리 프로젝트)에 총괄이 입력·확인',status:'active',checked:'2026-10-11 10:15',note:'10/16 코드 검토는 VS Code Codex(검토@무무토리)로 옮김'},
  {id:'coupang',seat:'쿠팡@무무토리',name:'쿠팡 담당 Claude',kind:'Claude Code · VS Code',team:'채널 판매',role:'쿠팡·채널·광고 (광고 담당 겸임, 10/18~)',
   scope:['쿠팡·스마트스토어·자사몰 현황','매일 아침 일일 보고(데이터·개선점·결정 거리)','운영 가이드','윙 로그인 감시(매시 정각·30분, 탭 안 건드림)','광고 세분화: 상품별 계속/줄임/끔 · 제외 키워드 · 수동 키워드'],out:['돈이 늘어나는 광고 변경·가격 변경(사장님 승인)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-18 20:30',note:'광고 운영 중 · 로켓그로스 2차 입고 취소(10/26 확인)'},
  {id:'github',seat:'대시보드@무무토리',name:'대시보드 담당 Claude',kind:'Claude Code · VS Code',team:'개발',role:'채널 데이터 취합·재발주 준비·대시보드 반영',
   scope:['판매처별 판매·재고·소진율 취합','판매 중인 상품 재발주 추천 수량','통합 대시보드 화면 반영','저장소 점검'],out:['발주 신청·장바구니 변경·결제'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-26',note:'10/26 운영·GitHub 화면 작업은 ChatGPT로 이관. 채널 데이터 취합·재발주 준비·스마트스토어 업무 유지. 이전: 10/11 대시보드 담당 지정 · 10/17 스마트스토어 겸임'},
  {id:'smartstore',seat:'스마트스토어(대시보드 겸임)',name:'스마트스토어 담당',kind:'Claude Code · VS Code',team:'채널 판매',role:'네이버 쇼핑 상위노출 · 스마트스토어 운영',
   scope:['상위노출: 상품명·태그·속성·카테고리·상세 글 다듬기','로그인 감시(매시 14·44분)','커머스 API로 로그인 없이 고치는 도구 준비 중'],
   out:['돈 드는 일(광고·유료 도구) — 사장님께 먼저 물음','가구매·리뷰·트래픽 조작 금지','로그인(사장님이 직접)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인(대시보드 담당과 같은 대화)',status:'active',checked:'2026-10-18 20:30',note:'10/18 상품 9개 "14세 이상·어린이용 아님" 표시·어린이 연상 말 정리 · 말랑이 카테고리는 사장님 답 대기'},
  {id:'page',seat:'페이지@무무토리',name:'페이지 담당 Claude',kind:'Claude Code · VS Code',team:'페이지·디자인',role:'자사몰·레터·오프라인 프로젝트 페이지',
   scope:['자사몰 리디자인 시안·상세 템플릿','레터·오프라인 준비 페이지 글·목록 맞추기','포장·첫 방문 인트로 시안'],
   out:['실제 자사몰 저장·게시(사장님 승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-26',note:'10/26 운영·GitHub 페이지 작업은 ChatGPT로 이관. 기존 디자인 시안·포장 기획 등 다른 업무는 유지. 이전: 10/16 자사몰 첫 방문 인트로 공개 · 헤르메스 시험 설치'},
  {id:'research',seat:'연구@무무토리',name:'AI 활용 담당',kind:'Claude · 예약 작업',team:'AI 활용',role:'새 AI 소식 조사 → 주간 제안',
   scope:['매주 새 AI 도구·기능 조사','무무토리에 바로 쓸 것 1~3개 제안서','보고판 질문 1개','담당별 플레이북 정리 제안'],
   out:['설치·가입·결제(제안만)'],
   channel:'기존 연구 예약 중단 · 새 소식 조사는 ChatGPT 소식·기회 브리핑이 대체',status:'idle',checked:'2026-10-16 07:15',note:'10/16 새 자리 · 첫 실행 10/19(월)'},
  {id:'hermes',seat:'헤르메스(시험)',name:'헤르메스',kind:'Hermes Agent · PC',team:'AI 활용',role:'1주 시험: 볼트 읽기 + 아침 텔레그램 브리핑',
   scope:['볼트 읽기','볼트 수신함에 새 파일만 쓰기','명령은 하나하나 사장님 승인'],
   out:['쇼핑몰·쿠팡·보고판 로그인','터미널·브라우저·화면 조작','결제·발송'],
   channel:'텔레그램(사장님이 키를 넣은 뒤)',status:'pending',checked:'2026-10-18 20:30',note:'무무토리 스킬 5개·사장님 정보 연결 끝 · 키 연결 대기(약 50%)'},
];

// 학습 루프(2026-10-16 켬): 일하면서 배운 것을 담당별 플레이북에 쌓아 다음 일에 쓴다.
export const LOOP=['일 시작 전 — 자기 플레이북과 작업 환경 함정 노트를 읽고 같은 종류의 일은 그 순서대로 합니다.',
  '일 끝난 뒤 — 새로 알게 된 것·실수·더 빠른 방법을 3줄 이내로 \'배운 것\'에 더합니다(날짜·건 ID).',
  '같은 일이 두 번째면 순서를 절로 정리하고, 같은 교훈이 두 번 나오면 작업법·스킬·도구를 고칩니다.',
  '지금은 ChatGPT 소식·기회 브리핑이 변화와 개선 기회를 찾고, 총괄이 적용 여부를 검토합니다.',
  '담당 호출 — 빈 우편함을 반복 확인하지 않고, 총괄 지시나 정해진 점검 때 필요한 작업만 합니다(10/26 기준).',
  '일 끝나면 정리 — 자기가 연 창·프로그램만 닫아 메모리를 아낍니다(10/16 켬).'];

// 자리(seat): 대화가 바뀌어도 이름은 그대로 — 바뀐 대화 주소는 볼트 조직도에서만 갈아 끼운다.
// 코드 작업 2인조: 만드는 쪽(해당 분야 Claude) + 검토하는 쪽(검토@무무토리 = VS Code Codex, 읽기 전용 검토·회귀 시험). 2026-10-16 Codex 앱 → VS Code Codex.
export const PAIRING='운영·GitHub 페이지는 ChatGPT가 구현하고 별도 검수로 화면·기능을 확인한 뒤 승인 범위에서 배포하며, 총괄 Claude는 지시·결과 확인·보고판을 맡습니다(10/26 이관). 다른 분야의 기존 코드 작업은 해당 Claude 구현 + 검토@무무토리(VS Code Codex) 검토·시험 체계를 유지합니다.';

// 프로젝트별 책임 — 상세 진행은 각 프로젝트 페이지·볼트 정본이 기준
export const PROJECTS=[
  {name:'오프라인 소품상점',lead:'dotori',helpers:['hub'],note:'11/1(일) 오픈 · 운영 페이지·구매 목록은 ChatGPT · 현장 구매·실측은 사장님'},
  {name:'소싱·초도 발주',lead:'sourcing',helpers:['watcher'],note:'KC 비대상 잡화·재발주 회차 → 장바구니·검수'},
  {name:'포장 기획',lead:'hub',helpers:['dotori','sourcing'],note:'발주 뒤 시작 · 도장·포장재 리스트는 도토리 조사'},
  {name:'레터서비스',lead:'dotori',helpers:['page'],note:'10/26 운영·GitHub 페이지 ChatGPT 이관 · 기존 디자인 담당 협업'},
  {name:'통합 대시보드(ERP)',lead:'dotori',helpers:['github','codex','coupang','sourcing'],note:'운영 홈·프로젝트 연결·페이지 점검은 ChatGPT · 채널 취합·재발주 준비는 기존 담당'},
  {name:'쿠팡·스마트스토어·자사몰',lead:'coupang',helpers:['smartstore','page'],note:'쿠팡 광고 3가지 승인 — 윙 로그인 뒤 적용 · 로켓그로스 2차 입고 취소 · 스마트스토어 상품 9개 "14세 이상" 표시·말 정리(말랑이 카테고리는 사장님 답 대기) · 재고는 재고관리 끝난 뒤 실재고로 맞춤'},
  {name:'사업지원',lead:'dotori',helpers:[],note:'현금 지원 공고만'},
  {name:'자사몰 리디자인(식스샵)',lead:'page',helpers:[],note:'첫 방문 인트로 공개(10/16) · 시안·상세 템플릿 · 실제 반영은 사장님 승인 뒤'},
  {name:'AI 활용·학습 루프',lead:'hub',helpers:['research','hermes'],note:'담당별 플레이북 · 연구 예약 중단 · ChatGPT 소식 브리핑 08:00 · 헤르메스 1주 시험은 키 기다림'},
];

export const STATUS={active:['연결됨','ok'],ready:['준비됨','ok'],pending:['연결 시험 전','warn'],idle:['쉬는 중','idle'],retired:['종료','idle']};
