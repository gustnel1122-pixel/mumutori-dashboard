# 앱 알림

설정·백업의 ‘앱 알림’에서 기기마다 ‘알림 받기’를 누르고 알림 권한을 허용합니다.
‘시험 알림 보내기’는 소유자 전용 서버에 시험 요청을 저장합니다. 서버가 약 1분 안에 FCM으로 보낸 뒤 결과를 화면에 돌려줍니다. ‘발송’ 표시와 실제 휴대폰 도착 확인은 구분합니다.

서버 설정이나 소유자 전용 규칙이 없으면 ‘알림 받기’를 비활성화하고 현재 상태를 표시합니다. 페이지를 열기만 했을 때 권한을 요청하지 않습니다. 차단된 권한은 휴대폰 설정에서 직접 변경합니다. iPhone/iPad에서는 홈 화면에 추가한 앱으로 엽니다.

- 기존 `sw.js`가 `firebase-messaging-sw.js`를 불러옵니다. Firebase 토큰을 발급할 때 같은 등록을 전달하므로 두 서비스워커가 같은 범위를 덮어쓰지 않습니다.
- FCM 수신 코드는 다른 앱 화면이 앞에 열려 있어도 표시하며, 알림을 누르면 같은 사이트의 허용된 관리 화면만 엽니다.
- Firebase SDK는 기존 인증 SDK와 같은 9.23.0 버전을 로컬 파일로 고정했습니다. 설정 화면의 연결 정책에는 Firebase 기기 등록 주소만 추가합니다.
- 토큰·시험 요청은 `hub`의 관리자 상속과 분리한 `appPush` 최상위 경로에 저장합니다. 실제 권한은 배포된 RTDB 규칙으로 제한해야 합니다. 저장 후 재조회로 확인하며 기기 토큰을 로그나 URL에 넣지 않습니다.
- 서버는 기존 Apps Script에서 OAuth `firebase.messaging` 범위와 `ScriptApp.getOAuthToken()`으로 FCM HTTP v1을 호출합니다. 공개 코드에 서버 비밀이나 서비스계정 키가 필요하지 않습니다.
- 레터 메일·로그인 메일 처리 뒤에 푸시를 더하고 오류를 분리합니다. 장부 확인 알림은 현재 ‘확인 필요’ 항목을 읽어 건수만 보냅니다. 최초 설치는 기존 건의 기준점만 저장하며 새 변화는 최대 시간당 한 번 알립니다.
- 90일 동안 갱신되지 않은 기기는 발송에서 제외합니다. 설정 화면을 다시 열면 허용된 기기의 토큰을 갱신하며, FCM이 `UNREGISTERED`로 응답한 토큰은 비교 후 제거합니다.

운영 설정·게시 상태는 내부 프로젝트 기록을 확인합니다. 코드가 게시되어 있다는 것만으로 서버 설치나 실제 수신을 완료 처리하지 않습니다.

검증:

```sh
python -B build.py
python -B tests/pwa_build.py
node --test tests/app-push-worker.test.cjs
ERP_CHROME=/path/to/chromium python -B tests/app-push-browser.py
python -B tests/pwa_browser.py --browser-executable /path/to/chromium --phase sw
python -B tests/pwa_browser.py --browser-executable /path/to/chromium --phase update
```

Firebase 공식 문서: [웹 수신](https://firebase.google.com/docs/cloud-messaging/web/receive-messages), [토큰·서비스워커 등록](https://firebase.google.com/docs/reference/js/messaging_.gettokenoptions), [HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api).
