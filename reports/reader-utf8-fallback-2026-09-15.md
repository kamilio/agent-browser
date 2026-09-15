# Reader UTF-8 fallback — September 15, 2026

## Outcome

An explicit `--reader-fallback-encoding utf-8` option repairs WebMD's source
punctuation when HTML lacks an HTTP charset and its UTF-8 meta appears beyond the
existing 1,024-byte prescan. The pinned original homepage has 423,007 bytes and
the declaration begins at byte 2,271. No prescan widening, silent UTF-8 default,
header override, script execution or budget increase is introduced.

The shared prescan also continues after unsupported meta labels and maps
`x-user-defined` to windows-1252, matching the ordinary native loader. One prior
source-input characterization is intentionally updated and two actual
cross-loader parity regressions cover this correction. Thus not every old
default behavior is claimed unchanged.

## Native validation

Runtime parent: `10ff160f6587fcc60095d4ecb0fa491443dde1d6`, with the nine owned
source/test overlays pinned in the adjacent JSON. Validation uses clean archive
builds, the explicit native test list, isolated guards and no actual SDK.

| Run | Test files | Passed | Failed |
| --- | ---: | ---: | ---: |
| Baseline selected native tests | 15 | 2,393 | 2 |
| Old production plus final new/updated tests | 17 | 2,469 | 117 |
| Candidate | 17 | 2,584 | 2 |

All **191 new tests pass** (58 loader/replay, 133 CLI/execution). Baseline and
candidate build, type, format and lint checks exit zero. The old-production red
type check fails because the new API is absent. This is not a full-manifest run.
Both remaining candidate failures exactly reproduce on the baseline:
`research-body-capture.test.ts` unscoped capture/post-extraction barrier
classification, once with reader=false and once with reader=true. They are not
fixed or concealed here.

Coverage includes option validation before effects, BOM/header/early-meta
precedence, late metadata, non-HTML controls, raw/visibility/MIME combinations,
long profiles, capture provenance, replay admission/pins, mismatched declarations
and actual encoding, error paths and cleanup. Initial validation artifacts are
retained. `AUDIT01.json` is authoritative; the initial audit misnamed Vitest's
describe-suite total as file count, corrected by counting its file results.

## Saved-body comparisons

These are source-fixture checks, not new HTTP validations. Six guarded children
perform nine native loads/extractions with explicit document closure and zero
actual or mocked navigations. Original receipts and bodies remain unchanged.

| Captured homepage | Default Markdown bytes | Explicit fallback bytes | Result |
| --- | ---: | ---: | --- |
| WebMD | 23,679 | 23,632 | Source em dash restored; known mojibake phrase absent |
| Bankrate | 23,689 | 23,689 | HTTP UTF-8 declaration wins; identical hash |
| English Wikipedia | 57,367 | 57,367 | HTTP UTF-8 declaration wins; identical hash |

Default output hashes also match baseline for all three. The JSON retains exact
content/body/receipt hashes; the WebMD comparison uses the same captured bytes,
not two changing live responses.

## Fresh native task checks

At **20:19 UTC on September 15, 2026**, three default-profile native navigations
return complete HTTP200 captures and `extracted-unverified`. All explicitly use
UTF-8 fallback, raw-text separation and inline/source-hidden filtering.

| Page | Decoded body bytes | Markdown bytes | Reviewed content |
| --- | ---: | ---: | --- |
| WebMD homepage | 422,915 | 23,632 | Source links and excerpts; corrected punctuation |
| WebMD Rebecca Romijn feature | 666,589 | 22,774 | Article headings/prose plus navigation and related content |
| Bankrate mortgage guide | 920,483 | 43,171 | Ten numbered step headings, prose and FAQ plus site UI |

Exact URLs and timestamps are in the JSON. The WebMD article URL is present in
the fresh homepage extraction before its request. This validates source-link
discovery followed by explicit navigation, **not** a DOM click. The Bankrate
article URL comes from the pinned original homepage, not a fresh root-page chain.
Content review samples headings/prose and page boundaries; it does not verify
health or financial claims, article completeness or rendered-page fidelity.
Literal escaped zero-width characters and site chrome can remain in output.

**Three navigations, three GETs, zero redirects/retries, three complete captures.**
The transport observer records no credential headers. Empty HOME/TMP, bounded
heap/deadlines and request/process cleanup apply. No account/form interactions,
CAPTCHA solver, impersonation, alternate browser or page runtime are used.

Three additional guarded offline CLI body selections use exact fresh receipt and
body pins. All retain fallback/actual-encoding provenance and reproduce their
corresponding live Markdown content exactly, with zero HTTP requests. All twelve
saved/live/replay children and process groups terminate; all three observed live
requests and sockets close.

## Evidence and outstanding work

Local evidence lane:
`node_modules/.cache/native-validation/reader-utf8-fallback-september15/`.
The adjacent JSON pins final validation manifests, fixtures, execution records,
live receipts, transport observations and offline guards. Source and compiled
pins are checked against the final candidate. Captured bodies stay local rather
than being duplicated in Git.

The original 100/100 agent-citation entry-page matrix in
`reports/agent-citation-pages-2026-09-15.md` remains unchanged. It is a documented
AI-citation proxy, **not measured global agent visit popularity**. These follow-up
checks are separate evidence, not a retroactively improved original pass rate.
Source extraction is still partial, with `contentSuccess: null`. Broader live
interaction, SafeJS callback admission, access barriers, passkey/device gates
and performance work remain open. No SDK dependency update or execution, push,
full-suite pass or overall-goal completion is claimed.
