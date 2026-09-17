# Literal SVG source labels and fresh native content — September 17, 2026

## Result

The native research reader now retains a nonblank, own SVG aria-label as escaped
code text with the explicit prefix "SVG source aria-label: ". This repairs an
otherwise textless owning anchor without rendering SVG, copying SVG roles or
inferring names from geometry, title, descendants, classes or URLs. A frozen
optional svgAlternatives report records decoded UTF-16 counts and explicitly
marks the value unrendered and unverified. Existing omission, visibility and
text/output limits remain in force. MathML source alternatives remain separate.

Baseline:2cea062edd09699852ab313a9f595d4840d41d14 plus the six owned source/test
manifest overlays. Qualification uses1,631 source and2,412 compiled pins, not
execution of the unrelated dirty worktree. No new dependency is added.
See SVG-SOURCE-LABELS.md for exact semantics and limits.

## Tests and preserved failures

- Final focused qualification:960 passed/0 failed across12 files, including
  168 new cases (164 core and4 replay). Build, selected types, formatter and
  linter pass; all recorded processes close and private HOME/TMP remain empty.
- Unchanged-production red01:813 passed/147 failed. Initial fixed core01:
  956 passed/4 failed. Two old SVG-negative expectations needed to allow the
  explicit annotation while still rejecting restored roles/name attributes;
  the new replay expected an unescaped Markdown period; the new Unicode test
  incorrectly omitted the combining acute accent from its expected value.
  Corrected expectations retain exact code-unit boundaries and escaping checks.
- Core01's linter also rejected two delete operators in the new replay test.
  Rest destructuring replaces them, with positive assertions on removed metadata.
  Final unchanged-production red02:812 passed/148 failed; fixed release01:960/0.
  Preserve all original logs rather than treating test-expectation fixes as
  production fixes or hiding the unsuccessful attempts.
- First full run:49,967 passed/90 failed across1,000 files. All failing cases
  are in nine private-file/CLI fixture files; repository-local TMPDIR has
  group-writable, non-sticky ancestors that correctly fail protected-file checks.
  The same nine files pass181/0 using private0700 HOME/TMP beneath sticky /tmp.
  No assertion, production security check or browser source changes for this
  environment correction. The first preparation helper also stopped before
  execution on a config-key spelling assumption; that caused no test run.
- Complete corrected run:50057 passed/0 failed in1000 files,
  657.986 seconds, no skipped/todo cases. This is every
  available path in the explicit1,022-entry canonical manifest, not all declared
  paths:22 committed files remain absent. Neither this run nor the focused gate
  qualifies actual SafeJS, real websites, secrets, devices or TTY behavior.

## Captured-source comparisons

The same strict document-scope replay policies are used on both runtimes:
default reader, separate-omitted-raw-v1, source-hidden-inline-v1, UTF-8 fallback,
256KB extraction and unchanged source/document bounds. Baseline/fixed pairs use
identical captured bytes. Replays run with kernel and JavaScript network denial;
the eight replay documents make zero new requests and close cleanly.

| Capture | Baseline Markdown bytes | Fixed Markdown bytes | Fixed SVG alternatives |
| --- | ---: | ---: | ---: |
| homedepot | 37621 | 37701 | 1 |
| consumerreports | 32479 | 34620 | 38 |
| target | 8446 | 8489 | 1 |
| consumerreports-fresh | 32488 | 34664 | 38 |

Home Depot is the earlier September17 18:32:56.500 UTC root capture. The other
saved captures are Consumer Reports at September16 00:24:38.332 and Target at
00:24:31.466 UTC. The final row is the fresh Consumer Reports response described
below. Existing source metadata and receipt bytes are never rewritten.

Home Depot's explicit "The Home Depot Logo" now retains its homepage anchor.
Consumer Reports' two responsive logo labels likewise restore the header's
homepage destination. Target's "Target circle™" supplements an existing
promotional link; it is not evidence that an entire previously missing link was
recovered. Unlabelled SVG remains omitted. The saved web.dev module-workers
candidate has no SVG-root aria-label and is explicitly not claimed as fixed.

