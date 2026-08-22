# rss2.pub — 프로젝트 계획

RSS/Atom 피드를 ActivityPub 액터로 노출하는 브리지. 등록된 피드 하나가 페디버스 계정 하나가
되어, 마스토돈 등에서 팔로우하면 새 글이 게시물로 전달된다. 추가로:

- **메인 액터**: 멘션/DM으로 `register <url>`, `search <keyword>` 같은 명령을 받아 피드를
  등록·검색해주는 봇 계정.
- **웹 UI**: 팔로워 수 기준 인기 피드 추천, 검색, 등록 페이지.

## 기술 스택 (2026-07 조사 반영)

| 영역 | 선택 | 근거 |
|---|---|---|
| 런타임 | Node.js 24 (ESM) | 요구사항. BotKit 최소 요구 버전(22) 충족 |
| 패키지 매니저 | **Yarn Berry (v4)** + `nodeLinker: pnpm` | 요구사항(2026-07-26 변경). corepack(`packageManager` 필드)로 버전 고정, Node는 nix/mise 제공 |
| 연합(Federation) | **BotKit 0.5.x** (`@fedify/botkit`, Fedify 2.3.x 기반) | 아래 "BotKit 채택 근거" 참조 |
| HTTP/웹 UI | Hono (+ `@hono/node-server`), 서버 렌더링(Hono JSX) | 경량, BotKit `fetch()`로 위임 가능 |
| 피드 파싱 | rss-parser | RSS 2.0 + Atom 모두 지원 (요구사항) |
| 데이터베이스 | **PostgreSQL 17+** + **Drizzle ORM**(pg dialect, 안정판) | 도메인 데이터·연합 상태·큐를 단일 DB로 통일. 운용 방안은 §6 |
| 연합 상태 저장소 | `@fedify/postgres`(KV+MQ) + `@fedify/botkit-postgres` | 동일 PostgreSQL 인스턴스 사용 — LISTEN/NOTIFY 실시간 배달 포함 |
| 테스트 | Vitest (unit / e2e 프로젝트 분리) | TS 네이티브, 빠름 |
| 언어 규율 | TS strict + branded types + 직접 구현한 `Result<T,E>` | 타입 기반 프로그래밍. Effect-TS는 보류(아래) |
| 관측가능성 | LogTape + OpenTelemetry | Fedify가 양쪽 모두 내장 지원 |
| 개발 환경 | Nix flake devShell + direnv (1단계만) | 아래 "Nix 도입 전략" 참조 |

## 조사 결과와 결정

### 1. BotKit 채택 (Fedify 직접 사용 대신)

BotKit은 "응답 달기" 이상의 이점이 확인되어 채택한다. 핵심 근거:

- **다중 액터 지원 (0.5.0+)**: `createInstance()`가 한 도메인에서 여러 봇을 호스팅.
  특히 **dynamic bot group**(식별자를 요청 시점에 DB에서 해석하는 dispatcher)이 있어
  "피드 수백 개 = 액터 수백 개" 패턴을 코드 변경 없이 지원. 정적 봇(메인 액터) +
  동적 봇 그룹(피드 액터) 조합이 우리 구조와 정확히 일치.
- 메인 액터 명령 처리에 필요한 `onMention`/`onMessage` 이벤트, `visibility: "direct"` 응답.
- `session.publish()`가 `class: Note | Article` 지정을 지원 → 콘텐츠 길이별 타입 전환이 쉬움.
- Follow 자동 수락(`followerPolicy`), WebFinger/inbox/컬렉션 보일러플레이트 제거,
  자동 프로필 페이지·Atom 피드 제공.
- 저장소: `@fedify/botkit-sqlite` / `-postgres` / `-redis` 리포지토리가 Node에서 1급 지원
  — 우리는 `-postgres`를 사용해 도메인 데이터와 같은 DB로 통일(§6).
- 참고: 원래 계획했던 "raw Fedify로 피드 액터 dispatcher 추가"는 **불가능** —
  Fedify는 federation당 actor dispatcher를 하나만 허용하며 BotKit이 이미 등록한다.
  탈출구로 `instance.federation`이 공개돼 있어 저수준 접근은 가능.

