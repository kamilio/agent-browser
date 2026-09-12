# HTML cellpadding: retained-spec and committed-source investigation

Date: September 12, 2026. Status: requirements and test proposal only.
No cellpadding implementation, new feature tests, test reruns, website replay,
network requests, or geometry validation were performed in this investigation.
The parent's eight remaining Libpng guards are the motivation supplied by the
task, not an independently remeasured website result.

## Evidence locations and source identity

All investigation artifacts are under:

`node_modules/.cache/native-validation/native-cellpadding-investigation-september12/`

Paths beginning `source/`, `attempt01/`, or an artifact filename below are relative
to that lane. Source references such as `source/src/styles.ts:1105` refer to the
saved committed source, NOT the dirty working-tree file.

The reviewed commit is `fa49059b123243f1b220a8b198607a62c5dc4927`, the 13226-test
release. The checkout had already advanced to `c26c8d9e9cb21ecea3d1a743a803ae57ce0b3da3`
when this task started; the requested commit was therefore addressed explicitly.
`SOURCE-INPUTS.json` records 18 files retrieved with actual `git show` from the
requested commit and compared byte-for-byte with its release snapshot. No dirty
overlays were used for this analysis. This includes reading existing tests, not
executing them.

Runtime: pinned Node `v22.22.0`, native `parseHtmlDocument` and `DocumentQueries`
from the verified release's `snapshot01/dist/src/`. Only the two retained HTML
specification bodies were parsed, once each. Script execution was disabled.

## Execution chronology and authorization distinction

Both actual attempts are retained at their original paths. There is no
`corrected00` execution, and no third extraction was performed.

| Actual attempt | UTC interval, September 12, 2026 | Outcome |
| --- | --- | --- |
| Lane root | 12:03:18.890–12:03:18.921 | Exit 1, 0.0297974553 seconds; stdout 0 bytes, stderr 1388 bytes. Import resolution failed at `snapshot01/dist/html-parser.js`, before any native module import or document parsing. |
| `attempt01/` | 12:04:16.494–12:04:16.823 | Exit 0, 0.3287539780 seconds; stdout 15491 bytes, stderr 0 bytes. Two documents, nine matches. Extraction JSON timestamp: 12:04:16.802Z. |

After reading the initial error, the assistant announced a self-directed harness
correction in the conversation and created a fresh `attempt01/` lane. The native
extractor's sole source change was `dist/` to `dist/src/` in the import base; the
matching predicates, input documents, and extraction semantics were unchanged.
The original extractor, launcher, invocation pins, zero-byte output, stderr,
run-once lock, and failure receipt remain intact. The corrected directory uses
the same sealed launcher and offline monitor, with a shim re-exporting the
original common helpers.

That correction ran BEFORE the parent's approximately 12:08 explicit correction
message. That later message is not retroactive approval. The assistant must not
describe `attempt01` as launched under the requested `corrected00` amendment.
The parent subsequently instructed that the existing successful attempt fulfills
the extraction need, that both attempts remain, and that no further native
execution occur. The remainder of this task only writes the report and seals and
verifies existing bytes.

Both actual invocations used the original task's 45-second wall timeout plus
5-second kill grace, NOT the later 40-second amendment. The successful process
reported seccomp mode 2 and `NoNewPrivs: 1`. The wrapper unconditionally installs
kernel EPERM rules for `socket` and `socketpair`, plus connection, listening,
message-send, and io_uring entry points. No socket-denial probe was executed.
Both receipts report no termination signals, absent child process groups at
completion, and empty private home/tmp directories.

Actual cumulative captured stdout/stderr is 16879 bytes, below 6 MiB. Each
invocation enforced its own 6 MiB output limit; the corrected monitor observed
its subdirectory, not a new cumulative-output counter. Whole-lane checks before
and after execution and in the final verifier enforce the 16 MiB lane and 64 MiB
minimum-free requirements. These facts establish bounded actual usage, not
retroactive compliance with the parent's later prelaunch-amendment procedure.

## Receipt verification and sealing

