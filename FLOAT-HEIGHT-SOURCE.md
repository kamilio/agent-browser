# Native offline height requirements — September 12, 2026 UTC

## Scope and result

Fresh **offline** native discovery and three heading-section extractions on
audited release **11080**, commit `fb4ea241778b51c0125d315dd839a0fe6bb81e03`,
establish the height, height-constraint, and line-box rules below. There were
**zero navigation, network, socket, or transport calls**. This is not a new
website visit, a copied earlier extraction outcome, or a float implementation
acceptance result.

Input is the intact accepted CSS 2.2 body previously acquired on September 11:
`node_modules/.cache/native-validation/native-float-sizing-source-september11/response-1.body`,
87,037 decoded bytes, SHA-256
`254bb76539cdde3070f7b0821dc9154efdc9b332a89e532359c6a8fd9d9dc732`.
Base URL: `https://www.w3.org/TR/CSS22/visudet.html`. Its original response
metadata, receipt, sizing report, and ledger remain unchanged. Archived response
data went directly to the native offline loader, not through a mocked HTTP
transport. The historical HTTP 200 is input provenance, not a new response.

New lane: `node_modules/.cache/native-validation/native-float-height-source-september11/`.
The lane name is retained as authorized; **execution actually occurred on
September 12, 2026 UTC**. `AUTHORIZATION.md`/`PROMPT.md`, `SOURCE-PROVENANCE.json`,
`HEADINGS.json`, and `SELECTIONS.json` retain authorization, input pins, current
native heading discovery, and chosen selectors.

| Fresh artifact | Current discovered heading/reference | Selected nodes |
| --- | --- | ---: |
| `section-1.jsonl` | §10.5 Content height, `e1706` | 169 |
| `section-2.jsonl` | §10.7 Minimum and maximum heights, `e2309` | 288 |
| `section-3.jsonl` | §10.8 Line height calculations, `e2597`; includes §10.8.1 | 592 |

Rules below are direct source findings unless marked **inference**. Semantic
references refer to these accepted section artifacts. Earlier reports remain
historical; resolution of their height-related gaps is recorded only here.

## Height: percentages, auto, and containing blocks

Section 1 (`e4908`–`e5036`) gives `height: <length> | <percentage> | auto |
inherit`, initially `auto`, not inherited. It specifies **content height**,
excluding non-replaced inline elements, table columns, and column groups from
its applicability. Computed value is the specified percentage/auto or an
absolute length. Negative height values are illegal.

- A length supplies the content-area height. The section's fixed-height
  example expressly allows contents to overflow according to `overflow`;
  explicit height is not automatically enlarged to fit content.
- Percentage height uses the generated box's **containing-block height**,
  not invariably the DOM parent's height.
- If containing-block height is not explicitly specified, meaning it depends
  on content, and the element is **not absolutely positioned**, calculate
  **used height as if `auto` were specified**.
- Root percentage height refers to the **initial containing block**.
- For absolutely positioned elements with a containing block based on a
  block-level element, the percentage uses that element's **padding-box height**.
- The containing-block height of an absolutely positioned element is independent
  of the element's own size, so its percentage height can resolve. It may still
  require processing elements later in the document before that height is known.
- Auto height depends on other properties and the subsequent sizing rules;
  this is not a universal zero-height or fill-available-height instruction.

**Inference:** a float that is not absolutely positioned remains subject to
the content-dependent containing-height fallback. Becoming a float/BFC root
does not by itself supply a definite percentage-height basis. Used-as-auto
does not replace the actual computed percentage with `auto`.

## Min/max-height and used-value ordering

Section 2 (`e8705`–`e8885`) establishes:

| Property | Values in this CSS 2.2 text | Initial |
| --- | --- | --- |
| `min-height` | length, percentage, inherit | 0 |
| `max-height` | length, percentage, none, inherit | none |

Neither is inherited. Negative values are illegal; `none` means no maximum.
Computed values retain specified percentages or absolute lengths, and `none`
for max-height. Both exclude non-replaced inlines, table columns, and column
groups. Their effects on tables, inline tables, cells, rows, and row groups
are explicitly **undefined in CSS 2.2**.

Percentages use containing-block height. If that height depends on content
and the element is not absolutely positioned, treat a percentage minimum as
**0** and a percentage maximum as **none**. This is different from ordinary
percentage height's used-as-auto fallback.

The ordered algorithm (`e8887`–`e8950`) is:

1. Calculate tentative used height without min/max-height under the normal
   height/margin sizing rules.
2. If it exceeds max-height, rerun those rules with max-height substituted
   for height.
3. If the result is below min-height, rerun with min-height substituted.

