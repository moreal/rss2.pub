# 릴리스 정책

첫 공개 릴리스는 `v0.1.0`입니다. 그 전의 이력은 모두 공개 전 개발 이력입니다.
공개 버전은 새 DB에서 시작하며, 이전 개인 설치에서 데이터를 가져오는 지원 경로는
없습니다.

## 버전과 변경 기록

- Git 태그는 `vMAJOR.MINOR.PATCH` 형식을 쓰고, 루트와 모든 workspace의
  `package.json` 버전을 일치시키세요. Nix 버전과 NodeInfo 버전은 루트
  패키지 버전에서 가져옵니다.
- `1.0.0` 전에는 호환되지 않는 변경과 새 기능에 MINOR, 호환되는 수정에
  PATCH를 올립니다. `1.0.0`부터는 호환되지 않는 변경에 MAJOR, 호환되는
  기능에 MINOR, 호환되는 수정에 PATCH를 올립니다.
- 개발 중에는 `CHANGELOG.md`의 `Unreleased`에 변경 사항을 기록하세요.
  태그를 붙이기 전 출시할 항목을 날짜가 있는 `## [X.Y.Z] - YYYY-MM-DD`
  절로 옮깁니다. 사용자 변경 사항뿐 아니라 운영자 조치, 설정 변경,
  마이그레이션 위험도 적으세요. 호환되지 않는 변경에는 업그레이드 경로를
  설명하세요.
- 같은 릴리스의 `docs/ko/changelog.md`도 갱신하고, 영어 운영 지침이 바뀌면
  한국어 안내도 함께 고치세요. 태그 전에 `yarn docs:build`로 두 언어를
  빌드하세요.
- 릴리스 태그는 변경하지 않습니다. 결함이 있으면 기존 태그나 이미지 버전을
  교체하지 말고 새 버전을 발행하세요.

## 릴리스 점검표

1. 이전 태그 이후의 변경 사항, 의존성, 라이선스 고지, 문서를 검토하세요. 모든
   패키지 버전과 `CHANGELOG.md`를 갱신하세요.
2. `yarn install --immutable`, `yarn typecheck`, `yarn lint:solid`,
   `yarn test`를 실행하세요. 입력이 바뀌었다면 UI 테스트와 Nix 빌드도 실행하세요.
3. `yarn release:check vX.Y.Z`로 릴리스 메타데이터를 확인하세요. 버전과 변경
   기록을 커밋한 다음 그 커밋에 `vX.Y.Z` 태그를 붙이세요.
4. 태그 워크플로가 전체 CI를 통과한 후 컨테이너 이미지를
   `ghcr.io/moreal/rss2pub:vX.Y.Z`로 공개합니다. `latest`는 안정 릴리스
   태그만 따라갑니다. GHCR 패키지가 공개적으로 읽히는지 확인하세요. 운영자는
   버전 태그 또는 digest를 고정해야 합니다.
5. 해당 변경 기록 절에서 릴리스 노트를 발행하세요. 스키마 변경이 있다면
   [마이그레이션 정책](https://docs.rss2.pub/ko/database-migrations)의 백업·업그레이드 안내와
   포함된 `db:migrate` 명령을 적으세요.

품질 검사가 실패한 상태에서는 태그를 발행하지 마세요. 컨테이너 빌드 성공만으로
릴리스가 검증되지는 않습니다.

문서는 `main`에서 GitHub Pages로 별도 배포됩니다. 도메인 설정과 확인 절차는
[문서 배포 안내](https://github.com/moreal/rss2.pub/blob/main/docs/DEPLOYMENT.md)를 참고하세요.
