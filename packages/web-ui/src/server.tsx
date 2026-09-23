/** @jsxImportSource @solidjs/web */
import { generateHydrationScript, renderToString } from "@solidjs/web";
import {
  ActorProfile,
  MessageDetail,
  RemoteFollowError,
  type ActorProfileModel,
  type MessageDetailModel,
  type RemoteFollowErrorModel,
} from "./federation/pages.js";
import { LocalePicker, type LocalePickerProps } from "./locale-picker.js";
import {
  HomeBody,
  RegisterResultBody,
  SearchBody,
  type HomeViewModel,
  type RegistrationViewModel,
  type SearchViewModel,
} from "./product/pages.js";

export type { LocalePickerProps, LocaleOption } from "./locale-picker.js";
export type { ActorProfileModel, MessageDetailModel, RemoteFollowErrorModel } from "./federation/pages.js";
export { SanitizedHtml } from "./federation/sanitized-html.js";
export type { HomeViewModel, RegistrationViewModel, SearchViewModel } from "./product/pages.js";

export function renderLocalePicker(props: LocalePickerProps): string {
  return renderToString(() => <LocalePicker {...props} />);
}

export function renderHomeBody(model: HomeViewModel): string {
  return renderToString(() => <HomeBody model={model} />);
}

export function renderSearchBody(model: SearchViewModel): string {
  return renderToString(() => <SearchBody model={model} />);
}

export function renderRegisterResultBody(model: RegistrationViewModel): string {
  return renderToString(() => <RegisterResultBody model={model} />);
}

export function renderActorProfile(model: ActorProfileModel): string {
  return renderToString(() => <ActorProfile model={model} />);
}

export function renderMessageDetail(model: MessageDetailModel): string {
  return renderToString(() => <MessageDetail model={model} />);
}

export function renderRemoteFollowError(model: RemoteFollowErrorModel): string {
  return renderToString(() => <RemoteFollowError model={model} />);
}

export function hydrationBootstrap(): string {
  return generateHydrationScript({});
}

export function serializeLocalePickerProps(props: LocalePickerProps): string {
  return JSON.stringify(props)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
