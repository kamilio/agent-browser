# IANA reserved-domain documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T06:10:45.086Z through 2026-09-12T06:10:45.478Z.
- Supervisor UTC: 2026-09-12T06:10:44.967Z through 2026-09-12T06:10:45.489Z; 522 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Float integration with flex, grid and table reflow is not coordinated"}.
- Counts: 1 initial navigation, 1 genuine click, 1 actual document commits, 2 native transport requests, 2 wire GETs, 2 adapter request-start observations, 2 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.iana.org/domains/reserved","title":"IANA-managed Reserved Domains","root":"e1","nodeCount":549,"revision":551,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T06:10:45.452Z","reason":"before-or-after-click-state","url":"https://www.iana.org/domains/reserved","root":"e1","revision":551,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.iana.org/domains/reserved","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.iana.org/domains/reserved","active":true,"requiresResubmission":false}],"retainedBytes":45,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Discovery: 56 anchors inspected, availability before deduplication; 24 eligible occurrences and 15 unique destinations; selected {"index":18,"reference":"e323","href":"/domains/root/help","url":"https://www.iana.org/domains/root/help","text":"Instructions & Guides","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":11,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":1}.
- After click/failure: {"url":"https://www.iana.org/domains/reserved","title":"IANA-managed Reserved Domains","root":"e1","nodeCount":549,"revision":551,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T06:10:45.472Z","reason":"before-or-after-click-state","url":"https://www.iana.org/domains/reserved","root":"e1","revision":551,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.iana.org/domains/reserved","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.iana.org/domains/reserved","active":true,"requiresResubmission":false}],"retainedBytes":45,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.iana.org/domains/reserved and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-float-atomic-september12-round02/snapshot01/dist`; commit `addf9898d11f2d2a16b56499393b740e0d74271a`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code was not executed; only the released float/atomic snapshot was used.

Reverified 20 gate receipts, 1114 source files, 1944 compiled files, and 13 commit-owned inputs. Historical gate: 12037 passed, 0 failed, 2 unchanged exclusions; 224 selected suites, 223 strict roots, 618 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `eb7269a4e836d8ef85e6b06f87c89008959a2f317ca1dfa8caba80d2baa13380`.
- compiled SHA256: `fa71f79779777c219454373067d8d9a11f2541e7b8596871ef4ffc6f05cd3462`.
- nativeResults SHA256: `89c2586e156fe12ca96a34329b6140c79cc5325ad81eaf176c3d6d6be4289278`.
- summary SHA256: `4b5fb0b3d5ad188ead4f766cf0af4f5b52586f6df07b547b0e710525eb2b713b`.
- audit SHA256: `8c0e160fcd5ceed46351fb3e7f97f27b6a7da7304209aa357e30b312261f89ca`.
- receipts SHA256: `b30d8f04ab3ba742fcdcfc101d7d7cc3563fad52da2cf7b3c4e202c2a7d22db7`.
- commitVerification SHA256: `83d80ac2138948d8d81648d1d5a60192e690eb51a46bf9df9e5d61ff5e9de843`.

The completed GnuPG flow remains failed and untouched. Both original seals (145/147 receipts) and their members are verified before/after this run and during read-only verification. 26 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation first stopped on an over-strict working-HEAD assertion: HEAD advanced externally from the pinned release to fea1bb4bd1ab9335367d63da34ceb9a0d5ab2381. The runtime remained pinned to addf9898d11f2d2a16b56499393b740e0d74271a. A subsequent preparation stopped on a mistyped commit-verification hash; the exact RELEASE.md value was used in a separately saved continuation. Both original scripts, output streams and failure receipts remain unchanged. No native launch occurred during preparation.

The first offline report check assumed that Node normalized headers and native raw-header lists were identical. IANA repeated x-content-type-options: Node joined these values, while native transport retained both. That failed check remains unchanged. The final checker independently decodes the captured ordered rawHeaders through pinned Node IncomingMessage in memory, compares normalized headers to the wire record, and compares distinct raw values to native response metadata. The first in-memory decoder initialization attempt also failed and remains preserved: assigning rawHeaders alone did not initialize the pinned Node header count. The final checker invokes the pinned in-memory _addHeaderLines initializer before reading normalized headers. No sockets, mock requests, refetch or response edits are involved.

Predirty byte proof: {"checkedAt":"2026-09-12T06:11:25.716Z","pinnedRuntimeCommit":"addf9898d11f2d2a16b56499393b740e0d74271a","preparationHead":"fea1bb4bd1ab9335367d63da34ceb9a0d5ab2381","currentHead":"fea1bb4bd1ab9335367d63da34ceb9a0d5ab2381","previousStatusSha256":"29d9ffcd52f81f69a8c6c0eab34a6bc3a1bfc2cc5e68d62aa4300dd6b67072f1","currentStatusSha256":"b0f77feb816afdd6d82673ba11fa5be09ab35f8cd53a6289634d37fe27999239","baselineFiles":738,"baselineFilesUnchanged":true,"observedExternalChanges":[],"protectedPathsNotRead":[],"ownedPaths":["IANA-RESERVED-DOMAINS-FLOW.md","node_modules/.cache/native-validation/native-iana-flow-september12/"],"agentCommitted":false,"agentPushed":false,"parentMayWorkConcurrently":true}.

The original verifier/checker files are preserved as executed; use verify-verified.mjs or sh node_modules/.cache/native-validation/native-iana-flow-september12/verify-verified.sh. A further preserved offline check found an adaptation typo in its expected lane-cap literal (16777224 rather than 16777216); the actual predeclared and enforced live cap was always 16MiB. The final budget checker expresses that exact cap as 16 * 1024 * 1024. Final checker and sealer additions are covered by both artifact inventories and the final seals.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.iana.org/domains/reserved` | document | 200 | 2451 / 10499 |
| 2 | `https://www.iana.org/static/css/iana_website.0feeb53883fa.css` | stylesheet | 200 | 14085 / 88658 |

Native measured totals: 16536 encoded bytes, 99157 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## One bounded failure census

- Raw CSS: {"unimplemented-css-at-rule":9,"unimplemented-or-invalid-css-value":42,"unimplemented-css-property":309,"unimplemented-or-invalid-css-selector":32,"unimplemented-or-invalid-media-query":1}; authoritative source styles.metrics().issues.
- Applicable CSS: {"unimplemented-css-at-rule":9,"unimplemented-css-property":53,"unimplemented-or-invalid-css-selector":32,"unimplemented-or-invalid-css-value":11,"unimplemented-or-invalid-media-query":1}; authoritative source styles.metrics().applicableIssues.
- Formatting CSS: {"css:unimplemented-css-at-rule":9,"css:unimplemented-css-property":53,"css:unimplemented-or-invalid-css-selector":32,"css:unimplemented-or-invalid-css-value":11,"css:unimplemented-or-invalid-media-query":1}.
- Independent non-CSS formatting issues: {"float-layout-not-supported":22,"display-layout-not-supported":3,"overflow-layout-not-supported":1}.
- Non-advisory non-CSS issues: {"float-layout-not-supported":22,"display-layout-not-supported":3,"overflow-layout-not-supported":1}.
- Deferred nodes: 3; 3 bounded actual-node samples. DOM revision 551/551.
- Counts do not identify a sole cause. No naive substring CSS excerpts, suppression, layout fallback or second interaction.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":1,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":true,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":1,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":true,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: ["PREPARATION-FAILURE-1789193326770.json","PREPARATION-FAILURE-1789193360563.json","REPORT-GENERATION-FAILURE-1789193485770.json","REPORT-GENERATION-FAILURE-1789193542523.json","REPORT-GENERATION-FAILURE-1789193581722.json"]. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only IANA-RESERVED-DOMAINS-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-iana-flow-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/setpriv --no-new-privs /usr/bin/python3 -I -B "$LANE/strict-offline-exec.py" /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import "$LANE/network-guard.mjs" "$LANE/verify-verified.mjs" </dev/null
```

## Exact machine-verifiable claims

```json
{
  "budget": {
    "checks": [
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "historicalGnuPGFlowNotReclassifiedOrExecuted",
      "documentLimitsAndDisabledPageRuntimePreserved",
      "independentAdapterNativeWireAndMockAccounting",
      "responseAndTotalTransferCapsObserved",
      "noWireRequestsAfterGlobalStop",
      "freshSingleNavigationAtMostOneRealClick",
      "discoveredDocumentationOnlyNoDownloadOrForcedNavigation",
      "thirteenExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
      "allLaneFilesPrivate"
    ],
    "fixedBeforeLaunch": {
      "maxRequests": 32,
      "maxResponseBytes": 2097152,
      "maxTotalBytes": 8388608
    },
    "historicalReferenceFlowPassed": false,
    "current": {
      "flowPassed": false,
      "wireRequests": 2,
      "adapterEntries": 2,
      "commits": 1,
      "clicks": 1,
      "failure": {
        "stage": "native-documentation-link-click",
        "name": "AgentBrowserError",
        "code": "unsupported",
        "message": "Float integration with flex, grid and table reflow is not coordinated"
      },
      "wallMs": 522
    },
    "censusMethod": "One authoritative raw/applicable CSS and non-CSS/deferred census; no substring rule excerpts",
    "newFailedCheckArtifacts": [
      "PREPARATION-FAILURE-1789193326770.json",
      "PREPARATION-FAILURE-1789193360563.json",
      "REPORT-GENERATION-FAILURE-1789193485770.json",
      "REPORT-GENERATION-FAILURE-1789193542523.json",
      "REPORT-GENERATION-FAILURE-1789193581722.json"
    ]
  },
  "formattingCensus": {
    "scope": "one bounded readonly native formatting build after layout failure; no second interaction",
    "nativeLimits": {
      "maxOwnedNodes": 50000,
      "maxBoxes": 50000,
      "maxDepth": 256,
      "maxTextCodeUnits": 1000000,
      "maxWork": 2000000
    },
    "metrics": {
      "visitedDomNodes": 527,
      "boxes": 583,
      "outsideMarkers": 22,
      "textCodeUnits": 4381,
      "work": 21922,
      "deferredSubtrees": 3
    },
    "formattingNodes": 561,
    "nonCssFormattingIssues": {
      "float-layout-not-supported": 22,
      "display-layout-not-supported": 3,
      "overflow-layout-not-supported": 1
    },
    "formattingCssIssues": {
      "css:unimplemented-css-at-rule": 9,
      "css:unimplemented-css-property": 53,
      "css:unimplemented-or-invalid-css-selector": 32,
      "css:unimplemented-or-invalid-css-value": 11,
      "css:unimplemented-or-invalid-media-query": 1
    },
    "rawCssIssues": {
      "unimplemented-css-at-rule": 9,
      "unimplemented-or-invalid-css-value": 42,
      "unimplemented-css-property": 309,
      "unimplemented-or-invalid-css-selector": 32,
      "unimplemented-or-invalid-media-query": 1
    },
    "applicableCssIssues": {
      "unimplemented-css-at-rule": 9,
      "unimplemented-css-property": 53,
      "unimplemented-or-invalid-css-selector": 32,
      "unimplemented-or-invalid-css-value": 11,
      "unimplemented-or-invalid-media-query": 1
    },
    "observedColorScheme": {
      "preference": null,
      "effective": "light",
      "profile": "native-ua-color-preference",
      "systemIntegration": false,
      "siteOverrides": false
    },
    "cssDiagnosticSources": {
      "rawCssIssues": "styles.metrics().issues",
      "applicableCssIssues": "styles.metrics().applicableIssues"
    },
    "nonAdvisoryFormattingCssIssues": {
      "css:unimplemented-css-at-rule": 9,
      "css:unimplemented-css-property": 53,
      "css:unimplemented-or-invalid-css-selector": 32,
      "css:unimplemented-or-invalid-css-value": 11
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "float-layout-not-supported": 22,
      "display-layout-not-supported": 3,
      "overflow-layout-not-supported": 1
    },
    "deferredCount": 3,
    "deferredSamples": [
      {
        "id": 46,
        "ref": "e64",
        "kind": "deferred",
        "domTag": "article",
        "display": "flex",
        "contentMode": "flex",
        "deferredReason": "display-layout-not-supported",
        "attributes": {},
        "actualStyles": {
          "visibility": {
            "display": "flex",
            "visibility": "visible",
            "displayed": true,
            "visible": true
          },
          "box": {
            "top": "auto",
            "right": "auto",
            "bottom": "auto",
            "left": "auto",
            "border-top-width": "0px",
            "border-right-width": "0px",
            "border-bottom-width": "0px",
            "border-left-width": "0px",
            "border-top-style": "none",
            "border-right-style": "none",
            "border-bottom-style": "none",
            "border-left-style": "none",
            "width": "1100px",
            "height": "auto",
            "min-width": "auto",
            "min-height": "auto",
            "max-width": "none",
            "max-height": "none",
            "box-sizing": "content-box",
            "margin-top": "0px",
            "margin-right": "auto",
            "margin-bottom": "0px",
            "margin-left": "auto",
            "padding-top": "25px",
            "padding-right": "50px",
            "padding-bottom": "25px",
            "padding-left": "50px"
          },
          "table": {
            "table-layout": "auto",
            "border-collapse": "separate",
            "border-spacing": "0px 0px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      },
      {
        "id": 88,
        "ref": "e106",
        "kind": "deferred",
        "domTag": "table",
        "display": "table",
        "contentMode": "table",
        "deferredReason": "display-layout-not-supported",
        "attributes": {},
        "actualStyles": {
          "visibility": {
            "display": "table",
            "visibility": "visible",
            "displayed": true,
            "visible": true
          },
          "box": {
            "top": "auto",
            "right": "auto",
            "bottom": "auto",
            "left": "auto",
            "border-top-width": "0px",
            "border-right-width": "0px",
            "border-bottom-width": "0px",
            "border-left-width": "0px",
            "border-top-style": "none",
            "border-right-style": "none",
            "border-bottom-style": "none",
            "border-left-style": "none",
            "width": "100%",
            "height": "auto",
            "min-width": "auto",
            "min-height": "auto",
            "max-width": "none",
            "max-height": "none",
            "box-sizing": "content-box",
            "margin-top": "0px",
            "margin-right": "0px",
            "margin-bottom": "0px",
            "margin-left": "0px",
            "padding-top": "0px",
            "padding-right": "0px",
            "padding-bottom": "0px",
            "padding-left": "0px"
          },
          "table": {
            "table-layout": "auto",
            "border-collapse": "collapse",
            "border-spacing": "0px 0px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      },
      {
        "id": 414,
        "ref": "e407",
        "kind": "deferred",
        "domTag": "table",
        "display": "table",
        "contentMode": "table",
        "deferredReason": "display-layout-not-supported",
        "attributes": {},
        "actualStyles": {
          "visibility": {
            "display": "table",
            "visibility": "visible",
            "displayed": true,
            "visible": true
          },
          "box": {
            "top": "auto",
            "right": "auto",
            "bottom": "auto",
            "left": "auto",
            "border-top-width": "0px",
            "border-right-width": "0px",
            "border-bottom-width": "0px",
            "border-left-width": "0px",
            "border-top-style": "none",
            "border-right-style": "none",
            "border-bottom-style": "none",
            "border-left-style": "none",
            "width": "auto",
            "height": "auto",
            "min-width": "auto",
            "min-height": "auto",
            "max-width": "none",
            "max-height": "none",
            "box-sizing": "content-box",
            "margin-top": "10px",
            "margin-right": "50px",
            "margin-bottom": "10px",
            "margin-left": "50px",
            "padding-top": "0px",
            "padding-right": "0px",
            "padding-bottom": "0px",
            "padding-left": "0px"
          },
          "table": {
            "table-layout": "auto",
            "border-collapse": "collapse",
            "border-spacing": "0px 0px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      }
    ],
    "revisionBefore": 551,
    "revisionAfter": 551,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T06:10:45.086Z",
  "finishedAt": "2026-09-12T06:10:45.478Z",
  "failure": {
    "stage": "native-documentation-link-click",
    "name": "AgentBrowserError",
    "code": "unsupported",
    "message": "Float integration with flex, grid and table reflow is not coordinated"
  },
  "accounting": {
    "nativeRequestAttempts": 2,
    "transportRequests": 2,
    "wireRequestCalls": 2,
    "wireResponses": 2,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 16536,
    "decodedBytes": 99157,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 2,
    "admittedRequests": 2,
    "rejectedAdapterEntries": 0,
    "rejectedAdapterSamples": [],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.iana.org/domains/reserved",
      "status": 200,
      "kind": "document",
      "encoding": "br",
      "encodedPath": "wire-1.body",
      "encodedBytes": 2451,
      "encodedSha256": "b848149b1a1de9c0ff0679255f5d0040d43d71cde1a18b16f44f5d1db31b0aed",
      "decodedPath": "response-1.body",
      "decodedBytes": 10499,
      "decodedSha256": "720e5cce9016212d2d28777356d2844fb0ca9e19a32636eb232f8653360dc450",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 3240,
      "headersSha256": "fd3c54c01735c43ab8008adbd2757b808ad8ec91084dab1ca3c3c3c62d682686",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.iana.org/static/css/iana_website.0feeb53883fa.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "br",
      "encodedPath": "wire-2.body",
      "encodedBytes": 14085,
      "encodedSha256": "dd1edeef2663ac6c2d549192f3f6a9698315b2e1ac90c1acdc01648698bd02d0",
      "decodedPath": "response-2.body",
      "decodedBytes": 88658,
      "decodedSha256": "cb9b57cb380a9ee01d4c1974a56fcb0d77c10be6303081a179a4ee7cd9ee4eba",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 3350,
      "headersSha256": "59650034169881a8812b9716866b1d00e5fb142878fa81bbc2cfdd10a374039b",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.iana.org/domains/reserved",
    "title": "IANA-managed Reserved Domains",
    "root": "e1",
    "nodeCount": 549,
    "revision": 551,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T06:10:45.452Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.iana.org/domains/reserved",
      "root": "e1",
      "revision": 551,
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
      "url": "https://www.iana.org/domains/reserved",
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
          "url": "https://www.iana.org/domains/reserved",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 45,
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
    "nativeRequestAttempts": 2
  },
  "selected": {
    "index": 18,
    "reference": "e323",
    "href": "/domains/root/help",
    "url": "https://www.iana.org/domains/root/help",
    "text": "Instructions & Guides",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 11,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 1
  },
  "afterClick": {
    "url": "https://www.iana.org/domains/reserved",
    "title": "IANA-managed Reserved Domains",
    "root": "e1",
    "nodeCount": 549,
    "revision": 551,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T06:10:45.472Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.iana.org/domains/reserved",
      "root": "e1",
      "revision": 551,
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
      "url": "https://www.iana.org/domains/reserved",
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
          "url": "https://www.iana.org/domains/reserved",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 45,
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
    "nativeRequestAttempts": 2
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
  "sourceSha256": "eb7269a4e836d8ef85e6b06f87c89008959a2f317ca1dfa8caba80d2baa13380",
  "compiledSha256": "fa71f79779777c219454373067d8d9a11f2541e7b8596871ef4ffc6f05cd3462"
}
```