**Inference:** a minimum larger than the maximum wins under this ordered
algorithm; do not reorder the maximum check after the minimum check. For
example, an ordinary 200px tentative height with max-height 100px and min-height
150px resolves through 100px to 150px, subject to the applicable sizing category.

The source explicitly preserves the **real computed height**. It specifically
says the substitutions do not change margin collapsing, which depends on that
computed value. Used-height constraints must not mutate computed style and then
recompute collapsing from the substituted value.

For replaced elements with **both width and height computed as auto**, §10.7
instead directs the reader to the min/max-width algorithm for joint used width
and height, then applies height/margin rules using those results as substituted
values (`e8956`). That cross-reference is freshly extracted; its target table
was established in the separate sizing report, not re-extracted here. Do not
apply independent height clamping to every replaced-element case.

## Line boxes, struts, and leading

Section 3 (`e12175`–`e12219`) determines a line box in three stages:

1. Determine each inline-level box's contributing height. Replaced elements,
   inline-blocks, and inline-tables contribute their **margin-box height**;
   inline boxes contribute their **line-height**.
2. Vertically align boxes according to `vertical-align`. Top/bottom-aligned
   boxes must be aligned to minimize line-box height. With sufficiently tall
   boxes, multiple solutions exist and the line-box baseline/strut position
   is explicitly **undefined** by CSS 2.2.
3. The line height spans the uppermost contributing top to the lowermost
   contributing bottom, **including the strut**.

Empty inline elements still generate inline boxes and participate in the
calculations; absence of text alone does not justify dropping them.

For a block container with inline-level content, its line-height supplies a
minimum above/below-baseline contribution as a hypothetical **zero-width inline
box with the container's font and line-height**: the strut (`e12420`). A line
therefore cannot be measured solely from the visible children or their largest
font size. This minimum is not a complete rule about whether an empty line box
exists; the earlier formatting source covers that separate question.

In §10.8.1 (`e12227`–`e12324`), font metrics give ascent `A` and descent `D`.
Leading is `L = line-height - (A + D)`, apportioned as half above and half below:
`A' = A + L/2`, `D' = D + L/2`. **Leading may be negative**. Glyphs align by
their relevant baselines; a glyph-less inline uses the first available font's
metrics for its invisible strut. Child elements do not change the enclosing
inline box's own line-height contribution; they contribute their own boxes.

Non-replaced inline margins, borders, and padding do **not** enter line-box
height calculation, although they are painted and may extend into adjacent
lines. The text recommends document-order painting for that case. It also
leaves the exact inline content area undefined, so background/border extents
may differ between UAs. This is distinct from margin-box contributions of
replaced elements and inline-blocks.

### Line-height values and inheritance

Line-height is inherited, initially `normal`, accepting normal, number, length,
percentage, or inherit. Length/percentage compute to an absolute value;
normal/number remain as specified. Negative numeric, length, or percentage
values are illegal (`e12340`, `e12446`).

- A unitless number's used value multiplies the **element's own font size**;
  the number remains its computed value.
- A percentage computes by multiplying the element's computed font size.
- A length is used in the line-height calculation.
- `normal` is a reasonable font-dependent value; the text **recommends**, not
  mandates, a multiplier between 1.0 and 1.2. Normal's computed value stays
  `normal`. With mixed fonts, the UA may use the largest font size to choose it.

**Inference:** an inherited unitless number can scale with a child's font size,
whereas an inherited already-computed percentage result is a length. The source
does not justify treating all these forms as the same inherited multiplier.

## Vertical alignment and float-exclusion implications

Vertical-align is initially `baseline`, not inherited, applying to inline-level
and table-cell elements; table meanings are separately referenced. Its percentage
uses the **element's own line-height** and computes to an absolute length.

For inline non-replaced elements, the alignment box is the line-height box;
otherwise it is the margin box. The source defines:

- `baseline`: align baselines; without a baseline, align the bottom margin
  edge to the parent's baseline.
- `middle`: align midpoint with parent baseline plus half the parent's x-height.
- `sub`/`super`: lower/raise to the parent's subscript/superscript position,
  without changing font size; exact numeric offsets are not supplied here.
- `text-top`/`text-bottom`: align to the parent's content-area top/bottom.
- Positive length/percentage raises, negative lowers; zero is baseline.
- `top`/`bottom`: align the **aligned subtree** to the line-box top/bottom.
  That subtree includes descendant inline subtrees except children whose
  computed alignment is themselves top/bottom; do not use just one glyph box.

Inline-table baseline is its first row's baseline. Inline-block baseline is
its last normal-flow line baseline, except with no in-flow line boxes or
non-visible computed overflow, when it is the **bottom margin edge** (`e12729`).

