# rss2.pub

rss2.pub turns Atom 1.0 and RSS 2.0 feeds into accounts that people can follow
from a fediverse server. RSS 1.0 is not supported.

To register a feed, open [rss2.pub](https://rss2.pub/) and submit its feed URL.
You can also mention the `rss2pub` account with a feed or website URL. The
service replies with the feed account's handle. When a website advertises several
readable feeds, choose the one you want; mentions receive the candidate URLs.
On the registration result or account page, enter your fediverse account name
to continue to your server and confirm the follow. You can also copy the feed
account's handle and search for it from your own app.

Feed account pages show whether the source check is waiting, healthy, or failing,
with the last successful check and the next scheduled attempt. These describe
source retrieval; delivery to a remote server can take additional time.

The service can also be [self-hosted](/self-hosting). Read the
[database migration policy](/database-migrations) before upgrading and the
[changelog](/changelog) before changing versions.
The application source is available under the
[GNU AGPLv3 or later](https://github.com/moreal/rss2.pub/blob/main/LICENSE).
