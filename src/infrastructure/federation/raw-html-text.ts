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