리스크: (a) 0.x 버전으로 마이너 브레이킹 변경 이력(0.4→0.5), (b) 예약 발행 없음 →
폴링 스케줄러는 자체 구현(어차피 도메인 관심사), (c) `text`/`markdown()` DSL이 raw HTML을
받지 않음 → **RSS의 HTML 본문을 게시하는 경로는 M3 초입에 스파이크로 검증**
(HTML→Markdown 변환(turndown) 또는 federation 탈출구 사용). (c)가 해결 불가로 판명되면
raw Fedify로 회귀한다 — 헥사고날 포트 뒤에 숨겨 회귀 비용을 낮춘다.

### 2. Effect-TS 보류

조사 결론: **지금 이 프로젝트에는 도입하지 않는다.**

- **경계세(boundary tax)가 최대화되는 구조**: BotKit/Fedify가 제어 흐름을 소유하는
  콜백 중심 앱이라, 모든 콜백에서 `runtime.runPromise` 변환이 필요. 이때 타입된 에러
  채널이 `FiberFailure`로 붕괴되고, 런타임/Scope 관리 실수(콜백마다 런타임 재생성,
  Layer 미주입)가 흔한 함정으로 보고됨.
- 학습 곡선(generator, Layer/Context DI, Cause/Fiber/Scope)과 장황한 타입 에러.
- **시기가 나쁨**: v3(3.22)는 기능 동결, v4는 베타(Schema 전면 재작성 포함 브레이킹).
  지금 시작하면 1년 내 브레이킹 마이그레이션이 예정된 라인에 올라타는 셈.
- AI 코딩 에이전트의 first-try 정확도가 vanilla TS 대비 뚜렷이 낮음(버전 churn 탓에
  구식 API 환각이 잦음). 이 프로젝트는 에이전트 주도 개발이 전제라 비용이 큼.
- Effect가 주는 가치 중 이 프로젝트에 실제로 필요한 것(타입된 에러, 재시도 스케줄,
  OTel 스팬)은 직접 구현 `Result<T,E>` + 소형 retry 헬퍼 + OTel SDK 직접 사용으로 충분.
- 재검토 시점: Effect v4가 LTS가 되고, 폴링/전달 오케스트레이션이 Fedify 내장 큐를
  벗어날 만큼 복잡해질 때.

### 3. Nix 도입 전략 (단계적)

Nix는 devShell부터 도입했고, M5에서 앱 패키징까지 확장했다. 컨테이너 이미지는
Containerfile로 빌드한다.

- `flake.nix` devShell: `nodejs_24` + `yarn-berry` + `postgresql_17`
  (nixpkgs의 `yarn` attr은 classic이므로 Berry는 `yarn-berry` 사용).
  `.envrc`에 `use flake` + direnv/nix-direnv. `flake.lock` 커밋이 곧 버전 고정.
- Nix 없이 개발할 때는 **mise**(`mise.toml`이 Node 24 고정) + `corepack enable` —
  corepack이 `packageManager` 필드(yarn@4.x)를 읽어 동일한 yarn 버전을 제공.
- CI(GitHub Actions)도 `nix develop --command yarn ...`으로 로컬과 동일 툴체인 보장.
- **주의**: `mkYarnPackage`/`yarn2nix`/`node2nix`는 nixpkgs 26.05에서 **제거됨** —
  2025년 이전 튜토리얼은 전부 낡았다. 앱 패키징은 Berry용 `fetchYarnBerryDeps` +
  `yarnBerryConfigHook`을 사용하며, lockfile 변경마다 오프라인 캐시 해시를 갱신한다.
  nixpkgs의 Yarn이 `packageManager` 버전보다 늦으면 해당 Yarn 소스만 고정 오버라이드해
  devShell과 패키징이 같은 CLI와 config hook을 쓰도록 한다(ADR-0003).
- 컨테이너는 일반 Containerfile로 빌드한다. `dockerTools`는 macOS에서 Linux 빌더가 필요해
  초심자 비용이 큼 — 필요해지면 Linux CI에서만.

### 4. 핸들 정책 (조사 기반 확정안)

