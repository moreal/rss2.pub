# ADR-0007: BotKit 한계 우회 — Article 제목과 federationOptions 패치

- Status: accepted (2026-07-27)
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
