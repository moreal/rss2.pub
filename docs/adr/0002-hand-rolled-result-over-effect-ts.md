# ADR-0002: 직접 구현한 Result 채택, Effect-TS 보류

- Status: accepted (2026-07-26)
- Context: docs/PLAN.md §2 (2026-07 조사)

## 결정

`src/shared/result.ts`의 자체 `Result<T, E>` + branded type + 판별 유니온 오류를 쓴다.
Effect-TS는 도입하지 않는다.

## 근거

- 이 앱은 BotKit/Fedify가 제어 흐름을 소유하는 콜백 중심 구조 — 모든 경계에서
  `runPromise` 변환이 필요해 경계세가 최대화되고, 타입된 에러가 `FiberFailure`로
  붕괴된다.
- 시기 문제: Effect v3는 기능 동결, v4는 베타(Schema 전면 재작성 포함 브레이킹).
- AI 코딩 에이전트의 Effect first-try 정확도가 vanilla TS 대비 낮음(버전 churn으로
  구식 API 환각 빈발) — 에이전트 주도 개발 전제와 상충.
- 필요한 가치(타입 에러, 재시도, OTel 스팬)는 Result + 소형 retry 헬퍼 + OTel SDK로 충분.

## 재검토 조건

Effect v4가 LTS로 안정화되고, 오케스트레이션 요구(다중 스케줄러, 내구성 워크플로)가
Fedify 내장 큐를 벗어날 때.
