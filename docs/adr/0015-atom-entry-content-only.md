# ADR-0015: Atom entry content만 게시

- 상태: Accepted
- 날짜: 2026-09-12
- 대체: ADR-0009

## 결정

rss2.pub은 Atom 피드가 제공한 내용을 전달한다. 원문 웹페이지의 Readability 추출,
추출 실패 재시도, 추출 전용 설정과 관측 지표를 제거한다.

- entry의 지원되는 인라인 `content`를 본문으로 사용하고, 없으면 `summary`를 사용한다.
  외부 `content src`는 기존 Atom consumer profile대로 가져오지 않는다.
- 기존 HTML 정제, 상대 URL 해석, 언어·저자 처리를 유지한다. 게시 타입은
  ADR-0016에 따라 길이와 관계없이 Note로 통일한다.
- 신규 등록은 URL당 기본 계정 하나만 만든다. 웹의 full 옵션과 배지, 봇 도움말의
  full 안내를 제거한다. 오래된 폼의 `full` 필드와 명령의 `full` 토큰은 무시한다.
- 기존 full 계정의 ID·핸들·키·팔로워는 유지한다. `fullContentEnabled`는 기존 식별자를
  보존하는 호환 필드일 뿐이며, 게시 동작을 바꾸지 않는다.
- 새 항목과 변경된 항목은 모두 Atom 본문으로 게시·수정한다. 이미 발행한 변경 없는
  항목은 소급 재발행하지 않으며, 추출 성공 여부를 이유로 Update를 보내지 않는다.

## 저장소 및 운영 호환성

기존 `(url, full_content_enabled)` 유니크 키와 계정 데이터는 유지한다. 일반 계정과
기존 full 계정이 함께 존재할 수 있으나 신규 등록은 일반 계정을 반환하거나 생성한다.

`published_items`의 추출 상태 컬럼은 롤링 배포 및 롤백 호환성을 위해 남긴다.
애플리케이션의 repository 계약과 실행 경로에서는 더 이상 읽거나 쓰지 않는다.
이번 변경은 데이터 삭제나 기존 계정 병합을 요구하지 않는다.

## 검증

- 일반 계정과 기존 full 계정에서 Atom content 발행·수정 및 중복 발행 방지.
- 실제 HTTP·PostgreSQL·ActivityPub 경로에서 content 우선, summary 대체, HTML 정제,
  원문 URL 요청이 없음을 확인.
- 오래된 full 등록 요청이 두 번째 계정을 만들지 않음을 확인.
- `yarn typecheck && yarn test`, 번역 카탈로그 재생성 및 Nix 의존성 해시 갱신.