**Inference for float exclusion:** the actual aligned line-box top/bottom,
including strut and atomic inline contributions, supplies the vertical extent
needed by the previously extracted float-adjacency rule. A single fixed font
height is not a complete substitute. These extracts do not themselves prescribe
a complete iteration algorithm for mutual line-width, wrapping, and float
placement dependencies.

## Source ambiguities versus native-profile choices

Undefined/UA-dependent areas include some top/bottom-aligned baselines, inline
content-area metrics, normal line-height, font metrics and fallback, and exact
sub/super offsets. The source recommends OpenType/TrueType ascent/descent
metrics but no OS fonts or font files were probed. Any fixed bitmap metrics,
normal multiplier, or baseline convention chosen by the native profile must
be identified as an implementation choice, not falsely attributed as the only
specification result. This reader run does not measure such rendering choices.

The min/max-height note establishes a dependency on computed height for margin
collapsing; it does not supply a complete margin-collapse algorithm. General
containing-block construction, modern definite-size rules, flex/grid, shape
exclusion, pagination, scrollbar behavior, and full float layout remain outside
this evidence. No broad CSS conformance or live-page pass is claimed.

## Execution and preservation

Release metadata/pins are retained in `RELEASE.json`/`RELEASE-GO.md`, sourced
from `positioned-float-work-september11/RELEASE.md`, which supplies **no live
authorization**. Commit `fb4ea241778b51c0125d315dd839a0fe6bb81e03`, audit base
`df08ff8c9174dacd725812c9554b100fd03d7ecf`; historical 11080 passed, 0 failed,
2 excluded, 191 selected files, 190 strict roots, 588 manifest entries,
1077 source/1916 compiled ledger entries, 3 owned files plus manifest verified
against commit, and 20 gate receipts. Fresh fixture-safe executable checks
cover 376 source and 1504 compiled files; owned inputs are separately verified.
No protected fixture payload was read, and no build or gate was rerun.

Preflight UTC: **2026-09-12 00:00:56.767**. Child UTC:
**2026-09-12 00:01:05.441–00:01:05.766**. One current native heading discovery,
three section calls, **four actual document owners**, all closed with zero
remaining nodes; close instrumentation restored. Exit 0, no timeout or output
failure, absent child process group afterward. No preparation failure or
permission exception occurred in this lane.

Private empty control/runtime HOME/TMP and lane directories were **0700 from
creation**, with an allowlisted environment. Kernel seccomp and runtime guards
denied sockets/process spawning/transport use; attempts lists are empty. No
credentials, providers, SafeJS/page scripts, TTY/device, or OS-font probes.
Bounds remained 30 s plus 5 s grace, 6 MiB file/output, 12 MiB lane, 64 MiB free,
50,000 document nodes, and 4,000,000 source/response admission bytes. Native
section limits remain 256,000 extraction bytes and 327,680 output bytes.
Network pacing is inapplicable because **no network operation was permitted**.

Fresh heading discovery scanned 3184 nodes, untruncated. Discovery and sections
report `extracted-unverified`, `partial: true`, no barrier; tokenizer issues
zero. Standard semantic omission of scripts/styles remains, not full rendering.
Fresh references and outcomes are separate from the source capture's metadata.

Sizing (76-entry), formatting (74-entry), font-source (73-entry), and fresh
OpenBSD (48-entry final) seals/reports were hash-verified before/after execution
and at sealing. Their artifacts, recorded failures, and local preparation
caveats remain unchanged. Only this new report/lane were written; no production,
shared documentation, test, manifest, old evidence, or commit was changed.

| New evidence | SHA-256 |
| --- | --- |
| `HEADINGS.json` (8,165 bytes) | `481c98b70cf424046695964d2ee2dd5453f46ea7176f78c230ea2c7a739ae202` |
| `section-1.jsonl` (12,462 bytes) | `e1db6c88990c0b2cbd42bc28fbc18a0f4ae08b346fb4cf86365a7afbfdb064e9` |
| `section-2.jsonl` (19,501 bytes) | `22ddf6a1c805b2630d2c4ed844f96f8202c483aafd7db90681c5b27ef0e8b380` |
| `section-3.jsonl` (41,328 bytes) | `2c9323d754e85eeee9c512881cc0f203a05e7474e00dcb7233072a1c29291a8f` |

Original receipt SHA-256:
`7f7e42450a565b2a730982c958cd45852fc10af46bf84531529be71464ec23b0`.
`CHECKS.json` records the final named checks and capacity; `EVIDENCE.sha256`
covers this report and lane files except itself.
