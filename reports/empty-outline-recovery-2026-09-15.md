# Empty-outline selector recovery — September 15, 2026

## What changed

An empty heading outline no longer has to strand a complete useful long HTML
capture. Add a **separate explicit** `--recover-empty-outline --selector CSS`
replay path, backed by `recoverResearchEmptyOutlineSelector` and strict dedicated
admission. Ordinary replay remains unchanged and rejects the original
empty-extraction receipt. No heading, successful original outcome or fresh
navigation is fabricated. Contract and usage: `RESEARCH-EMPTY-OUTLINE.md`.

The new path requires a complete independently pinned long-v1 HTML body, matching
2xx primary/navigation identity, closed metrics, inert reader, clean classification
and a finite empty nontruncated outline bound to the same document. Failed,
rate-limited, output-omitted, incomplete or mismatched evidence is rejected.
Native reparsing rechecks the actual empty outline before selecting one node;
existing source visibility, barrier checks, resource caps and cleanup remain.

## Google Play: saved-body acceptance

Use the already captured `https://play.google.com/store/games` body from the
preceding live long-profile run, not its incomplete64KiB diagnostic prefix.
The original receipt stays byte-identical: **2,535,808 body bytes**, zero headings,
2,758 scanned outline nodes, `empty-extraction`, `contentSuccess:false`.

- Receipt SHA256: `d70b9289373a438f45f00603c8250a6cf0df114bf87f4387c841feea0a3ccecb`.
- Body SHA256: `c4a5d8db3ae22c66477ec75546c2dc950894e90fa0f859eed20b265a2b2d3102`.
- New selected Markdown: **27,716 UTF-8 bytes /27,609 code units**.
- API and actual CLI produce the same content SHA256:
  `7e3a0f3d787b25ec1cb9e0b0420b3a6df9fe80ca703610eabb226fb07ebb9833`.
- Both serialized results are31,413 bytes, within the unchanged327,680-byte cap.
  The extraction cap remains256,000 bytes.

First/middle/end samples show useful game/app catalogue entries, categories,
displayed ratings and detail links beyond the category/sign-in menu. Literal
Markdown scanning counts218 app-detail link occurrences and78 distinct URLs;
no link was followed, and these are not78 individually validated apps. App detail,
account, installation, purchase, rating accuracy and availability are unverified.
Source clutter and some escaped/concatenated labels remain; this is partial native
source extraction, not a rendered or interactive store.

The recovery field retains `originalOutcome:empty-extraction`, false original
content success, the original empty discovery count and `originalRequestRetried:false`.
The new content remains `extracted-unverified` with null content success.
**No HTTP request occurred in this acceptance experiment.**

## Negative controls and lifecycle

Four baseline native API children verify ordinary Google rejection and unchanged
ordinary body selection from TechRadar, Tom's Guide and CNBC. Five candidate API
children keep Google's ordinary rejection, exercise its explicit recovery, retain
the three news-source content hashes and reject empty-outline recovery for their
nonempty outlines. The default-profile Comparor capture also rejects the new path.
A separate actual CLI child reads the original Google receipt on stdin and matches
the API content exactly.

Totals: **13 API entry calls plus one CLI call,10 closed probe children/groups,
zero actual or mocked navigations/HTTP**. Kernel socket/io_uring denial and JS
guards record zero forbidden attempts. Children use empty HOME/TMP,192MiB heaps
and30-second outer deadlines. All source receipts, body pins and compiled/source
manifests remain unchanged. This is saved-body validation, not a fresh website run.

## Native regression

- Main baseline: **1,404 passed /2 failed in15 explicit native files**.
- Main candidate: **1,595 passed /the same2 failed in17 files**.
- New tests: **126 admission/helper +65 CLI =191 passed**.
- Separate table-row CLI baseline/candidate supplement: **38 passed /the same1
  failed** on both. Aggregate candidate coverage across the disjoint18 files is
  **1,633 passed /3 unchanged baseline failures**; it is not a full-manifest pass.
- Build, selected-test types, formatting and lint pass. Existing failures are the
  two unscoped research-body-capture post-extraction barrier cases and one replay
  table-row invalid-flag case. No unrelated behavior was fixed or silently excluded.

Initial release00 results remain: a TypeScript overload-union dispatch error and
one test incorrectly expecting an unescaped hyphen inside serialized Markdown.
Explicit typed dispatch and a format-aware assertion correct them. Source-only
independent review found no concrete defect; executable tests and saved-source
acceptance are separate evidence, not inferred from that review.

## Scope and remaining work

The feature is explicit long-profile selector recovery, not generic admission of
failed captures, automatic fallback, a budget increase, script execution, a CAPTCHA
solver or authentication support. Other website/access, interaction/passkey and
SafeJS gates remain open. The five original transport cases now have useful source
observations through the documented explicit workflows, not default-mode or
full-site acceptance. Original100-page measurements remain historical.

Clean parent: `7b08418cd047a7f9fa29b53e3c4359e4a5953d26`; candidate release01 overlays only owned changes.
Evidence: `node_modules/.cache/native-validation/empty-outline-recovery-september15`, with scopes, controls, failed
initial results, input/output hashes and closure receipts pinned in the adjacent
JSON. Original42 dirty tracked/697 untracked files are preserved. No push.
