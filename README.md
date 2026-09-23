# rss2.pub

Atom 1.0 또는 RSS 2.0 피드를 ActivityPub 액터로 노출하는 브리지. 등록된 피드 하나가 페디버스
계정 하나가 되어, 마스토돈 등에서 팔로우하면 새 글이 게시물로 전달됩니다.

입력은 Atom 1.0과 RSS 2.0을 지원합니다(RSS 1.0은 제외).
[ADR-0012](docs/adr/0012-atom-only-input-and-parser-package.md)와 이를 개정한
[ADR-0016](docs/adr/0016-rss2-input-support.md)을 참고하세요. 연합 기능은
[ADR-0013](docs/adr/0013-raw-fedify-over-botkit.md)에 따라 raw Fedify dispatcher와
first-party PostgreSQL tables로 구현합니다.

Atom 형식의 규범적 사양은 RFC 4287입니다. rss2.pub는 고정된 W3C Feed Validator
corpus를 회귀 오라클로 사용하는 소비자 적합성 프로필을 유지합니다.

Tested against the rss2.pub Atom consumer conformance profile derived from the W3C Feed Validator RFC 4287 corpus.

이 프로필은 선택된 381개 경로를 모두 설명합니다. 그중 upstream에서 오류가 없다고
표시된 Atom Feed Document 62개는 수용하거나 DTO로 투영하고, 독립 Atom Entry는 제품
정책에 따라 거부합니다. 전체 Feed Validator와의 동등성이나 W3C의 보증을 주장하지
않습니다. 자세한 범위, 라이선스, pin 갱신 절차는
[Atom parser conformance guide](packages/atom-feed/README.md)를 참고하세요.

- 메인 액터 `@rss2pub`: 멘션/DM으로 `register <url>`, `search <keyword>` 명령 처리
- 웹 UI: 인기 피드 추천 · 검색 · 등록

게시물 본문은 Atom entry의 `content`를 사용하며, 없으면 `summary`를 사용합니다.
원문 웹페이지를 가져와 본문을 추출하지 않습니다. 기존 `full` 계정은 주소와 팔로워를
유지하며 같은 본문 정책을 따릅니다([ADR-0015](docs/adr/0015-atom-entry-content-only.md)).

Atom 저자는 entry → source → feed 순으로 상속된 URI를 사용합니다. 절대 HTTP(S) URI만
canonicalize·중복 제거한 뒤 최대 8개를 ActivityPub Actor로 확인하며, 게시물의
`attributedTo`에는 로컬 피드 액터를 먼저 두고 확인된 외부 액터를 최대 8개 추가합니다.
lookup 실패, 비-Actor, ID 없는 객체는 게시를 막지 않고 생략합니다. 저자만 바뀌면 같은
게시물에 Update를 보내되 본문, Mention, `to`, `cc`는 바꾸지 않습니다. 자세한 계약은
[ADR-0014](docs/adr/0014-atom-authors-as-multiple-attributions.md)를 참고하세요.

## 개발

```sh
nix develop            # Node 24 + Yarn Berry + psql (direnv 사용 시 자동)
# Nix가 없다면: mise가 Node 24를 제공(mise.toml), 최초 1회 `corepack enable`
yarn install --immutable
yarn typecheck && yarn lint:solid && yarn test  # e2e는 Docker 필요(testcontainers)
yarn playwright install chromium  # UI 테스트용 브라우저 최초 설치
yarn test:ui                    # Playwright 브라우저 UI 테스트
yarn storybook                  # 컴포넌트 개발 화면 (http://localhost:6006)
yarn storybook:build            # Storybook 정적 빌드
yarn lint:solid                 # Solid 2 정적 검사 (Oxlint + Solid 규칙)
yarn atom:conformance:update   # 고정된 W3C Atom manifest 재생성

# 로컬 실행
docker compose up -d           # PostgreSQL 17
cp .env.example .env
yarn dev                       # http://localhost:8000
yarn db:migrate                # 필요한 경우 DB 마이그레이션만 별도 실행

# Nix 패키지 빌드
nix build .#
./result/bin/rss2pub
```

W3C Atom corpus를 사용하는 테스트는 clone 뒤 한 번 다음 명령이 필요합니다.

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

## 컨테이너 배포

이미지는 애플리케이션만 포함하며 PostgreSQL은 별도로 필요합니다. 컨테이너 시작 시
Drizzle 마이그레이션이 자동 적용되지만, 운영 업그레이드에는 새 버전의
`node dist/web/migrate.js`를 앱 시작 전에 별도로 실행하세요. 공개 버전은
고정된 버전 태그를 사용하고 업그레이드 전 백업을 만드세요. 단일 호스트 예시는
[자체 호스팅 안내](docs/SELF_HOSTING.md)에 있습니다.

```sh
docker build -f Containerfile -t rss2pub:local .
docker run --rm -p 8000:8000 \
  -e ORIGIN=https://rss.example \
  -e DATABASE_URL=postgres://user:password@postgres:5432/rss2pub \
  -e BEHIND_PROXY=true \
  rss2pub:local
```

`ORIGIN`은 페디버스에서 접근 가능한 공개 URL이어야 합니다. 리버스 프록시 뒤에서
운영할 때만 `BEHIND_PROXY=true`를 설정합니다. 플랫폼의 liveness probe에는
`/healthz`, readiness probe에는 `/readyz`를 사용합니다. 운영 환경에서 `ORIGIN`은
필수이며, 수정 버전을 호스팅한다면 `SOURCE_URL`을 배포 버전의 소스 주소로 설정하세요.

## 라이선스와 릴리스

프로젝트 코드는 [GNU AGPLv3 또는 이후 버전](LICENSE)으로 제공됩니다. 포함된
제3자 패키지와 테스트 corpus에는 각각의 라이선스가 적용됩니다. 첫 공개 버전은
`v0.1.0`을 예정하며, 이전 개인 배포 데이터의 이전은 지원하지 않습니다.

- [변경 이력](CHANGELOG.md)
- [릴리스 정책](docs/RELEASING.md)
- [데이터베이스 마이그레이션 정책](docs/DATABASE_MIGRATIONS.md)

## 문서

- [사용·운영 문서](https://docs.rss2.pub/) — 영어·한국어 안내, 자가 호스팅,
  마이그레이션, 릴리스 및 변경 기록
- [프로젝트 계획](docs/PLAN.md) — 아키텍처, 기술 선택, 조사 결과, 마일스톤
- [ADR](docs/adr/) — 아키텍처 결정 기록
- [AGENTS.md](AGENTS.md) — AI 에이전트/기여자 가이드 (의존 규칙, 타입 규율, 워크플로)
