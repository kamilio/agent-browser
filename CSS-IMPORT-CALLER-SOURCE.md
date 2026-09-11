# CSS import caller: bounded CSSOM source result

## Clear conclusion

**The exact `@import` caller and its passed mode were not established. Neither
of the two extracted CSSOM sections binds `@import` to `no-cors`.**

The separately authorized request to `https://drafts.csswg.org/cssom-1/` succeeded
on **September 11, 2026**. One native reader navigation made **one bodyless GET**,
HTTP 200, no redirect, no retry, no page subresources, no mocks. Exactly **two
native heading-section extractions** then ran offline with **zero additional
navigation or wire**. This uses the offline allowance; no third extraction,
raw-body search, other specification, or broader browsing followed.

The preceding CSS Values result remains a **generic** algorithm:
caller-supplied `no-cors` gives credentials `include`, whereas caller-supplied
`cors` retains `same-origin`, before URL request modifiers. This CSSOM result
does **not** supply the missing import-specific choice. Do not publish an
unqualified claim that imports use `no-cors/include` based on these receipts.

## What each CSSOM extraction actually proves

### Section 1: CSSImportRule is an API surface, not the fetch caller

Source: **§6.4.4, `#the-cssimportrule-interface`**, interface anchor
`#cssimportrule`; artifact `section-1.jsonl`.

- The interface represents an `@import` at-rule.
- Its `href` returns the URL specified by the at-rule. The note directs readers
  to the associated stylesheet's `href` for the resolved URL.
- Its `styleSheet` returns the associated CSS stylesheet, or null when none
  exists. A non-matching supports condition is given as an example of no
  associated sheet.
- It exposes media, layer-name and supports-text information.

**Absent from this extracted section:** an invocation of the style-resource or
stylesheet fetch algorithm, request destination, mode, credentials assignment,
referrer-policy inheritance, or an import-caller parameter list. API accessors
and the existence of an associated sheet do not fill that gap. Linked test
pages/source files were not opened or executed.

### Section 2: stylesheet fetching accepts optional request parameters

Source: **§6.3.1, `#fetching-css-style-sheets`**;
artifact `section-2.jsonl`.

The algorithm accepts a parsed URL, a referrer, a document, an optional set of
request-construction parameters, and a response-handling algorithm.

1. Take the supplied document's origin.
2. Create a request using the supplied parsed URL, that origin, the supplied
   referrer, and any supplied optional parameters.
3. Invoke Fetch with a `processResponseEndOfBody` handler.
4. Return on a network-error response.
5. If the document is in quirks mode, the response is CORS-same-origin, and its
   Content-Type metadata is not a supported styling language, change that
   metadata to `text/css`.
6. Return if the response still is not in a supported styling language;
   otherwise invoke the supplied response handler with the response.

**Absent from this extracted section:** an `@import` call site, a fixed
destination `style`, an explicit `no-cors` mode, an explicit credentials mode,
or a definition of the import caller's optional parameters. The referrer is
an input; its provenance is not supplied here. No Fetch defaults are inferred,
and this wrapper is not silently equated to the CSS Values style-resource
algorithm.

## Policy status after these bounded sources

| Question | Status |
| --- | --- |
| Does CSSImportRule itself pass `no-cors`? | Not shown in the extracted API section. |
| Does the CSSOM fetch wrapper force `no-cors` or credentials `include`? | Not shown; it accepts caller-supplied optional request parameters. |
| Is the CSS Values conditional mapping known? | Yes, from the sealed preceding receipt, but it remains conditional on the caller's chosen mode and applicable modifiers. |
| Is `@import` specifically bound to that mapping's `no-cors` branch? | **No binding established by the selected sources.** |
| Are inherited referrer policy, redirect-final base assignment or cycles established here? | No. An externally supplied referrer and a resolved-URL accessor are not those algorithms. |

The unresolved next research target is the actual import-loading algorithm that
invokes one of these fetch routines with explicit parameters. Its primary-source
location has not been verified by these extractions. Any further source request
or native section extraction requires new authorization. This report makes no
claim that such a caller is absent from the entire specification: only the two
authorized selected sections were extracted. Browser import compliance remains
unverified; this run did not exercise a real CSS import.

## Final evidence

Directory:
`node_modules/.cache/native-validation/native-css-import-caller-source-september11/`