배경: RFC 7565(acct URI)는 관대하지만 실제 구현체가 훨씬 엄격하다.
마스토돈 로컬은 `[a-z0-9_]` 30자, 원격은 내부 `.`/`-` 허용 + 2048자.
**Misskey는 원격 128자 초과 시 액터 자체를 거부**. 점(`.`)은 모든 주요 구현체에서
로컬 생성 불가·원격만 관용되는 2급 문자.

확정 정책 — 전 구현체 호환 최소 교집합:

- 문자셋: `^[a-z0-9_]+$` (소문자만; `.`/`-`는 쓰지 않고 `_`로 매핑)
- 길이: **최대 30자** (마스토돈 로컬 한도와 동일 → 네이티브 계정처럼 보임)
- 정규화 알고리즘 (canonical feed URL 기준, 결정적):
  1. NFKC → 소문자 → 호스트/경로에서 `[a-z0-9]` 밖 문자를 `_`로 치환
  2. `_` 연속 붕괴, 선두/말미 `_` 제거
  3. 앞 22자로 절단(말미 `_` 재정리) + `_` + SHA-256(canonical URL) 기반 base36
     해시 앞 7자를 **항상** 덧붙임(길이 초과 여부 무관) → 최종 길이는 최대 30자(22 + 1 + 7)
- 대소문자 무시 조회(마스토돈/미스키 동작)를 전제로 소문자만 발급, 충돌은 매 핸들에
  붙는 해시로 회피(ADR-0004).

### 5. 콘텐츠 매핑: Note vs Article

조사 결론: **마스토돈은 Article의 `content`를 절대 렌더링하지 않는다**
(4.3+에서 `<h2>제목</h2>` + HTML `summary` + 링크만 표시). 반면 Misskey/Akkoma/Lemmy는
전문을 렌더링. WordPress ActivityPub 플러그인도 2025년부터 "자동 타입 선택"이 기본.

확정 정책 (도메인 서비스 `ContentPolicy`로 구현):

- **짧은 글** (임계값 이하, 기본 **2,000자**): `Note` — 제목을 본문 선두에 강조로
  인라인(WriteFreely 방식) + 원문 링크 첨부. 마스토돈에서 전문 표시됨.
  (마스토돈은 원격 글을 서버 측에서 자르지 않고 UI에서 접기만 하며, Misskey는
  8,192자에서 절단하므로 2,000자는 안전 범위.)
- **긴 글**: `Article` — `name`(제목) + `summary`(HTML 티저) + `content`(전문) + `url`.
  마스토돈은 제목+티저+링크, Misskey 계열은 전문을 봄. 티저는 첫 문단(없으면 첫 200자).
- 임계값·티저 길이는 피드별 설정 가능하게 값 객체로 모델링.

### 6. PostgreSQL 운용 방안

데이터베이스는 **PostgreSQL 하나로 통일**한다 — 도메인 데이터(Drizzle), Fedify KV/메시지
큐(`@fedify/postgres`), BotKit 연합 상태(`@fedify/botkit-postgres`)가 모두 같은 인스턴스를
사용한다. 각 라이브러리가 자기 테이블을 스스로 생성하므로 충돌이 없고, 필요하면
PostgreSQL schema로 네임스페이스를 분리한다.

**버전**: PostgreSQL **17 이상** (현행 최신 메이저 18). 각 메이저는 릴리스 후 5년 지원.

**배포 선택지**:
- **자체 호스팅 Docker 단일 인스턴스 (권장 시작점)**: `postgres:17-alpine`(또는 18) +
  볼륨. 이 규모(단일 앱, 소규모 트래픽)에서는 충분하며 운영 항목이 명확하다(아래).
- **매니지드(상시 구동형)**: RDS/Cloud SQL 등. 백업·마이너 업그레이드가 위임된다.
- **⚠️ 주의 — LISTEN/NOTIFY 제약**: `PostgresMessageQueue`는 상시 LISTEN 연결을 유지한다.
  따라서 (a) **트랜잭션 모드 풀러(PgBouncer transaction/statement mode) 뒤에서는 동작하지
  않고**(session mode 또는 직결 필요), (b) **scale-to-zero 서버리스(Neon 등)와는 궁합이
  나쁘다**(상시 연결 탓에 idle 전환이 안 돼 비용 이점 상실). 상시 구동 인스턴스를 쓸 것.