`PREFLIGHT.json`, `POSTFLIGHT.json`, and `FINAL-INPUTS.json` retain the three
completed before/after input checks. `attempt01/PREFLIGHT.json` preserves the
post-failure check used before the corrected launch. Each check verifies:

- All 15 entries in the pre-existing `SPEC-RECEIPTS.sha256`.
- All 20 release receipts, 1148 source-file hashes, and 1964 compiled-file hashes.
- Eight actual-Git release inputs: the seven release scope files plus
  `native-tests.json`, against commit `fa49059b123243f1b220a8b198607a62c5dc4927`.

Pinned pre-existing ledgers:

| Ledger | SHA-256 |
| --- | --- |
| Spec receipts | `374825689c7b9753820471a8f95f1849776e431da942062724569ecb60998453` |
| Release receipts | `2018a312829cafa38e2d8f2010c13d24fa11f8d1027639f49e30e52bb86744ff` |

`FINAL-RECEIPTS.sha256` seals this report and the private lane's existing
artifacts, saved sources, failure evidence, successful extraction, and verifier
scripts. `SEAL.json` records that ledger's hash and storage measurement. The
read-only `verify.mjs` performs a fourth bounded receipt/Git check, verifies the
saved source bytes and both invocation pin sets, and checks extraction metadata
and cumulative output. It does not import the native browser or rerun parsing,
tests, a release audit, compilation, or formatting. Its output is returned to the
parent, not added to or used to rewrite the historical receipts.

After sealing, the parent can supply the independently received ledger hash:

```sh
env -i PATH=/usr/bin:/bin /home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  node_modules/.cache/native-validation/native-cellpadding-investigation-september12/verify.mjs \
  EXPECTED_FINAL_RECEIPTS_SHA256
```

## Retained primary material

The documents were originally fetched on September 12, 2026 at approximately
11:21:16 UTC. This investigation reused those bytes; it did not fetch newer
material. Exact URLs, body hashes, original response dates, extraction node IDs,
section headings, complete matched text, and links are in
`attempt01/EXTRACTED.json`.

| Document | Exact URL | Body bytes | SHA-256 |
| --- | --- | --- | --- |
| Rendering | `https://html.spec.whatwg.org/multipage/rendering.html` | 366253 | `d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e` |
| Microsyntaxes | `https://html.spec.whatwg.org/multipage/common-microsyntaxes.html` | 121596 | `ea2c0ead4c7a0257f155c106c76b8dbc6e7a005ca07768bac9ac39d6e18bd13f` |

Nine matches were retained: six paragraphs, two algorithm lists, and one
stylesheet block. The stylesheet block is necessary evidence for default
padding and its HTML namespace. All matches are below 20000 characters; the
count is below 32. The original source documents retain the surrounding markup.

### Rules established directly by the extracted material

1. **Targets, match 5:** A `table` element's `cellpadding` maps to all four
   physical padding longhands of `td` and `th` elements with corresponding cells
   in the table corresponding to that `table` element. It does not say to set
   padding on the table itself, on every descendant element, or on arbitrary
   CSS `display:table-cell` boxes. Rendering source lines 994–999.
2. **Value conversion, match 3:** Mapping to a pixel-length property uses the
   rules for parsing non-negative integers. Successful parsing supplies a pixel
   length as a presentational hint; an error supplies no hint. It is not CSS
   length parsing or the percentage/dimension parser. Rendering lines 126–132.
3. **Integer prefix algorithm, matches 6–9:** Skip leading ASCII whitespace,
   accept an optional minus or plus, require an ASCII digit immediately after
   that optional sign, collect the digit sequence, interpret it in base ten,
   and apply the sign. The non-negative wrapper rejects an error or a result
   below zero. There is no trailing-input rejection in these steps.
   Microsyntaxes lines 164–186 and 205–210.
4. **Default, matches 1 and 4:** The retained UA stylesheet has an HTML namespace
   and `td, th { padding: 1px; }`. The general rendering paragraph identifies
   these rules as UA-level defaults. This default is distinct from the CSS
   initial padding of zero. Rendering lines 116–118 and 795.
5. **Origin, match 2:** These presentational hints belong to the author-level
   zero-specificity part of the cascade. Rendering lines 120–121. Detailed
   external CSS cascade rules were not retrieved.

