# Native Grid specification sections — September 11, 2026

**Twelve native section extractions succeeded; zero navigation or wire requests.** Each result remains `extracted-unverified`, `partial: true`, `contentSuccess: null`, with one matched heading and no classified barrier. This is captured-source research, not Grid implementation or live-browser acceptance.

## Observed sections

Titles and full selectors below were copied from the successful parent's 114-entry, nontruncated native outline. Exact title matching resolves the earlier ambiguous topic regexes. Each numbered row corresponds to `section-N.jsonl` in the new lane; inputs, native selection boundaries, hashes and cleanup are retained separately. All twelve outcomes are `extracted-unverified`.

| N | Exact observed title | Exact observed selector | Output bytes |
| --- | --- | --- | ---: |
| 1 | 7.2. Explicit Track Sizing: the grid-template-rows and grid-template-columns properties | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(141)` | 111,367 |
| 2 | 7.2.1. Track Sizes | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h4:nth-child(149)` | 30,046 |
| 3 | 7.2.2. Naming Grid Lines: the `[<custom-ident>*]` syntax | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h4:nth-child(154)` | 7,435 |
| 4 | 7.2.3.1. Syntax of repeat() | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h5:nth-child(161)` | 15,193 |
| 5 | 7.2.5. Computed Value of a Track Listing | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h4:nth-child(186)` | 6,198 |
| 6 | 7.3. Named Areas: the grid-template-areas property | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(200)` | 28,976 |
| 7 | 7.6. Implicit Track Sizing: the grid-auto-rows and grid-auto-columns properties | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(222)` | 12,981 |
| 8 | 7.7. Automatic Placement: the grid-auto-flow property | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(227)` | 17,266 |
| 9 | 8.3. Line-based Placement: the grid-row-start, grid-column-start, grid-row-end, and grid-column-end properties | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(284)` | 36,107 |
| 10 | 8.4. Placement Shorthands: the grid-column, grid-row, and grid-area properties | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(296)` | 24,645 |
| 11 | 11.4. Initialize Track Sizes | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(379)` | 9,084 |
| 12 | 11.7. Expand Flexible Tracks | `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(398)` | 18,064 |

## Source-derived paraphrases

- §§7.2–7.2.1: Numeric breadths are nonnegative. `minmax()` forbids flexible minima; smaller maxima are floored to minima. Bare `fr` implies an automatic minimum.
- §7.2.2: Line-name brackets allow zero or multiple names; `auto` and `span` are excluded.
- §7.2.3.1: Integer repeat counts are positive; repeats cannot nest. Adjacent name groups merge. Auto-repeat uses fixed-size grammar and occurs once per list.
- §7.2.5: Computed listings alternate name sets with computed `minmax()` or repeat sections.
- §7.3: Rows require equal, nonzero cell counts; named regions must be rectangles. Contiguous dots form one null cell.
- §§7.6–7.7: Implicit sizes cycle. Auto-flow defaults to rows; dense packing fills earlier holes.
- §§8.3–8.4: Line zero is invalid; numeric spans are positive. Shorthand omissions copy custom identifiers where specified, otherwise use `auto`.
- §§11.4/11.7: Fixed minima initialize bases; intrinsic minima start at zero. Flexible sizing distinguishes definite/indefinite space and respects base sizes.

## Method and limits

Used only immutable `native-reader-omitted-list-september11-round01/snapshot01/dist/scripts/research-json-replay.js`, via `extractResearchReplayJson`, on the parent's pinned `candidate.jsonl` and original captured W3C body. Existing complete validation was rechecked: **6,805 passes, zero failures, one existing exclusion; 112 selected files / 111 strict roots; 1,006 source / 1,788 compiled files**. No validation campaign or native test suite was rerun.

The single child ran from `2026-09-11T12:23:21.440Z` to `12:23:23.697Z`, PID **2558707**, exit **0**. Native results report zero network requests for every section. Inherited seccomp and JS network/process/worker/SafeJS guards remained active with **zero attempts**. No browser session, navigation or transport was created by this harness. Private clean HOME/TMPDIR, non-TTY pipes, 30-second deadline plus five-second grace and 6 MiB output/per-file caps were retained. Output was 157 bytes, stderr empty; no timeout, cap breach or stream/spawn error.

Original `long-v1` admission and `separate-omitted-raw-v1` policy were unchanged. Section extraction retained the native 256,000-byte extraction / 327,680-byte serialized-output bounds, 50,000 nodes, depth 128 and 20-second replay deadline. No retry or selector substitution occurred.

## Omissions and cleanup

Every replay reports the same partial reader transformation: **949,779 source code units; 223,411 text; 400,572 output; 27,024 tokens; 138 omitted tokens; zero tokenizer issues**. Omitted subtrees comprise six `meta`, three `link`, eleven `style`, two `object` and six `script` elements. It ignores 8,813 attributes and unwraps 929 elements. Omitted-raw work is **2,930,227 / 32,000,000 units**, over 348,332 code units, 21 steps and 17 elements; the window limit stays 65,536.

Scripting, styling and hidden-content semantics remain disabled; object fallbacks and omitted content are not restored by successful extraction. The native heading boundaries and partial flags are preserved, not upgraded into a general completeness guarantee. Broad §7.2 includes subsections, so extracted sections overlap. Layout stages such as §§11.5, 11.6, 11.8 and the §8.5 placement algorithm were not extracted here. Grammar evidence does not establish implemented syntax support, numerical layout correctness, visual fidelity or native MDN clicking.

All twelve documents close to zero nodes before advancing; close-method descriptors are restored. Replay document references change across extractions: use the preserved selectors and each result's own `sectionSelection`, not original-outline `e...` identifiers. Private directories remained empty and were removed; the process group is absent. Existing build, parent, original capture and diagnostic receipts remain unchanged. File-only verification and the new receipt ledger check the recorded results and preservation.

## Pins and artifacts

New lane: `node_modules/.cache/native-validation/native-grid-spec-sections-september11/`.

| Input | SHA-256 |
| --- | --- |
| Parent `candidate.jsonl` | `0a2aef81b62ae9374751b9de76c96ae4167606997aed0c1daa0597ac8a11212d` |
| Original 957,488-byte W3C body | `53a47980a217f0b976e1ab8fa0b56944421f7e6311deef96a6aa591ddc693317` |
| Candidate compiled inventory | `d737c0d571b69ce5c6a1162757ff24c3d4bbde14c448983915f356848f9c09b9` |

`SELECTIONS.json`, `section-N-input.json`, `section-N.jsonl` and `section-N-audit.json` are the source-evidence handoff; `RESULT.json`, `INTEGRITY.json`, `VERIFICATION.json` and `RECEIPTS.sha256` preserve execution and verification. Writes are confined to this new lane and report. No source changes, shared-evidence edits, commits, live requests, credentials, SafeJS execution or TTY probes.
