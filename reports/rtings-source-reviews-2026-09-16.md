# Native RTINGS source-review descriptions — September 16, 2026

## Outcome

The native reader now exposes bounded **sourceReviews** metadata from eligible RTINGS ProductVuePage attributes. Two saved anonymous responses recover **56 source description records** without page execution:26 for the projector review and30 for the laptop review. One fresh actual-CLI GET confirms30 laptop records containing4,242 UTF-16 units of HTML source descriptions.

This is a content-recovery feature, not a rendered review or subscriber-access bypass. Ordinary Markdown remains navigation-only; the useful descriptions are separate, unexecuted HTML metadata. Numerical score fields, default scores, featured measurements and unrelated application/private state are never exported. Raw blur flags and null/missing/omitted score states retain their uncertainty. Existing part-level source-access declarations remain present and do not establish whole-page permission.

Usage, exact schema, field semantics and bounds: SOURCE-REVIEWS.md. Production changes are one new codec plus loader/extraction integration. No dependency, research-content classifier, page runtime or default visible-DOM change.

## Source evidence and fidelity

| Saved review | HTML bytes | Ordinary Markdown bytes | Description records | Description UTF-16 units | Compact metadata bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| JMGO N1S 4K projector | 237,561 | 3,640 | 26: introduction +16 summaries +9 rating descriptions | 6,517 | 13,265 |
| Surface Pro 13 12th Edition laptop | 253,085 | 4,726 | 30: introduction +25 summaries +4 rating descriptions | 4,242 | 11,574 |

The native tokenizer decodes the single component attribute once. Strict JSON validation plus the maintained bounded literal parser establish schema/size/depth/value/duplicate-key bounds without evaluating code. Exact path, public named version/null version ID and false-or-null privileged-access flags are source eligibility conditions, not authorization decisions. The earlier laptop audit intentionally kept props opaque; this new separately recorded inventory establishes the shared schema rather than transferring projector values to the laptop.

All selected HTML strings, identity fields, summary priority/order/title/usage IDs and rating usage names/kinds/blur flags compare exactly with independent expected-field construction from the saved source. Array order is preserved; priority is not interpreted as pros/cons polarity. The13 captured rating score fields are null and all13 blur flags are false; no missing numerical values are reconstructed. Exact source paths and LF-normalized UTF-16 DIV offsets accompany every record.

Raw descriptions remain in the hash-pinned local extraction artifacts. The companion report JSON records text hashes/lengths and selected non-prose qualifiers rather than duplicating entire source descriptions or raw response bodies.

## Regression, quality and differential

- **2,963 native tests pass across34 selected files**, including201 new cases (103 direct codec and98 integration) and2,762 existing cases. Build, strict types, formatting and lint pass. Processes close and isolated HOME/TMP remain empty.
- The same98 integration cases with the new codec but prior production integration yield18 passes/80 failures. All98 pass with the integration. This explicitly overlaid red checkout is not an unchanged baseline tree.
- Coverage includes exact routes/public-style source contexts, ambiguity/missing props, strict syntax and parser limits, selected-field exclusion, typed qualifiers and score-state distinctions, hidden/noscript handling, entity decoding, profiles/raw policies, Markdown/JSON, original counters/DOM/text, byte-budget priority, source offsets, selections, immutability and close cleanup. Unrendered review HTML neither changes the content predicate nor enters challenge diagnostics.
- Core01 already passes all2,963 native cases and build/types/format; lint flags the control-range regex and test concatenations. Release replaces only that codec expression with equivalent Unicode Cc matching and makes lint-only test rewrites. Initial receipts remain intact.
- **110 saved-body comparisons pass**:107 successful extraction pairs and three identical non-HTML admission failures. Only the two expected review pages acquire new metadata. All previous extraction fields, content predicates and diagnostic text remain unchanged; all returned documents close. This is not110 live navigations.
- The clean candidate pins1,531 source/config/manifest entries and2,308 compiled artifacts. Relative to baseline, four codec artifacts are new, eight loader/extraction artifacts change and2,296 remain identical. Canonical manifest948 entries; working tree951 due to three pre-existing unrelated entries.

## Actual CLI and fresh response

Both saved review documents pass actual compiled research-browser CLI checks with one explicitly routed native response each under kernel-denied networking. Default-profile source metadata and ordinary Markdown exactly match the long-profile replay outputs. Only after native/quality/differential and both CLI proofs pass, make one new anonymous GET to the exact previously source-advertised laptop review URL.

- Received **2026-09-16T14:48:00.741Z**, HTTP200;252779 decoded/47512 encoded bytes. One real request, zero mocked requests, redirects or retries.
- Body SHA256: 69b362c4647c09df8691a7736fe139b746690053028e4a1d26688e9454a3de85.
- Actual CLI returns30 records: one introduction,25 summaries and four rating descriptions;4,242 source HTML units. Ordinary Markdown is still4,726 bytes. Outcome remains extracted-unverified/contentSuccess:null, with scripting/styling false.
- One authorized TLS connection; observed request/socket, native transport and child group close. Native active requests0; empty HOME/TMP. Probe enforces exact URL and no redirects; this is an acceptance policy, not a changed normal CLI redirect default.
- An independent Python standard-library HTML attribute decoder and duplicate-rejecting strict JSON parse, run under kernel network denial, reproduce the **complete emitted metadata exactly**, including the DIV offset222672 and every qualifier. This does not reuse the production tokenizer or codec and does not run a page/native runtime.
- The live body differs from the earlier laptop response. Its decoded props hash is unchanged (4d59404ac97f40aeec4ed8778f633afaf7aacc9f9a9bea1c923633a9d33c98db); selected values match after excluding changed source offsets, and ordinary Markdown matches. No second live fetch or retry is used.

No privileged version, credentials, viewer/tracker resources, alternate client, fingerprint change or challenge solver is used. Source schema flags do not prove how a runtime would render or gate these descriptions. Numerical score fields remain excluded regardless of blur state.

## Review and remaining work

Independent static review finds no concrete blocker in the hash-verified core01 codec/integration/tests. Its scope is **not** final-release approval: main records the subsequent equivalent control-regex and test-lint changes, verifies the unchanged loader/extraction/reader-test files and runs final release gates. Main also owns all live and executed comparison evidence; the reviewer ran no probes.

This feature fixes a source-description gap in the explicit reader path, not generic application rendering. Existing JSON-LD access declarations, barriers and human handoffs remain independent. Metadata is source-scoped across selection/DOM changes, fits after older metadata, and may be omitted/truncated at whole-record boundaries. Unsupported props, over-limit parser strings or unknown access schemas provide no guessed data. Do not treat source HTML as executable/trusted instructions.

Historical100-entry root-page verdicts, the citation-derived ranking limitation and earlier RTINGS navigation-only measurements remain unchanged. Earlier62 broad failures in26 files,22 missing committed native tests, actual SafeJS SDK, full rendering, credential/password/passkey/device/TTY and access-handoff gates remain open. Overall browser goal stays active.

Evidence: node_modules/.cache/native-validation/rtings-source-reviews-september16. Sealed2026-09-16T14:59:32.222Z: 138 files/10274542 bytes; ARTIFACTS.json SHA256 e7dc88688b2551abe817b28d23226ed73b76fc088efb349414add47a2825d04f. All validation writers/agents are terminal. Preserve42 pre-existing dirty tracked files and697 untracked files with selective TASKS/manifest staging. No push.
