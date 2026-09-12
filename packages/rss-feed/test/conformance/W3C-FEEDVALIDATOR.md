# W3C Feed Validator RSS 2.0 corpus

The rss2.pub RSS 2.0 consumer conformance profile uses selected RSS 2.0
fixtures from the [W3C Feed Validator](https://github.com/w3c/feedvalidator)
repository at commit `9ce274c9db93796b8ab2a44952b9da80811bf765`. The RSS 2.0
specification, rather than this corpus, is the normative format specification.

The pinned corpus is a regression oracle. The selected fixture glob is
`testcases/rss20/**/*.xml`; it contains 326 paths at that commit, and every
selected path has a generated profile classification. Upstream no-error RSS
2.0 documents execute as accepted or projected inputs. Fixtures devoted to
elements the rss2.pub parser does not consume are classified as not applicable.

This profile does not claim full Feed Validator parity. The W3C project does
not endorse rss2.pub and has not certified it. The upstream license is
preserved unmodified at `vendor/w3c-feedvalidator/LICENSE`.

## Setup and pin updates

Initialize the test-only corpus after cloning:

```sh
git submodule update --init --depth 1 vendor/w3c-feedvalidator
```

To update the corpus, move the gitlink to the reviewed W3C commit, run
`yarn rss20:conformance:update`, review every classification and checksum
change, then run the complete repository gate. Do not modify the generated
manifest directly. The corpus remains test input only and is not included in
the runtime or Nix package outputs.
