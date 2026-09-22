import type { Context } from "@fedify/fedify";
import { Feed } from "../../domain/feed/feed.js";
import { sha256Hex } from "../../shared/sha256.js";
import { renderFeedProfileHtml } from "./render.js";
import type { LocalActorDescriptor } from "./vocab-builders.js";

// Bump when buildLocalActor changes a serialized field not represented below.
// Existing fingerprints then backfill one fresh Update on the next poll.
const ACTOR_PROFILE_FINGERPRINT_VERSION = 1;

export type LocalActorDescriptorSeed = Omit<LocalActorDescriptor, "profileUrl">;

export function localActorDescriptorSeed(feed: Feed): LocalActorDescriptorSeed {
  return {
    handle: feed.handle,
    name: Feed.displayName(feed),
    summaryHtml: renderFeedProfileHtml(feed),
    homepageUrl: new URL(feed.url),
    iconUrl: feed.iconUrl === null ? null : new URL(feed.iconUrl),
  };
}

export function localActorDescriptor(
  ctx: Context<void>,
  feed: Feed,
): LocalActorDescriptor {
  return {
    ...localActorDescriptorSeed(feed),
    profileUrl: new URL(`/@${feed.handle}`, ctx.origin),
  };
}

export function actorProfileFingerprint(
  descriptor: LocalActorDescriptor,
): string {
  return sha256Hex(JSON.stringify({
    version: ACTOR_PROFILE_FINGERPRINT_VERSION,
    handle: descriptor.handle,
    name: descriptor.name,
    summaryHtml: descriptor.summaryHtml,
    profileUrl: descriptor.profileUrl.href,
    homepageUrl: descriptor.homepageUrl?.href ?? null,
    iconUrl: descriptor.iconUrl?.href ?? null,
  }));
}
