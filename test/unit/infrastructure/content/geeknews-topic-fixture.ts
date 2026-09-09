/**
 * The real shape of a news.hada.io topic page — the markup that motivated the
 * comment-stripping heuristics in `readability-extractor.ts`.
 *
 * Tag names, ids, classes and `itemprop` values are copied verbatim from a
 * live page (2026-09-09); the prose is deliberately shortened and rewritten so
 * this repository does not carry a copy of someone else's article and comment
 * thread. What the extractor keys off is the structure, and that is intact:
 * the submission body is a <ul> summary inside
 * `section#topic_contents[itemprop=articleBody]` followed by <h2> sections,
 * and the discussion lives in `div#comment_thread.comment_thread` — longer, in
 * <p> tags, and therefore the block Readability prefers if it is not removed
 * before scoring.
 */
export const GEEKNEWS_TOPIC_HTML = `<!doctype html>
<html lang="ko">
<head><title>Sample submission | GeekNews</title></head>
<body>
  <nav>홈 최신 인기 로그인</nav>
  <nav class="language-menu" aria-label="언어 선택">KO EN JA</nav>
  <div class='topictitle link'><h1>Sample submission title</h1></div>
  <section id='topic_contents' class='article-content' itemprop='articleBody'>
    <ul>
      <li>첫 번째 요약 항목으로, 링크된 글이 무엇을 다루는지 한 문장으로 설명하는 실제 본문 내용임</li>
      <li>두 번째 요약 항목이며 <strong>강조된 문구</strong>를 포함해 원문의 핵심을 전달함</li>
    </ul>
    <hr>
    <h2>첫 번째 소제목</h2>
    <ul>
      <li>소제목 아래의 세부 내용으로, 요약보다 구체적인 설명을 담고 있는 문단임</li>
    </ul>
    <h2>두 번째 소제목</h2>
    <ul>
      <li>마지막 절의 내용이며 본문 추출이 여기까지 도달했는지 확인하는 데 쓰임</li>
    </ul>
  </section>
  <div id="topic-comment-hint">댓글을 남기려면 로그인하세요</div>
  <div class="group comment_button_box watch_box"><button>댓글</button></div>
  <div id="topic-comment-watch-slot"></div>
  <div id='comment_thread' class='comment_thread descendant'>
    <div class="comment"><span class="comment_contents"><p>첫 번째 댓글입니다. 원문
    요약보다 훨씬 길게 이어지는 의견으로, 글자 수만 놓고 보면 본문을 쉽게 넘어섭니다.
    바로 이 상황이 추출기를 속이던 조건입니다.</p></span></div>
    <div class="comment"><span class="comment_contents"><p>두 번째 댓글도 마찬가지로
    길게 이어집니다. 이런 댓글이 여러 개 쌓이면 Readability는 분량을 근거로 댓글
    묶음을 본문이라고 판단하게 됩니다.</p></span></div>
  </div>
  <footer>GeekNews</footer>
</body>
</html>`;
