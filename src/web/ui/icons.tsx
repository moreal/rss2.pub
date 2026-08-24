import type { FC, PropsWithChildren } from "hono/jsx";

/**
 * The whole icon set, in one place. Every icon is a 24×24 currentColor glyph
 * marked `aria-hidden`: icons here only reinforce a label that is already in
 * the DOM, so none of them carries meaning a screen reader would miss.
 */

export const RSS_ICON_PATH =
  "M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 10.1v3.12c3.74 0 6.78 3.04 6.78 6.78h3.12c0-5.47-4.43-9.9-9.9-9.9zM4 4.44v3.12c6.86 0 12.44 5.58 12.44 12.44H19.56C19.56 11.4 12.6 4.44 4 4.44z";

type IconProps = { readonly size?: number; readonly class?: string };

const Icon: FC<PropsWithChildren<IconProps>> = (props) => (
  <svg
    class={props.class}
    viewBox="0 0 24 24"
    width={props.size ?? 18}
    height={props.size ?? 18}
    aria-hidden="true"
    focusable="false"
  >
    {props.children}
  </svg>
);

export const RssIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path fill="currentColor" d={RSS_ICON_PATH} />
  </Icon>
);

export const SearchIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path
      fill="currentColor"
      fill-rule="evenodd"
      d="M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm-5.5 7.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"
    />
    <path fill="currentColor" d="m15.8 17.2 1.4-1.4 4.5 4.5-1.4 1.4Z" />
  </Icon>
);

/** Success. Paired with a text heading — never the only success signal. */
export const CheckCircleIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.25 14.4-4.15-4.15 1.4-1.4 2.75 2.75 5.85-5.85 1.4 1.4-7.25 7.25Z"
    />
  </Icon>
);

/** Failure. A triangle, not just a red colour — shape carries the meaning. */
export const AlertIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path
      fill="currentColor"
      d="M12 2 1.5 21h21L12 2Zm0 6.1 6.15 10.65H5.85L12 8.1ZM11 11h2v4.5h-2V11Zm0 5.5h2V18h-2v-1.5Z"
    />
  </Icon>
);

export const CopyIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      d="M9 9h10v12H9zM5 15V3h10"
    />
  </Icon>
);

export const CheckIcon: FC<IconProps> = (props) => (
  <Icon {...props}>
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m5 12.5 4.5 4.5L19 7"
    />
  </Icon>
);
