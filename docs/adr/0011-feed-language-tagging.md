# ADR-0011: 피드 언어(Language) 태깅 — RSS `<language>` / Atom `xml:lang`

- Status: accepted (2026-08-23)
- Context: "Atom의 xml:lang이 Note/Article 생성 시 적용되고 있는지" 질문 및
  후속 논의 (2026-08-23 대화)

## 배경

조사 결과 RSS 채널의 `<language>`와 Atom의 `xml:lang`(feed 루트 또는
entry별) 모두 파싱 단계에서부터 완전히 버려지고 있었고, 발행되는
Note/Article에는 언어 태그(ActivityStreams `contentMap`/`nameMap` 상당)가
전혀 붙지 않았다. 두 형식의 "언어" 개념은 문법적으로 다르다:

- **RSS 2.0**: 채널 아래 `<language>`라는 전용 자식 엘리먼트가 코어 스펙에
  있다. 아이템에는 언어 필드가 없고, 흔히 Dublin Core 확장(`dc:language`)으로
  채우는 피드가 있긴 하지만 — 이는 ISO 15836/NISO Z39.85로 표준화된 정식
  메타데이터 어휘이되, RSS 2.0 코어 스펙이 아닌 발행자가 선택적으로 붙이는
  확장 네임스페이스이고 실제로 채우는 피드는 드물다.
- **Atom (RFC 4287)**: 전용 언어 엘리먼트가 없고, XML 공통 속성인
  `xml:lang`(`xml:base`와 함께 XML 스펙 자체에서 온다)을 `<feed>` 루트나
  `<entry>` 등 어떤 엘리먼트에도 붙일 수 있으며 XML 스코프 규칙에 따라
  상속된다. 즉 feed 루트뿐 아니라 entry별 오버라이드까지가 스펙의 일부다.

## 결정

- **RSS**: 채널 레벨 `<language>`만 지원한다. 아이템의 `dc:language`는
  지원하지 않는다 — 코어 스펙이 아니고 실제 채워지는 사례가 드물어 구현
  비용 대비 가치가 낮다.
- **Atom**: feed 루트 `xml:lang`과 entry별 `xml:lang` 오버라이드를 모두
  지원한다 — 둘 다 표준의 일부이므로. entry에 자신의 `xml:lang`이 없으면
  feed 루트 값을 상속한다(XML 스코프 규칙과 동일한 효과).
- 최종적으로 한 게시물의 언어는 **"그 아이템 자신의 xml:lang(있다면) →
  없으면 피드의 언어"** 순으로 정해진다. RSS 아이템은 자신의 언어를 절대
  갖지 않으므로 항상 피드 언어를 물려받는다.
- **추출 방식**: `rss-parser`(v3.13.0)는 이름 있는 자식 엘리먼트만
  복사하고(`copyFromXML`) 원본 파싱 결과(xmlObj)를 밖으로 노출하지 않아,
  XML 속성인 `xml:lang`을 커스텀 필드로도 읽을 방법이 없다. 별도 XML 파서
  의존성(`xml2js` 직접 사용 등)을 새로 추가하는 대신, 원본 XML 문자열에서
  `<feed ...>`/`<entry ...>` 여는 태그만 정규식으로 찾아 그 안의
  `xml:lang="..."` 속성을 읽는 가벼운 방식을 택했다. RSS 문서에는
  `<feed>`/`<entry>` 태그 자체가 없으므로 이 로직은 RSS에 대해 자연스럽게
  아무것도 찾지 못하고 넘어간다 — 포맷 분기가 필요 없다.
- **BotKit 발행**: BotKit의 `session.publish()`가 이미 `language?: string |
  Intl.Locale` 옵션을 지원해 `content`를 `LanguageString`으로 감싸준다. 다만
  `name`/`summary`(Article)는 BotKit의 `language` 옵션이 건드리지 않는
  필드라 — ADR-0007에서 다룬 것과 같은 종류의 BotKit API 갭이다 — 발행 후
  rewrite(`applyArticleMetadata`)에서 수동으로 `LanguageString`을 적용한다.

## 고려한 대안

