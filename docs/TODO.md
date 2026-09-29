# 후속 과제 완료 기록 (Follow-ups)

rss-parrot.net 비교 조사와 RSS 2.0 파서 개선에서 파생된 후속 과제 목록.
완료된 파서 작업은 `6707e20`(feat(rss-feed): consume full RSS 2.0 core spec
elements)에 포함되어 있다.

## 결정 사항

- **Bluesky 프로필 지원은 하지 않는다.** RSS Parrot의 bsky 지원은 Bluesky의
  공개 RSS(`bsky.app/profile/{did}/rss`)를 일반 피드처럼 폴링하는 것일 뿐
  (brid.gy 같은 API 기반 양방향 브리지와 다름)이지만, 이 프로젝트의 범위에서
  제외하기로 함.

## 1. rss-feed 파서 → 도메인 배선

파서 필드를 도메인과 등록·폴링 경로에 배선함.

- [x] **`content:encoded` → 전문 게시**: RSS 2.0 아이템에서 description이
  요약, `content:encoded`가 전문인 경우가 흔함(WordPress). Atom의
  content/summary 정책(ADR-0015, ADR-0016)에 대응되도록 매핑.
  `mapRss2Entry`에서 `contentEncoded`를 `contentHtml`로, 없으면 `description`
  폴백.
- [x] **`enclosure` → 팟캐스트 링크 폴백**: 링크 없는 아이템에서 첫 audio
  enclosure URL을 링크로 사용 (RSS Parrot `fixPodcastLink`, 이슈 #18 대응).
  W3C corpus의 `element-channel-item-enclosure/` 14개 테스트가 회귀 오라클.
- [x] **RSS 저자 attribution**: RSS 2.0 `<author>`와 `dc:creator`에 명시적
  HTTP(S) URI가 있을 때만 ADR-0014의 Actor 조회를 적용. 일반적인 RSS
  `<author>` 이메일과 plain name은 Actor 후보로 추정하지 않음
  ([ADR-0017](adr/0017-rss-author-attribution.md)).
- [x] **`generator` → Mastodon 계정 피드 감지**: `<generator>`에 mastodon이
  포함되고 URL이 계정 자체의 RSS 경로일 때 등록 거부. 태그 RSS와 계정별
  태그 RSS는 별도 Actor가 없으므로 등록 가능.

## 2. rss-parrot 대비 부족 기능

- [x] **웹사이트 URL 자동 발견**: 사이트 URL만 받아 HTML의
  `<link rel=alternate>`에서 피드를 찾아 등록. RSS Parrot의 핵심 UX — 피드
  URL을 몰라도 등록 가능. 등록 유스케이스에 발견 단계 추가.
- [x] **모더레이션 인프라**: 피드 블록리스트(파일/DB), 신고·제거 경로.
  DB 블록리스트, 연합 `Flag` 신고 수신, 운영자 검토·차단·제거 명령을
  [운영 문서](MODERATION.md)에 정리함.

## 참고: 완료됨

- RSS 2.0 파서가 핵심 스펙의 모든 채널·아이템 요소를 소비
  (`enclosure`, `author`, `categories`, `comments`, `source`,
  `content:encoded`, `cloud`, `image`, `textInput`, skip 일정, 타임스탬프,
  메타데이터). W3C conformance 매니페스트 재분류 완료 (unconsumed는
  `atom:link`, Slash 모듈뿐). `6707e20`
