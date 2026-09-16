# Replay-time MIME interpretation and storefront scope

## Outcome

Added an explicit ordinary replay `readerMimePolicy: "markdown-html-document-v1"` selection and CLI `--reader-mime-policy` flag. A complete saved capture originally read as literal Markdown can now be interpreted as HTML without a new website request or fabricated capture metadata. The existing bounded recognizer, inert reader, challenge checks and source/body integrity gates are reused.

**Two content tasks now have verified offline workflows from the exact failed/thin outputs in the100-entry sweep. No additional website GETs were made.** The original sweep and its33 substantive-content verdicts remain unchanged. These are separate saved-body follow-ups, not a revised success rate.

- **Kateminimalist:** original focused output was245189 bytes of HTML/code under a Markdown Content-Type. Existing direct loader interpretation yielded useful HTML, but old ordinary replay refused it. New explicit replay returns11565 bytes of rich Markdown, including six distinct product destinations, without text-prefix fallback or MutationObserver source leakage. This is captured merchandising content, not verified product claims, availability or checkout.
- **Home Depot:** automatic focus correctly followed its documented unique-article rule but selected a153-byte promotion. Explicit `#default-layout` replay returns28240 bytes; the inspected shelf ID returns15246. Both retain all22 distinct product destinations found by an independent static HTML inventory (66 repeated anchors,22 product pods). Existing baseline and candidate scoped outputs match exactly. No focus heuristic was changed; capture-specific IDs are not stable website APIs.

## Contract

The option is available only for ordinary selector/section/content-focus extraction, JSON or Markdown, on default-profile complete captures with one declared `text/markdown` type and no prior captured MIME policy. Genuine Markdown, fenced examples, fragments, unmatched prefixes, other MIME types, long profile, discovery/text modes and named recovery modes remain excluded. Existing table options and explicit bounded text fallback remain independent.

Original response headers, receipt/body hashes and metadata stay unchanged. Replay `selection.readerMimePolicy` records the request; actual reader interpretation records the effective HTML MIME, prefix basis and length. A present original reader must retain literal visibility semantics and matching decoding evidence, including when no visibility or fallback policy was originally requested. Valid absent-reader and policy-free/no-counter cases are covered separately. Hidden challenges receive the unfiltered effective-MIME check before filtered output.

No automatic retry, generic MIME sniffer, larger limit, credential access, page script/SafeJS, CAPTCHA solver or alternative browser is introduced. See `REPLAY-MIME-OVERRIDE.md` for commands and restrictions, and the additive note in `RESEARCH-MIME.md`.

## Validation

Base commit: `aa8f3a21a506b6e64d7de1fd8711802f7db68212`. The pinned earlier capture/inspection runtime matches1502 committed runtime source/script/config inputs. Candidate validation uses a clean archive plus the four explicitly hashed source/test overlays, not dirty root runtime.

- Baseline: **1077 passed /0 failed**,13 explicitly listed native test files.
- Final candidate: **1217 passed /0 failed**,15 manifest files, **140 new cases**, zero failed suites. Build, strict selected types, format and changed-file lint pass. Not the full929-file canonical manifest.
- Final old production with identical new-test hashes: **40 pass /100 expected failures** across the two new files; separate build/type/format/lint results remain archived.
- Real saved-body API comparison: seven cases, with unchanged legacy controls, exact original receipt/body pins, and original source/compiled files unchanged.
- Actual compiled replay CLI: seven kernel-network-denied invocations; four extraction outputs and three expected refusals match API semantics. No new capture metadata was synthesized. CLI refusals use the existing generic stderr message and empty stdout; detailed error categories are verified at the API level, not exposed by the CLI. The first audit wrongly expected those categories on stderr; its corrected assertion and original attempt remain archived.
- All nine offline proof child groups closed, with empty HOME/TMP and no guard attempts. Direct/API tree-close observations are recorded but are not an independent allocation census; CLI internal tree allocations are not independently counted. Unit cases exercise cleanup and admitted-body wiping, including error/close-failure paths.

| Saved-body case | Old API | New API | New Markdown bytes |
| --- | --- | --- | ---: |
| kateminimalist-interpreted | refuses | extracts | 11565 |
| kateminimalist-default-refusal | refuses | refuses | 0 |
| home-focus | extracts | extracts | 153 |
| home-container | extracts | extracts | 28240 |
| home-shelf | extracts | extracts | 15246 |
| genuine-markdown-refusal | refuses | refuses | 0 |
| barrier-refusal | refuses | refuses | 0 |

The larger Home Depot outputs are accepted based on product-link/content evidence, not size alone. The Kateminimalist comparison checks equality to the pre-existing direct loader's interpreted content and six product destinations, not a full catalog or factual audit. Both site bodies originated in the September16,2026 native sweep; no claim of current-site behavior beyond those captures is made.

## Findings retained during development

The first candidate had1191 passing/17 failing cases and a test-helper overload type error. Most failures were test assumptions about Markdown escaping, document-specific IDs, error categories and pre-admission allocation counts. One substantive new-path gap accepted contradictory captured encoding without an explicit fallback policy; production now rejects it. The second candidate had1207pass/1fail, a remaining heading-section reference-equivalence assertion; reference normalization preserves null-versus-present boundaries and all other metadata.

Independent review found a second new-path gap: malformed literal visibility semantics without a captured visibility policy. Production now validates that present reader evidence before loading; nine added cases cover malformed/null records and legitimate policy-free or absent-reader inputs. The review's original findings and static follow-up are preserved. The third candidate passed all1217 cases but still failed formatting on three line wraps; the final run uses the formatted, otherwise unchanged tests. Final validation includes all fixes rather than overwriting earlier failed evidence.

## Evidence and remaining work

Machine-readable result: `reports/replay-mime-override-2026-09-16.json`. Local private lane: `node_modules/.cache/native-validation/content-quality-followups-september16/`, including original pins, inspection, inventory, reviewer notes, red/candidate runs, API comparison and seven CLI invocations. Final commit/ownership audit and lane seal are separate artifacts. Raw website bodies are not committed.

The browser goal remains active. Oversize transport responses, timeouts, script-dependent shells, access handoffs, concatenated product-price/text formatting, broader source-linked task coverage and the separate SDK/credential/passkey gates still need work. This feature does not make all100 sites compatible. No push.
