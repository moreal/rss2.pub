import type { Federation } from "@fedify/fedify";
import { isActor } from "@fedify/vocab";
import type { ActorResolver } from "../../domain/ports/actor-resolver.js";
import { ResolvedActorUri } from "../../domain/ports/actor-resolver.js";
import { ok, err } from "../../shared/result.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Resolves author candidates through Fedify without leaking vocab types. */
export function createFedifyActorResolver(deps: {
  readonly federation: Federation<void>;
  readonly origin: string;
}): ActorResolver {
  const context = deps.federation.createContext(
    new URL(deps.origin),
    undefined,
  );
  return {
    async resolve(uri) {
      try {
        const object = await context.lookupObject(new URL(uri), {
          crossOrigin: "ignore",
        });
        if (!isActor(object) || object.id === null) return ok(null);
        const parsed = ResolvedActorUri.create(object.id.href);
        return parsed.ok ? ok(parsed.value) : ok(null);
      } catch (cause) {
        return err({
          type: "ActorLookupFailed",
          uri,
          message: messageOf(cause),
        });
      }
    },
  };
}
