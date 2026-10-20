# 휴대폰 앱(PWA) 운영 안내

PC 브라우저와 휴대폰 앱은 같은 주소의 같은 화면을 사용합니다. 앱 설치는 바로 여는 아이콘과 앱 형태의 창을 제공하며, PC의 브라우저 원장을 휴대폰으로 복사하지 않습니다.

## 설치

- 아이폰: 대시보드를 Safari로 열기 → 공유 → **홈 화면에 추가**.
- 안드로이드: 대시보드를 Chrome으로 열기 → 메뉴 → **앱 설치** 또는 **홈 화면에 추가**.
- 설치 후 홈 화면의 무무토리 아이콘으로 엽니다. 공용 장부는 기존과 같은 계정으로 로그인해야 합니다. 설치 메뉴의 이름과 표시 여부는 OS·브라우저에 따라 다릅니다.

## 한 번 빌드하여 PC와 앱에 함께 반영

1. 수정은 `build.py`와 `src/`의 원본에 합니다. 빠른 장부 틀은 `src/quick-shell.html`입니다. 루트의 15개 화면 HTML과 `sw.js`는 생성물이므로 직접 편집하지 않습니다.
2. `python -B build.py` 한 번으로 15개 HTML, 아이콘 4개, 버전이 포함된 서비스워커를 만듭니다. 아이콘은 `assets/mark.svg`에서 표준 라이브러리만 사용하는 `_tools/pwa_icons.py`로 재생성합니다.
3. 빌드와 시험을 마친 파일을 검토합니다. **이 제작 작업에서는 로컬 커밋까지만 하고 원격 push·배포하지 않습니다.** 총괄 검수 뒤 배포 담당이 같은 주소에 하나의 빌드 전체를 함께 배포합니다.
4. PC·휴대폰 앱 모두 HTML은 네트워크에서 먼저 확인합니다. 앱을 다음에 열거나 열린 창으로 돌아오면 서비스워커 업데이트를 확인합니다. 새 버전이 현재 화면과 다르면 아래에 **새 버전이 있어요 · 눌러서 새로고침**이 나타납니다.
5. 작성 중인 내용을 저장한 뒤 띠를 누릅니다. 자동으로 새로고침하여 입력을 지우지는 않습니다. 오래 열린 다른 탭에도 안내가 나타나며 각 탭에서 새로고침합니다. 앱 재설치는 필요 없습니다.

버전은 소스·빌드 도구·공개 정적 파일의 경로와 내용 해시입니다. 텍스트의 CRLF/LF 줄바꿈은 같은 내용으로 계산하여 Windows 체크아웃과 GitHub Pages에서 함께 검증합니다. 같은 내용으로 다시 빌드하면 같은 버전이 됩니다. 배포는 HTML·정적 파일·`sw.js` 전체를 함께 바꿔야 합니다. HTML 버전과 다른 파일은 캐시에 새로 넣지 않습니다. 네트워크 단절·브라우저 종료·백그라운드 제한 중에는 즉시 반영을 보장하지 않습니다.

## 오프라인과 저장 경계

- 인터넷 연결이 끊기면 오프라인 띠가 표시됩니다. 연결된 장부를 조회·저장하는 작업은 온라인에서 합니다. 오프라인 입력 대기열이나 자동 재전송 기능은 없습니다.
- HTML은 네트워크 먼저, 검증한 화면 캐시, 마지막에 **연결 안 됨** 안내 순서입니다. 홈·재무·통장·빠른 장부 및 네트워크에 의존하는 소싱·캐릭터·브랜딩 HTML은 캐시하지 않아 연결이 끊기면 중립적인 안내가 나옵니다.
- 상품·구매·판매·재고·거래처·이력·설정·조직도의 공개 HTML 틀만 저장할 수 있습니다. 화면에서 표시한 개인 기록을 HTML로 저장하지 않습니다. 캐시 화면도 필요한 파일이 이전에 로드됐고 이 브라우저의 자료가 있을 때만 열릴 수 있습니다. 나머지는 연결 후 다시 엽니다.
- 허용 목록의 같은 출처 CSS·JS·이미지는 캐시를 먼저 보여 주고 네트워크에서 갱신합니다(stale-while-revalidate). 캐시에 쓰기 전에 빌드 시점의 SHA-256과 일치하는지 확인합니다.
- 모든 JSON·seed·API 응답, 로그인·재무 모듈 및 Firebase SDK, 인증 헤더가 있는 요청과 알 수 없는 쿼리는 캐시하지 않습니다. 다른 출처의 Firebase·Google·상품 사진 요청, 쓰기 요청은 서비스워커가 가로채지 않습니다.
- 캐시 이름은 앱 scope와 빌드 버전을 포함합니다. 새 워커는 `skipWaiting`·`clients.claim` 후 이 앱 scope의 옛 캐시만 지웁니다. localStorage·IndexedDB·다른 앱의 캐시는 지우지 않습니다.
- 기존 브라우저 원장과 Firebase 로그인 유지 저장은 PWA 캐시와 별개입니다. 앱 설치/삭제·브라우저 저장소 정리 전에는 필요한 백업을 보관합니다.

