import {
  isValidPublicIPv4Address,
  isValidPublicIPv6Address,
  validatePublicUrl,
} from "@fedify/vocab-runtime";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

const MAX_REDIRECTS = 5;

export async function resolveConnectionAddress(
  hostname: string,
  resolve: (hostname: string) => Promise<readonly LookupAddress[]>,
  allowPrivateAddress: boolean,
): Promise<LookupAddress> {
  const addresses = await resolve(hostname);
  if (addresses.length === 0) throw new Error("DNS returned no addresses");
  if (!allowPrivateAddress) {
    for (const entry of addresses) {
      const isPublic = entry.family === 4
        ? isValidPublicIPv4Address(entry.address)
        : entry.family === 6 && isValidPublicIPv6Address(entry.address);
      if (!isPublic) throw new Error(`private or invalid DNS address: ${entry.address}`);
    }
  }
  const selected = addresses[0];
  if (selected === undefined) throw new Error("DNS returned no addresses");
  return selected;
}

const resolveDns = (hostname: string) => lookup(hostname, { all: true });

export function createAddressGuardedAgent(
  allowPrivateAddress: boolean,
  resolve: (hostname: string) => Promise<readonly LookupAddress[]> = resolveDns,
): Agent {
  return new Agent({
    connections: 2,
    // The default instance may hold 1000 distinct feeds; leave room for
    // registration probes while keeping the pool's origin count finite.
    maxOrigins: 2048,
    connect: {
      autoSelectFamily: false,
      lookup(hostname, _options, callback) {
        void resolveConnectionAddress(hostname, resolve, allowPrivateAddress).then(
          ({ address, family }) => callback(null, address, family),
          (cause) => callback(cause instanceof Error ? cause : new Error(String(cause)), "", 0),
        );
      },
    },
  });
}

const publicAgent = createAddressGuardedAgent(false);
const privateTestAgent = createAddressGuardedAgent(true);

/** Validate every hop before a feed or favicon request leaves the server. */
export async function fetchPublicUrl(
  url: string,
  init: {
    readonly method?: "GET" | "HEAD";
    readonly headers?: Record<string, string>;
    readonly signal?: AbortSignal;
  },
  options: { readonly allowPrivateAddress?: boolean; readonly fetchImpl?: typeof fetch } = {},
): Promise<Response | Awaited<ReturnType<typeof undiciFetch>>> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error(`unsupported fetch protocol: ${current.protocol}`);
    }
    if (!options.allowPrivateAddress) await validatePublicUrl(current.href);
    const response = options.fetchImpl === undefined
      ? await undiciFetch(current, {
        ...init,
        redirect: "manual",
        dispatcher: options.allowPrivateAddress ? privateTestAgent : publicAgent,
      })
      : await options.fetchImpl(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (location === null) return response;
    await response.body?.cancel();
    current = new URL(location, current);
  }
  throw new Error(`too many redirects (maximum ${MAX_REDIRECTS})`);
}