### Direct algorithm consequences, not executed tests

| Attribute text | Parsed result / hint |
| --- | --- |
| `5`, `+5`, `0005`, `5px`, `5%`, `5.9`, `5junk` | Integer 5; `5px` on each target side |
| `0`, `-0`, `-000`, `-0.5`, `0x10` | Integer zero; `0px`, not absence/fallback |
| `1e3` | Integer 1, not 1000 |
| Empty, ASCII-whitespace-only, `+`, `-`, `+ 5`, `.5`, `-1`, `--5`, `NaN` | Error/no hint; absent author padding leaves the UA default |

Missing attributes supply no hint. Non-ASCII whitespace/digit cases need explicit
tests against the linked Infra definitions; those definitions were not captured
here. The integer algorithm states no 4096-character cap, percent scaling,
decimal rounding, clamp-to-one rule, or numeric magnitude limit.

## Committed implementation requirements and concrete risks

These are requirements for a FUTURE source change, not claims that a fix exists.

### Apply a cell hint through the existing cascade

- `source/src/styles.ts:1093` owns the candidate/winner cascade. Place successful
  per-cell longhands here before author sheets/inline styles, rather than
  overriding `BoxStyle` after cascade or adding a made-up inherited table CSS
  property. `source/src/css-table.ts:15` has table properties but padding already
  belongs to the box-property path.
- **Concrete source-order trap:** `source/src/styles.ts:1105` assigns
  `order = baseOrder + index`. Batching top/right/bottom/left together with the
  existing single-hint `baseOrder = -2` yields orders -2, -1, 0, and 1. With
  `<style>*{padding-left:0}</style><table cellpadding="5"><tr><td>X</td></tr></table>`,
  the first author declaration has order 0 and zero specificity; a hypothetical
  left hint at order 1 would incorrectly win (`source/src/styles.ts:283`,
  `source/src/styles.ts:1237`). Every hint side must stay strictly before the
  first author declaration. Separate single-longhand applications at the
  existing negative rank avoid this trap without changing the global cascade.
- Preserve the already implemented `1px` fallback on HTML cells at
  `source/src/styles.ts:1467`. A successful zero hint must not become this default.
  Current `revert` handling selects the UA fallback; `initial`/`unset` resolve to
  zero through `source/src/css-box.ts:194`; `inherit` resolves the DOM parent's
  padding, not a table-attribute inheritance channel. Preserve these current
  code behaviors and test them; the detailed external normative cascade rules
  remain a separately identified evidence gap.
- Author declarations invalid at computed-value time become `unset` at
  `source/src/styles.ts:1379`. Do not resurrect the lower-priority hint after
  that resolution. Do not overwrite explicit side overrides or valid inline,
  important, shorthand, variable, or universal-selector declarations.

### Do not reuse an incompatible parser unchanged

- `source/src/replaced-box.ts:7` accepts decimals and percentages, omits a plus
  sign, and imposes its own 4096-character limit. It is not this integer parser:
  `5.9` and `5%` must supply 5 pixels, not 5.9 pixels or a percentage.
- `source/src/html-image-border.ts:15` accepts an integer prefix but returns a
  hint only when the number is positive; it discards valid zero and negative
  zero and has a separate input cap. `cellpadding="0"` must remove the default
  cell padding, so this helper cannot be used unchanged.
- Preserve resource failures rather than allowing non-finite or rounded unsafe
  integers to enter layout. `source/src/layout-values.ts:8` already bounds used
  lengths to 16777216 and computed length source text to 128 code units.
  Choosing when an oversized mathematical integer produces an existing
  resource-limit error is an implementation policy, not a parsing failure or
  a clamp specified by the retained HTML algorithm. Do not invent a new raw
  cap or silently narrow accepted small values with long zero prefixes.

### Resolve HTML ownership, not arbitrary descendant styling

- A table with `cellpadding="5"` containing a nested table without that attribute
  must not blindly assign 5px to the nested table's cells. A nested table with
  its own `cellpadding="2"` needs an independent value. The exact general
  membership algorithm is linked to uncaptured `tables.html`; nearest-ancestor
  scanning alone is not evidence of complete compliance for malformed DOMs.
