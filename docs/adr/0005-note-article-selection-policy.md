# ADR-0005: Note/Article 자동 선택 정책

- Status: accepted (2026-07-26)
- Context: docs/PLAN.md §5 (2026-07 조사 — Mastodon/Misskey 소스, 주요 브리지 관행)

## 결정

도메인 서비스 `ContentPolicy`가 아이템별로 게시 타입을 결정한다:

- 본문 **2,000자 이하 → `Note`**: 제목을 본문 선두에 강조로 인라인 + 원문 링크 첨부.
- **초과 → `Article`**: `name`(제목) + `summary`(티저: 첫 문단, 없으면 첫 200자) +
  `content`(전문) + `url`.
- 임계값과 티저 규칙은 피드별 설정 가능한 값 객체로 모델링.

## 근거

- 마스토돈은 Article의 `content`를 렌더링하지 않는다(4.3+에서도 `<h2>제목</h2>` +
  HTML summary + 링크만). Misskey/Akkoma/Lemmy는 전문을 렌더링한다.
- 따라서 짧은 글을 Article로 보내면 최대 소비층(마스토돈)에서 손해, 긴 글을 Note로만
  보내면 의미론 손실 — WordPress ActivityPub 플러그인도 2025년부터 자동 선택이 기본.
- 마스토돈은 원격 글을 서버 측에서 자르지 않고 UI에서 접기만 하며, Misskey 절단 한도는
  8,192자 — 2,000자 Note는 안전 범위.
- Article의 summary를 정성껏 채우는 것이 마스토돈 표시 품질을 결정한다(WriteFreely 방식).
