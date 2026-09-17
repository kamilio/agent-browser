# Continue-shopping interstitial diagnosis — September 17, 2026

## Result

Two saved HTTP 200 Amazon entry pages contained only a continue-shopping
instruction, a CAPTCHA validation form and legal footer. The native reader
previously reported `extracted-unverified`. The new bounded structural signature
reports `semantic-barrier`, a possible challenge with unspecified provider, and
`stop-and-request-user-handoff`, before ordinary extraction.

This prevents those interstitials from appearing to contain usable shopping
content. It does not solve a CAPTCHA, submit the form, retrieve blocked products,
or establish a successful human-handoff workflow. See
`CONTINUE-SHOPPING-CHALLENGES.md` for the exact conservative recognition contract.

## Native qualification

Baseline: `4ba7772ac0ac11ecd35a1d201a0b70ee61208b0e`, plus only the three owned
production changes, two new test files and their explicit manifest entries.
The qualified isolated candidate has 1,636 source pins and 2,416 compiled pins;
pre-existing dirty root code is excluded.

- Final native run: **1,310 passed, zero failed, across 15 selected files**,
  including the existing core and research behavioral-shell suites.
- **160 new cases:** 148 core/classifier and 12 research integration cases.
  Coverage includes ordinary shopping/article negatives, namespace and parser
  integrity, hidden ancestors, control ownership, source budgets, cancellation,
  non-disclosure of synthetic input values, and unchanged response admission.
- Build, new-test type checks, scoped formatter and scoped linter pass.
- Negative control: unchanged baseline production with the new tests yields
  1,209 passes and 23 failures across the initial 13 selected files. All 23
  failures are in the new tests; this is not a negative run of the final 15 files.
- Initial `core01`: 1,231 passes and one failure, caused by a test expecting a
  literal period rather than the reader's existing Markdown-escaped period.
  Correcting that fixture yields 1,232/0 in `release01`; its formatter reports
  a required line wrap. `release02` passes 1,232/0 with all quality checks green.
  The final 15-file `release03` uses the same `release02` candidate and adds two
  existing adjacent suites. No production changes follow `core01` qualification.
- All observed child processes/groups close and private native HOME/TMP
  directories remain empty. The manifest has 1,026 entries, of which 22 are
  absent from the committed baseline plus owned overlays. No new full-suite run.

## Saved-source comparison

The frozen September 16 corpus supplies 100 receipts and 96 complete saved
bodies. Both the prior qualified native runtime and the candidate inspect the
same saved bytes, checking receipt hashes, decoded sizes and body hashes.

All 96 bodies receive the bounded raw-response structural check in both
runtimes. **Only ranks 15 and 92 change**, from no structural signature to
`continue-shopping-challenge-v1`:

| Saved entry | Decoded bytes | Body SHA-256 |
| --- | ---: | --- |
| Amazon.com | 3,781 | `f742d284f4090d1eca19b2116bb0ff88b0eabbd6efe7678a841f26bb0104a2c2` |
| Amazon.co.uk | 3,805 | `40ff75b3ea7bce3302eb5a9c9ce0b21b6aaf2378763fbfc1ff352eb98b02705a` |

The two Amazon entries and four retail controls additionally pass through the
actual `researchNavigation` API with a single synthetic response per invocation:

| Saved entry | Baseline → candidate outcome | Extracted bytes before → after |
| --- | --- | ---: |
| Amazon.com | extracted-unverified → semantic-barrier | 361 → 0 |
| Amazon.co.uk | extracted-unverified → semantic-barrier | 377 → 0 |
| Walmart | extracted-unverified, unchanged | 6,439 → 6,439 |
| Target | extracted-unverified, unchanged | 8,489 → 8,489 |
| Best Buy | extracted-unverified, unchanged | 43 → 43 |
| eBay | http-failure, unchanged | 242 → 242 |

The four controls retain identical extraction hashes and recorded outcome,
classification and network metrics. Their unchanged outputs are regression
controls, not a claim that all four provide useful product content.

This makes 12 offline navigation invocations, not 12 website visits. The replay
process has kernel socket denial, pinned-module/filesystem scope, JS network
denial, no TTY and empty private HOME/TMP. It exits zero with no scope denials;
all 12 native transport objects and the child/process group close. The 1.216-second
whole offline run is not a live latency or controlled performance benchmark.

The structural scan is not a complete revalidation of every extraction/workflow.
Saved selected response headers are not a new full-header capture, and historical
source observations remain dated September 16. Original corpus reports and their
33 useful / 67 other result count are unchanged. No hidden input values appear
in this report or the new diagnostic.

## Outstanding work

No new website request, form submission, retry, identity spoofing, challenge
solver, source-script/SDK execution, real credential or device access occurred.
Dynamic runtime qualification, productive deep-page workflows, measured live
performance, safe access handling, real passwords/passkeys and the original
research topics remain open. The overall browser goal remains active.

Machine-readable evidence and pinned local artifact paths are in the adjacent
JSON report. Historical captures are retained in their original directories.
