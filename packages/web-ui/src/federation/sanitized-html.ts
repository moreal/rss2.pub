/** Explicit trust boundary for HTML rendered by federation page bodies. */
export class SanitizedHtml {
  private constructor(readonly value: string) {}

  /** Call only after sanitizing or HTML-escaping every untrusted fragment. */
  static fromSanitized(value: string): SanitizedHtml {
    return new SanitizedHtml(value);
  }
}
