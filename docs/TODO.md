# 남은 할일 (Follow-ups)

rss-parrot.net 비교 조사와 RSS 2.0 파서 개선에서 파생된 후속 과제 목록.
완료된 파서 작업은 `6707e20`(feat(rss-feed): consume full RSS 2.0 core spec
elements)에 포함되어 있다.

## 결정 사항

- **Bluesky 프로필 지원은 하지 않는다.** RSS Parrot의 bsky 지원은 Bluesky의
  공개 RSS(`bsky.app/profile/{did}/rss`)를 일반 피드처럼 폴링하는 것일 뿐
  (brid.gy 같은 API 기반 양방향 브리지와 다름)이지만, 이 프로젝트의 범위에서
  제외하기로 함.

## 1. rss-feed 파서 → 도메인 배선 (우선순위 순)

파서가 필드를 노출하지만 도메인(`src/domain`, `src/infrastructure/feedfetch/
rss2-mapping.ts`)은 아직 미사용. 모두 "도메인 → 유스케이스 → 어댑터 → 배선"
순서(add-feature 스킬)로 진행.

- [ ] **`content:encoded` → 전문 게시**: RSS 2.0 아이템에서 description이
  요약, `content:encoded`가 전문인 경우가 흔함(WordPress). Atom의
  content/summary 정책(ADR-0015, ADR-0016)에 대응되도록 매핑.
  `mapRss2Entry`에서 `contentEncoded`를 `contentHtml`로, 없으면 `description`
  폴백.
- [ ] **`enclosure` → 팟캐스트 링크 폴백**: 링크 없는 아이템에서 첫 audio
  enclosure URL을 링크로 사용 (RSS Parrot `fixPodcastLink`, 이슈 #18 대응).
  W3C corpus의 `element-channel-item-enclosure/` 14개 테스트가 회귀 오라클.
- [ ] **`author` → 저자 attribution**: ADR-0014의 Atom author lookup과 동일한
  처리를 RSS 2.0 `<author>`(이메일 + 이름 형태)와 `dc:creator`에 적용.
  `rss2-mapping.ts`의 "attribution stays the local feed actor only" 주석이
  이 작업으로 대체됨.
- [ ] **`generator` → Mastodon 피드 감지**: `<generator>`에 mastodon이
  포함되면 등록 거부 (RSS Parrot `filterFeed`의 FsMastodon 대응). 채널
  메타데이터는 이미 파싱되므로 등록 유스케이스에서 판정만 추가.

## 2. rss-parrot 대비 부족 기능

- [ ] **웹사이트 URL 자동 발견**: 사이트 URL만 받아 HTML의
  `<link rel=alternate>`에서 피드를 찾아 등록. RSS Parrot의 핵심 UX — 피드
  URL을 몰라도 등록 가능. 등록 유스케이스에 발견 단계 추가.
- [ ] **모더레이션 인프라**: 피드 블록리스트(파일/DB), 신고·제거 경로.
  현재는 익명 등록 제한만 존재하고 운영자용 unregister(`unregister-feed.ts`)는
  있으나 블록리스트와 신고 채널이 없음.

## 참고: 완료됨

- RSS 2.0 파서가 핵심 스펙의 모든 채널·아이템 요소를 소비
  (`enclosure`, `author`, `categories`, `comments`, `source`,
  `content:encoded`, `cloud`, `image`, `textInput`, skip 일정, 타임스탬프,
  메타데이터). W3C conformance 매니페스트 재분류 완료 (unconsumed는
  `atom:link`, Slash 모듈뿐). `6707e20`