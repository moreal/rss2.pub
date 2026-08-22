# ADR-0009: 전문(Full Content) 추출 정책

- Status: accepted (2026-08-23)
- Context: Inoreader/FiveFilters 리서치 및 논의 (2026-08-23 대화)

## 배경

RSS/Atom 피드 중 다수가 `description`에 요약(teaser)만 제공하고 전문은 원본 사이트에서만
볼 수 있게 한다(트래픽/광고 수익 목적). Inoreader의 "Load full content"(웹 아이콘/`W`
단축키, 모바일 pull-to-refresh 제스처)는 원문 URL을 서버에서 가져와 Readability류
알고리즘(본문 텍스트 밀도로 nav/광고/푸터를 걷어내고 기사 블록만 추출)으로 본문을
복원해 보여준다. FiveFilters의 Full-Text RSS는 같은 개념을 리더에서 떼어내 "요약 피드
URL → 전문 피드 URL 변환기"로 독립 제품화한 사례다.

rss2.pub은 리더가 아니라 브리지다 — 팔로워는 원문을 그때그때 요청하는 것이 아니라
`session.publish()`로 브로드캐스트된 Note/Article을 받는다(ADR-0005). 따라서 "언제
보여줄지"가 아니라 "등록 시점에 전문 추출을 켤지"의 문제로 치환된다.

## 결정

피드 등록 시점의 **opt-in**으로 제공한다. 기본값은 끔(teaser만 사용). URL과 콘텐츠
모드(teaser/전문)의 조합이 피드의 정체성이다 — 같은 URL을 두 모드로 각각 등록하면
핸들과 액터가 서로 다른 **별도의 두 계정**이 된다(한 계정을 몰래 바꾸는 대신, 팔로워가
직접 고를 수 있는 두 선택지를 만든다).

- **메인 액터 명령**: `register <url>` 뒤에 위치 인자로 `full`을 붙인다 —
  `register <url> full`. 그 외의 값(오타 포함)은 전문 모드로 해석하지 않고 조용히
  teaser 모드로 처리한다(엄격한 파싱보다 명령이 항상 성공하는 쪽을 택함).
- **웹 등록 폼**: 동일 옵션을 체크박스(`register.full-content-label`)로 노출.
- **핸들/식별자**: `Handle.fromFeedUrl(url, fullContentEnabled)`,
  `FeedId.fromUrl(url, fullContentEnabled)` — 해시 입력에 모드를 포함시켜 두 모드가
  항상 다른 핸들/id를 갖도록 한다(ADR-0004 개정). 기본값 `false`라 기존 호출부는
  영향받지 않는다.
- **폴링/발행**: 전문 모드 피드는 새로 발행할 아이템마다 `ContentExtractor` 포트로
  원문 URL을 가져와 본문을 추출하고, `FeedItem.contentHtml`을 교체한 뒤
  `ContentPolicy.decidePostContent`에 넘긴다 — Note/Article 판단 로직 자체는 변경
  불필요(교체된 콘텐츠도 그냥 더 긴/짧은 `contentHtml`일 뿐). 추출 실패(링크 없음,
  요청 실패, 본문 인식 실패)는 조용히 원래 teaser로 폴백한다 — 발행 자체를 막지 않는다.
- **액터 프로필**: 전문 모드 액터의 소개말에 한 줄을 덧붙여(`render.ts`) 팔로워가
  두 계정을 구분할 수 있게 한다. teaser 계정 쪽은 별다른 언급을 추가하지 않는다 —
  요약만 게시하는 쪽이 기본 동작이라 굳이 설명할 필요가 없고, 전문 계정이 실제로
  존재하는지 모르는 채 "따로 있을 수도 있다"고 암시하면 오히려 혼란만 준다.
- **캐싱은 별도로 두지 않는다**: 아이템은 `ItemRepository`가 발행 여부로 이미
  중복 제거하므로, 추출도 발행 시점에 자연히 아이템당 1회만 일어난다. 발행 실패로
  재시도되는 드문 경우에만 재추출이 일어나는데, 이는 감수할 만하다.

## 고려한 대안