| 옵션 | 설명 | 채택 여부 |
|---|---|---|
| A. 전용 XML 파서 의존성 추가 | `xml2js`를 직접 의존성으로 선언해 원본 파싱 결과에서 속성을 읽음 | 기각 — Yarn Berry의 pnpm 링커가 전이 의존성 접근을 막아 새 직접 의존성 선언이 필요해지고, `xml:lang` 하나만 위해 들이기엔 비용이 큼 |
| B. RSS 또는 Atom 중 하나만 지원 | 예: Atom만 지원하고 RSS는 드랍 | 기각 — RSS 설치 기반이 넓어 지원 범위를 좁힐 이유가 없음. 둘 다 지원하되 각 형식의 스펙 범위에 맞춰 세부 지원 수준을 다르게 함 |
| C. RSS 아이템의 `dc:language`까지 지원 | 확장 네임스페이스까지 파싱 | 기각 — 코어 스펙이 아니고 실제 채워지는 피드가 드묾. 필요해지면 `RawFeedItem.language`에 dc:language 파싱을 추가하기만 하면 되므로 나중에 저비용으로 확장 가능 |
| D. 정규식 기반 feed/entry 속성 추출 + BotKit `language` 옵션 + 수동 `LanguageString` rewrite | 위 결정 | **채택** |

## 아키텍처

- `domain/feed/feed-language.ts`: `FeedLanguage` 브랜드 타입 —
  `Intl.Locale`(전역 빌트인, `IconUrl`/`FeedUrl`이 `URL`을 쓰는 것과 동일한
  방식)로 BCP-47 문법을 검증하고 대소문자/구분자를 정규화한다.
- `domain/ports/feed-fetcher.ts`: `FetchedFeed.language: string | null`
  (raw) 추가 — 채널 `<language>` 또는 feed 루트 `xml:lang`.
- `domain/feed/feed-item.ts`: `RawFeedItem.language: string | null`(raw,
  entry 자신의 `xml:lang`만; RSS는 항상 `null`), `FeedItem.language:
  FeedLanguage | null`(검증됨, 무효값은 조용히 `null`로 드롭).
- `domain/feed/feed.ts`: `Feed.language: FeedLanguage | null` — `iconUrl`과
  달리 등록 시점에 이미 가져온 문서에 들어있으므로 `Feed.register`에서
  title/description과 함께 즉시 세팅한다(첫 폴링으로 미루지 않음).
  `Feed.withMetadata`가 다른 필드와 동일하게 "새 값 있으면 채택, 없으면
  기존 값 유지"로 병합.
- `domain/content/content-policy.ts`: `NotePost`/`ArticlePost.language:
  FeedLanguage | null` — `decidePostContent`는 이미 병합된 아이템 언어를
  그대로 옮겨 담는다.
- `infrastructure/feedfetch/rss-parser-fetcher.ts`: `atomFeedXmlLang(body)`,
  `atomEntryXmlLangs(body)` 정규식 헬퍼(둘 다 export되어 직접 단위 테스트
  됨); RSS `<language>`는 `customFields.feed: ["language"]`로 타입 있게
  읽음; 최종 `feed.language = parsed.language ?? atomFeedXmlLang(body)`.
- `application/poll-feed.ts`: `withLanguage(item, currentLanguage)`가 아이템
  자신의 언어가 없을 때만 이번 폴링에서 새로 가져온 피드 언어로 채운다(폴링
  직전의 stale한 값이 아니라 이번 fetch 결과를 바로 사용해, 피드 언어가
  바뀌면 같은 폴링에서 발행되는 아이템부터 반영됨).
- `application/register-feed.ts`: `languageFrom()` 헬퍼(`titleFrom()`과
  동일한 패턴)로 등록 시점 fetch 결과의 언어를 검증해 `Feed.register`에
  전달.
- `infrastructure/federation/botkit-gateway.ts`: `session.publish()`에
  `language` 옵션 전달; `applyArticleMetadata`가 `name`/`summary`를
  `LanguageString`으로 감싸 rewrite.
- `infrastructure/persistence/schema.ts`: `feeds.language text`(nullable)
  컬럼 추가.

## 재검토 조건

- **RSS `dc:language` 지원**: 실제로 이를 채우는 피드가 다수 발견되면
  `RawFeedItem.language`에 `dc:language` 파싱을 추가한다(대안 C 참고,
  구조적으로 준비되어 있어 저비용).
- **정규식 기반 속성 추출의 한계**: 아이템 본문(CDATA)에 우연히
  `<entry ...>` 형태의 리터럴 텍스트가 포함되어 언어가 오탐되는 사례가
  실제로 보고되면, 그때 전용 XML 파서 도입(대안 A)을 재검토한다.
- **액터 프로필 언어**: 지금은 게시물(Note/Article)에만 언어를 적용한다.
  액터 프로필 소개말(`renderFeedProfileHtml`)에도 언어 태그가 필요하다는
  요청이 오면 `botkit-stack.ts`의 동적 봇 디스패처에서 별도로 다룬다.
