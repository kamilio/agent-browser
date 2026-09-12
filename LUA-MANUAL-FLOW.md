# Lua 5.4 native manual flow — September 12, 2026

## Outcome

**Bounded live attempt completed; manual-link flow failed at native layout.** HTTP 200 is not working-site acceptance.

- Native child observations: 2026-09-12T03:03:55.333Z through 2026-09-12T03:03:57.239Z UTC.
- Supervisor: 2026-09-12T03:03:55.216Z through 2026-09-12T03:03:57.251Z UTC; 2035 ms wall; exit 1; no timeout, signal, spawn error or output-cap breach. Process group absent on return.
- Exactly 1 initial native navigation and 1 genuine native click; 4 wire GETs, 4 adapter request-start observations, 4 native transport requests, 0 mocks and 0 redirects.
- Committed title: **Lua 5.4 Reference Manual - contents**; root `e1`; 2341 nodes; revision 2345; URL `https://www.lua.org/manual/5.4/`.
- Inspected 96 anchors, evaluated native availability before URL deduplication, found 90 eligible occurrences and 1 unique destination. Selected visible `e33` (“start”), original href `manual.html`, resolved `https://www.lua.org/manual/5.4/manual.html`.
- Click stopped at `native-documentation-link-click`: `unsupported` — “Document width resolution requires an issue-free supported formatting profile”. No destination request occurred.
- Before/after failure URL, title, root and DOM revision remain unchanged; history index 0, length 1, key `h1-1`; one committed document. No forced click, invented URL, resource rewriting, fallback or capacity increase.
- No retries or further probes. The initial static documentation content is observed, but destination rendering/navigation is unproved. This is the version-specific Lua 5.4 manual, not a claim about the latest Lua.

## Release and byte preservation

Runtime: commit `0ca889debf2e52abb6316a2ec661fcb5f0ccd529`, `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-noscript-september12-round01/snapshot01/dist`. Node `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, version 22.22.0, SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

Reverified all 20 gate receipts, full 1094 source and 1928 compiled file ledgers, and all 12 commit-owned snapshot inputs against Git blobs. Native gate: 11599 passed, 0 failed, 2 unchanged exclusions; 208 selected suites, 207 strict roots, 602 manifest entries. No rebuild or gate rerun.

- Source ledger SHA256: `a17003a374936ef07f7cb39ce2cf57d0ce739e0dbf865e935fad081347d14bb9`.
- Compiled ledger SHA256: `97dd82d475c52022e6602e066646d292244f9ff2fe45e66aaeb958fc1eb81570`.
- Gate receipts SHA256: `0f6c33e405eaf8b0a802f437ced6759d1aae6d3e4093c40e6b881f73ac171426`.
- Commit verification SHA256: `c763181e16823c82673c1b90f4676edb0f40588196b78c59f5952a5d00372ca7`.
- Native results SHA256: `167962524711b98fdfdf990dfe7bbc7c0f91884f74f0b986a2f741ec1088009a`.
- Summary SHA256: `a8a78594cae62d33b9b81286892041d2cff593f5affdfc3a5644bae6cc3db2fa`; audit SHA256: `b5a923a2e2288c824cae8ad16043a03c75fe6f47adae5641658d8aa003c31bde`.

54 exact Buffer archives preserve the Lua task, AGENTS instructions, byte-preservation rule, release summary, sibling Man7 task as release reference only, completed Debian harness/report/ledgers, all 20 gate receipt inputs, commit verification and 12 snapshot inputs. Each archive was read back and compared by byte equality, length and SHA256 before adaptation; all cross-file assertions were independently rechecked. The completed Debian reference ledgers contain 83 and 85 entries. No unfinished Man7 replay artifacts or protected native-source-heading-source-10 payloads were read.

Source and compiled inventories were recalculated before/after the child and again offline. Gate, release, reference, executed harness and executable/security pins remained unchanged. Current shared working files were not substituted for the sealed runtime.

## Responses and headers

All four original resources were admitted through the native browser, same origin only. All returned HTTP 200 with identity encoding; encoded and decoded bytes are independently equal. No Retry-After, classified access barrier or credential header pair was observed. Raw header arrays retain original names, order and values; these are Node HTTP response records, not TCP/TLS packet captures.

| Wire ID | Original resource | Kind | Status | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.lua.org/manual/5.4/` | document | 200 | 32734 / 32734 |
| 2 | `https://www.lua.org/manual/5.4/lua.css` | stylesheet | 200 | 2247 / 2247 |
| 3 | `https://www.lua.org/manual/5.4/logo.png` | image | 200 | 9893 / 9893 |
| 4 | `https://www.lua.org/manual/5.4/index.css` | stylesheet | 200 | 240 / 240 |

