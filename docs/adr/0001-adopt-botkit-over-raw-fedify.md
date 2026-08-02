# ADR-0001: BotKit을 raw Fedify 대신 채택

- Status: accepted (2026-07-26)
- Context: docs/PLAN.md §1 (2026-07 조사)

## 배경

피드 하나당 액터 하나(수백 개 가능) + 명령을 받는 메인 액터가 필요하다. Fedify를 직접
쓰면 actor dispatcher가 federation당 1개뿐이라 다중 액터 라우팅을 자체 구현해야 한다.

## 결정

`@fedify/botkit` 0.5.x를 사용한다. `createInstance()`에 정적 봇(메인 액터 `rss2pub`) +
동적 봇 그룹(피드 액터, 식별자를 DB에서 해석)을 등록한다. 연합 접근은
`FederationGateway` 포트 뒤에 격리한다.

## 근거

- dynamic bot group이 "피드 = 액터 × N" 패턴을 그대로 지원 (0.5.0+).
- `onMention`/`onMessage` + `visibility: "direct"`로 명령 처리가 내장 이벤트로 해결.
- `publish({ class: Note | Article })`, followerPolicy 자동 수락, WebFinger/inbox
  보일러플레이트 제거, 자동 프로필 페이지.

## 결과 및 리스크

- 0.x라 마이너 브레이킹 변경 있음(0.4→0.5 전례) — 버전 고정 + 포트 격리로 완화.
- 예약 발행 없음 → 폴링 스케줄러는 자체 구현(원래 도메인 관심사).
- `markdown()`이 raw HTML을 받지 않음 → RSS HTML 본문 게시 경로는 M3 스파이크로 검증.
  해결 불가 판명 시 raw Fedify로 회귀(포트 덕에 어댑터 교체로 국소화).
