# ADR-0016: RSS 2.0 입력 지원 (RSS 1.0 제외, Atom과 완전히 분리된 순수 파서)

- Status: accepted (2026-09-10)
- Amends: ADR-0012 (RSS 지원 제거 결정 중 "RSS 입력을 전혀 지원하지 않는다"는 부분을 재검토
  조건 충족으로 뒤집는다. "Atom 파서 안에 RSS 분기를 추가하지 않는다"는 격리 원칙은 유지하며,
  대칭적으로 RSS 파서 안에도 Atom 분기를 추가하지 않는다.)
- Context: 실사용 조사에서 `https://longform.asmartbear.com/index.xml` 등 Hugo 기본 RSS 2.0
  출력만 제공하는 피드가 등록 시도 단계에서 전량 반려됨을 확인. ADR-0012가 명시한 재검토 조건
  ("별도 제품 요구와 유지보수 예산이 생길 때")이 충족되었다고 판단.

## 배경

Atom-only 정책(ADR-0012) 하에서 RSS만 제공하는 피드는 등록이 전량 실패한다. 주요 CMS/SSG
발행 경로를 조사한 결과, RSS만 제공하고 Atom 대체 피드가 없는 사이트가 드물지 않다:

- WordPress: 기본 피드 포맷은 `rss2`(RSS 2.0)이다.
  https://developer.wordpress.org/reference/functions/get_default_feed/
- Hugo: 내장 RSS 템플릿이 `<rss version="2.0">`을 생성하며, 별도 설정 없이는 Atom을 출력하지
  않는다. https://gohugo.io/templates/rss/
