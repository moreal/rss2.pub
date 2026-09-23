/** @jsxImportSource @solidjs/web */
import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { FeedCardData } from "../feed-card-data.js";

export type { FeedCardData } from "../feed-card-data.js";

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "class"> & {
  readonly variant: "primary" | "secondary" | "quiet";
  readonly class?: string;
  readonly children: JSX.Element;
};

export function Button(props: ButtonProps) {
  const native = omit(props, "variant", "class", "children");
  return (
    <button
      {...native}
      type={native.type ?? "button"}
      class={["btn", `btn-${props.variant}`, props.class]}
    >
      {props.children}
    </button>
  );
}

export type NoticeProps = {
  readonly kind: "success" | "error" | "info";
  readonly title?: string;
  readonly live?: "alert" | "status";
  readonly children: JSX.Element;
};

function NoticeIcon(props: { kind: NoticeProps["kind"] }) {
  return <svg class="notice-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {props.kind === "success"
      ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
      : props.kind === "error"
        ? <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3v.01" /></>
        : <><circle cx="11" cy="11" r="8" /><path d="m17 17 4 4" /></>}
  </svg>;
}

export function Notice(props: NoticeProps) {
  return (
    <div class={`notice notice-${props.kind}`} role={props.live}>
      <NoticeIcon kind={props.kind} />
      <div class="notice-body">
        {props.title !== undefined && <p class="notice-title">{props.title}</p>}
        {props.children}
      </div>
    </div>
  );
}

export type AccountHandleProps = {
  readonly handle: string;
  readonly host: string;
  readonly variant?: "plain" | "copy";
};

export function AccountHandle(props: AccountHandleProps) {
  return (
    <span class={props.variant === "copy" ? "handle handle-value" : "handle"} data-select-all>
      <bdi dir="ltr">@{props.handle}{props.variant === "copy" && <wbr />}@{props.host}</bdi>
    </span>
  );
}

export type FeedCardProps = {
  readonly feed: FeedCardData;
  readonly host: string;
  readonly followersLabel?: string;
  readonly level?: 2 | 3;
  readonly omitHandle?: boolean;
};

export function Avatar(props: { readonly iconUrl: string | null; readonly variant?: "inline" | "profile" }) {
  const fallbackOnError = { "attr:onerror": "this.remove()" };
  return (
    <span class={props.variant === "profile" ? "avatar actor-avatar" : "avatar"} aria-hidden="true">
      <svg width={props.variant === "profile" ? 32 : 18} height={props.variant === "profile" ? 32 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="5" cy="19" r="1" fill="currentColor" />
        <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      </svg>
      {props.iconUrl !== null && (
        <img src={props.iconUrl} alt="" loading="lazy" decoding="async" {...fallbackOnError} />
      )}
    </span>
  );
}

export function FeedCard(props: FeedCardProps) {
  const title = <a href={props.feed.href}><bdi dir="auto">{props.feed.title}</bdi></a>;
  return (
    <li>
      <div class="feed">
        <Avatar iconUrl={props.feed.iconUrl} />
        <div class="feed-body">
          {props.level === 2
            ? <h2 class="feed-title">{title}</h2>
            : <h3 class="feed-title">{title}</h3>}
          {props.feed.description !== null && <p class="feed-desc"><bdi dir="auto">{props.feed.description}</bdi></p>}
          <p class="feed-meta">
            {props.followersLabel !== undefined && <span class="feed-stat">{props.followersLabel}</span>}
            {props.omitHandle !== true && <AccountHandle handle={props.feed.handle} host={props.host} />}
            <span class="feed-src"><bdi dir="ltr">{props.feed.url.replace(/^https:\/\//, "")}</bdi></span>
          </p>
        </div>
      </div>
    </li>
  );
}

export function FeedList(props: { readonly children: JSX.Element }) {
  return <ul class="feeds">{props.children}</ul>;
}

export type FieldProps = {
  readonly id: string;
  readonly label: string;
  readonly help?: string;
  readonly error?: string;
  readonly type: "text" | "url" | "search";
  readonly name: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly autocomplete?: string;
  readonly autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
  readonly spellcheck?: "true" | "false";
  readonly autofocus?: boolean;
  /** ID of an error announced elsewhere, such as a form-level Notice. */
  readonly externalErrorId?: string | undefined;
  readonly invalid?: boolean;
};

export function Field(props: FieldProps) {
  const describedBy = () => [props.error !== undefined ? `${props.id}-error` : props.externalErrorId,
    props.help !== undefined ? `${props.id}-help` : undefined].filter(Boolean).join(" ");
  return (
    <div class="field">
      <label class="field-label" for={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type}
        name={props.name}
        value={props.value ?? ""}
        placeholder={props.placeholder}
        required={props.required}
        autocomplete={props.autocomplete}
        autocapitalize={props.autocapitalize}
        spellcheck={props.spellcheck}
        autofocus={props.autofocus}
        aria-describedby={describedBy() || undefined}
        aria-invalid={props.error !== undefined || props.invalid === true ? "true" : undefined}
      />
      {props.error !== undefined && <p class="help" id={`${props.id}-error`}>{props.error}</p>}
      {props.help !== undefined && <p class="help" id={`${props.id}-help`}>{props.help}</p>}
    </div>
  );
}
