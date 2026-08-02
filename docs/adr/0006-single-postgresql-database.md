# ADR-0006: 단일 PostgreSQL로 모든 상태 통일 (CockroachDB 보류)

- Status: accepted (2026-07-26)
- Context: docs/PLAN.md §6 (2026-07 조사)

## 결정

PostgreSQL 17+ 단일 인스턴스에 모든 상태를 둔다:

- 도메인 데이터: Drizzle ORM(pg dialect) + drizzle-kit 마이그레이션
- Fedify KV/메시지 큐: `@fedify/postgres` (LISTEN/NOTIFY 실시간 배달)
- BotKit 연합 상태: `@fedify/botkit-postgres`

## 근거

- 세 라이브러리가 모두 Postgres를 1급 지원 — 저장소 하나로 운영 표면 최소화.
- 당초 요구였던 CockroachDB는 LISTEN/NOTIFY(cockroachdb/cockroach#41522)·세션
  advisory lock·`hashtext()` 미지원으로 `@fedify/postgres` MessageQueue와
  `@fedify/botkit-postgres`가 하드 실패함을 소스 수준에서 확인(2026-07). 채택 시 연합
  상태를 별도 저장소로 빼야 해 "단일 DB" 이점이 사라진다.

## 운영 제약 (설계에 반영)

- `PostgresMessageQueue`는 상시 LISTEN 연결 유지 → 트랜잭션 모드 풀러(PgBouncer
  transaction/statement mode)와 scale-to-zero 서버리스는 사용 불가. 상시 구동
  인스턴스 + 앱 내 `pg.Pool`로 운용.
- 백업은 스케줄 `pg_dump`로 시작, PITR 필요 시 pgBackRest/wal-g로 승격.

## 재검토 조건

CockroachDB가 LISTEN/NOTIFY·advisory lock·`hashtext`를 지원하게 되거나, Fedify/BotKit
어댑터가 해당 의존을 제거할 때(참고 링크는 PLAN.md §6 말미).
