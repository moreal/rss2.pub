/** @jsxImportSource @solidjs/web */
import { Notice } from "./primitives/index.js";

export type CollectionStatusModel = {
  readonly state: "pending" | "healthy" | "failed";
  readonly title: string;
  readonly body: string;
  readonly lastSuccess: { readonly label: string; readonly iso: string; readonly text: string } | null;
  readonly nextCheck: { readonly label: string; readonly iso: string; readonly text: string };
};

export function CollectionStatus(props: { model: CollectionStatusModel }) {
  return <aside class="collection-status" aria-label={props.model.title}>
    <Notice kind={props.model.state === "failed" ? "error" : props.model.state === "healthy" ? "success" : "info"} title={props.model.title}>
      <p>{props.model.body}</p>
      <dl class="collection-times">
        {props.model.lastSuccess !== null && <div><dt>{props.model.lastSuccess.label}</dt><dd><time datetime={props.model.lastSuccess.iso}>{props.model.lastSuccess.text}</time></dd></div>}
        <div><dt>{props.model.nextCheck.label}</dt><dd><time datetime={props.model.nextCheck.iso}>{props.model.nextCheck.text}</time></dd></div>
      </dl>
    </Notice>
  </aside>;
}
