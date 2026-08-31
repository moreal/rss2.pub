# ADR-0013: BotKit 대신 raw Fedify 사용

- Status: accepted (2026-08-30)
- Supersedes: ADR-0001
- Amends: ADR-0006의 BotKit 연합 상태 저장 항목
- Context: `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## 배경

BotKit의 dynamic bot group은 초기 구현을 빠르게 만들었지만, 게시물에 feed actor 외의
복수 `attributedTo`를 넣는 요구를 직접 표현하기 어렵다. author lookup, 안정적인 object
identity, attribution-only Update를 구현하려면 BotKit repository를 우회하는 것보다 raw
Fedify dispatcher와 저장 모델을 소유하는 편이 단순하다.

## 결정

- `@fedify/botkit`과 `@fedify/botkit-postgres`를 제거한다.
- `@fedify/fedify`, `@fedify/vocab`, `@fedify/postgres`는 유지한다.
- actor, object, outbox, followers, inbox, WebFinger, NodeInfo dispatcher를 직접 등록한다.
- 정적 main actor와 FeedRepository 기반 동적 feed actors를 하나의 dispatcher에서 해석한다.
- actor keys, followers, emitted objects를 PostgreSQL typed tables에 저장한다.
- outgoing activity는 `PostgresMessageQueue`를 통해 전달한다.
- 기존 BotKit URI 형태와 main actor 명령 및 HTML actor/message page 동작을 유지한다.
- 과거 BotKit repository 데이터는 migration하지 않는다.

## 저장 원칙

- actor별 RSA와 Ed25519 key를 lazy-create하고 영속화한다.
- follower의 actor/inbox/shared inbox를 local actor별로 저장하고 Follow/Undo를 멱등 처리한다.
- emitted object는 JSON-LD snapshot이 아니라 Note/Article을 재구성할 typed fields로 저장한다.
- feed ID와 item key에서 안정적인 object ID를 만들어 publish 재시도가 같은 URI와 Create
  activity ID를 사용하게 한다.
- 최초 object kind와 URI는 Update에서도 유지한다.

## 결과

BotKit이 제공하던 boilerplate를 직접 유지해야 하지만, federation behavior와 storage
schema가 제품 요구에 맞게 명시된다. `FederationGateway` port 덕분에 application은 raw
Fedify type을 알지 않는다.

ADR-0007의 workaround는 이미 BotKit 0.6에서 해소된 역사 기록이며, raw Fedify migration
후에는 적용 대상 자체가 사라진다. ADR-0006의 단일 PostgreSQL 결정과 LISTEN/NOTIFY 운용
제약은 유지하되 BotKit repository 대신 first-party federation tables가 같은 DB를 쓴다.

## 재검토 조건

BotKit이 복수 attribution, deterministic object identity, first-party schema와 동일한 제어를
제공하고 직접 구현의 유지비가 더 커질 때만 재검토한다.
