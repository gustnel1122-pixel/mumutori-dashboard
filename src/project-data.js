// 운영 홈과 프로젝트 페이지가 함께 쓰는 공개 요약. 금액·계정·개인정보를 넣지 않습니다.
export const PROJECT_UPDATED_AT = '2026-10-26';
export const PROJECT_CHECK_NOTE = '10/26 정본 확인';
export const PROJECTS = [
  {
    "id": "offline",
    "title": "오프라인 매장 · 11/1(일)",
    "kicker": "공간 · 집기",
    "status": [
      "11월 1일(일) 오픈 준비",
      "다희 님 배치안 기준으로 집기 정리",
      "구매 여부가 불분명한 품목은 확인 필요"
    ],
    "next": "오늘 구매 목록에서 기존 비품을 먼저 확인하고, 테이블을 실측",
    "href": "store-opening.html",
    "links": [
      {
        "label": "오늘 팔시보 구매",
        "href": "palsibo-shopping.html"
      }
    ]
  },
  {
    "id": "letter",
    "title": "레터서비스",
    "kicker": "편지 · 접수",
    "status": [
      "인쇄 편지·대필 편지 2종 판매 중",
      "대필 편지는 다희 님이 작성",
      "봉투 선택은 준비 중"
    ],
    "next": "고객 작성 링크의 접수를 연결하고 실제 저장 확인",
    "href": "project-hub.html?project=letter",
    "links": [
      {
        "label": "레터 운영 페이지",
        "href": "https://letter.mumutori.com/"
      },
      {
        "label": "인쇄 편지 작성",
        "href": "https://letter.mumutori.com/print.html"
      },
      {
        "label": "대필 편지 작성",
        "href": "https://letter.mumutori.com/ghost.html"
      }
    ]
  },
  {
    "id": "mall",
    "title": "자사몰",
    "kicker": "온라인 매장",
    "status": [
      "소품과 레터서비스 판매 중",
      "귀리 크림 중심 화면 반영",
      "새 로고·캐릭터 교체할 자리 점검 중"
    ],
    "next": "아직 남은 옛 로고와 캐릭터를 최신 기준으로 정리",
    "href": "project-hub.html?project=mall",
    "links": [
      {
        "label": "자사몰 열기",
        "href": "https://mumutori.com"
      }
    ]
  },
  {
    "id": "coupang",
    "title": "쿠팡",
    "kicker": "판매 · 입고",
    "status": [
      "2차 입고 취소 완료",
      "1차 입고 상품 판매·노출 점검 중",
      "기존 판매 상품 운영 중"
    ],
    "next": "1차 상품의 방문·장바구니·판매를 같은 기간으로 비교",
    "href": "project-hub.html?project=coupang",
    "links": [
      {
        "label": "판매·정산 기록",
        "href": "sales.html"
      },
      {
        "label": "물류·재고 기록",
        "href": "stock.html"
      }
    ]
  },
  {
    "id": "smartstore",
    "title": "스마트스토어",
    "kicker": "네이버 판매",
    "status": [
      "12개 상품 배송 기준 변경 완료",
      "상품명·태그 정리 반영",
      "알림받기 쿠폰은 적용 전"
    ],
    "next": "판매자센터 접속 가능한 때 쿠폰 설정 확인",
    "href": "project-hub.html?project=smartstore",
    "links": [
      {
        "label": "스마트스토어 열기",
        "href": "https://smartstore.naver.com/mumutori_market"
      }
    ]
  },
  {
    "id": "characters",
    "title": "캐릭터 · 씨앗 컴퍼니",
    "kicker": "브랜드 · 디자인",
    "status": [
      "새 로고와 씨앗 친구 일곱 확정",
      "캐릭터 설정 v1.2·3D 기준 정리",
      "고객 화면의 옛 캐릭터 교체 진행"
    ],
    "next": "새 캐릭터 기준에 맞춰 남은 화면을 교체",
    "href": "characters.html",
    "links": [
      {
        "label": "캐릭터 보드",
        "href": "characters.html"
      },
      {
        "label": "브랜딩 도구",
        "href": "branding.html"
      }
    ]
  },
  {
    "id": "finance",
    "title": "재무",
    "kicker": "기록 · 확인",
    "status": [
      "공용 장부로 기록 관리",
      "계좌별 대조·확인 필요 화면 운영",
      "재무 수치는 로그인 후 확인"
    ],
    "next": "장부의 확인 필요 항목과 거래 분류 정리",
    "href": "finance.html",
    "links": [
      {
        "label": "재무 장부",
        "href": "finance.html"
      },
      {
        "label": "확인 필요 항목",
        "href": "finance.html#fin-needs"
      }
    ]
  }
];
