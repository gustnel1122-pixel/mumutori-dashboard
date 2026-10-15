// 무무토리 AI 조직도 — 공개 저장소이므로 역할·범위·연결 방식만 적는다.
// 세션 ID·주소·파일 경로·원가 같은 내부 정보는 넣지 않는다(정본은 옵시디언 00_인덱스/에이전트 조직도).
// 담당이 생기거나 바뀌면 총괄 Claude가 이 파일과 볼트 정본을 같은 날 함께 고친다.
export const ORG_UPDATED='2026-10-16 07:20 KST';
export const ORG_EDITOR='페이지 담당 Claude(총괄 지시)';

// status: active(연결·검증됨) | ready(켜면 쓸 수 있음) | pending(연결 시험 전) | idle(쉬는 중) | retired(종료)
export const OWNER={id:'owner',name:'김현수 사장님',role:'결정·승인·로그인',scope:['상품·수량·예산 결정','발주·결제·계약 승인','보안 설정·로그인'],status:'active'};

export const HUB={id:'hub',seat:'총괄@무무토리',name:'총괄 Claude',kind:'Claude · claude.ai',role:'전체 흐름 총괄',
  scope:['사장님 지시를 담당에게 전달','결과 확인·검증','통합 할 일·조직도·기록 관리','총괄 보고판'],
  channel:'사장님과 대화창으로 직접',status:'active',since:'2026-10-11'};