| 옵션 | 설명 | 채택 여부 |
|---|---|---|
| A. 전역 자동 적용 | 모든 피드에 대해 항상 원문을 가져와 전문으로 발행 | 기각 — 원저작자가 의도적으로 teaser만 제공하는 피드까지 동의 없이 전문을 연합우주에 재배포하게 됨 |
| B. 등록 시점 opt-in, 모드별 별도 액터 | 등록자가 명시적으로 켜고, 두 모드가 별도 계정이 됨 | **채택** |
| C. 별도 "피드 변환기" 서비스 | FiveFilters처럼 URL→전문 피드 URL 변환을 완전히 별도 제품으로 분리 | 지금은 보류 — 아래 "재검토 조건" 참고 |

## 아키텍처 (구현 완료)

- `domain/feed/feed.ts`: `Feed.fullContentEnabled: boolean`(등록 시 결정, 이후 불변).
  `FeedId.fromUrl`/`Handle.fromFeedUrl`이 두 번째 인자로 받아 해시에 반영.
- `domain/ports/content-extractor.ts`: `ContentExtractor` 포트 — `extract(url): Result<{contentHtml}, RequestFailed | ExtractionFailed>`.
- `domain/ports/feed-repository.ts`: `findByUrl(url, fullContentEnabled?)` — URL은
  모드별로 한 번만 등록 가능(DB에서는 `(url, full_content_enabled)` 복합
  유니크 인덱스로 강제, `feeds.url` 단독 유니크 제약은 제거).
- `application/register-feed.ts`, `application/handle-command.ts`: 명령/폼 입력을
  모드 플래그로 파싱해 `RegisterFeed.execute(rawUrl, fullContentEnabled)`까지 관통.
- `application/poll-feed.ts`: `withFullContent()`가 전문 모드일 때만 추출을 실행하고
  실패 시 원본 아이템을 그대로 반환.
- `infrastructure/content/readability-extractor.ts`: `fetch()` + `@mozilla/readability`
  + `linkedom`(DOM 파서로 jsdom 대신 채택 — 순수 JS, 네이티브 바인딩 없음, 가벼움).
- `infrastructure/persistence/schema.ts`: `full_content_enabled boolean not null
  default false` 컬럼 + `feeds_url_full_content_enabled_idx` 복합 유니크 인덱스
  (마이그레이션 `drizzle/0001_needy_lenny_balinger.sql`).
- `web/ui/pages.tsx`, `web/routes.tsx`: 등록 폼 체크박스, 검색/추천 카드의
  "전문 제공" 배지(`feed.full-content-badge`).
- e2e: `test/e2e/full-content.test.ts` — 같은 URL을 두 모드로 등록해 서로 다른
  액터가 되는지, 전문 모드 발행물이 실제로 Readability로 추출된 본문을 담는지
  로컬 픽스처 서버로 검증(실제 인터넷에 나가지 않음).

## 재검토 조건 (미결로 남긴 것)

- **옵션 C(별도 변환기 서비스)**: 지금은 브리지 기능 안의 opt-in으로 충분하다고
  보고 손대지 않는다. 재검토 신호: (a) 전문 추출이 파싱 실패/차단 비율이 높아
  운영 부담이 커지거나, (b) "ActivityPub으로 안 보내고 그냥 전문 피드 URL만
  필요하다"는 요청이 반복되면 — 그때는 `ContentExtractor` 어댑터를 그대로 재사용해
  독립 라우트(`/full/:feedId.xml` 같은)나 완전히 별도 서비스로 분리한다. rss2.pub
  본체는 그 경우 다시 "RSS → ActivityPub"만 하는 단순한 형태로 되돌릴 수 있다 —
  포트 뒤에 격리해 둔 덕에 이 되돌림은 어댑터 교체로 국소화된다.
- **저작권 고지 강화**: 지금은 기존 링크 첨부 방식(`linkParagraph`)을 그대로
  쓴다. 전문 재배포 관련 이슈가 실제로 제기되면 재검토.
- **추출 실패 가시성**: 지금은 무음 폴백만 한다. 실패율이 체감될 정도가 되면
  운영자용 지표(추출 성공/실패 카운트)를 추가할 수 있다 — 팔로워에게 알리지는
  않는다(교체 대상은 게시물 본문이지, 게시 여부가 아니므로).
