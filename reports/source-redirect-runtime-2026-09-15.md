# Source links and runtime inspection — September 15, 2026

## Top-100 evidence recheck

The complete matrix remains in `reports/top100-websites-2026-09-15.md:44`.
Rechecked all **100 saved receipt hashes**, **90 captured body hashes**, outcome
counts and recorded child/transport closure. This made **zero new requests**.
The original 197-request run still has 65 nonempty unverified results, 13 empty
results, 7 semantic barriers, 3 HTTP failures and 12 other failures. The corpus
is Similarweb's published May 2026 list, not a verified September ranking.
Historical failures and measurements were not rewritten.

## New public observations

Native browsing build: `5ad900156ab57ab001782b7e9ed1a7cfb4dfbb90`.
Four navigations, **7 observed GET requests**, **zero retries**, four verified
body captures. All children/groups and transports closed. Empty HOME/TMP,
allowlisted environment, explicit Markdown preference, existing response,
extraction and redirect limits. No page runtime, credentials or bypass.

| Requested URL | HTTP | Body bytes | Markdown bytes | GETs | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `https://mail.ru/` | 200 | 936 | 0 | 3 | Empty scripted/bootstrap source |
| `https://docs.pytorch.org/` | 200 | 115 | 124 | 1 | Literal Markdown redirect note |
| `https://docs.pytorch.org/docs` | 200 | 268 | 277 | 2 | Another source redirect note |
| `https://docs.pytorch.org/docs/stable/index.html` | 200 | 95 | 104 | 1 | Source note pointing to the versioned documentation |

Mail.ru's source contains scripts and a meta-refresh; no source refresh or
query-bearing destination was followed. PyTorch's authored links were selected
explicitly in two separately scoped follow-ups. The final note points to
`https://docs.pytorch.org/docs/2.14/index.html`; that destination was **not fetched
in this lane**. The bounded scope stopped, rather than automatically following
an arbitrary chain. Nonempty redirect notes are **not documentation retrieval**
and the publisher's "latest" wording is not an independent version claim.

## Focused change

Requested discovery now reports bounded, source-only Markdown link candidates.
They carry URLs and source positions, not fabricated DOM refs. Literal extraction
and HTML discovery remain unchanged. Explicit pinned default-profile replay
`--links` accepts Markdown; other MIME/profile restrictions remain in place.
No automatic navigation, runtime dependency or content-limit increase.
Contract and exclusions: `MARKDOWN-SOURCE-LINKS.md`.

Four pinned source comparisons, with no network:

| Saved source | DOM links | Markdown source links | Qualification |
| --- | ---: | ---: | --- |
| PyTorch root | 0 | 1 | Correct authored docs destination |
| Hugging Face | 0 | 28 | Partial source parsing |
| Cloudflare documentation | 0 | 32 | Entry cap reached; truncation explicit |
| RFC 9309 HTML | 32 | 0 | Existing HTML discovery unchanged |

Baseline replay rejects the three Markdown captures as unsupported. Candidate
API and actual CLI expose the PyTorch candidate without a request. Default
extraction, serialized source and reader provenance match baseline across all
four controls. Document-local reference IDs are normalized only for cross-tree
comparisons, never in raw output. Seven guarded offline children closed with zero
network attempts: one failed comparison harness, corrected baseline, intermediate
and final candidates, baseline CLI (expected exit 1), and intermediate/final
candidate CLIs (exit 0).

## Validation and limitations

- Clean committed archive plus five owned TypeScript overlays; explicit native
  manifest selection. **1,513 passed, 0 failed across 23 selected files**.
- **244 new tests**: 201 scanner cases and 43 integration cases. All 1,269
  baseline test statuses match. Build, scoped types, format and lint pass.
- Initial candidate: 1,449 passed, two new test-expectation failures. Corrected
  three-backtick literal output and empty-result CLI exit 1; no behavior change
  for those expectations. Initial evidence remains available.
- Review caught real false-link cases in container code and malformed autolinks
  containing comments. Bounded fixes and 56 additional regressions address them.
  Intermediate release02 passed 1,507 tests, but review then found a swallowed
  code-span opener in failed autolinks. Release03 fixes that state transition and
  adds six cases. Final bounded review confirms the reviewed findings resolved;
  earlier snapshots, results and review notes remain preserved.
- Not CommonMark or rendered link validation. Unsupported container tails can
  suppress source through EOF. Natural Markdown challenge detection is not
  proved by mocked classifier-wiring cases; inherited HTML-specific rules remain.
- This selected suite is not the full native release. Previously documented
  out-of-scope snapshot fixture typing and stale row-CLI assertions remain open.

## SafeJS gate

Static-only inspection reverified 383 staged inventory records, including 372
package files, for SDK **0.1.599 acquired September 14**. This is not a latest
version claim. Public extension signatures cover adapter-consumed operations,
but declared dependency resolution is incomplete and the legacy default API is
incompatible with the public core contract. Callback lifetime and synchronous
browser behavior still need actual isolated compatibility checks.

No SDK import/execution, dependency staging, default-runtime switch or website
scripts ran. An asynchronous isolated-gate authorization request remains pending;
queued delivery is not consent or a test result. Providers/passkeys/devices,
TTY/service gates, live scripting and the overall browser goal remain open.

Evidence lane: `node_modules/.cache/native-validation/source-redirect-runtime-september15/`.
Machine-readable summary: `reports/source-redirect-runtime-2026-09-15.json`.
Raw captured bodies and query-bearing observer logs remain private in the lane.
