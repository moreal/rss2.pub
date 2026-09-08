# BotKit 상태 복구

2026-09-08 운영 점검에서 `published_items.message_uri`는 이전 BotKit 객체를
가리키지만 `federation_objects`에 해당 객체가 없어 Update가 실패함을 확인했다.
BotKit 팔로워 8개도 새 저장소에 없어 발행 대상이 사라져 있었다.

`scripts/recover-botkit-state.sql`은 자동 마이그레이션이 아닌 운영자용 복구 절차다.
기존 `botkit` 스키마와 적용 완료된 Drizzle 마이그레이션이 필요하다.

- 현재 등록된 feed의 공개 Note/Article만 복원한다. 원래 ID, 본문, 발행 시각,
  언어, 공개 범위를 유지하고 `as:Public`은 절대 URI로 확장한다.
- 기존 새 객체를 덮어쓰지 않는다. main actor의 명령 답글은 비공개 가능성과
  표현할 수 없는 reply 메타데이터 때문에 이관하지 않는다.
- 현재 등록된 feed의 팔로워 관계를 복원하고 feed의 표시용 팔로워 수를 맞춘다.
- 현재 키가 전혀 없는 actor만 기존 키를 가져온다. 이미 새 키가 만들어진 actor는
  변경하지 않는다. 원격 서버의 과거 키 캐시는 별도 확인 대상이다.
- 기존 BotKit 테이블과 발행 기록, 큐는 삭제하거나 수정하지 않는다.
- 복구 자체는 federation 활동을 보내지 않지만, 복구 후 정상 스케줄러는
  복원된 팔로워에게 이후 게시물과 업데이트를 전달할 수 있다.

운영 접근은 `.agents/skills/rss2pub-federation-debug/SKILL.md`를 따른다.
DB 접속 비밀번호를 명령 인자에 넣지 말고 기존 인증 환경을 사용한다.
적용 전에 기존 DB Pod의 영속 볼륨에 접근 권한 `0600`으로 백업하고
`pg_restore --list`로 덤프를 확인한다. 운영 DB를 워크스테이션으로 반출하지 않는다.
외부 반출이 별도로 승인된 경우에는 암호화한다. 운영 데이터로 먼저 롤백 시험한다.
키를 가져오기 전에는 운영 프로세스 내부에서 Fedify `importJwk`로 후보 키를
불러와 같은 쌍으로 서명·검증이 성공하는지 확인한다. 키 값은 출력하지 않는다.
SQL은 쌍의 완전성과 알고리즘을 검사하지만 암호학적 유효성까지 검사하지 않는다.
팔로워 URL은 기본 포트의 hostname HTTP(S) 형태만 허용하며, IPv6나 명시적 포트 등
다른 형태는 임의 변환하지 않고 검토를 위해 중단한다.

```sh
psql -X -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL rss2pub.recovery_origin='https://beta.rss2.pub';" \
  -f scripts/recover-botkit-state.sql \
  -c ROLLBACK
```

검사에 실패하면 트랜잭션 전체가 중단된다. 원인을 확인하고 스크립트를 수정한 뒤
테스트와 롤백 시험을 다시 수행한다. 예상 건수와 보존 조건을 확인한 적용에서는
마지막 명령만 `COMMIT`으로 바꾼다. 잠금 대기는 최대 5초, 각 문장은 최대 30초다.

적용 후 동일 스크립트의 롤백 시험에서 추가 INSERT가 0건인지 확인하고,
기존 오류 객체 URL이 ActivityPub Accept 요청에 200을 반환하는지 확인한다.
발행 기록의 누락 객체 수, 팔로워 수, 현재 공개키 지문을 전후 대조한다.
스케줄러 로그와 전송 오류는 별도로 확인한다. 객체 복원만으로 원격 수신까지
증명되지는 않는다.
