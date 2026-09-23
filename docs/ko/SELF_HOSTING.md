# 자가 호스팅

애플리케이션에는 Node.js 24 또는 컨테이너 이미지, PostgreSQL 17 이상, 다른
페디버스 서버에서 접근할 수 있는 안정적인 HTTPS 주소가 필요합니다. 리버스 프록시에서
TLS를 종료하고 8000번 포트로 트래픽을 전달하세요. PostgreSQL 연결은 직접 연결이며
항상 유지되어야 합니다. Fedify 큐가 장시간 `LISTEN` 연결을 유지하므로 트랜잭션
모드 풀러와 사용하지 않을 때 중지되는 데이터베이스는 적합하지 않습니다.

피드와 favicon 요청은 리디렉션 대상까지 포함해 사설·루프백 주소를 거부하고, 실제
소켓 연결에 쓰이는 DNS 주소도 검사합니다. `ALLOW_PRIVATE_ADDRESS`는 로컬
테스트용이며 `NODE_ENV=production`에서는 허용되지 않습니다. 추가 보호 장치로
일반적인 네트워크 송신 제한도 유지하세요.

익명 등록에는 세 가지 한도가 적용됩니다.
`REGISTRATION_ATTEMPTS_PER_HOUR`는 기본 60회이며 실패하거나 중복된 요청도
포함합니다. `REGISTRATION_DAILY_LIMIT`는 최근 24시간에 새로 등록할 수 있는
피드의 기본 한도 20개입니다. `REGISTRATION_TOTAL_LIMIT`는 저장된 피드의 기본
한도 1000개입니다. 웹 폼과 `@rss2pub` 명령 모두에 적용됩니다. PostgreSQL
advisory lock으로 여러 앱 인스턴스에 걸쳐 새 등록을 한 번에 하나만 처리하며,
나머지 요청에는 재시도 가능한 응답을 보냅니다. 시간당 시도 횟수는 앱 프로세스마다
따로 세고, 일일·전체 피드 수는 공유 데이터베이스에서 조회합니다. 웹 폼은
본문이 4 KiB를 넘으면 파싱 전에 거부합니다. 서버의 저장 공간, 네트워크, 폴링
용량에 맞게 한도를 조정하세요. 신뢰하는 리버스 프록시에서는 클라이언트 IP별로
`POST /register` 요청 빈도를 제한하고, 신뢰할 수 없는 forwarded 주소 헤더를
제거하세요.

## 단일 호스트 Compose 예시

첫 공개 릴리스 이후 `selfhost.env.example`을 비공개 `selfhost.env`로 복사하고,
`ORIGIN`을 설정한 뒤 URL에서 안전하게 사용할 수 있는 PostgreSQL 비밀번호와
공개된 `RSS2PUB_VERSION`을 지정하세요. 앱을 시작하기 전에 포함된 스키마를
적용합니다.

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d db
docker compose --env-file selfhost.env -f compose.selfhost.yml run --rm app \
  node dist/web/migrate.js
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d app
```

예시는 웹 서버를 `127.0.0.1:8000`에만 바인딩합니다. 같은 호스트에서 HTTPS
리버스 프록시를 앞에 두세요. PostgreSQL은 Compose 네트워크 안에서만 접근할 수
있고 데이터는 `postgres-data` 볼륨에 보관됩니다. 업그레이드 전에 PostgreSQL을
통해 볼륨을 백업하세요. [마이그레이션 정책](https://docs.rss2.pub/ko/database-migrations)도
참고하세요. 다른 플랫폼에서는 같은 환경 변수를 릴리스 컨테이너와 외부
PostgreSQL 서비스에 적용할 수 있습니다.

이 Compose 예시에서 `RSS2PUB_VERSION`을 바꾸기 전에 앱을 중지하고 DB를
백업합니다.

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml stop app
docker compose --env-file selfhost.env -f compose.selfhost.yml exec -T db \
  pg_dump -U rss2pub -d rss2pub --format=custom > rss2pub-before-upgrade.dump
```

백업은 비공개로 보관하세요. `selfhost.env`의 버전을 갱신한 뒤 해당 버전의
이미지를 받고 마이그레이션한 다음 앱을 시작합니다.

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml pull app
docker compose --env-file selfhost.env -f compose.selfhost.yml run --rm app \
  node dist/web/migrate.js
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d app
```

`ORIGIN`은 경로·쿼리·프래그먼트가 없는 최종 스킴과 호스트여야 합니다. 원격 서버가
액터를 팔로우하기 시작한 뒤에는 변경하지 마세요. 신뢰하는 리버스 프록시가 서비스
앞에 있을 때만 `BEHIND_PROXY=true`를 설정하세요. 생존 상태는 `/healthz`, 준비
상태는 `/readyz`로 확인할 수 있습니다.

푸터는 `SOURCE_URL`로 소스 코드를 연결하며 기본값은 이 저장소입니다. 수정한
코드를 배포한다면 변경 사항을 포함한 해당 배포 버전의 공개 소스 주소를
`SOURCE_URL`로 지정하세요. [GNU AGPLv3의 네트워크 소스 제공 안내](https://www.gnu.org/licenses/gpl-faq.en.html)를
참고하세요. 제3자 패키지와 W3C 테스트 corpus에는 각각의 라이선스가 적용됩니다.

첫 공개 설치는 새 데이터베이스에서 시작합니다. 이전 개인 인스턴스가 같은
`ORIGIN`을 사용했다면 기존 DB를 조용히 새 DB로 바꾸지 마세요. 원격 서버에는 그
인스턴스의 액터 ID와 키가 남아 있을 수 있습니다. 이전 DB를 유지하거나 새
`ORIGIN`을 선택해 새로운 액터 신원을 만드세요.
