/** A nonblocking, instance-wide permit for work that creates a new feed. */
export type RegistrationGate = {
  tryAcquire(): Promise<{ release(): Promise<void> } | null>;
};