| Artifact | Evidence |
| --- | --- |
| `AUTHORIZATION.md`, `PROMPT.md`, `SOURCE-TARGET.json`, `PREFLIGHT.json` | New Markdown prompt, bounded target, current released-runtime and prior-seal verification. |
| `live-INVOCATION.json`, `live-EXECUTION.json`, `LIVE-AUDIT.json` | Exact command/environment, one native request/one actual GET/zero mocks, response metadata and closed transport. |
| `response-1.body`, `response-1.json`, `response-1.headers.json`, `FINAL-RESPONSE.json` | Preserved original decoded HTML and response hashes. |
| `live.jsonl` | Accepted native reader receipt, intact body capture, unchanged admission and native heading outline. |
| `OFFLINE-INPUT.json`, `SELECTIONS.json` | Pinned body/receipt and two selections taken from the accepted outline. |
| `section-1.jsonl` | CSSImportRule interface: 14,304 bytes; 200 selected nodes. |
| `section-2.jsonl` | Fetching CSS style sheets: 10,435 bytes; 144 selected nodes. |
| `section-*-audit.json`, `RESULT.json`, `offline-EXECUTION.json` | Two successful native offline extractions, zero remaining nodes after each close, zero network/process guard attempts. |
| `live-INTEGRITY.json`, `offline-INTEGRITY.json`, `*-{source,compiled,harness,preserved}.sha256` | Stable executable-source/compiled/harness and immediately preceding sealed-evidence pins. |
| `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Named final checks, resource accounting, both earlier seals verified, and artifact/report digest ledger excluding itself. |

Original body: **1,057,199 decoded bytes**, **135,084 encoded bytes**;
SHA-256 `ed17c48d6df322580da7b6d26b4f7785a4f34e8cd24afa5b31738f24daa1f2ec`.
Native receipt: **1,428,856 bytes**;
SHA-256 `d9885eef342e236ac621ff0aefa0ee06bf5f036074bea3c5884db2c3daa03b94`.
Captured and preserved transport bytes match. No source HTML was searched,
trimmed or passed through an alternate parser.

Live child: **21:39:33.425–21:39:34.073 UTC**. Offline child:
**21:40:03.292–21:40:04.106 UTC**, September 11, 2026. Both use one child/capacity
one, 30-second timeout plus 5-second grace, 6 MiB output/file limits, private
empty HOME/TMP and an allowlisted environment. Offline execution has kernel
socket denial plus network/process guards. Native 250 ms pacing is enabled;
one actual GET does not test inter-request spacing.

Unchanged `long-v1` admission retains the 4,000,000-byte body and 50,000-node
document caps. The outline scanned 26,567 nodes without truncation. Results
remain partial native semantic representations, `extracted-unverified`, without
page scripts or stylesheet execution. No access restriction or cap was hit.
No protected fixtures, working-tree integration contents, linked test fixtures,
SafeJS, credentials, alternate tools, devices/TTYs, builds, tests, source edits,
commits, pushes, cleanup/deletion, or old-lane relaunch were used. Final checks
enforce at least 64 MiB free, lane ≤12 MiB and files/output ≤6 MiB. All private
directories remain preserved empty.

## Release and prior-seal provenance

Only validation-cache
`native-table-document-integration-september11-round04/snapshot01/dist` executed
the reader/replay. Release commit
`2e88c1464b0975f1ad8a9e3e4eca122e648175b8`, gate base
`2ea6d50cc2ae5aecfb081f9b65cc2fb04c28bb3e`. Authorized gate-local audit,
full source/compiled ledger hashes, summary, native result and 20 gate receipts
remain pinned. The **10,123 pass / 0 fail / 2 existing exclusions**, **170
selected / 169 strict / 574 manifest**, and **25 commit inputs** are historical
release-gate facts, not tests or builds rerun here.

Fixture-safe content verification covers **372 executable source files and
1,488 compiled files**; **687 source and 412 compiled files** outside that
allowlist were not read. Full ledgers still cover 1,059 source/1,900 compiled
files; a fresh full-content rehash is not claimed.

Both earlier report/evidence seals are unchanged. CSS Values report SHA-256:
`2d357a1f659697db351f2332d3e50dbc9860baa05f3a5d42d92429b10d639e8b`;
ledger SHA-256:
`61ad9f77bfa15d9aac816c8a71eff17dda41d2036170c5f1242e56f60de1ec4f`.
CSS Cascade report SHA-256:
`5f9068cd2d51cdeff5bb09bce4300769f0c0b642ffa4b036ed28662adf549a08`;
ledger SHA-256:
`877489c5549e37c4c6fc66d336a6ba1abb427a4e668e5843c4043560ea35ba80`.
Only this new report and its new evidence lane were written for this follow-up.
