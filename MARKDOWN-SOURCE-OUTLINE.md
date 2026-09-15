# Bounded Markdown source outlines

Explicit `text/markdown` documents now expose optional `sourceMarkdown` extraction
metadata. This is a source-navigation aid, not a Markdown renderer. It identifies
ATX-shaped heading candidates and physical line ranges that can be passed to the
existing offline replay `--lines START:END` option. No new CLI flag is required.

## Unchanged content contract

- The literal pre/text document, body bytes and outer fenced Markdown stay intact.
- Rendered title metadata stays empty; source titles do not become DOM headings
  or links, and inline syntax remains literal.
- The normalized explicit response MIME must be `text/markdown`. There is no
  extension sniffing, HTML conversion, script execution or follow-up fetching.
- Only unchanged registered text-loader documents are eligible. A later document
  revision invalidates the outline even if text is restored. Additional root
  children installed by document initialization omit optional outline metadata
  without rejecting ordinary extraction; strict line selection still rejects
  ineligible source shapes.
- Metadata is document-wide, including when extracting a selected line range.
  It is subject to existing extraction byte limits and does not change HTTP,
  semantic-barrier or content-success classification or replay admission.

## Metadata

`sourceMarkdown` is omitted when there are no candidates or the source exceeds
2,000,000 UTF-16 code units. Eligible outlines and entries are frozen.

| Field | Meaning |
| --- | --- |
| `kind` | `markdown-source-outline-v1` |
| `partial` | Always `true`; no full Markdown semantics are claimed |
| `sourceCodeUnits` | Whole source length in UTF-16 units |
| `totalLines` | Physical source lines, including a terminal empty line |
| `matchedHeadings` | All recognized candidates, including entries beyond the cap |
| `leadingMetadataLines` | Lines omitted as a bounded leading paired metadata block |
| `truncated` | Whether more than 128 candidate entries were recognized |
| `entries` | At most 128 source-order entries |

Each entry contains `level`, literal `title`, `titleTruncated`, `startLine` and
`endLine`. Coordinates are one-based and inclusive; CR, LF and CRLF follow the
existing literal-text source-line rules. A section ends immediately before the
next candidate of equal or shallower level, or at the end of source. Scanning
continues after the entry cap so retained ranges still close at later candidates.

Titles retain at most 128 source UTF-16 units without splitting a surrogate pair.
Control/format characters except tabs are escaped after that bound, so an escaped
title may exceed 128 output units. Whitespace-delimited closing hashes are
removed. `titleTruncated` is independent of the outline's entry-cap flag.

## Deliberately partial recognition

Recognizes one to six leading hashes with zero to three leading spaces and a
space, tab or line ending after the hashes. Skips backtick/tilde fenced blocks,
conservatively opaque HTML-shaped blocks, comments, processing instructions,
CDATA and declarations. A paired `---` or `+++` block at the beginning is omitted
only if its closing marker is within 128 lines and 16,384 source units; `...`
also closes the `---` form. This convention is not metadata-language parsing.

Setext headings, nested list/quote-container Markdown, MDX and inline semantics
are not interpreted. HTML-shaped blocks may suppress candidates until a blank
line. Candidates are not proof of rendered headings or author intent.

In particular, the saved PyTorch server Markdown has unfenced code comments at
lines 44 and 46 (`# x.device ...` and `# y.device ...`). These are source
candidates under this policy and can end preceding source ranges. We do not
guess away those lines or rewrite the body. Better upstream representations and
full rendered Markdown semantics remain separate work.

## Saved-page validation — September 15, 2026

Six pinned bodies from the earlier native content-page run were replayed offline.
No website was re-fetched and no browser runtime or credentials were used.

| Saved source | Candidates | Source lines | Example selected range | Fenced Markdown bytes |
| --- | ---: | ---: | --- | ---: |
| Docker overview | 17 | 195 | The Docker platform, 11:29 | 1,000 |
| Hugging Face bitsandbytes | 18 | 318 | Hardware Compatibility, 27:52 | 1,082 |
| Ollama GPU | 13 | 179 | Nvidia, 7:57 | 5,456 |
| PyTorch CUDA notes | 99 | 1,281 | TensorFloat-32, 73:111 | 2,643 |
| PyTorch redirect notice | None | — | No heading invented | — |
| MDN Promise HTML control | Not eligible | — | Existing HTML behavior | — |

Baseline and final whole-document body hashes, title metadata and outcomes match
for all six sources. Selected JSON text matches source line ranges; actual
baseline/final PyTorch CLI replay produces the same 2,643-byte body, with only
source metadata added in the final version. Titles can contain literal inline
anchor markup. This is content navigation, not new hardware/research advice.

All 1,642 selected native tests pass across 23 explicit manifest files, including
106 new cases. All 1,536 prior case statuses match. Build, type, formatting and lint
checks pass in clean archives with owned overlays. Only four production module
families differ. Seven guarded offline children close with zero network attempts;
one preserves an initial incorrect proof assumption about PyTorch's missing
fences. Initial baseline path-configuration failure logs and the first candidate's
subsequently improved title scanner also remain preserved. Independent review
caught Unicode fence-regex backtracking and optional metadata rejecting valid
initialized documents. Prefix-only fence matching and nonthrowing shape checks
address those cases, with new regressions and a new final archive/proof run.
The first post-review run had 1,641 passes and one auxiliary test assertion that
omitted existing Markdown period escaping; correcting that expectation leaves
production bytes unchanged. The failed test run is retained separately.

Evidence: `reports/markdown-source-outline-2026-09-15.json` and the private local
lane `node_modules/.cache/native-validation/markdown-outline-september15`.
Original website evidence is unchanged. This is not a full native release or
rendering, interaction, SafeJS, credential/passkey, service/socket or TTY/PTY
acceptance result. The broader browser objective remains active.
