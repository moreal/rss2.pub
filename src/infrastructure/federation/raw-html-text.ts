import type { Text } from "@fedify/botkit";

/**
 * BotKit Text implementation that emits pre-sanitized HTML verbatim.
 * BotKit's built-in constructors escape HTML, but feed entries already are
 * HTML — render.ts sanitizes them and this class passes the result through
 * (session.publish applies no outgoing sanitization by design).
 */
export class RawHtmlText<TContextData> implements Text<"block", TContextData> {
  readonly type = "block" as const;
  readonly #html: string;

  constructor(sanitizedHtml: string) {
    this.#html = sanitizedHtml;
  }

  async *getHtml(): AsyncIterable<string> {
    yield this.#html;
  }

  async *getTags(): AsyncIterable<never> {}

  getCachedObjects(): never[] {
    return [];
  }
}

/**
 * Inline-typed sibling of {@link RawHtmlText}, for slots that take
 * `Text<"inline">` — e.g. `session.publish()`'s `summary` option, where a
 * plain string would be escaped but our teaser is already sanitized HTML.
 */
export class RawInlineHtmlText<TContextData>
  implements Text<"inline", TContextData>
{
  readonly type = "inline" as const;
  readonly #html: string;

  constructor(sanitizedHtml: string) {
    this.#html = sanitizedHtml;
  }

  async *getHtml(): AsyncIterable<string> {
    yield this.#html;
  }

  async *getTags(): AsyncIterable<never> {}

  getCachedObjects(): never[] {
    return [];
  }
}