- Ghost, Medium 등 다수 발행 경로도 RSS 2.0을 기본/표준으로 사용한다.
- 반면 Jekyll의 공식 `jekyll-feed` 플러그인은 Atom을 기본 출력으로 사용한다
  (https://github.com/jekyll/jekyll-feed) — 즉 이미 Atom 지원만으로 커버되는 발행 경로도 있다.

RSS 1.0(RDF Site Summary)은 RSS 2.0과 처리 모델이 근본적으로 다르다:

- 루트가 `<rdf:RDF>`이고 `<channel>`/`<item>`은 `rdf:about` URI로 식별되는 RDF 리소스다.
- 항목 순서는 문서 순서가 아니라 `<channel><items><rdf:Seq><rdf:li .../></rdf:Seq></items>`의
  참조를 해소해서 복원해야 한다. 시퀀스에 없는 `<item>`은 RDF 파서가 버릴 수 있다(스펙 명시).
  https://web.resource.org/rss/1.0/spec
- 날짜/저자/카테고리 등 핵심 필드가 코어에 없고 Dublin Core 등 선택 모듈(`dc:date`,
  `dc:creator`, `dc:subject`)에 의존한다. https://web.resource.org/rss/1.0/modules/dc/
- 조사한 주요 CMS/SSG(WordPress, Hugo, Ghost, Medium) 중 RSS 1.0을 기본 출력으로 쓰는 곳은
  없었다. WordPress는 레거시 호환 목적의 별도 엔드포인트로만 RSS 1.0을 제공한다. 따라서 RSS 1.0
  미지원의 실질 손실은, 확인 가능한 범위에서는 현재 대표적인 발행 경로가 아니라 일부 레거시·특수
  RDF 피드에 한정된다.

## 결정

- **RSS 2.0 입력을 지원한다. RSS 1.0은 이번 범위에서 제외한다.**
- 새 workspace package `@rss2pub/rss-feed`를 만든다. `@rss2pub/atom-feed`와 동일하게
  HTTP나 도메인을 모르는 순수 XML→DTO 변환기이며, Atom 파서의 코드/타입을 재사용하거나
  분기로 얽히게 하지 않는다.
- 패키지 내부는 **모듈 단위로 분리**한다(별도 package 분리 아님):
  ```text
  @rss2pub/rss-feed
    parse.ts   # 루트/버전 판별, 공통 XML 입력 처리
    rss2.ts    # rss → channel → item 단순 트리 순회 (지금 구현)
    model.ts   # 공통 정규화 DTO
  ```
  RSS 1.0은 구현하지 않지만, 향후 필요해지면 같은 패키지 안에 `rss1.ts`(`rdf:about` 인덱싱 +
  `rdf:Seq` 참조 해소 + Dublin Core 매핑)로 추가할 수 있는 경계를 남긴다. 별도 package로
  쪼개지 않는 이유는, RSS 1.0을 임의의 RDF 의미론까지 지원하는 게 아니라 RSS 1.0 코어 + Dublin
  Core 범위로 한정하면 공통 XML 엔진을 공유하는 얇은 모듈 하나로 흡수 가능하다고 판단했기
  때문이다(별도 조사 결론). 임의 RDF 어휘·재귀적 RDF 설명·외부 RDF 참조까지 지원해야 하는
  요구가 생기면 그때는 별도 패키지나 범용 RDF 처리기가 필요하다.
- **RSS로 등록된 피드는 저자(author)를 ActivityPub `attributedTo`에 등록하지 않는다.**
  RSS 매핑 함수는 `RawFeedItem.authorUris`에 항상 빈 배열을 반환한다 — 이 타입은 이미 빈
  배열을 허용하므로 도메인 타입 변경 없이 표현 가능하다. 최종 `attributedTo`는 로컬 feed actor
  하나뿐이다.
- `FeedFetcher` 어댑터(infrastructure)는 응답 루트 엘리먼트로 Atom → RSS 2.0 순으로 판별해
  각각의 순수 파서에 위임하고, 각각의 매핑 함수로 공통 `RawFeedItem`에 투영한다. 판별/분기는
  infrastructure의 책임이며, 두 파서 패키지 내부에는 서로에 대한 인지가 없다.
- 웹 UI/응답 에러 메시지("document is not an Atom 1.0 feed")는 "지원하지 않는 피드 형식"
  등으로 갱신한다(ADR-0008 절차에 따라 `messages.ts` → `yarn i18n:extract` →
  `ko.po` 번역 → `yarn i18n:compile`).
- RSS 2.0 conformance 테스트는 **이미 vendor된 `vendor/w3c-feedvalidator` submodule의
  `testcases/rss20/`(해당 pin 기준 326개 xml)를 그대로 재사용**한다. 새 fixture 생성기
  (Docker, WordPress, Hugo 등)는 만들지 않는다. 이 corpus는 Atom 서브셋과 동일한 커밋에서
  나온 동일 라이선스(`vendor/w3c-feedvalidator/LICENSE`, MIT 계열)이며, 이미
  `W3C-FEEDVALIDATOR.md`에 출처/라이선스가 문서화되어 있어 실사이트 스크래핑에 따르는
  저작권/ToS 리스크가 전혀 없다. `testcases/rss`(RSS 0.9x 계열, 221개)와
  `testcases/rss11`(RSS 1.1/RDF 계열, 32개)는 이번 범위(RSS 2.0만 지원) 밖이므로 선택하지
  않는다.
- Atom 서브셋과 동일한 절차를 RSS 2.0에도 적용한다: 선택 glob은
  `testcases/rss20/**/*.xml`, 각 경로에 생성된 프로필 분류를 부여하고, `yarn
  atom:conformance:update`에 준하는 `yarn rss:conformance:update` 스크립트로 매니페스트와
  체크섬을 고정한다. `W3C-FEEDVALIDATOR.md`에 RSS 2.0 서브셋 선택 근거와 파일 수를 추가한다.

## 결과

- RSS로 등록된 피드는 항상 로컬 feed actor 하나로만 attributedTo가 채워지며, 외부 저자 URI가
  붙지 않는다. 이는 알려진 제약으로 문서화한다.
- RSS 1.0만 제공하는 피드(레거시 RDF 피드)는 여전히 등록할 수 없다.
- Atom 파서(`@rss2pub/atom-feed`)와 RSS 파서(`@rss2pub/rss-feed`)는 완전히 독립적인
  package로 유지되어, 도메인/애플리케이션 계층은 여전히 XML 파서 타입을 전혀 모른다
  (`RawFeedItem`을 통해서만 접촉).
- RSS 2.0 conformance corpus는 새 인프라 없이 기존 `vendor/w3c-feedvalidator` submodule
  pin과 매니페스트/체크섬 절차를 그대로 확장해서 얻는다 — 별도 Docker/WordPress/Hugo 생성기를
  유지보수할 필요가 없다.

## 고려한 대안

- **RSS 1.0까지 동시 지원**: RDF 그래프 처리(자원 인덱싱, 시퀀스 참조 해소, 누락/불일치 정책)가
  즉시 필요해지고, 조사 결과 WordPress/Hugo/Ghost/Medium 등 대표 발행 경로가 RSS 1.0을 기본
  출력으로 쓰지 않아 실사용 이득이 제한적이라 기각. 수요가 확인되면 재검토.
- **RSS 파서를 Atom 패키지 내부에 조건 분기로 추가**: ADR-0012가 "Atom parser 안에 RSS 분기를
  추가하지 않는다"고 명시적으로 금지했고, 형식별 순수성·책임 분리를 지키기 위해 기각. 대칭적으로
  RSS 파서에도 Atom 분기를 넣지 않는다.
- **RSS1/RSS2를 처음부터 별도 package로 분리**: RSS 1.0을 아직 구현하지 않는 현재로서는
  과설계로 판단. RSS 1.0을 실제로 추가하는 시점에 이질성이 module 경계를 넘어선다고 판명되면
  그때 package를 쪼갠다.
- **WordPress/Hugo를 Docker 컨테이너로 실행해 합성 RSS fixture를 직접 생성**: 실사이트
  스크래핑을 피하기 위한 목적으로 처음 검토했으나, 이미 vendor된
  `vendor/w3c-feedvalidator`가 RSS 2.0 edge case를 필드 단위로 훨씬 세밀하게(326개, 중복/누락/
  타입오류 등 항목별 분류) 다루고 있고 라이선스도 이미 해결되어 있어 기각. 새 컨테이너
  인프라의 유지보수 비용을 정당화할 근거가 없다. corpus가 다루지 못하는 특정 CMS 고유 확장
  필드(예: `content:encoded`/`description` 분리, `media:` 네임스페이스)가 실제 등록
  실패로 드러나면 그때 최소 범위로 재검토한다.

## 조사 근거

- RSS 2.0 fixture 소스 확정 (2026-09-10): `vendor/w3c-feedvalidator`는 이미 Atom 서브셋에
  쓰이고 있는 동일 pin에 `testcases/rss20/`(326개), `testcases/rss`(221개, RSS 0.9x),
  `testcases/rss11`(32개, RSS 1.1/RDF)까지 포함하고 있음을 확인했다. RSS 2.0 지원 범위에는
  `testcases/rss20/`만 채택한다.
- RSS 1.0 vs RSS 2.0 구조/실사용 조사 (2026-09-10):
  - https://web.resource.org/rss/1.0/spec
  - https://www.w3.org/TR/rdf-syntax-grammar/
  - https://web.resource.org/rss/1.0/modules/dc/
  - https://www.rssboard.org/rss-specification
  - https://developer.wordpress.org/reference/functions/get_default_feed/
  - https://developer.wordpress.org/advanced-administration/wordpress/feeds/
  - https://gohugo.io/templates/rss/
  - https://github.com/gohugoio/hugo/blob/master/tpl/tplimpl/embedded/templates/rss.xml
  - https://github.com/jekyll/jekyll-feed
  - https://ghost.org/help/where-can-i-find-my-rss-feed/
- WordPress RSS 2.0 산출물의 네임스페이스/필드(`content`, `wfw`, `dc`, `atom`, `sy`,
  `slash`, `content:encoded` vs `description`, CDATA 이스케이프 비일관성):
  - https://github.com/WordPress/wordpress-develop/blob/6.9.4/src/wp-includes/feed-rss2.php
  - https://core.trac.wordpress.org/ticket/59082

## 재검토 조건

RSS 1.0 지원은 실사용 요구(예: RSS 1.0 전용 피드의 등록 실패 사례가 실제로 축적될 때)가 생기면
이 ADR을 수정해 `rss1.ts` 모듈 추가로 재검토한다. RSS 파서 패키지 안에 Atom 분기를 추가하지
않는다.
