# Native stylesheet imports

## Status and ownership

Added September 11, 2026. The bounded parser now feeds a native import graph,
document loading, and the existing cascade. The clean native gate passes10335
tests with0 failures and2 existing exclusions, including212 new import cases.
No whole-page or live import acceptance is inferred from these synthetic tests.

## Loading and cascade

`loadStylesheetImports` retains original source text and immutable nested sheet
occurrences. Import addresses resolve against the importing response's final URL;
inline roots instead use their captured document base. Requested and final
ancestor URLs detect cycles without fetching known back edges. Inline document
URLs are not treated as fetched CSS ancestors. Independent sibling occurrences
remain independent; this helper adds no URL-only HTTP cache or retry behavior.

The document loader uses the policy-aware stylesheet transport for imports,
including its existing mixed-content, redirect and resource checks. CSP contexts
remain fail-closed for new import requests. Missing policy transport is reported,
never silently downgraded to the legacy URL-only callback. Strict successful
status, explicit text/css MIME and body limits apply before child decoding.
Parent integrity is checked before any of its imports are requested; its hash
does not authenticate transitively imported resources. Parent encoding supplies
the child's environment encoding. Imports use no-cors/include rather than
inheriting an HTML link's crossorigin state. Primary-source verification is
recorded separately from execution evidence.

`DocumentStyles.setStylesheetSource` accepts only frozen source graphs produced
by this loader, authenticated by private weak metadata. It accounts for all
retained source occurrences against the existing aggregate text/sheet limits.
Imported rules enter at the original import position, preserving cascade order
and conjunctive media conditions without concatenating or rewriting sheets.
Viewport changes reevaluate the retained media conditions. Failed child loads
retain an explicit diagnostic rather than erasing later imports or parent rules.
Cycles contribute no rules. Changed inline text/base or link URL cannot apply a
stale loaded graph; automatic dynamic reloading is not implemented.

Graph limits are64 sheet occurrences,64 import edges,524288 total UTF-16 code
units,16 import levels and4M work units, with caller reductions. Document loading
also respects the existing32-sheet storage limit and a64-import-request ceiling.
Cancellation settles even if a supplied fetch callback remains unresolved;
late callback settlement cannot publish a graph after abort. Decoded URL
controls are rejected before URL normalization can erase them. Resource
exhaustion is not a partially successful graph. CSS rule/declaration/work
budgets remain shared across imported rules.

Unsupported layers/supports imports, CSS @charset byte-sniffing, permissive MIME
recovery, CSP enforcement and complete referrer/Fetch/CSSOM behavior remain
explicit limitations. Import loading does not implement background images or
make unrelated CSS/layout diagnostics advisory. The original W3C page still has
independent full-page acceptance gates.

## Contract

`parseCssImports(source, options?)` returns a deeply frozen object with:

- `imports`: frozen `{start, end, url, media}` entries in source order.
- `issues`: a frozen diagnostic-count record.
- `metrics.work`: reserved deterministic work units, not elapsed time or an
  instruction count.

`start` is the original `CssScanner.position` immediately before reading a
top-level prelude, including its leading whitespace/comments and an initial
BOM when present. `end` is the position just after that import's semicolon.
Charset statements and skipped blocks advance that same original-source
scanner. The source is never rewritten, concatenated with another stylesheet,
or stripped of its import rules. Parent can associate imports with its rule
scanner by these exact source positions.

`url` is the decoded CSS string or `url()` content, never a network-resolved
address. Both quote styles, case-insensitive and escaped identifiers, CSS hex
escapes, escaped characters, string line continuations, and CSS invalid-scalar
replacement are supported. Empty and whitespace-only decoded URLs are rejected.
Raw newlines in strings and invalid unquoted URL tokens are rejected. Comments
are accepted as token trivia; inside quoted strings and unquoted URL-token
content, comment-looking text remains literal URL content. Whitespace between
`url` and `(` is not a function token. A missing closing delimiter or semicolon
never produces an invented fallback import.

`media` is the trimmed original suffix, preserving comments and case. A suffix
consisting only of comments/trivia becomes the empty string. The existing
`compileCssMedia` validates the suffix; this helper does not evaluate a viewport.
Any unsupported or invalid branch rejects the whole import, even if another
branch could match. Supported but currently nonmatching media such as `print`
is still returned for parent-owned evaluation. This is deliberately more
conservative than browser recovery, not an extension of the native media grammar.

Only top-level imports before non-charset/non-import rules are eligible.
Charset statements do not reopen an already closed import window. This helper
does not implement encoding detection or validate charset encodings. Malformed
semicolon-terminated imports do not block later otherwise eligible imports.
Blocks are skipped with the existing `CssScanner`; nested imports are never
returned or individually diagnosed. An import with a block is malformed and
closes ordering. Unterminated strings/comments use the shared scanner's recovery,
which may consume later text; the helper never guesses additional imports from it.

