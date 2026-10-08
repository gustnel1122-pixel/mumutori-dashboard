# 소싱 추천 전 검토와 추천 제외

추천 운영 절차이며 적법성/무위험 보증이나 검수자 신원 인증 기능이 아니다. 실제 상품을 확인하지 않은 테스트용 승인 기록을 장부에 넣지 않는다.

## 실제 유입과 검토

실제 후보 생성 경로 sourcing_db.push_round(picks, details_dir), put(items/...), update(items/...)를 사용한다. 임의 관리자 REST/콘솔 쓰기의 서버 강제 차단은 제공하지 않으며 보안 규칙은 변경하지 않았다. UI의 새 담기·새 신청 요청에도 검토 조건을 적용한다. 기존 신청서를 처리하는 감시 프로세스는 변경/재시작하지 않았다.

1. 원본 상품/판매자 페이지의 실제 텍스트, 대표·상세·선택 옵션 이미지, 모델·재질·연령·용도를 읽는다. 키워드 없음/AI 점수만으로 승인하지 않는다. 로고·캐릭터·제품 형태, 이미지 출처와 판매자 주장을 실제 대조한다.
2. checks.product/supplier/ip/regulatory 각각에 status, 실제 확인 내용 note, 판단에 대응하는 정확한 HTTPS 근거 주소 배열 evidence를 기록한다. 홈페이지 주소만 적고 확인했다고 보고하지 않는다. supported는 근거 확인, regulatory.not_applicable은 실제 비대상 근거가 있을 때만 사용한다.
3. Jellycat 등 브랜드 유사 의심은 실제 이미지·비교 대상·차이·출처를 남긴다. 흔한 동물/과일 소재만으로 복제품이라고 단정하지 않는다. 정품 재판매와 판매 사진 이용 권리를 구분하며 모든 정품 재판매에 판매자 허가서를 일괄 요구하지 않는다. 의심/자료 부족이 남으면 hold.
4. classification.category/use/age/materials/regime/rationale에 분류·연령·용도·재질·적용 제도 근거를 기록한다. 안전인증·안전확인·공급자적합성확인을 혼동하지 않는다. 완구는 SafetyKorea 안전확인 대상 안내 확인. ‘14세 이상’ 표기만으로 비대상 판단 금지. 일반 포장과 식품 접촉 기구·용기·포장을 구분하고 불명확하면 보류한다.
5. status: unreviewed → in_review → 근거 충족 approved, 미확인/의심/분류 부족 hold. review.by/at는 실제 검토 주체·시각. reviewedImages는 실제 본 모든 대표·상세·옵션 이미지 URL, reviewedOptions는 실제 검토한 원본 옵션명. 보지 않은 사진을 기록하지 않는다. snapshot(id,item)은 검토한 상품·공급자·이미지·옵션·재질·모델을 고정하며 변경 시 재검수한다.
6. 위험 신호는 flags에 status:'open', note, evidence 배열로 기록한다. 실제 해결된 신호만 resolved와 근거를 기록하고 riskResolution에 해결 내용을 적는다. review.reason은 남은 보류 사유이다.

## 제외/복구와 기존 자료

원본을 1688:<offerId>로 정규화한다. marks/<id>/exclusion.active=true와 별도 exclusionEvents를 한 PATCH로 기록하고 URL 추적 파라미터/예전 별칭 키가 달라도 재유입 차단한다. 후보·표시·장바구니·주문을 물리 삭제하지 않는다. 복구는 active=false와 복구 사건 기록; 검수 조건은 계속 적용한다. 기존 👎 표시는 보존하며 기존 👎는 유입 전 제외 목록에 반영하되 명시적 복구 결정을 우선한다. 장바구니에서 빼기와 추천 제외는 별도 조작이다.

근거 없는 기존 후보는 검토 대기로 보인다. 실제 승인/장부 일괄 변경을 자동 실행하지 않는다. 배포 전 총괄에게 이 변화와 검토 대기 상태를 보고한다. 회귀 시험은 합성 상품·모의 HTTP/인증으로 수행하며 실 장부/주문에 시험 입력하지 않는다.

## 공식 확인 경로 (2026-10-08)

- [지식재산침해 신고상담센터](https://www.koipa.re.kr/ippolice/reportCounselingCenter/introductionCenter.do): 상표·디자인·상품형태 모방 쟁점 구분 참고.
- [한국저작권위원회](https://www.copyright.or.kr/customer-center/faq/list.do?portalcode=04): 저작물/사진 이용 상담·자료.
- [SafetyKorea 안전확인 대상 어린이제품](https://www.safetykorea.kr/policy/targetsSafetyCheck3): 완구 등 대상·절차.
- [생활법령 어린이용품 구입 주의사항](https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=4&cciNo=3&cnpClsNo=1&csmSeq=690&popMenu=ov): 제도 구분.
- [식약처 수입식품정보마루](https://impfood.mfds.go.kr/CFAGG01F01): 현재 직접 열기는 권한 오류. 특정 품목 근거를 확인하지 못했다면 승인 근거로 쓰지 말고 보류.
