# ADR-0008: Lingui 기반 다국어 지원 — 매크로 없는 런타임 방식

- Status: accepted (2026-08-04)
- Context: 웹 UI 다국어 지원(영어 + 한국어) 도입. 이 프로젝트의 툴체인은
  tsx(esbuild)로 dev, 순수 tsc로 build — babel/SWC 변환 단계가 없다.

## 문제

Lingui의 표준 사용법(`@lingui/core/macro`의 `t`/`msg`, React `Trans`)은
빌드 타임 매크로 변환(babel-plugin-lingui-macro 또는 SWC 플러그인)을
요구한다. 우리 툴체인에는 그런 변환 단계가 없고, UI는 React가 아니라
hono/jsx 서버 렌더링이다.

## 결정

**매크로 없이 `@lingui/core` 런타임만 사용한다** (Lingui 6.x).

1. **메시지 정의**: 모든 UI 문자열은 `src/web/ui/messages.ts` 한 파일에
   explicit ID를 가진 디스크립터(`{ id, message }`)로 모은다. 각 디스크립터에
   `/*i18n*/` 주석을 달면 `lingui extract`가 매크로 없이도 추출한다
   (babel-plugin-extract-messages의 ObjectExpression 방문자, node_modules
   소스로 확인). 추출기는 이 외에도 수신자 이름이 `i18n`인 `._()`/`.t()`
   호출을 인식하지만, spread(`{...msg, values}`)가 있으면 조용히 건너뛴다 —
   그래서 호출부는 자유롭게 spread를 쓰고 정의부만 주석을 단다.
2. **카탈로그 워크플로**: `yarn i18n:extract` → `src/web/locales/{en,ko}.po`
   갱신 → ko.po 번역 → `yarn i18n:compile` → 컴파일된 `{en,ko}.ts`를 커밋.
   explicit ID 메시지는 추출 시 소스 기본 메시지가 en.po의 msgstr로
   채워지므로 en 카탈로그도 항상 완전하다. 프로덕션 런타임은 컴파일된
   카탈로그만 로드한다(런타임 ICU 컴파일러 불필요).
   컴파일 산출물은 `compileNamespace: "ts"`로 .ts를 생성 — 생성 코드에
   `as Messages` 캐스트가 들어 있는데, 이는 생성물 예외로 허용한다.
3. **로케일 목록 단일화**: `src/web/locale.ts`가 `SUPPORTED_LOCALES` /
   `DEFAULT_LOCALE` / 로케일 표시명 / `resolveLocale` / `switchLocalePath`를
   갖는다. 카탈로그를 import하지 않으므로(= 컴파일 산출물에 의존하지 않으므로)
   `lingui.config.ts`가 jiti로 이 모듈을 그대로 불러 쓴다. 로케일 추가는
   이 파일 한 곳만 고치면 되고, `Record<Locale, …>` 맵들이 나머지 누락을
   컴파일 에러로 만든다.
4. **로케일 협상**: `hono/language`의 `languageDetector`
   (querystring `?lang=` → cookie `lang` → `Accept-Language` 순, 쿠키 캐시).
   `ko-KR` → `ko` 축약은 hono의 `normalizeLanguage`가 이미 하므로
   `convertDetectedLanguage`를 넘기지 않는다. HTML 라우트에 **개별로** 붙인다.
   실측으로 확인한 이유 두 가지: (a) `app.route("/", subApp)`은 서브앱의
   `use()`를 부모에 `/*`로 재등록하므로 healthz/readyz까지 매칭된다,
   (b) `createWebRoutes` 안에서 `app.use()`를 쓰면 `app.ts`가 이 앱을
   `route("/", web)`로 마운트하는 순간 그 미들웨어가 BotKit 라우트
   (WebFinger, `/ap/*`)에도 걸려 **연합 응답에 언어 쿠키가 붙는다**.
   `app.use(detectLanguage)`로 "단순화"하지 말 것.
5. **요청별 인스턴스**: 로케일당 `I18n` 인스턴스를 기동 시 1개씩 만들어
   공유한다. 기동 후 `activate()`/`load()`를 호출하지 않으므로 동시 요청에
   안전하다.