Simple `@layer` ordering statements and `layer`/`layer()`/`supports()` import
modifiers are unsupported. A layer statement closes the import window instead
of granting a partial approximation of layer ordering. Unsupported imports
are never returned; parent must not fetch entries reconstructed from issues or
raw syntax rejected by this helper.

## Diagnostics

- `invalid-css-import`: malformed or empty URL, invalid string, non-semicolon
  terminator, or incomplete import.
- `late-css-import`: an import encountered after the permitted ordering window.
  Its URL and media are not parsed; this takes precedence over malformed syntax.
- `unsupported-css-import-modifier`: the first suffix identifier decodes to
  `layer` or `supports`, including escaped or differently cased spellings.
- `unsupported-css-import-media`: the existing media compiler rejects or does
  not support any part of the suffix, including stray closing tokens and extra
  strings. No viewport or fallback fetch is attempted.
- `unsupported-css-import-layer-order`: a top-level `@layer` statement cannot
  participate in the supported import ordering profile.
- `unterminated-css-comment`, `unterminated-css-string`: forwarded shared
  scanner diagnostics, including those in skipped blocks.
- `unterminated-css-rule`: a skipped top-level block has no closing brace.

## Limits

The optional `maxCodeUnits`, `maxImports`, and `maxWork` must be positive integers
no greater than their defaults: 524,288 source code units, 64 retained imports,
and 4,000,000 work units. Explicit `undefined` uses a default. Invalid source,
options, or limit types throw `AgentBrowserError` with `invalid-input`.

Source length is checked before scanning. Six work units per source code unit
are reserved before entering the scanner for its traversal and bounded token
processing. Each media compilation additionally reserves
`media.length * (2 * cssMediaLimits.maxDepth + 8)` units before invoking the
existing compiler. Thus even skipped/invalid source consumes a bounded up-front
reservation, and many individually valid media queries can exhaust total work.
The source and work limits apply independently.

Decoded URL and retained media are each capped at 16,384 UTF-16 code units.
Only returned imports count toward `maxImports`; source/work still bound invalid,
nested and late input. Shared scanner nesting and media compiler limits also
apply. Exhaustion throws `AgentBrowserError` with `resource-limit`, never a
partially successful result that the caller could fetch.

## Fixtures and outstanding gates

The tests include the original captured W3C launcher stylesheet shape:

```css
@import "base.css"; body{background-image:url(https://www.w3.org/StyleSheets/TR/2016/logos/WD)}
```

Only `base.css` is an import; background image discovery is separate. This fixture
is not a new website capture.
The authored tests also cover token/escape/trivia forms, offsets, ordering,
unsupported syntax, malformed input, immutable results and budget boundaries.
All95 parser,64 graph and53 document integration cases pass. They cover original
source positions, independent occurrences, nested media, actual visibility
cascade, final-URL bases, inline current-document imports, cycles, failed loads,
CSP/policy transport guards, SRI ordering, MIME/encoding, mutation invalidation,
shared budgets, cancellation and immutable graph provenance.

## Validation evidence

Private work lane: `node_modules/.cache/native-validation/stylesheet-import-work-september11/`.
The first9-file parser/adjacent run passes613 tests. The first11-file graph and
loader run preserves725 passes and5 failures: unresolved callback cancellation
and four decoded-control URL cases. The fixes retain those regression tests;
`fixed04` passes730/0 across11 files. The preparation-only `fixed03` is not a
test result. All failed and earlier evidence remains unchanged.

Release gate: `node_modules/.cache/native-validation/native-stylesheet-import-integration-september11-round01/`.
At21:39:20.369–21:41:39.092 UTC on September11,2026, production build, strict
checking172 roots, formatting8 owned files and10335 native tests pass. The173
selected files come from a clean577-entry manifest. The same2 pre-existing
exclusions and snapshot.test.ts strict omission remain; this is not an entire
repository typecheck or every-manifest-test claim.

The audit verifies1064 source inputs,1908 compiled files,1055 unchanged tracked
inputs,8 owned source/test files plus the manifest, and both pre-existing dirty
production residuals independently excluded and preserved. Source ledger SHA256:
`4d5d1bea5c0346fce9aa87a442d94524fed0385103614b428db3b95f5d3633b6`;
compiled ledger:
`32ab79439722ef329c59ab5c60ffa9172b8fd44f369ddbb0a3387db0e3280232`.
The20 gate receipts are sealed. No network, credential, device, real TTY or SafeJS
probe acceptance is derived from this isolated gate. Complete original-page
geometry/click and separately authorized live import checks remain outstanding.
