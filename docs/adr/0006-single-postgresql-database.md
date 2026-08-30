# ADR-0006: 단일 PostgreSQL로 모든 상태 통일 (CockroachDB 보류)

- Status: accepted (2026-07-26), amended by ADR-0013 (2026-08-30)
- Context: docs/PLAN.md §6 (2026-07 조사)

## 결정

PostgreSQL 17+ 단일 인스턴스에 모든 상태를 둔다:

- 도메인 데이터: Drizzle ORM(pg dialect) + drizzle-kit 마이그레이션
- Fedify KV/메시지 큐: `@fedify/postgres` (LISTEN/NOTIFY 실시간 배달)
- 연합 상태: 구현 전에는 `@fedify/botkit-postgres`, ADR-0013 migration 후에는
  first-party Drizzle tables (`federation_actor_keys`, `federation_followers`,
  `federation_objects`)

## 근거

- 세 라이브러리가 모두 Postgres를 1급 지원 — 저장소 하나로 운영 표면 최소화.
- 당초 요구였던 CockroachDB는 LISTEN/NOTIFY(cockroachdb/cockroach#41522) 미지원으로
  `@fedify/postgres` MessageQueue가 하드 실패한다. 기존 BotKit adapter는 추가로 session
  advisory lock과 `hashtext()`에도 의존했다. raw Fedify migration이 뒤의 두 제약은
  제거하지만 LISTEN/NOTIFY 제약만으로도 현재 선택은 바뀌지 않는다.

## 운영 제약 (설계에 반영)

- `PostgresMessageQueue`는 상시 LISTEN 연결 유지 → 트랜잭션 모드 풀러(PgBouncer
  transaction/statement mode)와 scale-to-zero 서버리스는 사용 불가. 상시 구동
  인스턴스 + 앱 내 `pg.Pool`로 운용.
- 백업은 스케줄 `pg_dump`로 시작, PITR 필요 시 pgBackRest/wal-g로 승격.

## 재검토 조건

CockroachDB가 LISTEN/NOTIFY를 지원하거나 Fedify queue가 그 의존을 제거할 때(참고
링크는 PLAN.md §6 말미).