export const AGENTS=[
  {id:'sourcing',seat:'소싱@무무토리',name:'소싱 Claude',kind:'Claude Code · VS Code',team:'소싱·발주',role:'1688 소싱·장바구니·상품 검수',
   scope:['소싱 보드 화면','추천 제외·취향 규칙','선택 옵션 검수','보드 자동 처리기 관리'],
   out:['총괄 보고판','발주·결제(사장님 승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-11 09:35',note:'연결 시험 통과'},
  {id:'watcher',seat:'소싱-자동@무무토리',name:'보드 자동 처리기',kind:'PC 프로그램',team:'소싱·발주',role:'보드 요청 자동 처리',
   scope:['신청서 작성 요청 처리(신청하기 X)','검수 요청을 소싱 Claude에 전달'],
   out:['신청·결제'],channel:'소싱 보드 버튼 → 자동 실행',status:'active',checked:'2026-10-11 08:39',note:'로그 기준 연결 유지'},
  {id:'dotori',seat:'검증@무무토리',name:'도토리',kind:'ChatGPT',team:'검증·기록',role:'독립 검증·기록 정리',
   scope:['다른 담당 결과 재검증','공동 기록 정리','지원사업 사이트','조사: 버터 집기 업체·도장/포장재·KC','일일 보고로 실행계획 작성'],
   out:['업체 연락·구매(사장님 승인 필요)'],channel:'ChatGPT 도토리 대화창에 총괄이 입력·확인',status:'active',checked:'2026-10-11 10:09',note:'10/11 조사 업무 추가 · 8시·19시 점검 예약 유지'},
  {id:'codex-vscode',seat:'검토@무무토리',name:'검토·시험 담당',kind:'OpenAI Codex · VS Code',team:'개발',role:'Claude Code가 만든 것을 검토·시험',
   scope:['담당 Claude가 만든 코드·화면 읽기 검토','회귀 시험','고칠 점은 글로 남김(직접 고치지 않음)'],
   out:['상품 변경·물품 발주','보안 설정 변경','push·배포','업체 연락·메일 발송','개인정보 전송'],
   channel:'VS Code Codex 창 · 권한 \'승인 요청(Ask for approval)\'만',status:'ready',checked:'2026-10-16 07:15',note:'10/16 새 자리 · 코드 검토는 이 자리로 옮김'},
  {id:'codex',seat:'Codex앱@무무토리',name:'Codex 앱',kind:'OpenAI Codex · PC 앱',team:'개발',role:'범위를 정한 작업',
   scope:['범위를 정해 받은 작업(메일 초안·DNS 확인 같은 일)'],
   out:['push·배포(사장님 승인 필요)'],channel:'PC Codex 앱(무무토리 프로젝트)에 총괄이 입력·확인',status:'active',checked:'2026-10-11 10:15',note:'10/16 코드 검토는 VS Code Codex(검토@무무토리)로 옮김'},
  {id:'coupang',seat:'쿠팡@무무토리',name:'쿠팡 담당 Claude',kind:'Claude Code · VS Code',team:'채널 판매',role:'쿠팡 윙·로켓그로스·광고 운영',
   scope:['쿠팡·스마트스토어·자사몰 현황','매일 아침 일일 보고(데이터·개선점·결정 거리)','운영 가이드'],out:['광고·가격 변경(승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-11 10:22',note:'1순위: 집 재고 로켓그로스 입고 준비'},
  {id:'github',seat:'대시보드@무무토리',name:'대시보드 담당 Claude',kind:'Claude Code · VS Code',team:'개발',role:'채널 데이터 취합·재발주 준비·대시보드 반영',
   scope:['판매처별 판매·재고·소진율 취합','판매 중인 상품 재발주 추천 수량','통합 대시보드 화면 반영','저장소 점검'],out:['발주 신청·장바구니 변경·결제'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-11 23:20',note:'10/11 대시보드 담당으로 지정(기존 GitHub 관리 대화)'},
  {id:'page',seat:'페이지@무무토리',name:'페이지 담당 Claude',kind:'Claude Code · VS Code',team:'페이지·디자인',role:'자사몰·레터·오프라인 프로젝트 페이지',
   scope:['자사몰 리디자인 시안·상세 템플릿','레터·오프라인 준비 페이지 글·목록 맞추기','포장·첫 방문 인트로 시안'],
   out:['실제 자사몰 저장·게시(사장님 승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-16 07:15',note:'조직도에 빠져 있던 자리 추가(10/16)'},
  {id:'research',seat:'연구@무무토리',name:'AI 활용 담당',kind:'Claude · 예약 작업',team:'AI 활용',role:'새 AI 소식 조사 → 주간 제안',
   scope:['매주 새 AI 도구·기능 조사','무무토리에 바로 쓸 것 1~3개 제안서','보고판 질문 1개','담당별 플레이북 정리 제안'],
   out:['설치·가입·결제(제안만)'],
   channel:'매주 월요일 08:19 예약 작업(사장님 컴퓨터 사용) → 볼트 주간 제안',status:'ready',checked:'2026-10-16 07:15',note:'10/16 새 자리 · 첫 실행 10/19(월)'},
];

// 학습 루프(2026-10-16 켬): 일하면서 배운 것을 담당별 플레이북에 쌓아 다음 일에 쓴다.
export const LOOP=['일 시작 전 — 자기 플레이북과 작업 환경 함정 노트를 읽고 같은 종류의 일은 그 순서대로 합니다.',
  '일 끝난 뒤 — 새로 알게 된 것·실수·더 빠른 방법을 3줄 이내로 \'배운 것\'에 더합니다(날짜·건 ID).',
  '같은 일이 두 번째면 순서를 절로 정리하고, 같은 교훈이 두 번 나오면 작업법·스킬·도구를 고칩니다.',
  '매주 월요일 AI 활용 담당이 플레이북을 읽고 합칠 것·나눌 것·스킬로 굳힐 것을 제안합니다.'];

// 자리(seat): 대화가 바뀌어도 이름은 그대로 — 바뀐 대화 주소는 볼트 조직도에서만 갈아 끼운다.
// 코드 작업 2인조: 만드는 쪽(해당 분야 Claude) + 검토하는 쪽(검토@무무토리 = VS Code Codex, 읽기 전용 검토·회귀 시험). 2026-10-16 Codex 앱 → VS Code Codex.
export const PAIRING='만드는 쪽(그 분야 Claude 자리)이 고치고, 검토@무무토리(VS Code Codex)가 읽기만 하며 검토·시험해 고칠 점을 글로 남긴 뒤 배포합니다(배포는 총괄 허락 범위 또는 사장님 승인).';

// 프로젝트별 책임 — 상세 진행은 각 프로젝트 페이지·볼트 정본이 기준
export const PROJECTS=[
  {name:'오프라인 소품상점',lead:'hub',helpers:['dotori'],note:'10/31 오픈 · 메인 매장만 · 버터 집기 업체 조사(도토리)'},
  {name:'소싱·초도 발주',lead:'sourcing',helpers:['watcher'],note:'KC 비대상 잡화·재발주 회차 → 장바구니·검수'},
  {name:'포장 기획',lead:'hub',helpers:['dotori','sourcing'],note:'발주 뒤 시작 · 도장·포장재 리스트는 도토리 조사'},
  {name:'레터서비스',lead:'hub',helpers:[],note:'담당 AI 미지정'},
  {name:'통합 대시보드(ERP)',lead:'github',helpers:['codex','coupang','sourcing'],note:'재발주 준비 표·채널 데이터 취합'},
  {name:'쿠팡·스마트스토어·자사몰',lead:'coupang',helpers:[],note:'쿠팡 결정 대기 12개'},
  {name:'사업지원',lead:'dotori',helpers:[],note:'현금 지원 공고만'},
  {name:'자사몰 리디자인(식스샵)',lead:'page',helpers:[],note:'시안·상세 템플릿·첫 방문 인트로 · 실제 반영은 사장님 승인 뒤'},
  {name:'AI 활용·학습 루프',lead:'hub',helpers:['research'],note:'담당별 플레이북 · 매주 월요일 주간 제안'},
];

export const STATUS={active:['연결됨','ok'],ready:['준비됨','ok'],pending:['연결 시험 전','warn'],idle:['쉬는 중','idle'],retired:['종료','idle']};
