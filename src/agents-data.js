// 무무토리 AI 조직도 — 공개 저장소이므로 역할·범위·연결 방식만 적는다.
// 세션 ID·주소·파일 경로·원가 같은 내부 정보는 넣지 않는다(정본은 옵시디언 00_인덱스/에이전트 조직도).
// 담당이 생기거나 바뀌면 총괄 Claude가 이 파일과 볼트 정본을 같은 날 함께 고친다.
export const ORG_UPDATED='2026-10-11 10:35 KST';
export const ORG_EDITOR='총괄 Claude';

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
   scope:['다른 담당 결과 재검증','공동 기록 정리','지원사업 사이트'],
   out:[],channel:'ChatGPT 도토리 대화창에 총괄이 입력·확인',status:'active',checked:'2026-10-11 10:09',note:'사장님 직접 승인으로 역할 확정 · 8시·19시 점검 예약 유지'},
  {id:'codex',seat:'검토@무무토리',name:'Codex',kind:'OpenAI Codex · PC 앱',team:'개발',role:'구현·테스트·코드 검토',
   scope:['범위를 정해 받은 코드 작업','읽기 전용 검토·회귀 시험'],
   out:['push·배포(사장님 승인 필요)'],channel:'PC Codex 앱(무무토리 프로젝트)에 총괄이 입력·확인',status:'active',checked:'2026-10-11 10:15',note:'연결 시험 통과(읽기 전용)'},
  {id:'coupang',seat:'쿠팡@무무토리',name:'쿠팡 담당 Claude',kind:'Claude Code · VS Code',team:'채널 판매',role:'쿠팡 윙·로켓그로스·광고 운영',
   scope:['쿠팡 현황 파악','운영 가이드'],out:['광고·가격 변경(승인 필요)'],
   channel:'원격 연결 화면으로 총괄이 지시·확인',status:'active',checked:'2026-10-11 10:22',note:'연결 시험 통과 · 사장님 답 기다리는 질문 12개'},
  {id:'github',seat:'저장소@무무토리',name:'GitHub 관리 Claude',kind:'Claude Code · VS Code',team:'개발',role:'저장소 점검·정리',
   scope:['저장소 상태 점검'],out:[],channel:'원격 연결 자동 켜짐(시험 전)',status:'ready',checked:'2026-10-11 10:20',note:'총괄이 겸임 중'},
];

// 자리(seat): 대화가 바뀌어도 이름은 그대로 — 바뀐 대화 주소는 볼트 조직도에서만 갈아 끼운다.
// 코드 작업 2인조: 만드는 쪽(해당 분야 Claude) + 검토하는 쪽(검토@무무토리 = Codex, 읽기 전용 검토·회귀 시험).
export const PAIRING='만드는 쪽(그 분야 Claude 자리)이 고치고, 검토@무무토리(Codex)가 읽기만 하며 검토·시험한 뒤 배포합니다.';

// 프로젝트별 책임 — 상세 진행은 각 프로젝트 페이지·볼트 정본이 기준
export const PROJECTS=[
  {name:'오프라인 소품상점',lead:'hub',helpers:[],note:'10/31 전체 오픈 목표'},
  {name:'소싱·초도 발주',lead:'sourcing',helpers:['watcher'],note:'장바구니·검수'},
  {name:'레터서비스',lead:'hub',helpers:[],note:'담당 AI 미지정'},
  {name:'통합 대시보드(ERP)',lead:'hub',helpers:['codex'],note:'코드 작업은 범위를 정해 배정'},
  {name:'쿠팡·스마트스토어·자사몰',lead:'coupang',helpers:[],note:'쿠팡 결정 대기 12개'},
  {name:'사업지원',lead:'dotori',helpers:[],note:'현금 지원 공고만'},
];

export const STATUS={active:['연결됨','ok'],ready:['준비됨','ok'],pending:['연결 시험 전','warn'],idle:['쉬는 중','idle'],retired:['종료','idle']};
