# Native website testing: forty-fourth update

September 15, 2026. This increment targets missing source content rather than
formatting polish, with two new native website visits and a focused reader fix.
It supplements previous inventories; old captures/results are not relabeled.

## NVIDIA product page

One native GET at 02:49:51 UTC to
`https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/` returns
HTTP 200 without redirects. The transport reports 76,779 compressed bytes and
673,174 decoded bytes. Decoded-body SHA-256:
`d0d3abaa6660169ad17076e76fce51f3c98810861fe798b8b2b1a825e4b1ddc7`.
The gzip wire bytes are not independently retained/hashed.

Whole-page Markdown is 87,327 bytes; 49,275 precede the product H1, largely menus.
There is no `main`, `article` or `#page-content` target in this capture.
`#specs` contains an empty script-populated placeholder, but the unique static
`#specsmodal` holds the actual specifications. One socket-denied native API child
recovers its 17,259-byte Markdown and checks all **47 rows / 141 cells** against
the captured source using the independent native HTML subset. This is not an
independent web-platform parser or visual-layout validation.

The captured vendor table lists 32 GB GDDR7, a 512-bit memory interface, 21,760
CUDA cores, a 2.41 GHz boost clock and 575 W total graphics power. Those are vendor
statements, not measured hardware/LLM performance, a buying recommendation or proof
of current price/availability. Qualifications remain in the captured table.
Twenty-three keyword-matched source paragraphs occur in whole-page extraction:
ten product paragraphs, twelve menu paragraphs and one copyright paragraph.
That sample is not an exhaustive prose-completeness test. No source pre/code
elements are present, so this is not code-fidelity evidence.

Useful text is available without page scripts. However, modal/consent content,
repeated menus and unresolved price/date placeholders appear together because
the reader ignores hidden-content semantics. Multiline cells keep the documented
boundary fallback despite requested row lists. A Product JSON-LD description
is omitted with scripts; its architecture/memory facts occur elsewhere. No JSON
offer is used as a pricing claim and no linked resource is visited.
Original partial/unverified flags remain. Both children exit/reap cleanly, pinned
inputs/executable remain intact, and shared-workspace drift is separately recorded.
The original lane checks 42 artifacts:
`/dev/shm/agent-browser-nvidia-product-september15/`.

## arXiv paper and actual formula loss

One native GET to `https://arxiv.org/html/2402.17764v1` returns HTTP 200, zero
redirects and 97,824 decoded bytes. The captured title is *The Era of 1-bit LLMs:
All Large Language Models are in 1.58 Bits*. This is an observed versioned paper,
not a latest-version or experimental-results claim. Body SHA-256:
`7028228dc03d0856408671f6da41d66b208748f006c1179fcf32a9db492b7ba0`.

One admitted socket-denied native API child selects the unique `article`.
The original reader retains thirteen headings, 29 paragraphs, seven tables and
168 cells but drops **all eight explicit MathML alternatives**, six distinct
strings totaling 215 UTF-8 bytes including repeats. Captured-source comparison
identifies one affected paragraph and six affected cells, three of them empty:
the weight-rounding formula, RoundClip definition and gamma definition. Inline
quantization ranges and three `\downarrow` table-label markers also disappear.
Those contextual gaps, not a literal search alone, establish content loss.

The exact 5,437-byte “Quantization Function.” source section is separately pinned
at `article section[id="S2.SS0.SSS0.Px1"]`, with three display equations and two
inline ranges. Source MathML DOM/annotation content and the explicit alternatives
remain in the original capture; no mathematical expression or model experiment
is executed. There are no source pre/code elements. The native output remains
partial and unverified; source/method reading is not paper-results verification.
Evidence: `/dev/shm/agent-browser-arxiv-bitnet-september15/`.

## Focused reader change

An explicit, own, nonblank `math` `alttext` becomes escaped inert inline code
prefixed `MathML source: `. This restores the publisher's supplied expression
without adding a runtime dependency, guessing formulas, evaluating TeX/MathML or
parsing arbitrary annotation/hydration content. The MathML subtree and its original
IDs/classes remain omitted. No alternative inside another omitted subtree leaks
through. Existing malformed-source and source/token/depth/text/output/document/
extraction/replay limits remain active.

