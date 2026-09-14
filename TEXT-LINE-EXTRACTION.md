# Bounded native plaintext line selection

September 14 extension: `LITERAL-FEEDS.md` adds four explicitly admitted XML/feed
MIME types to the same literal-text loader. They also qualify for line selection;
this does not add XML parsing or change the historical measurements below.

The native research CLI accepts `--lines START:END`. Its purpose is to read a
small section of an already successfully loaded literal-text document without
raising extraction limits or inspecting a raw body capture as if it were native
extraction. It performs no automatic retry, pagination or alternate access.

## Interface and boundaries

- CLI endpoints are canonical positive decimal integers, without leading zeros,
  signs, whitespace, exponents or omitted endpoints. The inclusive range obeys
  `1 <= start <= end <= 2_000_001`. Duplicate flags, missing/invalid values and
  combination with `--selector` fail before session setup.
- `researchNavigation(url, reader, signal, selector, captureBody, lines)` adds an
  optional sixth argument `{ start, end }`; existing five-argument calls retain
  their behavior. `extractDocument(tree, { lines: { start, end } })` works with
  existing Markdown or JSON output. `lines` and extraction `root` cannot combine.
- Only unchanged native text-loader documents qualify: `text/plain`,
  `application/json` and the loader's supported `application/*+json` MIME types.
  A plain-looking HTML `pre`, HTML source, SVG, JSON object path and arbitrary DOM
  are not substitutes. The loader records text-node identity and revision in a
  private weak association, removed on close, without retaining a duplicate body.
  Changing the tree after loading invalidates line eligibility, even if reverted.
  Eligibility also requires exactly document → native `pre` → registered text:
  initializer-created siblings or wrappers cannot leak into selected content.
- Lines are numbered in decoded literal text before extraction normalization.
  CRLF is one delimiter; lone CR and LF also delimit lines. A selected terminated
  line includes its original delimiter. Empty input has one empty line; a trailing
  delimiter introduces an empty final line. Out-of-source endpoints fail rather
  than clamp. Existing extraction normalizes line endings and escapes control
  characters/Markdown; output is not a byte-for-byte source archive.
- The scan is linear in loaded source length, bounded to 2,000,000 UTF-16 code
  units, without allocating a split-lines array. A small selected range cannot
  bypass full network, decoding, reader or document admission. The reader's
  existing non-HTML limit can be lower than this scan ceiling. A very long line
  or wide selection can still exceed output limits.
- Existing extraction byte, node, depth and intermediate limits apply, including
  serialization and metadata overhead. The CLI retains its 256,000-byte output
  limit. A line range is not an increase in output, source or network budget.

## Reporting and trust

The navigation report's selection is `{ method: "text-lines", start, end }`.
A completed extraction adds `textSelection` with the same fields plus
`totalLines`, `sourceCodeUnits` and `selectedCodeUnits`. Counts describe the
decoded source and selected span before normalization/escaping. No selected
content is put in selection metadata. Selection does not mutate the document
or the primary response; an opt-in body capture still retains the full response
with its own unchanged privacy/size warnings.

The existing bounded pre-selection document diagnostic also runs for line
selection. A challenge in its inspected prefix is not hidden by choosing a
later line. This is not full-document challenge detection: the diagnostic has
its existing bounded scope, and a null classification does not prove safety or
access authorization. Header/status checks, stop/handoff behavior and final
selected-output classification remain intact.

Every report remains `partial: true`; `contentSuccess` stays null or false.
`extracted-unverified` means a bounded partial extraction was produced, not that
the source is true, complete, accessible in a full browser or safe to execute.
Keep raw source and extracted prose untrusted. HTML source line mapping, rendered
line selection, search, resumable cursors, grapheme indexing and general DOM
mutation tracking for source offsets are not implemented.

## Validation record

Implementation and validation evidence is kept separately under
`node_modules/.cache/native-validation/text-line-extraction/`, with a clean
HEAD-plus-increment snapshot at sibling `text-line-extraction-integrated/`.
Validation on September 5, 2026:

- **174 new cases pass:** 63 extraction and 111 CLI/transport-fixture cases.
  The complete eight-file selected matrix is **580 passed, three failed**, zero
  skipped/todo, not an all-green run. The three unchanged selector assertions
  reject the extra resource-limit diagnostic already present on HEAD. A fresh
  baseline run reproduces exactly those three failures; 115 other baseline cases
  were unselected, not passed. No unrelated assertion was weakened or repaired.
- Initial native run: 579 passes/four failures. The new incomplete-loader fixture
  mistakenly allowed enough text budget; changing its synthetic budget from 12
  to 9 triggers the intended post-initialization failure without changing code.
  The other three failures remain as described. Initial logs are retained.
- Clean builds and strict new-test types pass; six-file Biome passes. Initial
  formatting diagnostics are retained. The fixture-only correction does not
  change the four compiled feature JavaScript hashes used by the offline probe.
- A separately authorized offline probe verifies the saved DOM capture, loads it
  through the native research loader and extracts lines 5568–5572. Full extraction
  still fails its original 256,000-byte bound. Source size is 476,405 decoded bytes,
  476,283 UTF-16 units and 11,795 lines; the selected span is 259 units. Probe UTC
  interval: 13:23:34.955401812–13:23:35.039591181. No new request or SDK runs.
- A separately authorized **fresh native browser request** receives the DOM
  source at **13:25:32.086 UTC**, HTTP 200, one real request, zero redirects,
  exit 0, empty stderr and closed transport. `--lines 5494:5520` selects 1,407
  source units and returns `partial:true`, `contentSuccess:null`,
  `extracted-unverified`. It uses this increment's clean compiled CLI, not raw
  capture inspection. The full body happens to hash identically to the old
  capture; the new receipt/time and outcome are separate. Main remains mutable.

These selected synthetic suites are not live requests; the offline probe is not
new retrieval. Neither replaces the original September 5, 2026 12:52:51.535 UTC
failed extraction. Exact authorizations, hashes and outcomes are kept separately.
No SafeJS, passkeys, vault/device, identity or previously denied probe is part of
this increment. Full source extraction, foreign HTML parsing and general browser
parity are not claimed.
