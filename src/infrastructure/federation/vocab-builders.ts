import type { ActorKeyPair, Context } from "@fedify/fedify";
import {
  Article,
  Create,
  Endpoints,
  Image,
  LanguageString,
  Mention,
  Note,
  PropertyValue,
  Service,
  Update,
} from "@fedify/vocab";
import type { StoredFederationObject } from "./model.js";
import { toTemporalInstant } from "./temporal.js";

export type LocalActorDescriptor = {
  readonly handle: string;
  readonly name: string;
  readonly summaryHtml: string;
  readonly profileUrl: URL;
  readonly homepageUrl: URL | null;
  readonly iconUrl: URL | null;
};

function urlOf(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function languageValue(value: string, language: string | null) {
  return language === null ? value : new LanguageString(value, language);
}

function messageUri(
  ctx: Context<void>,
  record: StoredFederationObject,
): URL {
  const values = { identifier: record.actorHandle, id: record.id };
  return record.kind === "note"
    ? ctx.getObjectUri(Note, values)
    : ctx.getObjectUri(Article, values);
}

export function buildLocalActor(
  ctx: Context<void>,
  descriptor: LocalActorDescriptor,
  keyPairs: readonly ActorKeyPair[],
): Service {
  const rsa = keyPairs.find(
    (pair) => pair.cryptographicKey.publicKey?.algorithm.name
      === "RSASSA-PKCS1-v1_5",
  );
  const attachments = descriptor.homepageUrl === null
    ? []
    : [new PropertyValue({
        name: "Feed",
        value: `<a href="${descriptor.homepageUrl.href}">${descriptor.homepageUrl.href}</a>`,
      })];
  return new Service({
    id: ctx.getActorUri(descriptor.handle),
    preferredUsername: descriptor.handle,
    name: descriptor.name,
    summary: descriptor.summaryHtml,
    attachments,
    icon: descriptor.iconUrl === null ? null : new Image({ url: descriptor.iconUrl }),
    inbox: ctx.getInboxUri(descriptor.handle),
    outbox: ctx.getOutboxUri(descriptor.handle),
    followers: ctx.getFollowersUri(descriptor.handle),
    endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
    publicKey: rsa?.cryptographicKey ?? null,
    assertionMethods: keyPairs.map((pair) => pair.multikey),
    url: descriptor.profileUrl,
  });
}

export function buildMessage(
  ctx: Context<void>,
  record: StoredFederationObject,
): Note | Article {
  const values = {
    id: messageUri(ctx, record),
    content: languageValue(record.contentHtml, record.language),
    mediaType: "text/html",
    url: record.sourceUrl === null ? null : urlOf(record.sourceUrl),
    attributions: record.attributedToUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
    tos: record.toUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
    ccs: record.ccUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
    tags: record.mentions.flatMap((mention) => {
      const href = urlOf(mention.href);
      return href === null ? [] : [new Mention({ name: mention.name, href })];
    }),
    published: toTemporalInstant(record.publishedAt),
    updated: record.updatedAt === null
      ? null
      : toTemporalInstant(record.updatedAt),
  };
  if (record.kind === "note") return new Note(values);
  return new Article({
    ...values,
    name: record.name === null ? null : languageValue(record.name, record.language),
    summary: record.summaryHtml === null
      ? null
      : languageValue(record.summaryHtml, record.language),
  });
}

export function buildCreate(
  ctx: Context<void>,
  record: StoredFederationObject,
): Create {
  return new Create({
    id: ctx.getObjectUri(Create, {
      identifier: record.actorHandle,
      id: record.id,
    }),
    actor: ctx.getActorUri(record.actorHandle),
    object: buildMessage(ctx, record),
    tos: record.toUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
    ccs: record.ccUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
  });
}

export function buildUpdate(
  ctx: Context<void>,
  record: StoredFederationObject,
  activityId: URL,
): Update {
  return new Update({
    id: activityId,
    actor: ctx.getActorUri(record.actorHandle),
    object: buildMessage(ctx, record),
    tos: record.toUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
    ccs: record.ccUris.flatMap((raw) => {
      const uri = urlOf(raw);
      return uri === null ? [] : [uri];
    }),
  });
}
