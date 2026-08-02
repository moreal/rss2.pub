# ADR-0004: 핸들 정규화 정책

- Status: accepted (2026-07-26)
- Context: docs/PLAN.md §4 (2026-07 조사 — RFC 7565, Mastodon/Misskey/Pleroma/Lemmy 소스)

## 결정

피드 액터의 핸들(username)은 canonical feed URL로부터 결정적으로 생성한다:

1. NFKC → 소문자 → `[a-z0-9]` 밖 문자를 `_`로 치환
2. `_` 연속 붕괴, 선두/말미 `_` 제거
3. **22자 초과 시**: 앞 22자로 절단(말미 `_` 재정리) + `_` +
   SHA-256(canonical URL) 기반 base36 해시 앞 7자

문자셋 `^[a-z0-9_]+$`, 최종 길이 최대 30자(22+1+7).

## 근거

- `[a-z0-9_]`는 조사한 모든 구현체(Mastodon 원격/Misskey/Pleroma/Lemmy)가 수용하는
  교집합. `.`과 `-`는 로컬 생성 불가·원격만 관용되는 2급 문자라 배제.
- Misskey는 원격 username 128자 초과 시 액터 자체를 거부 — 30자는 안전 마진이 크고,
  마스토돈 로컬 한도(30)와 같아 네이티브 계정처럼 보인다.
- 해시 suffix는 절단으로 인한 충돌을 결정적으로 회피한다(같은 URL → 항상 같은 핸들).
- 소문자만 발급: Mastodon/Misskey는 대소문자 무시 조회를 하므로 혼합 케이스는 이득 없이
  중복 정체성 혼란만 만든다.