6. **JSX 요소 삽입**: `Trans` 컴포넌트는 React 전용이라 쓸 수 없다. 번역
   문자열 안에 렌더링된 요소(칩 등)를 끼워 넣을 때는
   `translateWithSlots()`(src/web/i18n.ts)가 ICU 값으로 NUL 마커를 치환한 뒤
   분할·병합한다. 번역자는 `{handle}` 같은 플레이스홀더를 자유롭게 재배치할
   수 있다. 한계 두 가지:
   - 슬롯은 불투명(opaque)하다 — 요소가 텍스트 사이에 놓일 수는 있어도
     텍스트를 감쌀 수는 없다. `read the <a>docs</a>` 류가 필요해지면 문장을
     여러 메시지로 쪼개지 말고 태그 플레이스홀더(`<0>…</0>`)를 추가할 것.
   - 슬롯은 ICU가 읽지 못한다. 복수형 개수처럼 ICU가 해석해야 하는 값은
     네 번째 인자 `values`로 넘긴다. 슬롯으로 넘기면 마커 문자열로 치환된
     뒤 `NaN`으로 포맷된다(단위 테스트가 이 회귀를 고정한다).
7. **캐시·크롤러**: 로케일은 URL 경로가 아니라 `?lang=` + 쿠키로 나른다.
   경로 접두사(`/ko/…`)는 `app.ts`가 BotKit에 `/*`를 넘기는 구조와 충돌한다.
   대신 협상 응답에 `Vary: Accept-Language, Cookie`를 붙이고(공용 캐시가
   한 방문자의 언어를 다른 방문자에게 주는 것을 막는다), `<head>`에
   로케일별 `rel="alternate" hreflang"`과 `rel="canonical"`을 낸다 —
   크롤러는 본문 링크의 `hreflang`을 신호로 보지 않으므로 이것이 없으면
   한국어 페이지는 검색엔진에 존재하지 않는 것과 같다.

## 계층 판단

i18n은 프레젠테이션 관심사로 보고 전부 `src/web`에 둔다.
`@lingui/core`는 hono와 같은 지위의 웹 계층 프레임워크 의존성이다.
도메인은 사용자 대면 문자열을 만들지 않고 에러를 discriminated union으로
반환하므로, 웹 계층의 `registerErrorMessage()`가 그 union을 exhaustive
`switch`로 받아 문자열화한다(변형이 늘면 TS2366으로 컴파일이 깨진다).
포트로 감싸는 것은 이 경우 의례(ceremony)라 판단했다.

단, **애플리케이션 계층이 문자열을 전혀 만들지 않는 것은 아니다**:
`src/application/handle-command.ts`는 봇 응답 문구(도움말, 에러, 등록 안내)를
직접 조립하며, 그중 셋은 `messages.ts`의 영어 원문과 사실상 중복이고 이미
미세하게 갈라져 있다("I couldn't read a feed there: …" vs "Couldn't read a
feed there: …"). 봇 응답 현지화를 하게 되면 그 문자열 조립을
`src/application` 밖으로 빼내야(= 구조화된 응답을 반환하고 호출자가 렌더)
두 표면이 하나의 에러→문구 매핑을 공유할 수 있다. 지금은 범위 밖으로 둔다.

## 결과

- 새 문자열 추가 절차: messages.ts에 디스크립터 추가 → extract → ko.po 번역
  → compile → 커밋. ko 번역 누락은 컴파일 시 `fallbackLocales: en`으로
  영어가 나가고, 단위 테스트가 `SUPPORTED_LOCALES`를 순회하며 각 카탈로그가
  선언된 ID 집합과 정확히 일치하는지 검사한다(로케일을 추가해도 테스트를
  고칠 필요가 없다).
- 봇 명령 응답(`handle-command.ts`)과 연합 콘텐츠는 이번 범위 밖 — 현재
  영어 고정. 필요해지면 위 "계층 판단"의 단서대로 문자열 조립을 옮겨야 한다.
- Lingui 메이저 업그레이드 시 추출기의 비-매크로 동작(주석 인식, spread
  건너뛰기)을 재검증할 것.