Totals: 45114 encoded and 45114 decoded bytes. Observed wire-start spacing: 519, 353, 358 ms (minimum required 250 ms). Each `wire-N.body`, `response-N.body`, `wire-N.headers.json` and `response-N.json` is in the private lane. Full body/header hashes and lengths appear in the exact machine-verifiable claims below.

Loader calls preserved the original fetchStylesheet and fetchImage callbacks, unchanged DOM and native limits. Two original stylesheets loaded; zero fetchStylesheetWithPolicy observations, so that API branch is unproved here. Native callback credential intent was include; the admitted transport cookie context was forcibly omit, with a fresh jar, zero accepted/stored cookies and no credential headers. TLS certificate/hostname validation and strict public-address checks remained in the immutable native transport; the wire wrapper asserted GET, agent=false, original AgentBrowser/0.1 identity, SNI www.lua.org, bodyless request provenance and TLS validation.

The original logo image e21 completed at 128×128 pixels and remained origin-clean. No cross-origin image was encountered or locally rejected; that allowed policy branch remains unexercised, not validated. The actual configured image owner was observed through the original fetch callback and after load, never replaced or initialized with a second configuration. Original PNG ancillary metadata was reported as ignored by the native decoder, not rewritten by the harness.

## One read-only layout census

After the failed click, one bounded native formatting census returned 2381 formatting nodes, 2330 visited DOM nodes, work 27918, 1 deferred subtree; revision 2345 → 2345. This census is not a sole-cause proof.

| CSS diagnostic | Raw styles.metrics().issues | Applicable styles.metrics().applicableIssues |
| --- | --- | --- |
| `unimplemented-or-invalid-css-value` | 10 | 5 |
| `unimplemented-css-property` | 11 | 5 |
| `unimplemented-or-invalid-css-selector` | 1 | 1 |

Applicable formatting CSS entries retain the css: prefix and remain non-advisory. Independent non-CSS formatting guards:

- `html-presentation-hint-not-supported`: 1.
- `display-layout-not-supported`: 1.
- `table-collapsed-borders-not-supported`: 7.

- Deferred `e401`: DOM `table`, display `table`, reason `display-layout-not-supported`.

No guard, stylesheet, node, image or adverse result was suppressed. Raw CSS counts are not presented as applicable counts. Default viewport was 1280×720; observed preference null/effective light; no host/system preference integration or overrides.

## Cleanup and bounds

All four actual owner categories were observed: one document, one image owner, one event owner and one control owner. Independent recomputation from returned metrics proves their sampled cleanup: document nodes/text/collectors/declarations zero and closed; image resources/active/queued/waiters zero and closed; event listeners/active dispatches zero and closed; file controls/files/bytes and mouse pressed/buttons zero, closed and not busy. Session tabs/pending loads/queue activity and native active requests are zero; session, queue, transport and cookie jar are closed. This proves only those sampled owners, not process-wide leak freedom.

A final request-4 wire-close was appended to progress.jsonl at 2026-09-12T03:03:57.241Z, after stdout serialization at 2026-09-12T03:03:57.239Z and before supervisor exit. The independent verifier checks the exact stdout-wire prefix, permits only distinct known late close events, and verifies all four closes. It does not erase or rewrite either log.

Limits: 8 bodyless GET maximum, 250 ms pacing, 30 s child wall plus 5 s kill grace, 6 MiB per file/combined output, 12 MiB lane, minimum 64 MiB free disk. Actual combined stdout/stderr 147788 bytes; stderr empty. Postflight storage sample: 6901760 allocated / 6615077 logical lane bytes, 1584046080 free bytes; final seal receipts include later storage samples.

Private lane/HOME/TMP were created mode 0700; HOME/TMP remained empty. Explicit child environment contains only PATH, LANG, LC_ALL, TZ, HOME, TMPDIR and PYTHONDONTWRITEBYTECODE. stdin ignored, no TTY; RLIMIT_FSIZE 6291456 and core size zero; no-new-privileges and seccomp active. Live seccomp denies listening/accept, ptrace, process-vm and io_uring, not outbound sockets. Egress enforcement is the native public-address/TLS policy and same-origin/provenance guards, not a claimed kernel egress allowlist. No socket self-probes, other browser/HTTP client, provider, device, credential, page script, real SafeJS, mock, challenge bypass or alternate identity was used.

## Preserved preparation and verification failures