- Use `isHtmlElement` for the owning table and candidate `td`/`th`
  (`source/src/dom-namespaces.ts:12`), not tag spelling, ARIA role, or computed
  display alone. SVG/MathML lookalikes, CSS-created cells, anonymous wrappers,
  captions, rows, and row groups are not interchangeable with these HTML targets.
- `source/src/table-structure.ts:59` consumes an already-built CSS formatting
  tree: groups, rows, and cells selected by display role, with captions excluded.
  `source/src/formatting-tree.ts:291` can synthesize anonymous table boxes.
  This is not a standalone HTML table-model membership API. Invoking formatting
  or layout while constructing styles would also introduce a dependency cycle.
- Normal HTML input can acquire implied groups and reprocessed table structure
  (`source/src/html-tables.ts:292`); orphan table tags can be ignored
  (`source/src/html-tables.ts:176`). Inspect the constructed DOM, not substrings
  in the source markup. DOM-created malformed structures, display changes,
  template boundaries, and detached cells need explicit membership decisions
  based on missing normative material before broad support is claimed.

### Bound work and invalidate ownership/value state

- Charge the complete raw value length plus a fixed operation before parsing,
  following `source/src/styles.ts:1120` and the existing `maxWork` charge at
  `source/src/styles.ts:1005`. Charge ownership traversal and each of the four
  applications before creating unbounded derived state; `apply` itself does
  not debit work. Charge invalid, hidden, and author-overridden raw inputs too.
- Parse once per owning table per refresh. Do not repeat full descendant
  queries for each table, climb the full ancestor chain separately for every
  cell, or cache arbitrarily large raw strings. Prefer a bounded ownership
  traversal/metadata map once the HTML membership rules are established.
  Keep existing DOM, style, and table capacities; table placement already has
  bounds in `source/src/table-slot-placement.ts:3`.
- `source/src/styles.ts:939` invalidates on ordinary attribute and structural
  revisions. Table attribute writes/removals journal attribute changes at
  `source/src/document.ts:1643` and `source/src/document.ts:1752`.
  Any new owner/value map must be rebuilt or correctly invalidated for changing
  the table hint, removing it, moving cells/rows between tables, adding nested
  tables, and modifying author styles. Do not persist it across the existing
  cache-clear or close boundaries, or bypass the journal for hint application.

### Keep geometry consumers and unrelated guards intact

- Once correct padding reaches the cell's computed box, current layout already
  consumes its edges. `source/src/table-structure.ts:164` adds horizontal padding
  to intrinsic contributions; `source/src/table-layout.ts:436` and
  `source/src/table-layout.ts:662` consume vertical padding. This is source
  analysis only, not a measured geometry result.
- `source/src/table-collapsed-formatting.ts:26` copies the existing cell box while
  replacing borders; only the table root has padding zeroed. Do not accidentally
  apply the cell hint to that root or duplicate padding during collapsed layout.
- The retained guard is at `source/src/formatting-tree.ts:668`. Exempt only the
  specifically implemented HTML-table `cellpadding` behavior, including
  recognized parsing failures once their no-hint behavior is covered. Do not
  suppress `cellspacing`, `rules`, `frame`, `background`, generic presentation
  hints, foreign/layout errors, or unsupported role attributes.
- `source/src/html-background-color-layout.test.ts:544` currently expects a
  guard for `cellpadding="legacy"`. A future scoped feature update will need
  to replace that now-obsolete expectation with an explicit invalid-value
  no-hint/default test, retaining every unrelated guard assertion. Do not rewrite
  the historical baseline or weaken its recorded failure.

## Proposed bounded next-task tests — not authored or run

### Canonical baseline first

Use a small ordinary HTML table with `cellpadding="5"`, one `td`, one `th`,
and no other legacy attributes or author padding. Query the native computed box
and assert each cell's four sides is `5px`. Static tracing of commit `fa49059`
predicts its existing `1px` defaults instead; record that actual failure in the
next authorized source task. This style-only baseline isolates missing behavior
from the separate formatting guard. Do not claim that baseline was run here.

