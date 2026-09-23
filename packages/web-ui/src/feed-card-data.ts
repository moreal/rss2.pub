/** Serializable feed data passed from the web adapter into Solid views. */
export type FeedCardData = {
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly url: string;
  readonly iconUrl: string | null;
  readonly href: string;
};
