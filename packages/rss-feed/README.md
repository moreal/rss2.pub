# @rss2pub/rss-feed

`@rss2pub/rss-feed` parses RSS 2.0 documents for rss2.pub. The RSS 2.0
specification is the normative format specification for this package.

Tested against the rss2.pub RSS 2.0 consumer conformance profile derived from the W3C Feed Validator RSS 2.0 corpus.

The profile uses a pinned W3C Feed Validator corpus as a regression oracle. It
accounts for all 326 selected paths. Upstream no-error RSS 2.0 documents run as
accepted or projected inputs, and the parser consumes the RSS 2.0 core
specification's channel and item elements. Fixtures devoted to unconsumed
extension elements, or to validator-only semantic rules, are classified as not
applicable. This is not a claim of complete Feed Validator parity or W3C
endorsement.

## Conformance corpus setup

Initialize the test-only corpus after cloning:

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

To update its pin, move the submodule gitlink to the reviewed upstream commit,
run `yarn rss20:conformance:update`, review every classification and checksum
change, then run the complete repository gate. The submodule is test input; it
is not part of this package's runtime output.
