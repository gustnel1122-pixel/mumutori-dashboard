// 공개용 품목만. 가격·원가·계좌·내부 문서 식별자는 넣지 않는다.
export const SHOPPING_KEY = 'mumutori-palsibo-20261026-v1';
export const SHOPPING_DATE = '2026-10-26';
export const SHOPPING_ITEMS = [
  {id:'left-cabinets',group:'today',zone:'왼쪽 진열',name:'빈티지 서랍장·수납장',qty:'2개 내외',use:'왼쪽 벽 아래 상품 진열',figure:'전체 배치 · 왼쪽 벽 아래',image:'interior',status:'보유 확인 후 부족분',note:'좌우 합계 4개 내외가 목표예요. 폭·높이·문 열 공간을 재고 기존 가구부터 확인해요.'},
  {id:'right-cabinets',group:'today',zone:'오른쪽 진열',name:'빈티지 서랍장·수납장',qty:'2개 내외',use:'오른쪽 벽 아래, 레터 책상 왼쪽',figure:'전체 배치 · 오른쪽 벽 / 레터 코너 · 왼쪽',image:'interior',status:'보유 확인 후 부족분',note:'왼쪽 가구와 높이가 비슷한 것을 골라요. 레터 책상 자리와 통로를 먼저 남겨요.'},
  {id:'letter-desk',group:'today',zone:'레터 코너',name:'타자기 책상',qty:'1개',use:'타자기와 손님 작성 자리',figure:'레터 코너 · 오른쪽 벽 끝',image:'letter',status:'보유 확인 후 부족분',note:'타자기 무게를 버티는지, 상판 흔들림과 콘센트 위치를 확인해요.'},
  {id:'letter-stool',group:'today',zone:'레터 코너',name:'나무 스툴',qty:'1개',use:'레터 책상 앞 좌석',figure:'레터 코너 · 책상 아래',image:'letter',status:'보유 확인 후 부족분',note:'책상 높이를 정한 뒤 같이 앉아 보고 골라요.'},
  {id:'letter-mailbox',group:'today',zone:'레터 코너',name:'잠금형 벽걸이 우편함',qty:'1개',use:'손님이 쓴 편지 접수',figure:'레터 코너 · 책상 바로 위 벽',image:'letter',status:'잠금·고정 확인 필요',note:'열쇠와 편지 투입구를 확인해요. 벽 고정 방식이 가능한지도 현장에서 봐요.'},
  {id:'character-frames',group:'today',zone:'벽면 장식',name:'짙은 갈색 나무 액자',qty:'2개',use:'도토리 로고와 씨앗 친구 그림',figure:'전체 배치 · 좌우 벽 각 1개',image:'interior',status:'구매 완료 확인 필요',note:'세로 그림 1개·가로 그림 1개. 안쪽 규격을 적어 오면 준비된 그림을 맞춰 출력해요.'},
  {id:'chalk-paint',group:'today',zone:'가구 도장',name:'버터색 초크 페인트',qty:'필요량 확인',use:'좌우 가구와 타자기 책상 도장',figure:'전체 배치 · 버터색 가구',image:'interior',status:'도장 면적 확인 필요',note:'테이블보 색에 맞춰요. 기존 2~3L는 예상치이므로 실제 칠할 면적을 확인한 뒤 골라요.'},
  {id:'matte-varnish',group:'today',zone:'가구 도장',name:'무광 바니시',qty:'필요량 확인',use:'도장한 가구 표면 마감',figure:'전체 배치 · 가구 표면',image:'interior',status:'제품·필요량 확인',note:'선택한 페인트에 사용할 수 있는 마감재인지 제품 설명을 확인해요.'},
  {id:'paint-tools',group:'today',zone:'가구 도장',name:'붓·롤러·도장 트레이',qty:'보유분 확인 후',use:'가구 도장 작업',figure:'전체 배치 · 가구 작업',image:'interior',status:'구성·수량 확인 필요',note:'집이나 매장에 있는 도구를 먼저 확인해요.'},
  {id:'paint-protection',group:'today',zone:'가구 도장',name:'마스킹 테이프·보양 비닐',qty:'작업 범위에 맞게',use:'바닥·손잡이·주변 벽 보호',figure:'전체 배치 · 가구 주변',image:'interior',status:'보유·수량 확인 필요',note:'바닥 보호재가 이미 있다면 새로 사지 않아요.'},
  {id:'measure-table',group:'verify',zone:'중앙 테이블',name:'기존 테이블 실측·사진',qty:'가로·세로·높이',use:'테이블보 최종 규격',figure:'버터 테이블보 · 중앙 테이블',image:'butter',status:'오늘 먼저 확인',note:'약 200×60cm는 가안이에요. 높이 75cm와 ㄷ자 천 320cm도 확정값이 아니에요.'},
  {id:'typewriter-check',group:'verify',zone:'레터 코너',name:'타자기 보유·작동 확인',qty:'1대 기준',use:'한글 편지 인쇄',figure:'레터 코너 · 책상 위',image:'letter',status:'추가 구매 전 확인',note:'마라톤 1000 DLX 자판 사진 기준이 있어요. 실제 보유·현장 반입, 한글·급지·리본은 확인이 필요해요.'},
  {id:'display-tools',group:'verify',zone:'상품 진열',name:'트레이·꽂이·키링 걸이·안내 홀더',qty:'상품 배치 후 확정',use:'높낮이 진열과 안내',figure:'전체 배치 · 상판과 벽면',image:'interior',status:'추가 후보',note:'이전 준비표의 후보예요. 다희 배치에 필요한 것만, 기존 재고를 확인한 뒤 골라요.'},
  {id:'back-room',group:'verify',zone:'창고·작업실',name:'커튼·봉 / 선반·보관함·작업대',qty:'실측·보유 확인',use:'뒤쪽 공간 가림과 포장 작업',figure:'전체 배치 · 뒤쪽 공간',image:'interior',status:'추가 후보',note:'커튼 1세트·폭 약 100cm는 이전 가안이에요. 그림만으로 크기와 수량을 확정하지 않아요.'},
  {id:'cargo-arrival',group:'verify',zone:'상품·포장',name:'중국 화물 도착·내용물 확인',qty:'도착분 대조',use:'매장 상품·포장재 중복 구매 방지',figure:'전체 배치 · 상품 진열',image:'interior',status:'현장 도착 확인 필요',note:'입항·비용 결제 기록만 있어요. 실제 도착과 포장재 포함 여부를 보고 부족분을 정해요.'},
  {id:'tablecloth-choice',group:'elsewhere',zone:'중앙 테이블',name:'테이블보 제작 방식 선택·주문',qty:'A 또는 B 중 하나',use:'중앙 테이블을 버터 포장처럼',figure:'버터 테이블보 · 중앙',image:'butter',status:'선택 전 · 별도 주문',note:'A 제안: 무지 박스 커버 1 + ㄷ자 인쇄천 1 + 벨크로·집게. B: 맞춤 4면 박스형 1. 둘 다 사지 않아요. 10/31까지 수령 가능 여부를 확인해요.'},
  {id:'signs',group:'elsewhere',zone:'입구',name:'정면 간판·돌출간판·입구 배너',qty:'각 1안 · 실측 필요',use:'매장 입구 안내',figure:'다희 안 · 입구 간판 계획',image:null,status:'업체·일정 확인 필요',note:'간판 자리를 재고 새 로고로 별도 제작해요. 설치·수령일은 아직 확정되지 않았어요.'},
  {id:'frame-print',group:'elsewhere',zone:'벽면 장식',name:'액자 속 캐릭터 그림 출력',qty:'2장',use:'새로 고른 액자 안에 넣기',figure:'전체 배치 · 좌우 액자',image:'interior',status:'출력 파일 준비됨',note:'A3/A4 준비본이 있어요. 액자 안쪽 치수에 맞는 판을 실제 크기로 출력해요.'},
  {id:'letter-supplies',group:'elsewhere',zone:'레터 코너',name:'편지지·봉투·필기구·안내 카드',qty:'재고·규격 확인 후',use:'손님 작성과 포장',figure:'레터 코너 · 책상 위',image:'letter',status:'재고 확인 후 준비',note:'포장재 구매표·주문내역과 먼저 대조해요. 장바구니에 담긴 것을 구매 완료로 세지 않아요.'},
  {id:'packing-supplies',group:'elsewhere',zone:'포장·출력',name:'도장·라벨·봉투·상자·필요한 잉크',qty:'부족분만',use:'상품 포장과 안내 출력',figure:'상품 포장 / 레터 포장',image:null,status:'기존 주문 확인 필요',note:'기존 온라인 구매표를 먼저 확인해요. 포장재를 모두 새로 사는 목록이 아니에요.'},
  {id:'lucky-goods',group:'elsewhere',zone:'캐릭터 굿즈',name:'럭키 세트 굿즈',qty:'제작 수량 미정',use:'스티커·엽서·책갈피·키링 등',figure:'럭키 세트 · 제작 시안',image:'lucky',status:'시안 · 구매 대상 미확정',note:'그림이 있다는 것이 제작·주문 완료를 뜻하지 않아요. 오늘 현장 집기 구매에서 분리해요.'},
  {id:'owned-pos',group:'owned',zone:'계산대',name:'카드 단말기',qty:'수령 기록 있음',use:'결제와 취소',figure:'계산대',image:null,status:'이미 받음',note:'10/26 수령 확인. 연결·개통·결제/취소 시험은 아직 남아 있어요.'},
  {id:'owned-printer',group:'owned',zone:'출력',name:'EPSON L18050 프린터',qty:'집에 보유',use:'액자·라벨·안내 출력',figure:'출력 작업 자리',image:null,status:'보유 기록 있음',note:'새 프린터 구매는 제외해요. 현장 사용 여부와 잉크 잔량만 확인해요.'},
  {id:'owned-table',group:'owned',zone:'중앙 테이블',name:'기존 중앙 DP 테이블',qty:'1개 재사용',use:'버터 테이블보를 씌울 바탕',figure:'버터 테이블보 · 중앙',image:'butter',status:'기존 집기 재사용',note:'새 버터 조형 테이블 주문제작은 보류예요. 현재 테이블부터 실측해요.'},
  {id:'owned-interior',group:'owned',zone:'기존 공간',name:'벽면 우드·조명·후면 카운터',qty:'기존 것 유지',use:'매장 기본 공간',figure:'전체 배치 · 벽·천장·뒤쪽',image:'interior',status:'재사용',note:'재구매 목록에서 제외하고 상태만 살펴봐요.'}
];
export const SHOPPING_IMAGES = {
 interior:{src:'assets/store-plan/interior-v3.jpg',label:'전체 배치',caption:'왼쪽 가구 2 · 오른쪽 가구 2 · 중앙 테이블 · 앞쪽 레터 코너'},
 butter:{src:'assets/store-plan/butter-cloth-v3.jpg',label:'버터 테이블보',caption:'중앙 기존 테이블. 테이블보 제작 방식과 규격은 선택·실측 후 확정'},
 letter:{src:'assets/store-plan/letter-corner-v3.jpg',label:'레터 코너',caption:'오른쪽 벽 끝 책상 · 스툴 · 책상 위 타자기 · 바로 위 우편함'},
 lucky:{src:'assets/store-plan/lucky-set.jpg',label:'럭키 세트',caption:'캐릭터 굿즈 제작 시안. 오늘 집기 구매와 별도'}
};
