# rss2.pub

RSS/Atom 피드를 ActivityPub 액터로 노출하는 브리지. 등록된 피드 하나가 페디버스
계정 하나가 되어, 마스토돈 등에서 팔로우하면 새 글이 게시물로 전달됩니다.

- 메인 액터 `@rss2pub`: 멘션/DM으로 `register <url>`, `search <keyword>` 명령 처리
- 웹 UI: 인기 피드 추천 · 검색 · 등록

## 개발

```sh
nix develop            # Node 24 + Yarn Berry + psql (direnv 사용 시 자동)
# Nix가 없다면: mise가 Node 24를 제공(mise.toml), 최초 1회 `corepack enable`
yarn install --immutable
yarn typecheck && yarn test    # e2e는 Docker 필요(testcontainers)

# 로컬 실행
docker compose up -d           # PostgreSQL 17
cp .env.example .env
yarn dev                       # http://localhost:8000

# Nix 패키지 빌드 (최초 1회 flake.nix의 yarnOfflineCache.hash 채우기 필요)
nix build .#
./result/bin/rss2pub
```

## 문서

- [프로젝트 계획](docs/PLAN.md) — 아키텍처, 기술 선택, 조사 결과, 마일스톤
- [ADR](docs/adr/) — 아키텍처 결정 기록
- [AGENTS.md](AGENTS.md) — AI 에이전트/기여자 가이드 (의존 규칙, 타입 규율, 워크플로)
