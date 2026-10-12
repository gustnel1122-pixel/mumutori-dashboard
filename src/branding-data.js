// 무무토리 브랜딩 도구(도장·잉크·포장재) — 무엇을 쓰는지, 고장 나면 같은 판매처·같은 옵션으로 다시 살 정보.
// 공개 저장소에 올라가는 '공개 목록'이다. 판매처 상품 사양·후보/권고·표시 가격·제작 규칙처럼 공개해도 되는 것만 적는다.
// 여기에 두지 않는 것(칸 자체를 만들지 않는다): 주문번호·주문 내역 주소·발주일·수령일·결제 금액·수량, 도안 원본 위치(드라이브 링크·파일 ID)·제출 버전,
//   샘플 시험 결과, 개인 경로, 인증 정보. 그런 기록은 화면의 [기록하기]로 브라우저의 비공개 장부(erp.branding)에만 저장된다.
//   build.py 가 이 파일에서 비공개 칸 이름·드라이브 링크·개인 경로를 발견하면 빌드를 멈추고, 화면(src/pages/branding.js)은 허용한 칸만 읽는다.
// 상태는 미등록(unregistered)·후보(candidate)·권고(recommended)까지만 쓴다. 주문 완료·수령·사용 중은 증거(발주일·수령일)가 있는 내 기록에서만 나온다.
// 값이 null 이면 화면에 '확인 전'으로 나온다(지어내지 않는다).
export const BRAND_UPDATED='2026-10-12';
export const BRAND_EDITOR='대시보드 담당 Claude';
export const BRAND_BASIS='도토리(ChatGPT) 브랜딩 스탬프 구매 준비안 2026-10-12 · 판매처 상품 화면 2026-10-12 확인';

export const STATUS_RULE='110(종이용)·414(비닐용) 방향을 정했고 도토리의 구매 준비안을 반영했습니다(준비안 반영 완료·실제 주문 전). 주문·사용 증거가 없어 권고·후보까지만 적습니다. 최종 색·실제 도안 크기·414 리필 호환·OPP 실물 시험은 아직 확정이 아니며, 구매·업체 문의는 사장님 승인 뒤에 합니다.';

