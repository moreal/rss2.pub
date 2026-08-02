# ADR-0003: Nix는 devShell 단계부터 증분 도입

- Status: accepted (2026-07-26), amended (2026-07-28: 패키징 단계 추가)
- Context: docs/PLAN.md §3 (2026-07 조사)

## 결정

`flake.nix` devShell(`nodejs_24` + `yarn-berry` + `postgresql_17`) + direnv를 기본으로
한다. Nix가 없는 환경에서는 mise(`mise.toml`, Node 24 고정) + corepack(`packageManager`
필드)이 같은 툴체인을 제공한다.

**2026-07-28 개정**: 사용자 요청으로 앱 패키징(`packages.default`)도 구현했다 —
`yarn-berry_4.fetchYarnBerryDeps` + `yarnBerryConfigHook` 기반, `nix build` 후
`./result/bin/rss2pub`로 실행. lockfile 변경 시마다 `yarnOfflineCache.hash` 갱신이
필요하다(절차는 flake.nix 주석). dockerTools 이미지는 여전히 하지 않는다(맥에서 Linux
빌더 필요 — 필요해지면 Linux CI에서만).

## 근거

- devShell은 ~20줄로 로컬(macOS)과 CI(Linux)의 툴체인을 비트 단위로 고정 — 저비용 고가치.
- nixpkgs의 `yarn` attr은 classic이므로 Berry(v4)는 `yarn-berry`를 쓴다.
- 앱 패키징(Berry용 `yarn-berry_4.fetchYarnBerryDeps` + `yarnBerryConfigHook`)은
  lockfile 변경마다 해시 갱신이 필요한 운영 부담이 있어 지금 규모에 이득이 없다.
  `mkYarnPackage`/`yarn2nix`/`node2nix`는 nixpkgs 26.05에서 제거됨 — 과거 자료를
  따르지 말 것.

## 재검토 조건

재현 가능한 배포 아티팩트가 필요해질 때(M5 이후). 그때도 devShell → CI → 패키징 →
dockerTools(Linux CI에서만) 순서로 증분 도입한다.
