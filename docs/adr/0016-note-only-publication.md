# ADR-0016: 모든 Atom entry를 Note로 게시

- 상태: Accepted
- 날짜: 2026-09-22
- 대체: ADR-0005
- 개정: ADR-0013의 Note/Article 저장 모델, ADR-0015의 Note/Article 분류 유지

## 결정

rss2.pub은 Atom entry의 길이에 관계없이 모든 새 글과 수정 글을 ActivityPub `Note`로
게시한다.

- `content`에는 제목을 굵게 인라인한 뒤 정제된 Atom 본문 전문과 원문 링크를 넣는다.
- `url`은 Atom entry의 원문 링크로 설정한다.
- Atom `summary`가 본문 대체 입력으로 선택된 경우에도 최종 본문은 `content`에 넣는다.
- ActivityStreams `summary`는 티저로 자동 생성하지 않는다. 실제 content warning을
  표현하는 입력이 도입될 때만 사용한다.
- 본문 길이를 이유로 자르거나 `Article`로 바꾸지 않는다. 수신 구현의 자체 한도는
  수신 구현이 처리하도록 한다.

정식 출시 전 결정이므로 기존 Article 객체와 데이터의 호환 경로를 두지 않는다.
Article dispatcher, 저장 kind, 렌더러와 설정을 제거하고 개발 데이터베이스를 초기화한다.

## 근거

ActivityStreams에서 `Note`와 `Article`은 전용 필드가 아니라 의미적 분류가 다르다.
`name`, `summary`, `content`, `url`은 공통 `Object` 속성이다. 그러나 주요 소비자인
Mastodon은 `Note`를 일급 게시물로 처리하고 `Article`은 변환된 표시로 처리하므로,
전문을 타임라인에 일관되게 전달하려면 Note가 더 예측 가능하다.

ActivityPub에는 수신 서버의 최대 본문 길이를 사전에 협상하는 표준이 없다. 서버별
한도에 맞춰 모든 수신자의 본문을 선제적으로 자르면 다른 수신자에게도 불필요한 정보
손실이 생기므로 원본 Atom 본문을 그대로 전달한다.

## 고려한 대안

- **ADR-0005의 길이 기반 Note/Article 선택 유지**: 긴 글이 Mastodon에서 전문 대신
  제목·티저·링크로 바뀌므로 기각했다.
- **Note를 공통 길이로 절단**: 서버별 한도를 하나의 값으로 일반화할 수 없고 원문
  손실이 생기므로 기각했다.
- **FEP-b2b8의 Article + preview Note**: 장기적으로 더 의미론적인 모델이지만 해당 FEP는
  Draft이고 현재 주요 소비자의 `preview` 표시를 신뢰할 수 없어 채택하지 않았다.

## 결과

- `PostContent`는 Note에 필요한 제목, 본문, 원문 URL, 발행 시각, 언어만 가진다.
- `NOTE_MAX_CHARS`와 `TEASER_MAX_CHARS` 설정이 사라진다.
- 연합 객체 URI는 `/ap/actor/{identifier}/note/{id}` 하나만 사용한다.
- 매우 긴 Note는 일부 수신 구현에서 잘리거나 거부될 수 있다. 실제 전달 실패가
  관측되면 수신 서버별 협상이 아니라 제품 수준의 별도 본문 정책으로 재검토한다.
