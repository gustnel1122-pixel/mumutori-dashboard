# 광고 자료 쓰기 웹앱 — 초안 (미배포)

**상태: 아직 만들지도 배포하지도 않음.** 20261114_1112 2번 "준비만" — 코드·모양 검사·시험까지만. 사장님이 이 방법으로 하기로 정하고 "허용"을 누르기 전까지는 이 문서만 존재한다.

## 왜 Apps Script인가
`fin-hub.js`의 "바로 답하기"(재무 채팅)와 같은 길: Apps Script 웹앱은 **배포한 사람(사장님)의 구글 계정 권한**으로 돌아간다. 광고 담당 자리(쿠팡·coupang 자리 등)는 브라우저 OAuth 토큰이 없어서 Firebase에 직접 못 쓰지만, Apps Script를 거치면 새 키·새 서버 규칙 없이 사장님 권한을 그대로 빌려 쓸 수 있다.

## 받는 모양
`_tools/ads-write-validate.js`의 `validateAdsDay(payload)`가 모양을 검사한다(테스트: `tests/ads-write-validate.test.js`, 6개 통과). payload는 `hub/adsDaily/<YYYY-MM-DD>` 한 칸 전체:

```json
{
  "coupang": {
    "updatedAt": "2026-11-14T09:40:00+09:00",
    "status": "ok",
    "breakeven": 380,
    "yesterday": {"spend": 1816, "revenue": 0, "roas": 0},
    "d7": {"spend": 19994, "revenue": 29500, "roas": 147.5},
    "d30": {"spend": 106577, "revenue": 169330, "roas": 158.9},
    "campaigns": [{"name": "오늘의 Pick", "on": true, "dailyBudget": 10000, "targetRoas": 600, "diagnosis": "입찰 경쟁력 낮음"}],
    "decisions": "목표 수익률을 낮출지 정해주세요."
  },
  "naver": null
}
```

## 초안 doPost (Apps Script — 배포 전까지 그냥 텍스트)
실제로 Apps Script 프로젝트를 만들면 이 내용을 `Code.gs`에 붙여넣는다. 지금은 어디에도 배포돼 있지 않다.

```js
// doPost(e) — 받은 JSON을 모양 검사 뒤 hub/adsDaily/<date>/<channel>에 덮어쓴다(채널 하나씩만, 다른 채널은 안 건드림).
// 인증: 호출하는 쪽이 사전에 공유받은 비밀 토큰(쿼리 또는 바디)만 들고 있으면 됨 — 이 토큰은 Firebase 로그인 토큰이 아니라
// 이 웹앱 하나만을 위한 별도 비밀값(아직 없음 · 사장님 승인 뒤 PropertiesService에 저장).
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.token !== PropertiesService.getScriptProperties().getProperty('ADS_WEBHOOK_TOKEN')) {
    return ContentService.createTextOutput('unauthorized').setMimeType(ContentService.MimeType.TEXT);
  }
  var channel = body.channel, date = body.date, data = body.data;
  if (!/^[a-z]+$/.test(channel) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return ContentService.createTextOutput('bad channel/date').setMimeType(ContentService.MimeType.TEXT);
  }
  // 모양 검사는 서버 쪽에서도 한 번 더(이 .gs 안에 validateAdsDay를 그대로 옮겨 둔다 — _tools/ads-write-validate.js 참고).
  var check = validateAdsDay_single(data);
  if (!check.ok) return ContentService.createTextOutput('invalid: ' + check.reason).setMimeType(ContentService.MimeType.TEXT);

  var dbUrl = 'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app/hub/adsDaily/' + date + '/' + channel + '.json';
  var idToken = ScriptApp.getOAuthToken(); // 배포자(사장님) 권한의 토큰 — Firebase Auth 로그인과는 별개 경로이므로
  // 실제로는 Firebase Admin SDK 스타일 서명이 필요할 수 있음 — 이 부분은 실제 만들 때 Firebase 쪽과 다시 확인.
  UrlFetchApp.fetch(dbUrl, { method: 'put', contentType: 'application/json', payload: JSON.stringify(data) });
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}
```

**주의(실제로 만들 때 다시 확인할 것)**: Apps Script의 `ScriptApp.getOAuthToken()`이 Firebase RTDB 쓰기에 바로 쓰이는 토큰은 아닐 수 있다 — Firebase REST는 보통 Firebase Auth의 ID 토큰이나 서버 키를 받는다. 실제 구현 때는 "Apps Script가 Firebase Admin처럼 쓸 수 있는 공식 방법"(예: 서비스 계정 JSON을 Apps Script 안에서 JWT 서명해 Google OAuth 토큰 교환)을 다시 찾아서 확정해야 한다 — 지금은 뼈대만.

## 받는 쪽(coupang 자리) 보낼 줄
`mumutori-roles\coupang\CLAUDE.md`의 "매일 아침 점검" 절에 추가함: 매일 점검 결과를 `results\private\ads_<날짜>.json`에도 위 모양으로 남겨 두라는 한 줄(웹앱이 실제로 켜지면 그 파일을 그대로 보내면 됨 — 지금은 파일로만 쌓아 둠).

## 사장님이 정할 것
1. 이 방식(Apps Script 웹앱)으로 갈지, 0950에 적어둔 다른 방법으로 갈지.
2. "가"로 정하면: Apps Script 프로젝트 실제로 만들기·배포·비밀 토큰 생성·coupang 자리에 보낼 주소 전달 — 전부 사장님 "허용" 뒤에 진행.
