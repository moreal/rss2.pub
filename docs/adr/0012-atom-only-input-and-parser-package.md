# ADR-0012: Atom-only 입력과 전용 parser package

- Status: accepted (2026-08-30)
- Supersedes: ADR-0011의 RSS 지원 및 regex 기반 Atom 속성 추출 결정
- Context: `docs/design/2026-08-30-atom-fedify-attribution-design.md`

## 배경

`rss-parser`는 Atom entry의 복수 author URI와 feed/source author 상속을 충분히 보존하지
않는다. `xml:lang`도 원본 XML 정규식으로 따로 추출해야 해 parser 결과와 entry 순서가
암묵적으로 결합되어 있다. 복수 저자 attribution을 정확히 만들려면 namespace-aware Atom
의미 파서가 필요하다.

RSS의 기존 등록과 데이터 호환은 요구하지 않는다. 앞으로 입력 형식을 Atom으로만
제공해도 된다.

## 결정

- RSS 입력 지원과 `rss-parser`를 제거한다.
- workspace package `@rss2pub/atom-feed`를 만든다.
- package는 HTTP나 root domain을 모르는 순수 XML-to-DTO parser다.
- `saxes`를 strict namespace-aware XML engine으로 사용한다.
- Atom 1.0 namespace의 `feed`만 허용하고 RSS는 `NotAtomFeed`로 거부한다.
- author 상속은 entry, source, feed 순으로 계산한다.
- `text`/`html`/`xhtml`, `xml:lang`, feed/entry metadata를 구조적으로 해석한다.
- DOCTYPE을 거부하고 byte/depth/node limit을 둔다.

## 결과

Atom semantics와 XML security boundary가 한 package에 모인다. domain과 application은 XML
package type에 의존하지 않고 infrastructure adapter가 DTO를 raw domain input으로
변환한다.

기존 RSS URL은 등록 또는 poll에 실패할 수 있으며 별도 migration이나 fallback을
제공하지 않는다. UI와 문서도 Atom-only 제품으로 바꾼다.

## 고려한 대안

- **`rss-parser` custom fields 확장**: entry author 일부는 얻을 수 있지만 feed author
  복수성과 상속이 불완전해 기각.
- **`linkedom` DOMParser**: XML namespace와 malformed XML 처리 실험 결과가 strict Atom
  parser에 맞지 않아 기각.
- **범용 object XML parser**: mixed content와 namespace 의미를 다시 복원해야 해 기각.
- **RSS와 Atom 모두 자체 구현**: 현재 요구 범위를 넓히므로 기각.

## 재검토 조건

RSS 지원은 별도 제품 요구와 유지보수 예산이 생길 때만 새 ADR로 재검토한다. Atom parser
안에 RSS 분기를 추가하지 않는다.