## One fresh native visit

At2026-09-17T19:25:21.922Z, one anonymous native GET of the exact Consumer Reports
root returns200 with482,642 decoded bytes and72,739 encoded bytes. There are no
redirects, retries, asset requests, credentials, SDK, source-script execution,
devices, TTY, alternate browser/client, spoofing, proxy or challenge solver.
The exact synthetic driver first verifies an SVG-only anchor and omitted script
under kernel/JavaScript network denial, with zero wire requests.

- Body SHA-256:cab7d8fa003197de19aa2a8ad17d18a2ee51dab86e13e84d60b2b7db347168a7.
- Receipt SHA-256:f92ab1a64f8bef9637afee926821fc9a7603cbf5bd19e424f9feccc187c64fab.
- Original live Markdown:39,333 bytes; SHA-256
  f3691434cf99aab3df160be29e0bb2490767050b319ad9a0870417401dae0714.
- The original live reader uses legacy hidden semantics and emits39 source
  alternatives/746 label code units. Both strict replays use identical explicit
  hidden/raw policies; the fixed replay emits38 alternatives/734 code units.
  Do not attribute their difference from live to the SVG production change.
- The native capture is admitted and bounded, and reports extracted-unverified,
  not an automatic content-quality pass. Request/transport/session/document and
  child/process-group closure checks pass; private HOME/TMP remain empty.
  The observer does not archive a secureConnect event; none is claimed here.

## Independent content review

An independent artifact review checks every39 live and38 fixed SVG annotation
against decoded source attributes, including the entity-encoded apostrophe.
It verifies enclosing-anchor destinations and the same-policy content comparison:

- Baseline has319 emitted link occurrences across270 unique destination strings;
  fixed has323 across271. Exactly one unique destination is added: the homepage.
  Three added link occurrences repeat already-present editorial destinations.
  No prior destination occurrence is removed.
- Removing added annotations/annotation-only links and normalizing whitespace
  reproduces baseline Markdown exactly. This establishes source text, order and
  destination preservation for this captured body, not a universal guarantee.
- Useful captured content includes the can-opener feature and summary, product
  ratings/review categories, product A–Z navigation, article links and video-card
  text. These are publisher claims and source destinations, not independently
  verified editorial facts, played videos or completed destination visits.
- The strict replay excludes four explicitly hidden article panels and one
  aria-hidden close label present in the legacy live output. Nineteen destination
  strings disappear entirely relative to live, but are absent in both strict
  variants. This is real policy-dependent source coverage, not an SVG regression.

The complete review, including all labels, exact source locations, duplicate and
hidden-panel accounting, is pinned in the evidence lane's FRESH-REVIEW.md. A
separate static production/test review finds no actionable correctness defects.
Neither review is represented as another browser or test execution.

## Limitations and next work

Consumer Reports contains both desktop/mobile logos, class-hidden account labels
and paired video-state icons. Twenty-one fixed annotations describe seven
video-state labels repeated across three cards. These can add noise. The source
search button is disabled, but its source annotation is not a disabled-state UI.
No computed CSS visibility, accessibility-name algorithm, enabled interaction,
logged-in account state, SVG graphics, QR decoding or media playback is implied.

Historical100-entry results remain33 useful/67 other; focused retests do not
retroactively change that corpus. There is no new overall speed result or general
CAPTCHA/crawler-block solution. Continue varied source-linked tasks, dynamic
SafeJS/HTML modules, actual authentication/passkeys/devices and the original
research topics. The full browser goal remains active.

Evidence: node_modules/.cache/native-validation/svg-source-labels-september17
and node_modules/.cache/native-validation/svg-source-live-september17. Their
immutable manifests and seals are recorded in the paired JSON report. Preserve
42 pre-existing tracked modifications and697 untracked files. No push is made.
