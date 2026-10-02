import type { CollectionStatusModel, RemoteFollowFormModel } from "@rss2pub/web-ui/server";
import type { Feed } from "../../domain/feed/feed.js";
import { collectionState } from "../../domain/feed/collection-state.js";
import type { PageContext } from "../page-context.js";
import { translate } from "../i18n.js";
import { copy } from "./messages.js";

export function followFormModel(ctx: PageContext, handle: string): RemoteFollowFormModel {
  return { handle, locale: ctx.locale, heading: translate(ctx.i18n, copy.federationRemoteFollowLabel),
    help: translate(ctx.i18n, copy.federationRemoteFollowHelp),
    placeholder: translate(ctx.i18n, copy.federationRemoteFollowPlaceholder),
    button: translate(ctx.i18n, copy.federationRemoteFollowButton) };
}
function formatTime(ctx: PageContext, date: Date): string {
  return new Intl.DateTimeFormat(ctx.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}
export function feedStatusModel(ctx: PageContext, feed: Feed, now = new Date()): CollectionStatusModel {
  const state = collectionState(feed);
  const title = state === "pending" ? copy.collectionPendingTitle : state === "failed" ? copy.collectionFailedTitle : copy.collectionHealthyTitle;
  const body = state === "pending" ? copy.collectionPendingBody : state === "failed" ? copy.collectionFailedBody : copy.collectionHealthyBody;
  return { state, title: translate(ctx.i18n, title), body: translate(ctx.i18n, body),
    lastSuccess: feed.lastSuccessfulPollAt === null ? null : {
      label: translate(ctx.i18n, copy.collectionLastSuccess), iso: feed.lastSuccessfulPollAt.toISOString(), text: formatTime(ctx, feed.lastSuccessfulPollAt),
    },
    nextCheck: { label: translate(ctx.i18n, copy.collectionNextCheck), iso: feed.nextPollAt.toISOString(),
      text: feed.nextPollAt <= now ? translate(ctx.i18n, copy.collectionAwaitingCheck) : formatTime(ctx, feed.nextPollAt) },
  };
}