const GOGO='고고스탬프';
export const ITEMS=[
 {id:'STAMP-PAPER-01',kind:'도장',name:'종이용 대형 만년 도장 (고고 110)',use:'비코팅 헤더카드·크라프트·택배 상자',status:'recommended',
  vendor:GOGO,productNo:'110',url:'https://gogostamp.com/product/detail.html?product_no=110',
  model:'고고 110 대형 만년형',form:'잉크 내장 만년형(외부 패드 불필요)',printSize:'최대 72×46mm',artSize:null,option:'본체 검정(일제다이오) — 권고, 최종 색 확정 전',
  ink:{maker:'일제다이오(판매자 표기)',model:null,volume:'본체에 처음부터 충전됨',compat:'예비 리필은 INK-PAPER-01'},
  price:{lines:[['본품',29000],['기본 배송',3000]],total:32000,note:'리필 5cc(2,000원)와 한 번에 배송되면 34,000원 예상',checked:'2026-10-12'},
  art:{rule:'박스·봉투용 가로형(도토리 + MuMuTori)을 72×46mm 안에 가로 60mm 안팎으로 먼저 잡아 실제 포장에 대 보기 — 제안 단계'},
  pending:['로고 채택본(PNG 후보 여러 개 중 미정)','실제 도안 크기','최종 색','판매자 시안·제작 가능 답변'],
  caution:'코팅된 헤더카드에는 쓰지 않습니다(종이 전용).'},
 {id:'INK-PAPER-01',kind:'잉크',name:'만년스탬프용 리필 잉크 검정 5cc (고고 38)',use:'STAMP-PAPER-01 예비 리필',status:'recommended',
  vendor:GOGO,productNo:'38',url:'https://gogostamp.com/product/만년스탬프용리필잉크/38/',
  model:'고고 38 만년스탬프용 리필',form:'리필 병',printSize:null,artSize:null,option:'검정 5cc · SKU P00000BM000F',
  ink:{maker:'일제다이오(판매자 표기)',model:null,volume:'5cc (30cc P00000BM000G 12,000원 · 100cc P00000BM000H 25,000원도 있음)',compat:'110 상품의 추가 구성에서 이 리필(상품 38)을 연결 — 같은 판매자·같은 계열'},
  price:{lines:[['검정 5cc',2000]],total:2000,note:'따로 사면 기본 배송 3,000원이 붙어 5,000원. 110과 함께 주문하는 안',checked:'2026-10-12'},
  art:null,
  pending:['합배송 여부·최종 결제액'],
  caution:'다른 색과 섞거나 다른 회사의 만년용 잉크로 바꾸지 않습니다.'},
 {id:'STAMP-OPP-01',kind:'도장',name:'OPP 봉투용 속건 만년 도장 (고고 414)',use:'OPP 봉투 겉면에 직접 찍기',status:'candidate',
  vendor:GOGO,productNo:'414',url:'https://gogostamp.com/product/detail.html?product_no=414',
  model:'고고 414 속건 만년형',form:'잉크 내장 만년형(속건)',printSize:'07번 46×72mm',artSize:null,option:'검정 속건 잉크 — 권고(청색·빨강 옵션도 있음), 최종 색 확정 전',
  ink:{maker:null,model:null,volume:'본체에 처음부터 충전됨',compat:'리필 후보는 INK-OPP-01 — 414와 같은 잉크인지 미확인'},
  price:{lines:[['본품',25000],['크기 추가(46×72mm)',20000],['기본 배송',3000]],total:48000,note:null,checked:'2026-10-12'},
  art:{rule:'종이용과 같은 로고라도 OPP용 생산 파일은 따로 버전 관리(번짐·미끄러짐에 맞춰 선·여백 보정)'},
  pending:['실제 쓰는 OPP 봉투로 시험(건조 → 문지름·구김·겹침)','414 리필의 정확한 모델·호환 근거','로고 채택본·실제 도안 크기·최종 색'],
  caution:'판매자의 비닐 날인 예시가 우리 OPP와 같은 재질이라는 증거는 없습니다. 시험 통과 전에는 포장에 쓰지 않습니다.'},
 {id:'INK-OPP-01',kind:'잉크',name:'의류용 스탬프 리필 30ml 검정 (고고 386) — 414 리필 후보',use:'STAMP-OPP-01 리필(호환 확인 전)',status:'candidate',
  vendor:GOGO,productNo:'386',url:'https://gogostamp.com/product/의류용스탬프-리필잉크-30ml/386/',
  model:'고고 386 의류용 스탬프 리필',form:'리필 병',printSize:null,artSize:null,option:'검정 30ml · SKU P00000OW000A (빨강 …000B · 청색 …000C)',
  ink:{maker:null,model:null,volume:'30ml',compat:'414의 추가 구성으로 연결돼 있으나, 414에 처음 충전된 잉크와 같다는 판매자 확인은 없음 — 전용 리필로 확정하지 않음'},
  price:{lines:[['검정 30ml',20000]],total:20000,note:'따로 사면 기본 배송 3,000원',checked:'2026-10-12'},
  art:null,
  pending:['판매자에게 "414(46×72mm, 검정)에 처음 충전된 잉크와 상품 386 검정 30ml가 같은 제품인지" 확인 — 문의는 사장님 승인 뒤'],
  caution:'확인 전에는 414에 넣지 않습니다.'},
 {id:'STAMP-HEADER-01',kind:'도장',name:'작은 헤더카드용 도장 (도토리 단독)',use:'작은 헤더카드',status:'candidate',
  vendor:null,productNo:null,url:null,model:null,form:null,printSize:null,artSize:'도토리 단독 30·35·40mm 비교본을 100% 출력해 고르기 — 제안 단계',option:'검정(종이용) 제안',
  ink:null,price:null,art:{rule:'접힘선·스테이플·상품에 가리는 위치를 표시하고 작은 눈·입·가는 선이 보이는지 확인'},
  pending:['별도 소형 도장이 필요한지(110을 작게 만들어도 본체가 큼)','모델·견적'],caution:null},
 {id:'PACK-OPP-01',kind:'포장재',name:'OPP 봉투 (지금 쓰는 제품)',use:'상품 포장',status:'unregistered',vendor:null,productNo:null,url:null,model:null,form:null,printSize:null,artSize:null,option:null,
  ink:null,price:null,art:null,
  pending:['가로·세로·두께·접착 형태','재주문 판매처·상품번호','시험에 쓴 묶음(로트)'],caution:null},
 {id:'PACK-HEADER-01',kind:'포장재',name:'헤더카드 (지금 쓰는 제품)',use:'상품 걸이 포장',status:'unregistered',vendor:null,productNo:null,url:null,model:null,form:null,printSize:null,artSize:null,option:null,
  ink:null,price:null,art:null,
  pending:['펼친 크기·접은 크기·평량·코팅 여부','재주문 판매처·상품번호'],caution:'코팅된 카드면 종이용 도장(110) 대상이 아닙니다.'},
 {id:'PACK-BOX-01',kind:'포장재',name:'택배 상자 (지금 쓰는 제품)',use:'배송',status:'unregistered',vendor:null,productNo:null,url:null,model:null,form:null,printSize:null,artSize:null,option:null,
  ink:null,price:null,art:null,
  pending:['안쪽 가로×세로×높이·골·색','재주문 판매처·상품번호'],caution:null}
];

