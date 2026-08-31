# ADR-0014: Atom author를 복수 `attributedTo`로 표기

- Status: accepted (2026-08-30)
- Context: `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## 배경

Atom author의 `uri`가 JSON-LD ActivityPub Actor를 가리키는 경우 게시물 저자로 명시하고
싶다. 본문에 `@mention`을 삽입하면 원문을 오염시키고 알림과 delivery audience까지
바뀐다. ActivityStreams `attributedTo`는 여러 객체를 받을 수 있으며, 실제 fediverse
객체에서도 Organization과 Person을 함께 attribution하는 패턴이 사용된다.

## 결정

- Atom의 effective author는 entry, source, feed 순으로 상속한다.
- absolute HTTP(S) author URI만 후보로 인정한다.
- 정규화 후 순서를 유지해 deduplicate하고 entry당 최초 8개만 lookup한다.
- Fedify `lookupObject()` 결과가 canonical ID를 가진 Actor일 때만 인정한다.
- 최종 `attributedTo`는 local feed actor를 첫 항목으로 하고 확인된 Atom actors를 뒤에 둔다.
- body, Mention tag, `to`, `cc`는 변경하지 않는다.
- lookup 실패와 non-Actor는 해당 author만 제외하고 publish/Update를 계속한다.
- memoization은 한 poll 동안 URI별 한 번으로 제한하고 persistent cache는 두지 않는다.
- author candidate 목록을 content fingerprint에 넣어 author-only 변경도 Update한다.

## 실패 및 재시도

lookup 실패는 poll 실패가 아니다. entry가 바뀌지 않으면 이후 poll에서 재시도하지 않는다.
content 또는 author candidate가 바뀌어 Update 대상이 되면 그 poll에서 다시 lookup한다.
Update lookup이 실패한 author는 과거 attribution을 보존하지 않고 제외한다.

## 결과

원문과 audience를 보존하면서 공동 저자를 ActivityStreams metadata로 표현한다. 외부 Actor
조회 결과는 도메인 fingerprint에 넣지 않아 Update 판정을 deterministic하게 유지한다.
local actor를 포함한 최종 attribution 수는 최대 9개다.

## 고려한 대안

- **본문 Mention**: 원문 오염과 알림/delivery 의미 변경 때문에 기각.
- **`tag: Mention`만 추가**: attribution이 아니고 여전히 mention semantics를 만들므로 기각.
- **Atom URI를 검증 없이 attribution**: 일반 홈페이지나 non-Actor object가 들어갈 수 있어
  기각.
- **persistent Actor cache와 background retry**: stale data와 retry lifecycle이 복잡해 현재
  best-effort 요구보다 과하므로 기각.

## 재검토 조건

author lookup 부하가 실제 병목이 되면 TTL cache를 별도 ADR로 검토한다. 8명 제한이나
lookup 실패 보존 정책을 바꿀 때도 interoperability와 abuse risk를 다시 평가한다.
