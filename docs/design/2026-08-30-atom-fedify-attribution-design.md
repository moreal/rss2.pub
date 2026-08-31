# Atom-only 입력, raw Fedify, 복수 저자 attribution 설계

- Status: approved (2026-08-30)
- Scope: Atom 입력 파서, BotKit 제거, ActivityPub 복수 저자 표기
- Related ADRs: ADR-0012, ADR-0013, ADR-0014

## 목표

rss2.pub의 입력 형식을 Atom 1.0으로 한정하고, BotKit이 감추던 연합 상태와
dispatcher를 raw Fedify 위에 명시적으로 구현한다. 그 위에서 Atom entry의 저자 URI가
실제 ActivityPub Actor를 가리킬 때 게시물의 `attributedTo`에 함께 싣는다.

저자 표기는 메타데이터에만 영향을 준다. 본문 HTML, Mention tag, `to`, `cc`는 저자
때문에 바뀌지 않는다. 기존 RSS 등록과 BotKit repository 데이터의 마이그레이션은
지원하지 않는다. 기존 외부 URI 형태와 사용자 동작은 유지한다.

## 작업 분해

세 프로젝트를 순서대로 완료한다. 각 프로젝트는 독립적으로 배포할 수 있고 품질
게이트를 통과해야 한다.

1. **Atom-only feed foundation**
   - workspace package `@rss2pub/atom-feed` 추가
   - `rss-parser`와 RSS 입력 지원 제거
   - Atom fixture, UI 문구, 문서, Nix offline cache 갱신
   - 이 단계에서는 기존 BotKit federation을 유지
2. **Raw Fedify parity**
   - BotKit과 `@fedify/botkit-postgres` 제거
   - actor/object/collection dispatcher, inbox listener, 연합 저장소를 직접 구현
   - WebFinger, Follow, 발행/수정/삭제, 메인 actor 명령, HTML 페이지의 외부 동작 유지
   - 이 단계의 게시물 attribution은 로컬 feed actor 하나뿐
3. **Atom author attribution**
   - author URI 값 객체와 Actor resolver port 추가
   - lookup 결과가 Actor일 때만 복수 `attributedTo`에 반영
   - author-only 변경도 Update로 전파

큰 변경을 한 번에 합치거나 Fedify migration을 먼저 하는 방안은 기각했다. Atom
foundation을 먼저 분리하면 파서 회귀와 federation 회귀를 서로 다른 변경에서 진단할 수
있고, author 기능은 두 기반이 안정된 뒤 작은 수직 변경으로 남는다.

## 1. Atom parser package

### 경계

`packages/atom-feed`는 HTTP, 데이터베이스, ActivityPub, 루트 도메인 모델을 모르는 순수
XML-to-DTO 패키지다.

```text
Atom XML string
  -> saxes (strict + xmlns)
  -> 제한된 내부 XML tree
  -> Atom 1.0 의미 해석
  -> ParseResult<AtomFeedDto, AtomParseError>
  -> infrastructure adapter
  -> domain smart constructors
```

패키지는 루트의 `src/shared/Result`에 의존하지 않고 자체의 작은 discriminated union
`ParseResult`를 내보낸다. infrastructure adapter가 이를 프로젝트 `Result`로 매핑한다.

### XML 엔진과 방어선

`saxes`를 namespace-aware strict parser로 사용한다. 현재 직접 의존하는 `linkedom`은
실험에서 기본 namespace를 잘못 보고하고 malformed XML을 HTML처럼 복구했으므로 Atom
파서로 사용하지 않는다. 범용 object mapper인 `fast-xml-parser`보다 작은 Atom 전용 tree가
direct-child 의미, mixed XHTML 순서, 입력 제한을 더 명확하게 표현한다.

- Atom namespace `http://www.w3.org/2005/Atom`의 `feed`만 루트로 허용
- RSS와 namespace가 없는 유사 XML은 `NotAtomFeed`
- DOCTYPE 즉시 거부
- HTTP adapter의 response byte limit
- parser의 maximum depth와 node count
- well-formedness 오류는 문서 전체 parse failure

문서는 올바르지만 개별 entry가 도메인 필수값을 만족하지 못하면 그 entry만 무시한다.
나머지 entry의 처리와 발행은 계속한다.

### Atom 의미

DTO는 feed의 title, subtitle, alternate link, language, authors와 entry의 id, alternate link,
title, summary, content, published, updated, language, authors를 보존한다.

- author 상속: entry author가 있으면 그것, 없으면 source author, 둘 다 없으면 feed author
- author의 `name`, `uri`, `email` 원문 보존
- `text`, `html`, `xhtml` text construct 구분
- XHTML child order를 보존해 직렬화하고 최종 HTML sanitization은 기존 `render.ts` 책임
- `content src`는 추가 fetch 없이 콘텐츠 없음으로 처리
- `xml:lang`은 XML scope에 따라 구조적으로 계산
- relative author URI는 나중의 도메인 경계에서 제외하고 resolve하지 않음

## 2. Raw Fedify parity

### 구성

