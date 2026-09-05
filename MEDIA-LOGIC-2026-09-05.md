# Native media logic — September 5, 2026

## Contract and implementation

The native compiler now distinguishes **true, false and unknown** internally.
Unknown is not converted to false before negation or Boolean composition:

- Negating unknown gives unknown.
- AND is false when any term is false, true when all are true, otherwise unknown.
- OR is true when any term is true, false when all are false, otherwise unknown.
- The public two-valued `matches` boundary treats remaining unknown as false.

This fixes supported conditions combined with unsupported features: a decisive
known result survives instead of losing the entire branch. The aggregate
`unsupported` flag and existing media diagnostic remain, even when an unknown
term is irrelevant to the final true result. Fallback layout retains that
diagnostic under the separate policy in `MEDIA-FALLBACK-2026-09-05.md`.

Media types are distinct from unknown conditions. An otherwise valid unescaped
identifier type other than native all/screen is known false, not unknown.
Thus `not future` matches, but `not (future)` remains unknown/nonmatching.
The existing native all/screen=true and print=false policy is unchanged; no new
physical device is implied. The reserved type keywords not, only, and, or and
layer remain excluded. Optional not scopes over the typed conjunction; only
does not invert it. Valid unknown types no longer count as invalid queries.

Parenthesized conditions/features are attempted before general-enclosed
fallback. Balanced function-token terms and otherwise unrecognized enclosed
values produce unknown. For example, `not(foo)` is a function token, not
keyword negation. Required whitespace, operator grouping, comma boundaries and
existing source/depth/condition ceilings remain enforced. Parse failure and
unknown evaluation are represented separately; resource exceptions are not
caught and converted to unknown.

Speculative condition/term parsing remains charged. The same fixed condition
ceiling can be reached sooner for some inputs than before; this is not a promise
of identical quota-edge acceptance or a cap on every token in opaque functions.
Those function contents remain bounded by source and nesting limits.

## Explicitly partial serialization and syntax

Canonical all-unknown branches retain the existing `not all` serialization.
Mixed known/unknown branches and valid media types retain normalized native
source, so a query that can match after resize does not falsely report itself
as `not all`. Its serialized text stays stable across viewport changes. This
is an explicit partial native policy, **not full CSSOM serialization proof**.

Quoted, escaped and bracketed branches remain conservatively unsupported.
Global malformed-block recovery can still discard an entire list. CSS token
preprocessing, all identifier/escape handling, host stylesheet recovery and
complete general-enclosed token validation are not newly claimed conformant.
Existing gamut/device/computed-color limitations remain. No SafeJS execution,
runtime dependency, browser engine or page lifecycle behavior changes here.

## Native source evidence

Both admitted sections come from the unchanged archived Media Queries body,
originally received **2026-09-05T06:57:25.980Z**, HTTP 200, **709,021 decoded /
114,627 encoded bytes**. Source: `https://drafts.csswg.org/mediaqueries-5/`.
Decoded-body SHA256:

`13710d9352b367231363ef2445541cbf17a443f7e7af2f0707949f95a523546c`

The original live attempt failed in the old reader and admitted zero scopes.
Its path, measurements and failure remain unchanged. These are **offline native
reads**, not new requests or live validation. The fixed native reader is
`reader-table-integrated.O7zvlp/dist/src/research-loader.js`, hash:

`cda8f2419aab50d999eb6ec7309b3b0c01fb1b952b583ecdddf04cb6f123205d`

### Evaluation

**07:53:41.657–07:53:41.940 UTC**: exact native heading e3414,
**3.1. Evaluating Media Queries**, and five adjacent scopes. **6 scopes / 8,239
serialized extraction bytes**, **128 discovery bytes**, **10,378 report bytes**.
Captured prose establishes the three-valued composition and two-valued boundary.
The worker's truth tables are explicitly derived from prose, not extracted
table cells. Parent verified **18 artifacts, 1,596 build inputs and ten inherited
files** from finalized ledgers before using that evidence.

