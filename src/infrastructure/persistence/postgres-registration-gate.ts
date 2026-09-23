import type postgres from "postgres";
import type { RegistrationGate } from "../../domain/ports/registration-gate.js";

/** One global registration slot per PostgreSQL database, shared by app replicas. */
export function createPostgresRegistrationGate(
  sql: postgres.Sql,
  options: { readonly attemptsPerHour?: number; readonly now?: () => Date } = {},
): RegistrationGate {
  let busy = false;
  const attempts: number[] = [];
  const attemptsPerHour = options.attemptsPerHour ?? 60;
  const now = options.now ?? (() => new Date());
  return {
    async tryAcquire() {
      if (busy) return null;
      const cutoff = now().getTime() - 60 * 60 * 1000;
      while (attempts[0] !== undefined && attempts[0] <= cutoff) attempts.shift();
      if (attempts.length >= attemptsPerHour) return null;
      busy = true;
      try {
        const reserved = await sql.reserve();
        try {
          const rows = await reserved<{ acquired: boolean }[]>`
            SELECT pg_try_advisory_lock(17236, 72901) AS acquired
          `;
          if (rows[0]?.acquired !== true) {
            reserved.release();
            busy = false;
            return null;
          }
          attempts.push(now().getTime());
          let released = false;
          return {
            async release() {
              if (released) return;
              released = true;
              try {
                await reserved`SELECT pg_advisory_unlock(17236, 72901)`;
              } finally {
                reserved.release();
                busy = false;
              }
            },
          };
        } catch (cause) {
          reserved.release();
          throw cause;
        }
      } catch (cause) {
        busy = false;
        throw cause;
      }
    },
  };
}
