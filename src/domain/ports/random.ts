/**
 * Uniform randomness port — keeps domain/application deterministic under
 * test, the same way `Clock` does for time. Scheduling needs jitter (see
 * `JITTER_SPREAD` in `retry-policy.ts`), and domain code may not reach for a
 * non-deterministic platform primitive of its own.
 */
export type Random = {
  /** A uniform value in [0, 1). */
  readonly ratio: () => number;
};