```text
Hono composition root
  |-- product web UI
  |-- ActivityPub HTML profile/message pages
  `-- Federation.fetch()
       |-- actor/object/collection dispatchers
       |-- inbox listeners
       `-- WebFinger/NodeInfo

PollFeed -> FederationGateway -> federation_objects -> Fedify queue -> followers
Inbox    -> command/follower use case -> repositories -> Fedify queue
```

`PostgresKvStore`와 `PostgresMessageQueue`는 유지한다. production outgoing activity는 항상
queue를 통하며, queue의 long-lived LISTEN 연결을 await하지 않는 기존 운용 규칙도
유지한다. `allowPrivateAddress`는 테스트에서만 사용할 수 있다.

### 외부 URI

BotKit repository의 과거 행은 읽지 않지만 다음 URI 형태는 유지한다.

- `/ap/actor/{handle}`
- `/ap/actor/{handle}/inbox`
- `/ap/actor/{handle}/outbox`
- `/ap/actor/{handle}/followers`
- `/ap/actor/{handle}/note/{id}`
- `/ap/actor/{handle}/article/{id}`
- `/ap/actor/{handle}/create/{id}`
- `/ap/inbox`
- `/@{handle}`
- `/@{handle}/{id}`

정적 `rss2pub` actor와 FeedRepository에서 handle을 찾는 동적 feed actor가 같은 actor
dispatcher를 사용한다. WebFinger handle mapping도 같은 조회를 사용한다.

### 연합 저장소

연합 전용 저장소는 infrastructure 내부에 둔다. 외부 패키지 타입이나 JSON-LD 저장
형식을 domain으로 노출하지 않는다.

#### `federation_actor_keys`

- local actor handle
- RSA와 Ed25519 algorithm
- public/private JWK
- creation time

key pair는 actor별로 lazy-create하고 재사용한다. actor Delete가 queue에 남아 있을 수
있으므로 unregister 직후 key를 제거하지 않는다.

#### `federation_followers`

- local actor handle
- remote actor URI
- inbox URI
- shared inbox URI
- followed time

local handle과 remote actor URI의 복합 키로 Follow를 멱등 처리한다. 실제 insert/delete가
일어난 경우에만 application의 follower count를 증감한다.

#### `federation_objects`

- object ID와 Create activity ID
- local actor handle
- immutable object kind (`Note` 또는 `Article`)
- content/name/summary/language/source URL
- `to`, `cc`, `attributedTo`, Mention tag
- published/updated time

JSON-LD snapshot 대신 typed columns에 의미 데이터를 저장하고 dispatcher가 vocab object를
조립한다. 이로써 Fedify serializer 변경과 저장 형식이 결합되지 않고, 복수 attribution은
URI 배열 갱신으로 표현된다.

### 발행과 Update

`FederationGateway.publish`에는 feed, item key, `PostContent`를 전달한다. gateway는
`(feed ID, item key)`에서 안정적인 object ID를 만든다. object row를 upsert하고 같은 ID의
Create를 followers에게 queueing한 뒤 message URI를 반환한다.

프로세스가 object 저장과 `published_items` 기록 사이에서 중단되어도 다음 poll은 같은
object/Create ID를 다시 사용한다. 원격 inbox가 activity ID로 중복을 제거할 수 있고 새
permalink가 생기지 않는다.

Update는 object URI와 최초 kind를 유지한다. 새 content policy 결과가 다른 kind여도 기존
Note/Article 필드에 투영하고 같은 object의 Update를 보낸다. kind와 URI path가 충돌하지
않게 한다.

### inbox 동작

- **Follow**: local target 확인, remote actor/inbox 저장, 최초 insert에만 count 증가,
  target actor가 서명한 Accept 발송
- **Undo(Follow)**: Undo actor와 nested Follow actor 일치 확인, 실제 delete에만 count 감소
- **main actor command**: main actor를 Mention했거나 direct audience에 main actor가 포함된
  Create(Note/Article)만 처리. HTML에서 평문을 추출해 기존 `CommandHandler` 호출
- **reply visibility**: direct 입력은 direct, 그 외는 unlisted. reply handle은 실제
  ActivityStreams Mention tag로 표현
- feed actor로 온 일반 message와 unsupported activity는 상태 변경 없이 무시

HTML actor/message pages는 first-party Hono view로 옮기고 기존 URL과 핵심 내용을
유지한다.

## 3. Atom author attribution

### 도메인과 port

- `AuthorUri`: absolute HTTP(S) URL을 보장하는 branded value object
- `AttributionCandidates`: canonical URL 순서, deduplication, maximum 8
- `RawFeedItem.authorUris`: adapter가 넘기는 effective Atom author URI 원문
- `FeedItem.authorUris`: smart constructor를 통과한 후보 목록
- `ActorResolver`: external vocab type을 숨기고 `ResolvedActorUri` 또는 실패를 반환하는 port

잘못된 author URI는 entry를 실패시키지 않고 제외한다. 입력 순서를 유지하며 정규화 후
중복을 제거한 다음 최초 8개만 lookup한다.

