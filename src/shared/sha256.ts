import { createHash } from "node:crypto";

/**
 * SHA-256 as a pure, deterministic function. Thin wrapper over `node:crypto`
 * so domain code can derive stable identifiers (ADR-0004) without knowing the
 * provider — `src/domain` imports only `src/shared`, and this module is the
 * one place allowed to touch the platform primitive.
 */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
