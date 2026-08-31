import { Temporal as TemporalPolyfill } from "@js-temporal/polyfill";

if (!("Temporal" in globalThis)) {
  Object.defineProperty(globalThis, "Temporal", {
    configurable: true,
    value: TemporalPolyfill,
    writable: true,
  });
}

export function toTemporalInstant(date: Date): Temporal.Instant {
  return globalThis.Temporal.Instant.from(date.toISOString());
}
