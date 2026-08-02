/** Time source port — keeps domain/application deterministic under test. */
export type Clock = {
  readonly now: () => Date;
};