// 하지 말 것(비추천) — 리필은 같은 계열 전용만
export const DONT=[
 '110(종이용)에 속건·비닐용 잉크를 넣어 비닐에 찍는 방식은 권하지 않습니다. 종이용과 비닐용은 도장을 따로 씁니다.',
 '414에 상품 38(종이용 리필)이나 다른 회사 잉크(StazOn 등)를 임의로 넣지 않습니다.',
 '리필은 같은 판매자·같은 계열·같은 색만 씁니다. 색을 섞지 않습니다.',
 '실제 쓰는 OPP 봉투로 시험을 통과하기 전에는 414를 포장에 쓰지 않습니다.',
 '주문·수령·시험 증거 없이 상태를 주문 완료·사용 중으로 올리지 않습니다.'
];

// 판매자 제작 규칙(고고스탬프 제작 가이드에서 확인한 것) — mirror: 좌우 반전 제출 여부
export const MAKER_RULES=[
 '도안은 AI 파일 또는 JPG·PNG — 도안은 검정, 배경은 흰색, 원하는 크기를 적어 접수',
 '판매자가 제작 가능하다고 답한 뒤 해당 상품을 결제, 제작 전에 시안 확인',
 '이미지·디자인 의뢰는 추가 비용이 있을 수 있음(상품 화면의 5,000원 옵션은 간단한 문구용)',
 '좌우 반전(미러링)해서 보내야 하는지는 가이드에 없음 — 시안 단계에서 판매자에게 확인하고, 임의로 뒤집어 보내지 않음',
 '주문 제작이라 제작 준비 뒤에는 취소·단순 변심 반품이 제한됨 — 결제 전에 조건·배송비·제작일 다시 확인'
];
export const ART_PLAN='권고 납품물(판매자 필수 형식은 아님): 1:1 mm 단위 벡터 AI 원본 + 글자를 윤곽선으로 바꾼 생산용 AI + 실제 크기 PDF + 흑백 PNG 미리보기. 단색 검정, 그림자·회색·그라데이션 없이. 주문에 실제로 낸 파일은 덮어쓰지 않고 버전을 올립니다. 로고는 여러 PNG 후보 중 채택본이 아직 정해지지 않았고, 생산 원본도 아직 없습니다.';

export const REORDER_STEPS=[
 '이 화면에서 품목 ID의 판매처·상품번호·옵션·SKU를 확인합니다.',
 '품목 카드의 내 기록(이 브라우저 장부)에서 마지막 주문번호, 실제로 제출한 도안 버전, 결제 금액을 확인합니다.',
 '같은 판매처·같은 상품번호·같은 옵션으로 주문합니다. 도안은 승인본 그대로 냅니다(고치면 버전을 올리고 시안을 다시 확인).',
 '받으면 실제 쓰는 종이·OPP에 찍어 보고(건조 → 문지름·구김·겹침) 결과를 [기록 수정]의 샘플 시험 칸에 적은 뒤 사용 중으로 바꿉니다.',
 '잉크만 떨어졌으면 리필 품목 ID의 SKU로 주문합니다(같은 계열·같은 색).',
 '단종되거나 옵션이 바뀌었으면 대체 품목을 [+ 품목 추가]로 새로 만들고, 이전 품목은 지우지 않고 상태를 단종·대체로 바꿉니다.'
];
export const PRIVATE_NOTE='[기록하기]·[+ 품목 추가]로 적은 내용(발주일·주문번호·결제액·도안 원본 위치·시험 결과 포함)은 이 브라우저에만 저장되고 저장소·공개 목록에는 올라가지 않습니다. 전체 백업 파일에 함께 들어가며, 다른 기기·다른 브라우저에서는 백업을 가져와야 보입니다.';
