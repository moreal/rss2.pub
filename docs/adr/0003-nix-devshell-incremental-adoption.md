# ADR-0003: Nix는 devShell 단계부터 증분 도입

- Status: accepted (2026-07-26), amended (2026-07-28: 패키징 단계 추가,
  2026-08-18: Yarn 버전 동기화)
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

**2026-08-18 개정**: `package.json`의 `packageManager`에서 Yarn 버전을 읽고,
nixpkgs의 `yarn-berry_4` 소스를 그 버전으로 오버라이드한다. 이 패키지를 devShell과 앱
패키징이 함께 사용하므로 로컬 CLI, 오프라인 fetcher, config hook의 Yarn 버전이 항상
일치한다. `packageManager` 버전을 바꾸면 `flake.nix`의 Yarn 소스 해시도 갱신한다.

## 근거

- devShell은 ~20줄로 로컬(macOS)과 CI(Linux)의 툴체인을 비트 단위로 고정 — 저비용 고가치.
- nixpkgs의 `yarn` attr은 classic이므로 Berry(v4)는 `yarn-berry`를 쓴다.
- Yarn의 내장 호환성 패치 체크섬은 버전마다 다르므로, `packageManager`와 Nix가 실행하는
  Yarn 버전이 다르면 샌드박스의 오프라인 설치가 실패한다. nixpkgs 전체를 갱신하는 대신
  Yarn 소스만 고정 오버라이드해 다른 도구의 불필요한 버전 변화를 피한다.
- 앱 패키징(Berry용 `fetchYarnBerryDeps` + `yarnBerryConfigHook`)은 lockfile 변경마다
  해시 갱신이 필요하지만, 재현 가능한 패키지와 CI에서의 누락 검출을 위해 그 비용을
  감수한다.
  `mkYarnPackage`/`yarn2nix`/`node2nix`는 nixpkgs 26.05에서 제거됨 — 과거 자료를
  따르지 말 것.

## 재검토 조건

재현 가능한 배포 아티팩트가 필요해질 때(M5 이후). 그때도 devShell → CI → 패키징 →
dockerTools(Linux CI에서만) 순서로 증분 도입한다.