### Actor lookup

Fedify adapter는 application origin에서 만든 context의
`lookupObject(uri, { crossOrigin: "ignore" })`를 사용한다. `isActor()`가 참이고 canonical
`actor.id`가 있는 Application, Group, Organization, Person, Service만 인정한다.

각 `PollFeed.execute()`는 다음 memo를 하나 만든다.

```ts
Map<AuthorUri, Promise<Result<ResolvedActorUri | null, ActorLookupError>>>
```

같은 author가 여러 entry에 나타나도 한 poll에서 한 번만 조회한다. persistent/global
cache는 두지 않는다.

### 최종 attribution

게시물의 `attributedTo`는 다음 순서다.

1. local feed actor
2. Atom에 나타난 순서대로 lookup에 성공한 external actor IDs

external 후보는 최대 8개이므로 local actor를 포함한 최종 attribution은 최대 9개다.
서로 다른 후보가 같은 canonical actor ID로 resolve되면 최종 단계에서 다시 deduplicate
한다.

저자 정보는 다음을 바꾸지 않는다.

- body HTML
- Mention tags
- `to`
- `cc`

### 실패와 재시도

network error, invalid JSON-LD, non-Actor object, ID 없는 Actor는 해당 author만 제외한다.
publish/Update와 feed poll은 계속 성공할 수 있다. 실패는 structured log와 metric으로만
기록하고 `publishErrors`에는 넣지 않는다.

feed entry가 바뀌지 않으면 다음 poll에서 lookup을 재시도하지 않는다. 이후 content나
author candidate가 바뀌어 Update 대상이 되면 새 poll memo를 통해 다시 조회한다. Update
중 lookup이 실패하면 과거 resolved author를 보존하지 않고 새 attribution에서 제외한다.

### Update 판정

`contentFingerprint()`는 normalized candidate URI 목록을 순서대로 포함한다. resolved
actor ID는 I/O 결과이므로 fingerprint에 넣지 않는다.

author의 추가, 삭제, 교체, 순서 변경은 Update를 발생시킨다. remote Actor document만
변하고 Atom entry가 그대로인 경우에는 Update하지 않는다.

## 오류 처리

| 오류 | 결과 |
|---|---|
| HTTP/conditional fetch 실패 | 기존 poll backoff 적용 |
| non-Atom 또는 malformed XML | fetch/parse failure로 poll backoff 적용 |
| 개별 entry의 도메인 값 부족 | 그 entry만 제외 |
| author URI invalid/relative | 그 author만 제외 |
| Actor lookup 실패/non-Actor | 그 author만 제외, publish 계속 |
| object 저장 또는 queueing 실패 | FederationDeliveryFailed, item은 미발행 상태로 재시도 |
| 중복 Follow/Undo | 성공 응답, count 변화 없음 |
| unsupported inbox activity | 성공 응답, 상태 변화 없음 |

## 테스트 전략

### Atom foundation

- package unit: namespace, malformed XML, author inheritance/order, XHTML mixed content,
  `xml:lang`, duplicate elements, DOCTYPE, depth/node limits
- root adapter unit: DTO-to-`RawFeedItem`, text construct mapping, RSS rejection
- application/e2e: Atom registration, polling, conditional request, full-content fallback

### Raw Fedify parity

- unit: vocab builders, URI mapping, follower repository idempotency, command extraction/reply
  audience, stable object identity
- persistence e2e: keys, objects, followers survive restart
- federation e2e: signed Follow-to-Accept, Create, Update, Delete, WebFinger, outbox, NodeInfo,
  main actor direct/unlisted replies
- web e2e: `/@handle` and `/@handle/:id`

### Author attribution

- domain unit: absolute HTTP(S), canonicalization, ordering, deduplication, limit 8,
  author-aware fingerprint
- application unit with fake resolver: per-poll memo, failure/non-Actor omission,
  author-only Update
- infrastructure/e2e with local fixture actors: Person/Organization accepted, Note rejected,
  canonical ID deduplication
- serialized JSON-LD assertion: local feed actor first, authors afterward, no body/tag/audience
  mutation

모든 단계는 `yarn typecheck && yarn test`를 통과해야 한다. dependency/lockfile 변경 단계는
`nix/missing-hashes.json`과 `flake.nix`의 `yarnOfflineCache.hash`를 갱신하고
`nix build .#`도 검증한다.

## 문서와 결정의 영향

- ADR-0012는 입력을 Atom-only로 바꾸고 ADR-0011의 RSS 부분과 regex parser 결정을
  supersede한다.
- ADR-0013은 ADR-0001을 supersede하고 ADR-0006의 BotKit storage 항목을 대체한다.
  ADR-0007은 과거 BotKit workaround 기록으로 남지만 목표 구조에는 적용되지 않는다.
- ADR-0014는 Atom author를 body Mention 없이 복수 `attributedTo`로 표현한다.
- 구현 단계에서 README, UI i18n catalogs, AGENTS.md의 BotKit/RSS 설명도 실제 코드와 함께
  갱신한다.
