# Cached native block-alignment source confirmation

## Result and provenance

One offline native parse on **September 12, 2026, 14:37:52.834–14:37:53.170
UTC** found both requested headings and extracted their bounded contexts.
This is source research for real HTML button descendant work, not rendering
implementation or validation. No source was refetched and no latest-source
claim is made.

The public W3C CSS Box Alignment Level 3 source is the unchanged body described
in `GRID-ALIGNMENT-NATIVE.md`: original native capture **September 11, 2026,
13:56:55.074–13:56:55.367 UTC**, one HTTP 200, **574,165 decoded bytes**.
The original URL was `https://www.w3.org/TR/css-align-3/`.
The body remains at
`node_modules/.cache/native-validation/native-alignment-spec-research-september11/response-1.body`,
SHA-256 `7361249cbb73d90e811e6eb7f8cd5bc4de5bbb81c2a7add6d1cbcb9dfd800d37`.
No protected heading-source payload was used.

The new reader is the native `parseHtmlDocument` / `DocumentQueries` implementation
in `native-request-start-pacing-september12-round00/snapshot01/dist/src`, pinned
Node **22.22.0**, committed release
`e02ebaf4365c5e7a534cc08f4849795d58e391d8`. Its **13,588 passed / 0 failed / 2
excluded** gate is existing release evidence, not a new test run. Five snapshot
inputs are linked to eight captured, independently hash-checked Git objects
(commit, root tree, source tree and five blobs); Git collection was read-only,
outside the kernel seal. The working checkout was not used as the parser runtime.

## Newly observed sections

Native `h1,h2,h3,h4,h5,h6` query plus native text access found **76 / 128** allowed
heading candidates, with one rank-and-whitespace-normalized title match each:

| Selected heading | New DOM ID | Context / stopping boundary |
| --- | --- | --- |
| H3: `5.1. The justify-content and align-content Properties` | 3353 | Introduction only; 10 sibling inspections, 1,506 text code units; stops before H4 §5.1.1, ID 3602 |
| H4: `5.1.1. Block Containers (Including Table Cells)` | 3602 | Whole section; 4 sibling inspections, 1,080 text code units; stops before H4 `5.1.2. Multicol Containers`, ID 3727 |

The H3's actual text contains a newline after `5.1. `; the H4 text is exactly
as displayed. Raw heading text and every extracted sibling text are retained in
`extraction.stdout`. Old outline refs `e3221` and `e3463` are provenance only:
neither those refs nor their historical selectors selected the new DOM.
Total candidate-heading plus context text was **5,399 code units**.

### Rules and limits for button descendant work

- **Subject/container:** §5.1 aligns the contents collectively inside their box;
  subject and container use that box's writing mode. For a block container,
  §5.1.1 identifies the content box as container, all block contents as one subject,
  and the block axis for `align-content`. `justify-content` has no effect on block
  containers. This does not establish which internal box an HTML button uses.
- **Extent and fixed/auto size:** these excerpts do not define the subject's
  geometric extent calculation, descendant-margin contributions, or fixed versus
  automatic block-size resolution. They do not supply a button sizing algorithm
  or justify treating descendant content as a single text line. Those are explicit
  remaining source/implementation questions, not inferred rules.
- **Formatting context:** non-`normal` values require the block container to
  establish an independent formatting context. Outside table cells, `normal`
  behaves as start alignment. This source observation does not prove that the
  current browser establishes that context or handles its sizing consequences.
- **Baseline:** the excerpt maps table-cell `normal` through `vertical-align`:
  top/bottom/middle correspond to start/end/center, and other values to baseline.
  It does not define general baseline geometry, baseline sharing, or a button's
  baseline; the table-cell mapping must not be generalized to buttons.
- **Distribution/overflow:** for block containers, a content-distribution value
  uses its fallback alignment instead of distributing the contents. With no
  explicit overflow-position and a non-scroll block container, alignment is safe.
  Scroll-container behavior and complete fallback geometry are not established
  by these two new contexts.

## Separately retained overflow evidence

The unchanged historical `section-2.jsonl` in the original source lane has SHA-256
`202b77cf847baed32f324a5c55134ce2fbbdc0bd6b3efdf55f971ffb4e6359a3`.
Its native extraction ran **September 11, 2026, 13:57:48.537–13:57:48.670 UTC**;
this task only inspected that retained semantic JSON, never reran its extractor.

In §4.4.1.3, the default smart-overflow behavior first preserves specified
alignment, then constrains overflow into an ancestor scroll container's
unscrollable region. Crucially, UAs **without that smart behavior must use safe
alignment for `align-content` on block containers and unsafe otherwise**.
That fallback is historical retained evidence, not a third new section extraction
or a claim that smart overflow safety is implemented. Neither it nor the new
non-scroll-block rule authorizes treating every alignment or layout mode as safe.

## Isolation, integrity and handoff

New private lane:
`node_modules/.cache/native-validation/native-button-block-alignment-source-september12/`.
`execution.json` records one child, exit zero, **0.374443 seconds** wall time,
**15,939 stdout bytes / 0 stderr bytes**, and an absent process group after exit.
The existing `grid-placement-worker-september11/sealed-exec.py` installed kernel
socket/socketpair and related network-syscall denial before exec; the child
observed seccomp mode 2, one added filter and `NoNewPrivs=1`. Private HOME/TMPDIR,
`/dev/null` stdin and pipe outputs were used. No socket probe was attempted;
this is kernel-policy evidence, not packet capture or a syscall-attempt count.

Only parsing/query/text APIs ran: no browser session, HTTP, stylesheet/image
fetch, layout, scripts, SafeJS, alternate engine, devices, credentials or TTY.
The one-parse limit was consumed once, without retry. Limits were 2 MiB source,
30 seconds, 256 KiB combined stdout/stderr, two contexts, 512 sibling inspections
and 20,000 text code units per context, and 64,000 total output code units.
Native parser/document/query limits remained unchanged except for tightening
query results to 128; the full effective limits are retained in the output.

Before/after checks matched all **1,155 source files, 1,968 compiled files**, all
release pins/receipts, all **50 historical lane artifacts**, and **1,952
pre-existing working source/document files**. DOM revision **10,717**, **10,718
nodes**, and the full native-walk digest were unchanged after extraction; there
were zero post-parse mutation/change notifications. Query and document closed;
cached selectors, indexed nodes, document nodes and retained text all reached zero.
Document construction during parsing is not claimed to be mutation-free.

`SEAL.json`, `RECEIPTS.sha256`, `before.json`, `after.json`, `git-proof.json` and
the immutable output provide the receipts. `VERIFICATION.md` gives the sealed,
read-only offline verifier command: it checks hashes/proofs/recorded bounds and
cleanup without importing the native parser, executing Git, or using network.
Read-only discovery-path misses are retained in `setup-observations.json`; there
was no failed parse or relaxed-bound retry. The seal is an integrity manifest,
not a signature or filesystem sandbox. Main independently verifies and commits.

No production/test/manifest/`TASKS.md` or old-artifact edits, Git writes or pushes
were made. Existing browser goals and outstanding gates remain in `TASKS.md`.
No website, button-rendering, CSS-conformance, performance, passkey, credential,
SafeJS or other native acceptance follows from this bounded source task.
