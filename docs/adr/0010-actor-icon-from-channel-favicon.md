# ADR-0010: 액터 아이콘 — 채널 링크의 favicon 사용

- Status: accepted (2026-08-23)
- Context: "channel의 link의 favicon 혹은 icon을 액터 아이콘으로" 요청 (2026-08-23 대화)

## 배경

지금까지 피드 액터는 아이콘 없이 생성된다(BotKit `icon`은 옵션이라 생략 시 기본
아바타로 표시됨). 팔로워가 여러 피드 액터를 구분하기 어렵다는 피드백에 따라,
RSS/Atom `channel`의 `link`(피드가 가리키는 원본 웹사이트) 쪽에서 favicon/아이콘을
찾아 액터 아바타로 노출한다.

## 결정

- **탐색 대상**: 피드 문서가 아니라 `channel.link`(RSS) / entry `alternate` 링크
  상당의 사이트 홈페이지다. 그 페이지의 HTML을 가져와 `<link rel="*icon*">`
  태그(`apple-touch-icon`, `icon`, `shortcut icon` 등)를 찾고, 없으면
  `/favicon.ico`를 프로브한다. `sizes` 속성이 있으면 더 큰 쪽을, 없으면
  `apple-touch-icon` 계열을 일반 `icon`보다 우선한다 — 액터 아바타는 타임라인/
  프로필에서 파비콘보다 크게 렌더링되는 경우가 많아 고해상도 쪽이 낫다.
- **저장 형태**: 이미지를 내려받아 보관하지 않고, 해석된 절대 URL 문자열만
  `Feed.iconUrl`에 저장한다. BotKit의 동적 봇 디스패처가 `icon: URL`을 그대로
  받아들이므로 원격 URL 참조만으로 충분하고(Mastodon 등이 렌더링 시점에 직접
  가져감), 우리가 이미지 프록시/캐시를 맡을 필요가 없다.
- **시점 — 등록이 아니라 폴링**: 등록(`register-feed.ts`)은 건드리지 않는다.
  대신 이미 있는 "아이템 적체는 첫 폴링으로 미룬다"는 원칙(ADR 없음, 코드 주석)을
  그대로 따라, 아이콘 해석도 `poll-feed.ts`에서 수행한다 — 등록 시점 HTTP 요청은
  피드 문서 하나만 가져오면 되고, 느릴 수 있는 사이트 홈페이지 fetch 때문에
  `/register` 응답이 지연되지 않는다. 최초 등록 직후에는 검증자가 없어(
  `NO_VALIDATORS`) 첫 폴링이 항상 전체 fetch가 되므로, 모든 피드가 등록 후 한
  번은 아이콘 해석을 시도받는다.
- **자가 치유, 재시도 없음**: `feed.iconUrl`이 아직 `null`인 동안에는 매 폴링마다
  (피드 문서가 실제로 새로 fetch될 때) 재시도한다. 한 번 성공하면 그 폴링 이후로는
  다시 요청하지 않는다 — favicon은 거의 바뀌지 않고, 이미 매 폴링 아이템 발행
  로직이 아이템 단위로 "실패하면 다음 폴링에 재시도"하는 것과 대칭적인 저비용
  전략이다. 사이트에 파비콘이 끝내 없는 경우 매 폴링마다(피드가 실제로 갱신될
  때만) 조용히 재시도가 반복되는데, 폴링 주기가 시간 단위이고 요청 자체가
  timeout으로 상한선이 있어 감수할 만하다.
- **실패는 조용히 무시**: 사이트가 응답하지 않거나 아이콘을 못 찾으면
  `Feed.iconUrl`은 `null`로 남고 발행/폴링 자체를 막지 않는다 — `ContentExtractor`
  (ADR-0009)와 동일한 실패 처리 철학.

## 고려한 대안

| 옵션 | 설명 | 채택 여부 |
|---|---|---|
| A. 피드 자체의 `<image>`/`<icon>` 요소 사용 | RSS `channel.image.url`, Atom `icon` | 기각 — 요청이 명시적으로 "channel의 **link**"를 지목했고, 다수 피드가 이 요소를 생략하거나 저해상도 배너를 넣는 경우가 많음. 향후 폴백으로 추가할 수 있음(재검토 조건 참고) |
| B. 등록 시점에 동기적으로 해석 | `/register` 처리 중 사이트를 fetch | 기각 — 사용자 응답 지연, 기존 "무거운 작업은 폴링으로" 관례와 불일치 |
| C. 폴링 시점에 해석, `iconUrl`이 없을 때만 재시도 | 위 결정 | **채택** |
| D. 이미지를 내려받아 우리 스토리지에 보관 | 아바타 자체 호스팅 | 기각 — BotKit이 원격 URL 참조를 그대로 지원하고, 새 저장/캐시 계층은 지금 요청 범위를 넘어섬 |

## 아키텍처

- `domain/feed/icon-url.ts`: `IconUrl` 브랜드 타입 — 절대 http(s) URL 검증만
  수행(정규화는 하지 않음; 캐시 키가 아니라 렌더링 힌트라 `FeedUrl`만큼 엄격할
  필요 없음).
- `domain/ports/favicon-resolver.ts`: `FaviconResolver.resolve(pageUrl: string)`
  — `ContentExtractor`와 동일하게 URL은 브랜드 없는 평범한 문자열로 받는다
  (네트워크 경계로 나가는 임의 URL이라는 점에서 `FeedUrl`과 다름).
- `domain/ports/feed-fetcher.ts`: `FetchedFeed.link: string | null` 추가 —
  이미 매 폴링 가져오는 피드 문서에서 채널 링크를 함께 읽어온다(추가 요청 없음).
- `domain/feed/feed.ts`: `Feed.iconUrl: IconUrl | null`, `Feed.withMetadata`가
  세 번째 필드로 받아 "새로 해석된 값이 있으면 채택, 없으면 기존 값 유지"
  방식으로 병합.
- `infrastructure/favicon/html-favicon-resolver.ts`: `fetch()` + `linkedom`으로
  `<link rel>` 파싱(이미 `readability-extractor.ts`가 쓰는 조합 재사용), 실패 시
  `/favicon.ico` HEAD 프로브.
- `application/poll-feed.ts`: `feed.iconUrl === null`이고 채널 링크가 있을 때만
  `FaviconResolver.resolve()` 호출.
- `infrastructure/federation/botkit-stack.ts`: 동적 봇 디스패처가
  `icon: feed.iconUrl ? new URL(feed.iconUrl) : undefined`를 반환.
- `infrastructure/persistence/schema.ts`: `icon_url text` 컬럼(nullable) 추가.

## 재검토 조건

- **피드 자체 이미지 폴백(대안 A)**: 사이트 favicon 해석이 실패율이 높다고
  판단되면, `FetchedFeed`에 `image: string | null`을 추가해 폴백 체인에 넣을 수
  있다.
- **재시도 상한**: 파비콘이 없는 사이트에 대한 무한 재시도가 운영 부담이 되면
  `consecutiveFailures`류의 카운터를 도입해 backoff/포기 조건을 추가한다.
- **웹 UI 노출**: 지금은 ActivityPub 액터 프로필에만 반영한다. 검색/추천 카드에
  아이콘을 보여달라는 요청이 오면 `web/ui/pages.tsx`에서 별도로 다룬다.