### Grammar

**07:54:06.501–07:54:06.806 UTC**: exact native heading e3063, **3. Syntax**,
with twelve adjacent scopes. **13 scopes / 13,192 serialized extraction bytes**,
**154 discovery bytes**, **15,515 report bytes**. Formal grammar at e3121,
reserved type words at e3274, spacing at e3312/e3321 and general-enclosed
precedence at e3344 support the implementation distinctions. Source-linked WPT
lists were extracted only; none of their links or tests was visited/executed.

The initial parent grammar helper called a nonexistent cleanup-metrics method
after closing native owners and did not save a structured result. Its script
and failure log remain unchanged; no scopes from that attempt are claimed.
A distinct corrected helper uses the actual mutationMetrics method and separate
output paths, without raising limits or making requests. Filesystem audit and
ten artifact hashes verify the corrected record and preserved initial failure.

Both successful loads produced 14,240 nodes with revision 14,239 unchanged.
Native queries/documents closed; no collectors/notifications remain. Original
reader limits were preserved. Combined admitted extraction is **19 scopes /
21,431 bytes**, from two distinct successful offline runs. There were zero
requests, transports or SDK executions; no alternate parser or raw-body rewrite.
The reader remains partial without scripting/styling/complete hidden semantics.

The separately preserved Error Handling scope distinguishes unknown media types
from unknown feature values and describes query-list recovery. None of these
selected sections establishes CSSOM serialization, current standards maturity,
publication date, arbitrary-input conformance or native guest/device acceptance.

## Evidence and outstanding work

Implementation adds **129 parser and 61 page integration cases**. **675 tests
pass across nine named files in each tree**, with project types, explicit dist
builds, strict touched tests, formatting and scoped Biome passing. The older
page-media test has pre-existing import-order diagnostics, reproduced against
its before copy and left untouched; no full source/test Biome pass is claimed.
The working/candidate manifests contain 449/447 entries respectively, with the
two pending parent-RP suites excluded from this patch and matrix.

The unchanged old compiler fails **100 of the same 190 new cases**, passing 90:
62 parser failures and 38 page failures. Its seven existing suites independently
pass 485 cases. Both new tests use existing APIs, not missing new exports. The
old snapshot in `/tmp/media-logic-old-baseline-path` and its selected eight-file
input ledger are preserved. The distinct candidate is recorded in
`/tmp/media-logic-integrated-path`; final logs use `media-logic-final-01-`.

The first related six-suite run passed 446 cases and failed a budget fixture
that treated bare x as invalid syntax. Since x is now a valid false media type,
the fixture uses genuinely invalid ? to retain the same expansion/retained-text
limit check. Initial page-worker results were 57 passes/four fixture failures:
the aggregate event metric counts resize dispatches as well as query changes.
Only those aggregate expectations were corrected; callback checks already
passed. Initial source/logs are retained separately; no production quota or
event behavior was changed to accommodate either fixture assumption.

Separate review finds no new blocker within the declared subset, with 19
verified artifacts, seven reviewed source hashes and twelve evidence hashes.
This static conclusion does not substitute for the native test results or
expand them into full CSS, guest or device conformance claims.

Cache paths are under `node_modules/.cache/native-validation/`:
`media-logic-research/` contains finalized evaluation artifacts;
`media-grammar-research/` contains both initial failure and corrected grammar
artifacts; `media-logic-review/` contains the separate implementation review.
Implementation test/baseline evidence is distinct from source acquisition.

Full syntax/token/recovery/serialization conformance, actual guest execution,
real site compatibility and physical-device evidence remain outstanding.
No full native test manifest, live website, socket, TTY, credential or device
probe is authorized by this checkpoint. Denied parent-RP, actual identity SDK
and identity-wire gates remain untouched. The full goal stays in `TASKS.md`.
