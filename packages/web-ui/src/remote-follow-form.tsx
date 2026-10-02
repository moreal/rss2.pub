/** @jsxImportSource @solidjs/web */
import { Button } from "./primitives/index.js";

export type RemoteFollowFormModel = {
  readonly handle: string;
  readonly locale: string;
  readonly heading: string;
  readonly help: string;
  readonly placeholder: string;
  readonly button: string;
};

/** Registration and actor pages share the existing follow endpoint. */
export function RemoteFollowForm(props: { model: RemoteFollowFormModel }) {
  return <form method="get" action={"/@" + encodeURIComponent(props.model.handle) + "/remote-follow"} class="field">
    <input type="hidden" name="lang" value={props.model.locale} />
    <label class="field-label" for="remote-follow-acct">{props.model.heading}</label>
    <div class="control">
      <input type="text" id="remote-follow-acct" name="acct" placeholder={props.model.placeholder}
        autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="320" required
        aria-describedby="remote-follow-help" />
      <Button variant="primary" type="submit">{props.model.button}</Button>
    </div>
    <p class="help" id="remote-follow-help">{props.model.help}</p>
  </form>;
}
