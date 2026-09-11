# Format-independent research barrier handoff

Status: native and reader research callers stop on the captured PyPI challenge in
default Markdown, explicit Markdown and JSON modes. This is offline caller
verification, not successful PyPI access or challenge solving.

## Caller behavior

Research navigation now checks bounded native document text before extraction in
every output mode. Previously, default/explicit Markdown without a selection
waited until after formatting. Emphasis and links could insert Markdown syntax
inside challenge phrases, obscuring markers that the native document contained.

A recognized document barrier now consistently returns `semantic-barrier`,
`contentSuccess: false`, a handoff diagnostic and a `policy-denied` failure at
`semantic-barrier`, without invoking or attaching content extraction. Header-first
checks, sanitized response metadata, explicit capture behavior, later selected-text
classification and session cleanup remain in place. Existing Markdown login
fixtures now verify early handoff instead of retaining extracted login content.

Document diagnostics retain one lookahead code unit beyond the 8192-character
searchable prefix. This lets the classifier distinguish a complete word from one
cut mid-word, without searching beyond its existing prefix. A marker cannot be
completed using lookahead; the document diagnostic output is bounded to 8193 units.

## Reader limitation retained

The reader explicitly declares `hiddenContentSemantics: false` and discards source
styling/visibility attributes. Hidden source text may therefore remain in its
partial representation and trigger a possible barrier. Native mode excludes hidden
markers. This patch does not claim to implement reader visibility or treat a reader
diagnostic as proof of what a rendered browser displays.

Initial new tests incorrectly required hidden-content semantics in both modes.
Six reader cases failed identically against old and modified source. Their final
expectations now verify the existing reader limitation and early handoff; ordinary
titles, incomplete phrases and script-only markers remain unblocked. No failing
test is silently excluded and no historical result is rewritten.

## Isolated validation

`node_modules/.cache/native-validation/native-research-challenge-handoff-september11-round02/`
records September 11, 2026, 09:31:22.469–09:32:58.800 UTC:

- 6543 tests pass, zero fail and one previously reproduced baseline assertion is
  excluded across 110 explicitly selected native files.
- This selection adds the already manifest-listed 48-case challenge-truncation
  file to the previous 109 files. The workflow file contains 191 passing cases,
  including 64 new format/reader/visibility/lookahead cases.
- Production compilation, strict checking of 109 test roots and four-file
  formatting pass. The unchanged snapshot.test.ts typing exception remains outside
  strict roots, not native runtime testing.
- All 1006 source/fixture files remain stable; 1788 compiled files are pinned in
  `native-research-challenge-handoff-compiled-september11`, ledger SHA-256
  `8ac79987f90c5d39954d3585055dc9d5ef2251bfabd53def93717a42cdb3c516`.

The initial round01 remains failed: 6537 pass, six fail and one baseline assertion
is excluded. The separate `native-research-challenge-handoff-baseline-september11/`
uses unchanged HEAD 8c4a927 source with the initial new workflow tests: 163 pass and
28 fail. Twelve failures expose Markdown handoff behavior, ten expose missing
boundary lookahead, and six are the incorrect reader visibility assumptions
described above. Their pinned inputs and original measurements remain intact.

## Captured caller replay

`node_modules/.cache/native-validation/native-pypi-research-handoff-replay-september11/`
records 09:33:11.334–09:33:11.490 UTC. It runs the actual researchNavigation caller
six times: native/reader crossed with default/Markdown/JSON. Native transport
fixture routes serve the unchanged captured challenge HTML and stylesheet.

Every report returns the possible unspecified-provider challenge/handoff diagnostic,
`semantic-barrier`, `contentSuccess: false`, no extraction and research exit code 1.
The replay supervisor exits zero because those expected handoff outcomes and
cleanup checks pass; it does not report website success.

Nine fixture responses are served: two for each native case and one for each reader
case. Encoded network bytes and guard attempts are zero. All six observed sessions,
documents and transports close internally, request counts become inactive, and
instrumentation is restored. Source/build/original-capture pins stay unchanged;
private directories remain empty. Receipt SHA-256:
`90fb7b583f460bfbd65ea4a4692633bfa38e4cad0c7ba70be40584acfa7d4a68`.

The replay uses seccomp plus JavaScript network/process guards, clean environment,
30-second child deadline and 6-MiB output/file caps. There is no new PyPI request,
script/SafeJS execution, real credential access, TTY/PTY or CAPTCHA bypass. Research
completion, rendering, broad website coverage and anti-bot effectiveness remain
open; a detected restriction still needs an appropriate user handoff.