**커넥션 관리**: 단일 앱 프로세스이므로 앱 내 `pg.Pool`로 충분(기본 10 커넥션 수준).
외부 풀러는 도입하지 않는다 — 위 LISTEN 제약도 있고, 이 규모에선 불필요.

**백업/복구**: 소규모에는 스케줄 `pg_dump`(cron, 일 1회) + 오브젝트 스토리지 업로드 +
복구 리허설로 충분. PITR이 필요해지면 pgBackRest 또는 wal-g로 승격. 매니지드면 위임.

**업그레이드**: 마이너 버전은 이미지 교체 후 재시작. 메이저 버전은 `pg_upgrade` 또는
소규모답게 `pg_dump`/`pg_restore`로 이전.

**모니터링**: `postgres_exporter`(Prometheus)로 스크레이프, `pg_stat_statements` 활성화.
앱 쪽 OTel 트레이스(§관측가능성)와 함께 보면 폴링→발행→배달 경로가 끝까지 보인다.

**로컬 개발/테스트**: 개발은 Docker Compose(`postgres:17-alpine`). E2E는
`@testcontainers/postgresql`로 테스트마다 격리된 인스턴스 기동 후 drizzle-kit 마이그레이션
적용. Nix devShell에는 `postgresql_17` 클라이언트 도구(psql)를 포함(aarch64-darwin 정상
지원 — 서버도 devShell로 띄울 수 있으나 Docker 쪽이 단순).