1. Initial preflight stopped before any live launch: a sequential text replacement accidentally changed the expected gate count 11599 to 11602. Actual gate count was correct. PRECHECK-OR-SUPERVISOR-FAILURE.json, RUN-ONCE.lock and exact preflight-failed01--run.mjs.source / preflight-failed01--syntax-check.mjs.source remain. PREFLIGHT-CORRECTION.json explains the correction. The corrected preflight checked the actual 11599 result, preserved the old lock, and required absence of LIVE-LAUNCH.lock. Exactly one live child was subsequently launched.
2. Initial offline postflight incorrectly required whole-log equality and rejected the valid late request-4 close described above. POSTFLIGHT-FAILURE-1789182248011.json and original checks.mjs remain unchanged. POSTFLIGHT-CORRECTION.json, checks-fixed01.mjs and separate postflight/seal/verify files preserve the correction. No browser rerun was used to obtain cleaner logs.

The original offline checks, failed versions and logs remain in the full file ledgers. Evidence integrity success does not turn the native layout failure into website acceptance.

## Changed paths and verification

- New assigned root report: `LUA-MANUAL-FLOW.md`.
- New assigned private lane only: `node_modules/.cache/native-validation/native-lua-manual-flow-september12/` (including empty home/ and tmp/).
- Exact complete file inventory: `node_modules/.cache/native-validation/native-lua-manual-flow-september12/ARTIFACTS.txt`.
- RECEIPTS.sha256 covers the root report and lane artifacts other than itself, VERIFICATION.json and FINAL-RECEIPTS.sha256; FINAL-RECEIPTS.sha256 additionally covers the first ledger and VERIFICATION.json, excluding only itself. Both are independently recomputed against complete membership, not merely sampled.
- No source, TASKS, inventory, commit or push changes. Shared release/inventory review belongs to the parent; Man7 offline replay belongs to the other worker.

Limitations: manual.html was not fetched or rendered; full working-site interaction, supported geometry, destination history, screenshot/visual correctness, cross-origin image rejection, policy-aware stylesheet API behavior, host preference integration and broader live/provider/device/SafeJS/TTY acceptance remain unproved. The table/deferred and CSS diagnostics coexist; no single root cause is established.

## Exact machine-verifiable claims

