# Native HTML table cell padding

## Verified result

The native isolated gate passes **13,446 tests, zero failures, two unchanged
exclusions**. This adds **220 cases**: 154 parser/ownership, 62 integration and
four canonical geometry/paint/hit cases. Focused validation passes 1,181 tests
across 22 suites. Full gate UTC: **2026-09-12T12:46:46.521Z–2026-09-12T12:49:39.170Z**.

The gate has 256 selected suites, 255 strict roots and 650 clean manifest
entries. Build, strict type checking, existing formatting and explicit native
tests pass. This is not a live website, credential, device, TTY, real SafeJS or
challenge acceptance result. No dependencies or foreign browser engines added.

## Behavior

HTML table cellpadding now supplies four zero-specificity author-origin padding
hints to its HTML td/th cells. Each side enters the existing cascade separately,
before ordinary author rules. Universal selectors, side and shorthand overrides,
inline/important declarations, variables and CSS-wide values retain precedence.
The existing HTML-cell UA padding remains 1px when no valid hint applies;
initial/unset and revert keep their distinct existing behavior.

The integer parser skips only ASCII whitespace, accepts an optional sign and
an ASCII digit prefix, and ignores the remaining suffix. Zero and negative zero
produce 0px; negative nonzero and invalid inputs produce no hint. Thus a decimal,
exponent or percent suffix does not become a fractional, exponential or percentage
padding value. Long leading-zero inputs are not rejected by an arbitrary new raw
length cap. Positive integers beyond safe numeric precision fail explicitly with
resource-limit rather than rounding, clamping or silently becoming invalid hints.
Existing used-layout length limits remain enforced.

Cell ownership follows the HTML table-model source: a td/th is a direct child of
tr; the row is a direct table child, or a child of a direct thead/tbody/tfoot.
Every role is namespace checked. Multiple groups, nested tables and DOM moves are
covered; arbitrary ancestor searches, CSS-created cells, anonymous wrappers,
foreign lookalikes and intervening elements do not acquire the hint. CSS display
and visibility do not redefine the HTML ownership predicate.

Only the recognized HTML-table cellpadding guard is removed. Cellpadding on
other roles, cellspacing, frame, rules, background and unrelated hints remain
guarded. This does not implement the entire HTML/CSS table model.

## Bounds and mutation

The existing pre-order DOM traversal parses each table value once per refresh.
Raw input length plus one is charged before parsing, including ignored or
overridden values. The call-local table map is bounded by existing nodes;
ownership uses at most three charged parent reads, with no ancestor walk or
formatting/layout recursion. Each side application is charged. No hint map
survives refresh/close. Attribute changes, row/cell moves, nested owners and
stylesheet replacement exercise the existing invalidation lifecycle.

Review caught an introduced callback mismatch: ownership called charge without
an argument, but the initial integration required an amount. That made work NaN,
which invalidated selector budgets. The charge callback now defaults to one.
Finite-work, exact formatting-profile, exhaustion and recovery tests preserve
this regression coverage; it was repaired before this release.

## Native standards evidence

The prior retained rendering/integer investigation is preserved in
HTML-CELLPADDING-INVESTIGATION.md. Its missing table-membership source was fetched
separately using this repository's committed 13226 NodeNetworkTransport:

- URL: `https://html.spec.whatwg.org/multipage/tables.html`.
- Supervisor UTC: 2026-09-12T12:22:53.912Z–2026-09-12T12:22:54.060Z.
- One GET200, 32,212 encoded / 254,858 decoded bytes, no redirects, mocks,
  sessions, scripts, subresources, credentials or new host.
- Body SHA256: fb26736819aaa873821f4e0322a0e3c96b884737541f1956eea1739be058d0c4.
- Native parser/DocumentQueries then extract four bounded contexts offline,
  including the complete table-forming and row-processing algorithms.
- The 15-entry spec ledger is 0c880e443da24eee88988e53f896370f032429992e328c8da4e35e121f2507d7; release receipts,
  1148 source / 1964 compiled files and eight actual Git inputs were checked.

Only this independently captured native request is counted as browser evidence.
The parent extraction uses kernel socket/socketpair denial, not a mocked parser.

## Validation history and limits

The unchanged canonical baseline on old 13226 has one CSS-control pass and three
HTML width-guard failures. After repair, the same formatted fixture bytes pass:
100px cell width, exact 5px/0px content offsets and heights, native red/green
pixels, padding/content hits, unchanged attributes and DOM revision.

- baseline: 1 passed / 3 failed.
- baseline01: 1 passed / 3 failed.
- fixed00: 1048 passed / 61 failed.
- fixed01: 1048 passed / 62 failed.
- fixed02: 1048 passed / 62 failed.
- fixed03: 1103 passed / 7 failed.
- fixed04: 1111 passed / 0 failed.
- fixed05: 1181 passed / 0 failed.

Failed runs, the initial formatting-only baseline, static finding and corrected
test assumptions remain in the private work directory. Three older negative
tests retain their case counts while recognizing supported cellpadding and
keeping unsupported cellspacing coverage. No old live report is rewritten.

Collapsed-table authored padding may compute to 7px while used table padding is
zero; tests distinguish those values. Percentage table widths still hit the
existing cycle-resolution guard in both hinted and CSS-only controls. Separate
50vw coverage verifies viewport reflow without claiming that gap is solved.
The new libjpeg-turbo live flow still fails float/table coordination on 13226;
this feature does not claim to repair that independent limitation.

Artifacts: `node_modules/.cache/native-validation/html-cell-padding-work-september12`
and `node_modules/.cache/native-validation/native-html-cell-padding-september12-round01`.
The gate's commit-verification artifact records the eventual source commit.
Fresh Libpng captured replay/live acceptance after this release remains separate;
eight cellpadding guards are targeted, but other Libpng guards remain. The full
browser goal and research/provider/passkey/device/TTY/SafeJS/challenge gates stay
open in TASKS.md. Pre-existing uncommitted work is preserved; nothing is pushed.