**보류: CockroachDB (차기 재검토용 기록)**: LISTEN/NOTIFY(이슈 #41522)·세션 advisory
lock·`hashtext()` 미지원으로 `@fedify/postgres`의 MessageQueue(인큐마다 NOTIFY)와
`@fedify/botkit-postgres`(팔로우 경로에서 `pg_advisory_xact_lock`+`hashtext`)가 하드
실패한다(2026-07 소스 확인). 재검토 시 이 세 가지 해소 여부부터 확인할 것.
근거: <https://github.com/cockroachdb/cockroach/issues/41522>,
<https://github.com/fedify-dev/fedify/blob/main/packages/postgres/src/mq.ts>,
<https://github.com/fedify-dev/botkit/blob/main/packages/botkit-postgres/src/mod.ts>

**참고 문서**:
- 버전 지원 정책: <https://www.postgresql.org/support/versioning/>
- 백업/복구: <https://www.postgresql.org/docs/current/backup.html>,
  <https://pgbackrest.org/>, <https://github.com/wal-g/wal-g>
- 메이저 업그레이드: <https://www.postgresql.org/docs/current/pgupgrade.html>
- 모니터링: <https://github.com/prometheus-community/postgres_exporter>,
  <https://www.postgresql.org/docs/current/pgstatstatements.html>
- PgBouncer 모드별 기능 제약(LISTEN 불가 등): <https://www.pgbouncer.org/features.html>
- Docker 이미지: <https://hub.docker.com/_/postgres>
- 드라이버/ORM: <https://node-postgres.com/>,
  <https://orm.drizzle.team/docs/get-started-postgresql>
- Fedify/BotKit 어댑터: <https://fedify.dev/manual/kv>, <https://fedify.dev/manual/mq>,
  <https://www.npmjs.com/package/@fedify/postgres>,
  <https://www.npmjs.com/package/@fedify/botkit-postgres>
- 테스트: <https://www.npmjs.com/package/@testcontainers/postgresql>

## 아키텍처 (DDD + Hexagonal)

의존 방향은 항상 안쪽(domain)으로만. domain은 외부 패키지 의존성 0 — BotKit 타입도
어댑터 밖으로 새어 나오지 않는다.

```
src/
  shared/          # Result, Brand 등 순수 타입 유틸 (의존성 0)
  domain/
    feed/          # Feed 애그리거트: FeedId, FeedUrl(canonical), Handle, FeedItem, ItemId
    content/       # ContentPolicy(Note/Article 결정), PostContent 값 객체
    follower/      # 팔로워 통계(추천 랭킹용 읽기 모델)
    ports/         # FeedRepository, ItemRepository, FeedFetcher, FederationGateway, Clock
  application/     # 유스케이스: RegisterFeed, SearchFeeds, PollFeed, PublishItem,
                   #   ListPopularFeeds, HandleCommand(메인 액터 명령 파서 포함)
  infrastructure/
    persistence/   # 도메인 데이터 저장소: 인메모리(테스트) + PostgreSQL(Drizzle)
                   #   (BotKit repository가 관리하는 연합 상태 테이블과는 별개)
    feedfetch/     # rss-parser 어댑터 (RSS 2.0 + Atom), 조건부 GET(M5)
    federation/    # BotKit 어댑터: createInstance, 정적 메인 봇 + 동적 피드 봇 그룹,
                   #   FederationGateway 구현 (publish, 프로필 갱신)
    telemetry/     # LogTape 설정, OTel SDK 부트스트랩
  web/             # Hono 앱: 웹 UI(SSR) 라우트 + BotKit fetch 위임, composition root
```

- `FederationGateway` 포트가 핵심 격리 지점: application은 "이 피드 액터로 이 콘텐츠를
  발행하라"만 알고, BotKit/Fedify 어느 쪽이 구현하는지 모른다. BotKit 리스크 헤지.
- 폴링 스케줄러는 infrastructure(단순 interval + 지터)에서 `PollFeed` 유스케이스 호출.

### ActivityPub 매핑

| 도메인 | ActivityPub (BotKit 경유) |
|---|---|
| 등록된 Feed | 동적 봇 그룹의 액터 (`acct:{handle}@{host}`) |
| 메인 액터 | 정적 봇 `acct:rss2pub@{host}`, onMention/onMessage로 명령 처리 |
| FeedItem 발행 | `session.publish()` — 짧으면 Note, 길면 Article |
| Follow | BotKit `followerPolicy: "accept"` 자동 수락 |
| 팔로워 수 | BotKit repository에서 조회 → 추천 랭킹 읽기 모델 |

## 관측가능성

- **로그**: LogTape(`configure()`) — `["fedify"]`, `["botkit"]`, `["rss2pub"]` 카테고리
  계층. 개발은 콘솔 싱크, 운영은 구조화 JSON + OTel 싱크.
- **트레이스/메트릭**: OTel NodeSDK 부트스트랩 후 Fedify `tracerProvider`/`meterProvider`
  주입(2.3+ 메트릭 내장 — inbox/outbox/서명검증/큐 자동 계측). 자체 스팬: 폴링 사이클,
  피드 파싱, 발행. 자체 메트릭: 폴링 성공/실패, 발행 아이템 수, 피드별 팔로워 수.
- **헬스**: `/healthz`(liveness) + `/readyz`(폴러·DB 상태).
- 개발 편의: `@fedify/debugger`(실시간 ActivityPub 디버그 대시보드).

## 테스트 전략

- **unit** (`test/unit`): 도메인(핸들 정규화, ContentPolicy, 중복 판정)·애플리케이션
  (유스케이스, 명령 파서). 포트는 인메모리 구현/스텁. 외부 I/O 없음.
- **e2e** (`test/e2e`): 실제 서버를 임시 포트로 기동 — WebFinger → 피드 액터 문서 →
  픽스처 RSS/Atom 폴링 → outbox/프로필 반영, 웹 UI 페이지(검색/추천), NodeInfo.
  RSS 원본은 로컬 픽스처 HTTP 서버로 제공(RSS 2.0 픽스처 + Atom 픽스처 모두).
- HTTP Signature가 필요한 수신(Follow/Mention) 흐름은 유스케이스 레벨로 검증하고,
  서명 포함 E2E는 M5에서 보강.

## 에이전트 오케스트레이션

- `CLAUDE.md` / `AGENTS.md`(codex용, 동일 내용): 아키텍처 지도, 의존 규칙(임포트 방향),
  명령어(yarn scripts), 코딩 규율(Result/branded type 사용법), BotKit 요약.
- `.claude/skills/checks`: typecheck + unit + e2e를 도는 품질 게이트.
- `.claude/skills/add-feature`: "도메인 → 유스케이스 → 어댑터 → 테스트" 순서를 강제하는
  기능 추가 워크플로.
- `.claude/agents/domain-reviewer.md`: 의존 방향·타입 규율 위반 검사 서브에이전트.
- `docs/adr/`: 본 문서의 결정들(BotKit, Effect 보류, Nix 단계 도입, 핸들 정책,
  Note/Article 정책)을 ADR로 분리 기록 — 에이전트가 과거 결정을 재발명하지 않도록.

## 마일스톤

- ✅ **M0 — 환경/오케스트레이션**: yarn 프로젝트, TS strict, Vitest, flake.nix devShell +
  direnv, GitHub Actions(nix develop 경유), CLAUDE.md/AGENTS.md, skills, ADR 뼈대.
- ✅ **M1 — 도메인 우선**: shared(Result/Brand) → domain 전체 + 단위 테스트
  (핸들 정규화·ContentPolicy·아이템 동일성 판정이 핵심).
- ✅ **M2 — 애플리케이션**: 유스케이스 + 명령 파서 + 단위 테스트.
- ✅ **M3 — 연합**: BotKit 스파이크(HTML 본문 경로 → RawHtmlText로 해결, ADR-0007) →
  federation 어댑터, 폴링 스케줄러, PostgreSQL 영속화(Drizzle + testcontainers), E2E 1차.
- ✅ **M4 — 웹 UI + 관측가능성**: 추천/검색/등록 페이지(SSR), LogTape + OTel(NodeSDK,
  poll 스팬/메트릭), /healthz·/readyz, RSS+Atom E2E.
- ✅ **M5 — 운영 준비**: 조건부 GET(ETag/Last-Modified)·백오프, **서명 포함 E2E**
  (raw Fedify 원격 액터와 Follow→Accept→Create 배달→Delete 전파 왕복,
  `remote-federation.test.ts`), Containerfile + docker-compose, 피드 삭제(Delete 전파),
  Nix 패키징(`packages.default` — `fetchYarnBerryDeps` + `yarnBerryConfigHook`,
  ADR-0003 개정. 최초 1회 `yarnOfflineCache.hash` TOFU 채우기 필요).

## 후속 과제 (계획 범위 밖)

- BotKit 업스트림에 `federationOptions` 노출 및 Article `name`/`summary` publish
  옵션 제안 → 수용되면 `.yarn/patches` 제거 (ADR-0007).
- 메인 액터 명령의 서명 E2E(멘션 → 명령 응답)와 팔로워 수 기반 추천의 부하 테스트.
- 운영 배포(리버스 프록시 + `BEHIND_PROXY=true`, 매니지드 Postgres) 및 Docker 이미지
  CI 빌드.

## 확정된 사항

- 런타임: **Node.js 24**, 패키지 매니저 **Yarn Berry(v4) + `nodeLinker: pnpm`**
  (corepack으로 버전 고정, Node는 nix/mise 제공).
- 메인 액터 핸들: **`rss2pub`**.
- 메인 액터 명령: **`register <url>`, `search <keyword>`** 두 가지로 시작.
  unregister는 제공하지 않음.
- 핸들 정규화: 해시 suffix를 **항상** 적용(최종 최대 30자).
- 데이터베이스: **PostgreSQL 단일 인스턴스로 통일** — 도메인 데이터는 Drizzle ORM,
  연합 상태는 `@fedify/postgres` + `@fedify/botkit-postgres` (운용 방안 §6).
  CockroachDB는 차기 과제로 보류(§6 말미 기록).
- Note/Article 임계값: 기본 **2,000자**. 티저(summary)는 첫 문단(없으면 첫 200자).

## 미결 사항

1. PostgreSQL 배포 형태: 자체 호스팅 Docker(권장 시작점) vs 매니지드. LISTEN/NOTIFY
   상시 연결 때문에 트랜잭션 모드 풀러·scale-to-zero 서버리스는 제외(§6).
   개발 착수에는 영향 없음 — 로컬/CI는 Docker + testcontainers로 동일.