Then compare the future implementation against a CSS-only control applying
`padding:5px` to precisely those cells, with the same table, text, and fixed
viewport. Propose box/content bounds, raster equality, and hit ownership checks,
but establish actual expected measurements only during authorized validation.

### Focused coverage matrix

1. Parser: the prefix/sign/zero/error cases above, leading ASCII whitespace,
   NBSP and other non-ASCII lookalikes, long small values with leading zeros,
   oversized magnitudes, and full-raw-work accounting. Separate mathematical
   parse expectations from resource-limit policy.
2. Cascade: each physical side overridden as the FIRST author declaration under
   `*` and supported zero-specificity selectors; shorthand and individual sides;
   inline/important; `0`, `revert`, `initial`, `unset`, `inherit`; resolved and
   invalid-at-computed-value-time variables. In particular catch the -2/+index
   left-side trap, rather than testing only selectors with nonzero specificity.
3. Ownership: `td` and `th` in ordinary body/header/footer groups; implied tbody;
   sibling tables; nested table with no hint, a different hint, zero, and an
   invalid hint. Keep unresolved malformed/model cases separate until the linked
   HTML table algorithm is available; do not encode guessed foreign-browser
   results as oracles.
4. Eligibility and guards: HTML versus SVG/MathML namesakes; CSS-only cells and
   non-table `cellpadding`; table `cellpadding` alone versus combinations with
   `cellspacing`, `rules`, `frame`, and `background`; unchanged other guards.
5. Mutation: set 5→2→0→invalid→remove, author side override→remove, replacement
   stylesheet, move a row between differently padded tables, and insert/remove
   a nested table. Repeated reads must preserve source attributes, revisions,
   references, and mutation journals.
6. Layout controls: separate and collapsed tables, empty cells, one bounded
   rowspan/colspan fixture, nested tables, captions/following flow, and the
   previously fixed collapsed-rowspan paint/hit regression. Compare to exact
   CSS controls without assuming a new paint-order repair is necessary.
7. Capacity: a small fixed many-cell fixture, a fixed nested fixture within
   existing limits, and exact/one-below `maxWork` cases. Verify fail-closed errors
   and recovery after removing an over-budget attribute. No live/socket/SafeJS
   cases, arbitrary benchmark sweep, or raised limit is proposed.

After focused coverage, the parent/source task should select the explicit native
manifest scope, preserve original failures, and independently authorize and run
the isolated build/strict/format/native gates. No native-suite pass would itself
establish Libpng replay or live acceptance.

## Missing normative material and handoff

- **Blocking general ownership evidence:** match 5 links to
  `tables.html#concept-cell` and `tables.html#concept-table`. `tables.html` was
  not one of the two retained bodies. Neither the extracted paragraph nor the
  current CSS table model supplies the linked HTML table-forming algorithm.
  General malformed-source/DOM, ownership, and CSS-display edge-case claims
  remain unresolved. A later separately authorized research task or a supplied
  trusted capture is needed; this task did not fetch it.
- **External definitions:** match 7 links to Infra's ASCII whitespace/digit and
  code-point collection definitions. The algorithms name these primitives but
  their external normative definitions are not present in the retained pair.
- **External CSS rules:** detailed padding applicability, the CSS table model,
  complete cascade/revert rules, and implementation numeric range behavior are
  not fully established by these two HTML sections. Current source behavior and
  proposed compatibility tests must not be mislabeled as newly captured CSS
  normative evidence.
- **Obsolete authoring attribute definition:** `obsolete.html#attr-table-cellpadding`
  is linked but uncaptured. The retained rendering behavior is available; the
  obsolete authoring-conformance material is not. Do not confuse strict authoring
  syntax with the permissive rendering integer parser.

The available evidence is sufficient to identify the intended four cell-padding
hints, non-negative integer-prefix parsing, the existing 1px UA default, the
specific cascade-order hazard, and the required bounded integration points.
It is not evidence of implemented support, passing new tests, general HTML table
membership conformance, a completed live/replay gate, or retroactive approval of
the earlier self-directed harness correction. The parent verifies and integrates.