```json
{
  "flowPassed": false,
  "startedAt": "2026-09-12T03:03:55.333Z",
  "finishedAt": "2026-09-12T03:03:57.239Z",
  "failure": {
    "stage": "native-documentation-link-click",
    "name": "AgentBrowserError",
    "code": "unsupported",
    "message": "Document width resolution requires an issue-free supported formatting profile"
  },
  "accounting": {
    "nativeRequestAttempts": 4,
    "transportRequests": 4,
    "wireRequestCalls": 4,
    "wireResponses": 4,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 45114,
    "decodedBytes": 45114,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 4,
    "admittedRequests": 4,
    "rejectedAdapterEntries": 0,
    "rejectedAdapterSamples": [],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.lua.org/manual/5.4/",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-1.body",
      "encodedBytes": 32734,
      "encodedSha256": "400cce3bc5b23b1d424a01c23dae926fbecb56fbbe266a3b7a669f5f180cefa0",
      "decodedPath": "response-1.body",
      "decodedBytes": 32734,
      "decodedSha256": "400cce3bc5b23b1d424a01c23dae926fbecb56fbbe266a3b7a669f5f180cefa0",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1146,
      "headersSha256": "a5288e111ceec12764ad286c98e3f3905f926db18c725cc659a1c3753f01b4d9",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.lua.org/manual/5.4/lua.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "identity",
      "encodedPath": "wire-2.body",
      "encodedBytes": 2247,
      "encodedSha256": "73e7e5fa61afec5f04f5e43ad5c8348620abc41b8e4671631300b5defe3f2826",
      "decodedPath": "response-2.body",
      "decodedBytes": 2247,
      "decodedSha256": "73e7e5fa61afec5f04f5e43ad5c8348620abc41b8e4671631300b5defe3f2826",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1147,
      "headersSha256": "abc2cbdb1ee68b766e2973abc824b4e3e3dfe4e64ed795772c899c6fba810485",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://www.lua.org/manual/5.4/logo.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-3.body",
      "encodedBytes": 9893,
      "encodedSha256": "de4ca280a5561940ace4b1a72dc5bc1d96ac154e59c7ae32d98ddcde010baeaa",
      "decodedPath": "response-3.body",
      "decodedBytes": 9893,
      "decodedSha256": "de4ca280a5561940ace4b1a72dc5bc1d96ac154e59c7ae32d98ddcde010baeaa",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1152,
      "headersSha256": "9aba4f7f198aefa238bcca6942b63876f7a4108351bb7154df7800be81fb015c",
      "redactedHeaderPairs": 0
    },
    {
      "id": 4,
      "url": "https://www.lua.org/manual/5.4/index.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "identity",
      "encodedPath": "wire-4.body",
      "encodedBytes": 240,
      "encodedSha256": "b6ef324ca66e9ffdafa9e5b5a1478a548aa20f3a23f264eb1bed6d21c1c7d039",
      "decodedPath": "response-4.body",
      "decodedBytes": 240,
      "decodedSha256": "b6ef324ca66e9ffdafa9e5b5a1478a548aa20f3a23f264eb1bed6d21c1c7d039",
      "headersPath": "wire-4.headers.json",
      "headersBytes": 1145,
      "headersSha256": "3659fcef481eb6b6f9853d35d0cf5f7c5de65ab613dfc0f20446fb86f49cbbb1",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.lua.org/manual/5.4/",
    "title": "Lua 5.4 Reference Manual - contents",
    "root": "e1",
    "nodeCount": 2341,
    "revision": 2345,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T03:03:57.199Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.lua.org/manual/5.4/",
      "root": "e1",
      "revision": 2345,
      "source": "page.styles.metrics().colorScheme",
      "colorScheme": {
        "preference": null,
        "effective": "light",
        "profile": "native-ua-color-preference",
        "systemIntegration": false,
        "siteOverrides": false
      },
      "sessionPreferenceSource": "session.colorSchemePreference(tabId)",
      "sessionPreference": null
    },
    "history": {
      "key": "h1-1",
      "url": "https://www.lua.org/manual/5.4/",
      "state": null,
      "index": 0,
      "length": 1
    },
    "sessionHistory": {
      "index": 0,
      "length": 1,
      "entries": [
        {
          "key": "h1-1",
          "url": "https://www.lua.org/manual/5.4/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 39,
      "evictedDocuments": 0
    },
    "scroll": {
      "x": 0,
      "y": 0,
      "maximum": {
        "x": 0,
        "y": 0
      },
      "revision": -1,
      "builds": 0,
      "updates": 0,
      "work": 0,
      "closed": false
    },
    "scrollObservation": "existing native metrics only; no geometry refresh or direct scrolling",
    "nativeRequestAttempts": 4
  },
  "selected": {
    "index": 2,
    "reference": "e33",
    "href": "manual.html",
    "url": "https://www.lua.org/manual/5.4/manual.html",
    "text": "start",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 5,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 90
  },
  "afterClick": {
    "url": "https://www.lua.org/manual/5.4/",
    "title": "Lua 5.4 Reference Manual - contents",
    "root": "e1",
    "nodeCount": 2341,
    "revision": 2345,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T03:03:57.228Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.lua.org/manual/5.4/",
      "root": "e1",
      "revision": 2345,
      "source": "page.styles.metrics().colorScheme",
      "colorScheme": {
        "preference": null,
        "effective": "light",
        "profile": "native-ua-color-preference",
        "systemIntegration": false,
        "siteOverrides": false
      },
      "sessionPreferenceSource": "session.colorSchemePreference(tabId)",
      "sessionPreference": null
    },
    "history": {
      "key": "h1-1",
      "url": "https://www.lua.org/manual/5.4/",
      "state": null,
      "index": 0,
      "length": 1
    },
    "sessionHistory": {
      "index": 0,
      "length": 1,
      "entries": [
        {
          "key": "h1-1",
          "url": "https://www.lua.org/manual/5.4/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 39,
      "evictedDocuments": 0
    },
    "scroll": {
      "x": 0,
      "y": 0,
      "maximum": {
        "x": 0,
        "y": 0
      },
      "revision": -1,
      "builds": 0,
      "updates": 0,
      "work": 0,
      "closed": false
    },
    "scrollObservation": "existing native metrics only; no geometry refresh or direct scrolling",
    "nativeRequestAttempts": 4
  },
  "ownerEvidence": {
    "eventOwnersInstrumented": 1,
    "imageOwnersInstrumented": 1,
    "eventOwnerCleanupProved": true,
    "imageOwnerCleanupProved": true,
    "documentOwnersInstrumented": 1,
    "controlOwnersInstrumented": 1,
    "documentOwnerCleanupProved": true,
    "controlOwnerCleanupProved": true,
    "scope": "Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"
  },
  "sourceSha256": "a17003a374936ef07f7cb39ce2cf57d0ce739e0dbf865e935fad081347d14bb9",
  "compiledSha256": "97dd82d475c52022e6602e066646d292244f9ff2fe45e66aaeb958fc1eb81570"
}
```
