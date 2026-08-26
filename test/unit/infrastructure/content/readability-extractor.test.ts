import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  extractReadableContent,
  stripCommentContainers,
} from "../../../../src/infrastructure/content/readability-extractor.js";

describe("stripCommentContainers", () => {
  it("removes elements whose class contains 'comment'", () => {
    const { document } = parseHTML(
      `<html><body><div class="comment_thread"><p>reply</p></div><p>kept</p></body></html>`,
    );
    const removed = stripCommentContainers(document);
    expect(removed).toBe(1);
    expect(document.body.innerHTML).not.toContain("reply");
    expect(document.body.innerHTML).toContain("kept");
  });

  it("removes elements whose id contains 'comment'", () => {
    const { document } = parseHTML(
      `<html><body><div id="comment_thread"><p>reply</p></div><p>kept</p></body></html>`,
    );
    stripCommentContainers(document);
    expect(document.body.innerHTML).not.toContain("reply");
  });

  it("removes elements marked with schema.org Comment microdata (Discourse-style), even without a matching class/id", () => {
    const { document } = parseHTML(
      `<html><body>
        <div id="post_1" class="topic-body">OP</div>
        <div id="post_2" itemprop="comment" itemscope itemtype="http://schema.org/Comment" class="topic-body">reply</div>
      </body></html>`,
    );
    const removed = stripCommentContainers(document);
    expect(removed).toBe(1);
    expect(document.body.innerHTML).not.toContain("reply");
    expect(document.body.innerHTML).toContain("OP");
  });

  it("leaves elements alone when nothing looks comment-shaped", () => {
    const { document } = parseHTML(
      `<html><body><article><p>just an article</p></article></body></html>`,
    );
    expect(stripCommentContainers(document)).toBe(0);
    expect(document.body.innerHTML).toContain("just an article");
  });
});

describe("extractReadableContent", () => {
  it("extracts the article and drops a short-body/long-comments page's comment thread (hada.io-style)", () => {
    // The submission body is short enough (well under Readability's default
    // 500-char threshold) that, without stripping comment containers first,
    // Readability's internal retry-without-strip logic would resurrect the
    // <p>-tagged comment thread and prefer it for being longer.
    const html = `<!doctype html>
<html><body>
  <nav>Home Search Login</nav>
  <h1>A short submission</h1>
  <article>
    <p>This is the actual submission blurb, short but a real paragraph of
    genuine article text describing the linked story in one sentence.</p>
  </article>
  <div id="comment_thread" class="comment_thread descendant">
    <div class="comment"><span class="comment_contents"><p>First commenter
    weighing in with a long, padded reply that goes on for quite a while so
    the comment thread easily out-lengths the tiny submission blurb above,
    which is exactly the situation that used to fool the extractor.</p></span></div>
    <div class="comment"><span class="comment_contents"><p>Second commenter
    adding yet more padded prose, again comfortably longer than the original
    one-paragraph submission blurb by a wide margin in raw character count.</p></span></div>
  </div>
</body></html>`;

    const content = extractReadableContent(html);
    expect(content).toBeDefined();
    expect(content).not.toContain("commenter");
    expect(content).not.toContain("First commenter");
    expect(content).toContain("actual submission blurb");
  });

  it("never leaks the comment thread for a hada.io-shaped page whose submission body is a short <ul> summary", () => {
    // hada.io's actual markup: the submission is a <ul><li> AI summary (not
    // <p>), which Readability doesn't score directly, so even after
    // stripping the comment thread it may not recover the bullet text as
    // "article content." The one thing that must never happen either way is
    // the comment thread's own text showing up in the result.
    const html = `<!doctype html>
<html><body>
  <nav>Home Search Login</nav>
  <h1>A short submission</h1>
  <section id="topic_contents" class="article-content" itemprop="articleBody">
    <ul>
      <li>One-line AI-generated summary of the linked story, short but a
      genuine bullet of real content describing what the submission is about.</li>
    </ul>
  </section>
  <div id="comment_thread" class="comment_thread descendant">
    <div class="comment"><span class="comment_contents"><p>First commenter
    weighing in with a long, padded reply that goes on for quite a while so
    the comment thread easily out-lengths the tiny submission bullet above,
    which is exactly the situation that used to fool the extractor.</p></span></div>
    <div class="comment"><span class="comment_contents"><p>Second commenter
    adding yet more padded prose, again comfortably longer than the original
    one-bullet submission summary by a wide margin in raw character count.</p></span></div>
  </div>
</body></html>`;

    const content = extractReadableContent(html);
    expect(content).not.toContain("commenter");
    expect(content).not.toContain("First commenter");
  });

  it("extracts only the original post from a Discourse-style thread, dropping itemprop=comment replies", () => {
    const replies = Array.from(
      { length: 5 },
      (_, i) =>
        `<div id="post_${i + 2}" itemprop="comment" itemscope itemtype="http://schema.org/Comment" class="topic-body crawler-post">
           <div class="post" itemprop="text"><p>Reply number ${i + 1} continuing the discussion with plenty of its own padded text.</p></div>
         </div>`,
    ).join("\n");
    const html = `<!doctype html>
<html><body>
  <div id="post_1" class="topic-body crawler-post">
    <div class="post" itemprop="text">
      <p>We're excited to announce a major update to how self-hosting works,
      with several paragraphs of real announcement content below.</p>
      <p>This second paragraph adds more substance so the original post
      comfortably scores as the main article body on its own merits.</p>
    </div>
  </div>
  ${replies}
</body></html>`;

    const content = extractReadableContent(html);
    expect(content).toBeDefined();
    expect(content).toContain("major update to how self-hosting works");
    expect(content).not.toContain("Reply number");
  });

  it("falls back to the raw document when the only real content is itself comment-shaped (Discourse per-post URL)", () => {
    // A Discourse per-post crawler page contains exactly one post, and that
    // post carries itemprop="comment" whether it's a reply or not — there is
    // nothing else on the page for Readability to fall back to once that
    // node is stripped.
    const html = `<!doctype html>
<html><body>
  <header><nav>Home Categories</nav></header>
  <div id="post_47" itemprop="comment" itemscope itemtype="http://schema.org/Comment" class="topic-body crawler-post">
    <div class="post" itemprop="text">
      <p>Can I use your domain if I haven't yet chosen or purchased my own
      and am still in the process of deciding between a few options?</p>
    </div>
  </div>
  <footer>Powered by Discourse</footer>
</body></html>`;

    const content = extractReadableContent(html);
    expect(content).toBeDefined();
    expect(content).toContain("haven't yet chosen or purchased my own");
  });

  it("is unaffected on a plain article page with no comment-shaped markup at all", () => {
    const html = `<!doctype html>
<html><body>
  <nav>Home About Contact</nav>
  <article>
    <h1>The Full Article Title</h1>
    <p>This is the first paragraph of the full article, with enough real
    content to satisfy the Readability content-density heuristics so the
    parser confidently selects this block as the main article body instead
    of the navigation or footer chrome surrounding it.</p>
    <p>This is a second paragraph continuing the article, adding more
    substantive text so the total character count comfortably clears the
    default extraction threshold used internally during scoring.</p>
  </article>
  <footer>Copyright 2026 Example Corp. All rights reserved.</footer>
</body></html>`;

    const content = extractReadableContent(html);
    expect(content).toBeDefined();
    expect(content).toContain("first paragraph of the full article");
  });
});
