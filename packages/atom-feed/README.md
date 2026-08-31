# @rss2pub/atom-feed

`@rss2pub/atom-feed` parses Atom Feed Documents for rss2.pub. RFC 4287 is the
normative format specification for this package.

Tested against the rss2.pub Atom consumer conformance profile derived from the W3C Feed Validator RFC 4287 corpus.

The profile uses a pinned W3C Feed Validator corpus as a regression oracle. It
accounts for all 381 selected paths: 62 upstream no-error Atom Feed Documents
run as accepted or projected inputs, while standalone Atom Entry Documents are
rejected by rss2.pub product policy. This is not a claim of complete Feed
Validator parity or W3C endorsement.

## Conformance corpus setup

Initialize the test-only corpus after cloning:

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

To update its pin, move the submodule gitlink to the reviewed upstream commit,
run `yarn atom:conformance:update`, review every classification and checksum
change, then run the complete repository gate. The submodule is test input; it
is not part of this package's runtime output.