서비스워커는 HTTPS 또는 localhost에서 동작합니다. `file://`로 파일을 직접 여는 것은 설치·오프라인 시험이 아닙니다. 기준: [Chrome 서비스워커 생명주기](https://developer.chrome.com/docs/workbox/service-worker-lifecycle), [PWA 캐싱 안내](https://web.dev/learn/pwa/caching).

## 페이지별 데이터 위치

공통 ERP 원장은 localStorage `mumutori-private-finance-v3`입니다. 이 키가 없으면 예전 저장 키를 확인하고, 끝까지 없으면 저장소의 `data/seed.json.gz`를 읽습니다. 새 폰에서는 PC의 최신 입력 대신 seed가 보일 수도 있습니다. 일반 ERP는 페이지 모듈보다 먼저 공통 원장을 읽기 때문에 공용 화면에도 seed 로딩 의존성이 있습니다.

| 화면 | Firebase로 같이 보는 업무 자료 | 이 브라우저 안의 자료 | seed·공개 정적 자료 / 코드 근거 |
|---|---|---|---|
| 운영 홈 `index` | `hub/financeV1` 요약·확인 필요(로그인 후 읽기) | 옛 공통 원장, 확인 필요 건수·시각 | 공통 seed / `src/home-fin.js`, `src/pages/overview.js` |
| 재무 `finance` | 상단 `hub/financeV1` | 접힌 옛 원장, 최근 입력 설정, 건수·시각 | 공통 seed / `src/fin-hub.js`, `src/fin-panel.js` |
| 통장 `bank` | 없음 | 공통 원장의 통장 거래 | 공통 seed / `src/pages/bank.js` |
| 상품 `products` | 없음 | 공통 원장의 상품 | 공통 seed / `src/pages/products.js` |
| 구매·원가 `purchases` | 없음(재발주 링크는 소싱으로 이동) | 공통 원장의 매입 | 공통 seed / `src/pages/purchases.js` |
| 소싱 `sourcing` | `sourcing/` 상품·담기·발주·검수·재발주 준비 | 화면 선택 상태(sessionStorage), 공통 ERP 로딩 | 공통 seed 로딩 / `src/pages/sourcing.js` |
| 판매·정산 `sales` | 없음 | 공통 원장의 판매·수금 연결 | 공통 seed / `src/pages/sales.js` |
| 물류·재고 `stock` | 없음 | 상품·창고·실사·입출고 | 공통 seed / `src/pages/stock.js` |
| 거래처 `partners` | 없음 | 공통 원장의 거래처 | 공통 seed / `src/pages/partners.js` |
| 변경 이력 `audit` | 없음 | 공통 원장의 변경 이력 | 공통 seed / `src/pages/audit.js` |
| 설정·백업 `settings` | 없음 | 계좌·창고·백업·병합 전 사본 | 공통 seed / `src/pages/settings.js`, `src/store.js` |
| 브랜딩 `branding` | 없음 | 공통 원장 `erp.branding` 개인 기록 | 공개 `src/branding-data.json` + seed / `src/pages/branding.js` |
| 캐릭터 `characters` | `sourcing/meta/characterBoard` | 옛 캐릭터 보드·이전 표시·안내 설정 | 기본 구조·`src/character-ref/` + seed 로딩 / `src/characters-sync.js` |
| AI 조직도 `agents` | 없음 | 공통 ERP 로딩 의존성 | `src/agents-data.js` + seed 로딩 / `src/pages/agents.js` |
| 폰 빠른 장부 `quick` | `hub/financeV1`(PC 재무 상단과 동일) | 최근 수단·거래처 설정, 확인 필요 건수·시각 | 공통 seed 사용 없음 / `src/quick.js`, `src/fin-form.js` |

업무 코드가 직접 쓰는 IndexedDB 원장은 발견되지 않았습니다. Firebase Auth SDK의 IndexedDB 로그인 유지 저장은 사업 원장과 구분합니다. Firebase 자료도 네트워크 연결과 현재 권한이 갖춰져야 함께 보입니다. 이번 작업은 저장 위치·인증·Firebase 규칙·업무 자료를 변경하지 않습니다.

**제안만 남김:** 로컬 원장을 쓰는 화면에는 “이 기기에는 PC에서 추가한 자료가 아직 없을 수 있어요. PC의 최신 자료는 설정·백업에서 옮길 수 있어요” 안내를 넣을 수 있습니다. seed 표시와 실제 로컬 기록 유무를 구분해야 하므로 이번에는 이 안내나 데이터 이전을 구현하지 않았습니다.

## 로컬 검증

`python -B build.py` 후 로컬 서버에서 확인합니다. 설치된 Playwright가 있는 Python으로 `python -B tests/pwa_browser.py`를 실행하면 운영 장부와 분리한 가짜 자료·새 브라우저로 시험합니다. 실제 폰 홈 화면 설치와 Safari의 동작은 사람 확인 항목입니다.
