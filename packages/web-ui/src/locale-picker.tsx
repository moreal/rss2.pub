/** @jsxImportSource @solidjs/web */
import * as Popover from "@kobalte/core/popover";
import { createMemo, For } from "solid-js";

export type LocaleOption = {
  readonly locale: string;
  readonly label: string;
  readonly href: string;
};

export type LocalePickerProps = {
  readonly currentLocale: string;
  /** Short visible code, such as EN, KO, or ZH-TW. The trigger width never depends on it. */
  readonly currentShortLabel: string;
  readonly buttonLabel: string;
  readonly options: readonly LocaleOption[];
};

export function LocalePicker(props: LocalePickerProps) {
  const current = createMemo(() => {
    const option = props.options.find((item) => item.locale === props.currentLocale);
    if (option === undefined) throw new Error("Current locale is missing from options");
    return option;
  });
  let panel: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  return (
    <div class="locale-picker">
    <Popover.Root>
      <Popover.Trigger
        ref={(element) => { trigger = element; }}
        class="locale-picker-trigger"
        aria-label={`${props.buttonLabel}: ${current().label}`}
        onKeyDown={(event) => {
          // The portal follows the page body, not the header trigger. Route a
          // forward Tab into its first link before focus reaches page controls.
          if (event.key === "Tab" && !event.shiftKey &&
              event.currentTarget.getAttribute("aria-expanded") === "true") {
            const first = panel?.querySelector("a");
            if (first !== undefined && first !== null) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" />
        </svg>
        <bdi dir="auto">{props.currentShortLabel}</bdi>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="locale-picker-panel"
          ref={(element) => { panel = element; }}
          onEscapeKeyDown={() => queueMicrotask(() => trigger?.focus({ preventScroll: true }))}
        >
          <Popover.Title class="locale-picker-title">{props.buttonLabel}</Popover.Title>
          <nav aria-label={props.buttonLabel}>
            <For each={props.options}>{(option) => (
              <a
                href={option.href}
                lang={option.locale}
                hreflang={option.locale}
                aria-current={option.locale === props.currentLocale ? "true" : undefined}
              >
                <bdi dir="auto">{option.label}</bdi>
              </a>
            )}</For>
          </nav>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    </div>
  );
}