Optional frozen `reader.mathAlternatives` records retained element and decoded
UTF-16 unit counts. The same units are charged to `textCodeUnits`; original glyph
and annotation text still consumes its original source-processing budget. The
fixed label/markup consumes output budget. Documents without alternatives keep
the same output/report shape. Native inline-code whitespace/control handling
still applies; this is not a verbatim TeX export or rendered equation. See
`MATHML-ALTERNATIVES.md` for the precise contract.

The final frozen candidate passes **1,498 tests / zero failures across 22 files**,
including all **104 new cases**. The clean `709ad5e` baseline passes all 1,394
pre-existing cases; their names/statuses remain unchanged. Build, strict checking
of 22 roots and format/lint for three changed source/test files pass. Only the
reader loader and reader-info production modules change, with no cap or timeout
increase. The canonical native manifest grows from 856 to 857 files, separately
from three original uncommitted entries.

The first candidate passes 1,497 tests and fails one new fixture that incorrectly
expects literal attribute NUL to become U+FFFD during sanitization. Existing
attribute decoding retains that literal; invalid numeric references are a separate
case. The fixture is corrected, not the tokenizer, and both snapshots/reports are
retained. First/final candidate production compilation is byte-identical.
Validation: `/dev/shm/agent-browser-content-coverage-september15/`.

## Offline content comparison

Four actual replay CLI children and two native API children compare the original
captures using identical selectors, explicit Markdown and `--table-rows` in both
engines. All six run under socket denial and exit/reap cleanly, with zero HTTP
requests or retries. Admitted bodies are zeroed and native trees closed.

| Captured scope | Baseline Markdown | Candidate Markdown | Verified result |
| --- | ---: | ---: | --- |
| arXiv `article` | 28,586 bytes | 28,957 bytes | All eight source alternatives retained |
| NVIDIA `#specsmodal` | 17,259 bytes | 17,259 bytes | Byte-identical no-MathML control |

The paper gets three equations, two inline ranges and three arrow markers, in
source order, with no copied IDs or annotation duplication. Removing only the
new labeled code reproduces baseline non-math text exactly, globally and per
heading/paragraph/table/cell. Source comparisons also match all alternatives in
their original contexts. All thirteen headings, 29 paragraphs, seven tables and
168 cells remain; generated code has no attributes and contains only text.

Frozen source statistics are `{elements: 8, codeUnits: 215}`. The paper's reader
text charge changes 26,746→26,961, exactly +215 decoded UTF-16 units, while its
MathML subtree omission count stays eight. The no-MathML control has no optional
math record and unchanged text charge. No limits increase. NVIDIA's full API
JSON is **not byte-identical**: generated document/scope/node references differ
after the preceding paper allocates additional code nodes. All non-reference
content and other top-level metadata match; its Markdown is byte-identical.

The first local comparison helper incorrectly expects unpadded inline-code
fences. Existing Markdown output uses one space inside each fence. A separate
corrected helper fixes only those occurrence expectations; original helper and
failure remain, with no native child or request repeated. Both original source
seals remain intact. The final proof checks 235 artifact files plus its manifest
through 236 checksum entries. Evidence:
`/dev/shm/agent-browser-math-alternative-proof-september15/`.

This increment totals two fresh HTTP GETs and eight offline native children:
six proof children plus the two original website inspections. These are source
content checks, not math evaluation, code execution, hardware benchmarks or
measured runtime acceleration. Native partial/unverified flags remain unchanged.

## Outstanding scope

The browser goal remains active. Hardware/benchmark/Astra/Poe research is not
complete. Product-page focus/metadata, additional sites, JS-only/iframe content,
doctype provenance, visual/interactive fidelity and a full native release remain
open. Older table-source/body-capture failures and ARIA-test lint are outside this
selection, not repaired or hidden by its green result. SafeJS, service/socket,
real TTY/PTY, credentials and passkey-device gates remain separate. No restrictions
are bypassed and no new runtime dependency or alternative browser is introduced.
Original uncommitted work and historical evidence remain preserved; no push.

After the focused commit, byte-checked durable copies of the content-coverage,
NVIDIA, arXiv and math-proof lanes are stored under
`node_modules/.cache/native-validation/` with matching September-15 suffixes.
`content-coverage-september15/PERSISTENCE.json` records their copy manifests.
