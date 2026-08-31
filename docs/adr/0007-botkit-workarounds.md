# ADR-0007: BotKit 한계 우회 — Article 제목과 federationOptions 패치

- Status: superseded (2026-08-27) — 두 한계 모두 BotKit 0.6에서 업스트림 해소,
  로컬 패치 제거. 과거 우회의 기록으로 유지.
  ADR-0013(2026-08-30)이 BotKit 자체를 목표 구조에서 제거한다.
  (2026-07-27 accepted; 2026-08-25 amended — 한계 1은 BotKit 0.6에서
  업스트림 해소, 한계 2 패치는 0.6.0-dev.345로 포팅)
- Context: M3 구현 중 확인된 BotKit 0.5.1의 두 가지 한계 (node_modules 소스 수준 확인)

## 한계 1: `session.publish()`가 Article의 `name`/`summary`를 설정할 수 없음

마스토돈은 Article을 `name`(제목) + `summary`(티저) + 링크로만 렌더링하므로(ADR-0005)
제목 없는 Article은 마스토돈에서 깨진다. BotKit의 publish 옵션에는 해당 필드가 없다.

**결정**: `botkit-gateway.ts`에서 publish 직후 (1) 우리가 소유한 `Repository`의
`updateMessage()`로 저장된 Create(Article)에 `name`/`summary`를 clone해 넣고,
(2) `session.context.sendActivity()`로 팔로워에게 `Update`를 보낸다(마스토돈 4.5+가
Article Update를 반영). 콘텐츠 본문에도 `<h1>` 제목을 중복 포함해 전문 렌더러
(Misskey 계열)에서도 제목이 보이게 한다. E2E가 원격 outbox에서 `name`/`summary`를 검증.

## 한계 2: `createInstance()`가 Fedify 옵션을 노출하지 않음

BotKit은 `createFederation({ kv, queue, userAgent })`를 하드코딩한다. 서명 검증은
상대 액터 키를 fetch해야 하는데 Fedify의 SSRF 가드가 사설/루프백 주소를 차단하므로,
로컬 E2E에서 서명 왕복(Follow→Accept→Create 배달)을 검증할 수 없다.

**결정**: Yarn Berry `yarn patch`로 BotKit 0.5.1에 5줄 패치를 적용
(`.yarn/patches/@fedify-botkit-npm-0.5.1-*.patch`): `CreateInstanceOptions`에
`federationOptions`를 spread로 전달. 우리 코드는 `ALLOW_PRIVATE_ADDRESS=true`(테스트
전용)일 때만 `{ allowPrivateAddress: true }`를 넘긴다. 운영 기본값은 가드 활성.

## 결과

- BotKit 버전 업그레이드 시 패치 재검토 필요(버전 고정 0.5.1). 업스트림에
  `federationOptions` 노출을 제안할 가치가 있음.
- 서명 포함 E2E(`test/e2e/remote-federation.test.ts`)가 실제 HTTP Signature로
  Follow 수락·Create 배달·Delete 전파를 검증한다.

## 재검토 조건

BotKit이 publish에 name/summary 옵션 또는 createInstance에 Fedify 옵션 패스스루를
공식 제공할 때(그때 패치 제거).

## 개정 (2026-08-25): BotKit 0.6.0-dev.345 업그레이드

- **한계 1 해소**: 0.6.0부터 `session.publish()`가 `name`/`summary`/`url` 옵션을
  직접 받고, `language` 옵션이 content뿐 아니라 name/summary까지 태깅한다.
  `botkit-gateway.ts`의 post-publish `updateMessage()` + `Update` 재작성 단계를
  제거하고 단일 Create로 전송한다. `summary`는 이미 sanitize된 HTML이므로
  문자열(이스케이프됨)이 아닌 `RawInlineHtmlText`(`Text<"inline">`)로 넘긴다.
  `url` 미지정 시 BotKit이 자체 메시지 페이지 URL을 기본값으로 채운다.
- **한계 2 유지**: `federationOptions` 패스스루는 여전히 업스트림에 없어 동일한
  1줄 패치를 0.6.0-dev.345에 포팅했다
  (`.yarn/patches/@fedify-botkit-npm-0.6.0-dev.345-*.patch`).
- 콘텐츠 본문의 `<h1>` 제목 중복 포함(전문 렌더러용)은 그대로 유지.

## 개정 (2026-08-27): BotKit 0.6.0-dev.348 업그레이드 — 한계 2 해소, 패치 제거

- 이 저장소가 제기한 [fedify-dev/botkit#41][issue-41]에 대한 답으로 BotKit이
  [#43][pr-43]에서 `FederationInfrastructureOptions`
  (`allowPrivateAddress`, `circuitBreaker`, `tracerProvider`, `meterProvider`,
  `firstKnock`, `inboxChallengePolicy`)를 정식 채택했다. `CreateInstanceOptions`
  / `CreateBotOptions`가 이제 공식적으로 `federationOptions` 필드를 노출한다
  (`kv`/`queue`/`userAgent`는 여전히 BotKit이 소유, 오버라이드 불가).
- **결정**: `0.6.0-dev.345` 패치(`.yarn/patches/@fedify-botkit-npm-0.6.0-dev.345-*.patch`)를
  제거하고 `0.6.0-dev.348`로 업그레이드. `botkit-stack.ts`의 `CreateInstanceOptions`
  타입 확장 우회(`& { federationOptions?: ... }`)도 제거 — 이제 패키지 자체 타입에
  `federationOptions?: FederationInfrastructureOptions`가 있다.
- 한계 1, 2 모두 업스트림에서 해소되어 이 ADR이 다루던 우회가 남지 않았다. 향후
  BotKit이 새 한계를 드러내면 새 ADR로 기록한다(이 문서는 과거 기록용으로 유지).

[issue-41]: https://github.com/fedify-dev/botkit/issues/41
[pr-43]: https://github.com/fedify-dev/botkit/pull/43
