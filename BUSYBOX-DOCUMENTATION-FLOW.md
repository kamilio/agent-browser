# BusyBox documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T07:32:43.833Z through 2026-09-12T07:32:45.275Z.
- Supervisor UTC: 2026-09-12T07:32:43.717Z through 2026-09-12T07:32:45.286Z; 1569 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Document width resolution requires an issue-free supported formatting profile"}.
- Counts: 1 initial navigation, 1 genuine click, 1 actual document commits, 4 native transport requests, 4 wire GETs, 4 adapter request-start observations, 4 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.busybox.net/","title":"BusyBox","root":"e1","nodeCount":1505,"revision":1509,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T07:32:45.245Z","reason":"before-or-after-click-state","url":"https://www.busybox.net/","root":"e1","revision":1509,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.busybox.net/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.busybox.net/","active":true,"requiresResubmission":false}],"retainedBytes":32,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":4}.
- Discovery: 96 anchors inspected, availability before deduplication; 3 eligible occurrences and 3 unique destinations; selected {"index":1,"reference":"e55","href":"about.html","url":"https://www.busybox.net/about.html","text":"About BusyBox","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":10,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":1}.
- After click/failure: {"url":"https://www.busybox.net/","title":"BusyBox","root":"e1","nodeCount":1505,"revision":1509,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T07:32:45.266Z","reason":"before-or-after-click-state","url":"https://www.busybox.net/","root":"e1","revision":1509,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.busybox.net/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.busybox.net/","active":true,"requiresResubmission":false}],"retainedBytes":32,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":4}.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.busybox.net/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-nonfloating-clear-september12-round02/snapshot01/dist`; commit `5c6aea54cf6d9ce61569f57518cd836ebe8bf506`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code was not executed; only the released non-floating-clearance snapshot was used.

Reverified 20 gate receipts, 1121 source files, 1944 compiled files, and 12 commit-owned inputs. Historical gate: 12187 passed, 0 failed, 2 unchanged exclusions; 231 selected suites, 230 strict roots, 625 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `dabe4002756bc5d4c29f1b2273ec0334fbc768f07587b14356202098db11f1c5`.
- compiled SHA256: `d2790f7e8f29e5d4be288e9308d3a32894f437ef4a1321f843aae489dd0c47d9`.
- nativeResults SHA256: `659727a60ac78db6c2abf0c299f21568ef91a22fe417c11502166ffbcdef436f`.
- summary SHA256: `5728a84726e6aca2ed719ec76a0c8ce3c3c32ec1955fb6a98aa7d01394fae2ed`.
- audit SHA256: `2af5b45d138e03074ca6b5a8e3d56eddbc833b59126c2a20c752bf25abc67836`.
- receipts SHA256: `add18a0d0f12a01ed260f266d559140bda6502edca3f613508e92296ba6a84cc`.
- commitVerification SHA256: `668f40c99c6580dbdc6fadea366371126e7e754a5dc72c7419d99a8a8fa73c38`.

The completed Netlib flow remains failed and untouched. Its completed checks-verified.mjs supplies the checker, invoked historically by verify-verified.sh. Both original seals (146/148 receipts) and their members are verified before/after this run and during read-only verification. 26 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation and failed checks belong to this lane only; any failures are preserved and enumerated below. Netlib historical failures are not new BusyBox failures. The checker normalizes ordered raw headers offline with IncomingMessage._addHeaderLines while retaining distinct native raw values. No socket self-probes or refetch.

The candidate filter conservatively requires an actual .htm/.html path and guide/FAQ/about/help/manual/documentation wording. Directory and extensionless anchors are not substitutes; destination text/html MIME is checked if reached.

Working HEAD observations: before b88e11e9fa703e17040dfe618b85f6c4c3c19cae; after b88e11e9fa703e17040dfe618b85f6c4c3c19cae. These are independent of the pinned runtime commit. Git status snapshots retain path metadata only; protected payloads and credentials were not read. Concurrent external edits are not attributed to this lane.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.busybox.net/` | document | 200 | 249489 / 249489 |
| 2 | `https://www.busybox.net/images/busybox1.png` | image | 200 | 10913 / 10913 |
| 3 | `https://www.busybox.net/images/written.in.vi.png` | image | 200 | 4394 / 4394 |
| 4 | `https://www.busybox.net/images/osuosl.png` | image | 200 | 8683 / 8683 |

Native measured totals: 273479 encoded bytes, 273479 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## One bounded failure census

- Raw CSS: {"unimplemented-or-invalid-css-value":3}; authoritative source styles.metrics().issues.
- Applicable CSS: {"unimplemented-or-invalid-css-value":2}; authoritative source styles.metrics().applicableIssues.
- Formatting CSS: {"css:unimplemented-or-invalid-css-value":2}.
- Independent non-CSS formatting issues: {"html-presentation-hint-not-supported":9,"html-table-presentation-hint-not-supported":2,"display-layout-not-supported":3}.
- Non-advisory non-CSS issues: {"html-presentation-hint-not-supported":9,"html-table-presentation-hint-not-supported":2,"display-layout-not-supported":3}.
- Deferred nodes: 3; 3 bounded actual-node samples. DOM revision 1509/1509.
- Counts do not identify a sole cause. No naive substring CSS excerpts, suppression, layout fallback or second interaction.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":1,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":true,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":1,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":true,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: []. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only BUSYBOX-DOCUMENTATION-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-busybox-flow-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/setpriv --no-new-privs /usr/bin/python3 -I -B "$LANE/strict-offline-exec.py" /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import "$LANE/network-guard.mjs" "$LANE/verify-verified.mjs" </dev/null
```

## Exact machine-verifiable claims

```json
{
  "budget": {
    "checks": [
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "historicalNetlibFlowNotReclassifiedOrExecuted",
      "documentLimitsAndDisabledPageRuntimePreserved",
      "independentAdapterNativeWireAndMockAccounting",
      "responseAndTotalTransferCapsObserved",
      "noWireRequestsAfterGlobalStop",
      "freshSingleNavigationAtMostOneRealClick",
      "discoveredDocumentationOnlyNoDownloadOrForcedNavigation",
      "twelveExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
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
      "wireRequests": 4,
      "adapterEntries": 4,
      "commits": 1,
      "clicks": 1,
      "failure": {
        "stage": "native-documentation-link-click",
        "name": "AgentBrowserError",
        "code": "unsupported",
        "message": "Document width resolution requires an issue-free supported formatting profile"
      },
      "wallMs": 1569
    },
    "censusMethod": "One authoritative raw/applicable CSS and non-CSS/deferred census; no substring rule excerpts",
    "newFailedCheckArtifacts": []
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
      "visitedDomNodes": 1495,
      "boxes": 1859,
      "outsideMarkers": 77,
      "textCodeUnits": 234088,
      "work": 249047,
      "deferredSubtrees": 3
    },
    "formattingNodes": 1782,
    "nonCssFormattingIssues": {
      "html-presentation-hint-not-supported": 9,
      "html-table-presentation-hint-not-supported": 2,
      "display-layout-not-supported": 3
    },
    "formattingCssIssues": {
      "css:unimplemented-or-invalid-css-value": 2
    },
    "rawCssIssues": {
      "unimplemented-or-invalid-css-value": 3
    },
    "applicableCssIssues": {
      "unimplemented-or-invalid-css-value": 2
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
      "css:unimplemented-or-invalid-css-value": 2
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "html-presentation-hint-not-supported": 9,
      "html-table-presentation-hint-not-supported": 2,
      "display-layout-not-supported": 3
    },
    "deferredCount": 3,
    "deferredSamples": [
      {
        "id": 6,
        "ref": "e19",
        "kind": "deferred",
        "domTag": "table",
        "display": "table",
        "contentMode": "table",
        "deferredReason": "display-layout-not-supported",
        "attributes": {
          "cellpadding": "0",
          "cellspacing": "0",
          "border": "0"
        },
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
            "border-top-width": "3px",
            "border-right-width": "3px",
            "border-bottom-width": "3px",
            "border-left-width": "3px",
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
            "border-collapse": "separate",
            "border-spacing": "2px 2px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      },
      {
        "id": 13,
        "ref": "e28",
        "kind": "deferred",
        "domTag": "table",
        "display": "table",
        "contentMode": "table",
        "deferredReason": "display-layout-not-supported",
        "attributes": {
          "cellpadding": "2",
          "cellspacing": "1",
          "border": "0"
        },
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
            "border-top-width": "3px",
            "border-right-width": "3px",
            "border-bottom-width": "3px",
            "border-left-width": "3px",
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
            "border-collapse": "separate",
            "border-spacing": "2px 2px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      },
      {
        "id": 1745,
        "ref": "e1464",
        "kind": "deferred",
        "domTag": "table",
        "display": "table",
        "contentMode": "table",
        "deferredReason": "display-layout-not-supported",
        "attributes": {
          "width": "100%"
        },
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
            "border-top-width": "3px",
            "border-right-width": "3px",
            "border-bottom-width": "3px",
            "border-left-width": "3px",
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
            "border-collapse": "separate",
            "border-spacing": "2px 2px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      }
    ],
    "revisionBefore": 1509,
    "revisionAfter": 1509,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T07:32:43.833Z",
  "finishedAt": "2026-09-12T07:32:45.275Z",
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
    "encodedBytes": 273479,
    "decodedBytes": 273479,
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
      "url": "https://www.busybox.net/",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-1.body",
      "encodedBytes": 249489,
      "encodedSha256": "1027545b603f291070247f4f6272556a9538ad224860cfe2b2be4f8ff39d904b",
      "decodedPath": "response-1.body",
      "decodedBytes": 249489,
      "decodedSha256": "1027545b603f291070247f4f6272556a9538ad224860cfe2b2be4f8ff39d904b",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1195,
      "headersSha256": "09bf7f4b288dc458378aae6dee5e181aec441bc9fa0a7bd10b5ce14e9fa74630",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.busybox.net/images/busybox1.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-2.body",
      "encodedBytes": 10913,
      "encodedSha256": "04efc8545e0a54742f922bb538ac673d2dc7407dbd997ee592d9adf7948eaed6",
      "decodedPath": "response-2.body",
      "decodedBytes": 10913,
      "decodedSha256": "04efc8545e0a54742f922bb538ac673d2dc7407dbd997ee592d9adf7948eaed6",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1424,
      "headersSha256": "df12f54d5a8b82d920d91a562435c11a7a294423da25b750d7514abf81f54a43",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://www.busybox.net/images/written.in.vi.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-3.body",
      "encodedBytes": 4394,
      "encodedSha256": "1d52ed29bf5c8e6610c4e6d0ea871bc67df1c4b8bcd5e98124ba00176a3ac748",
      "decodedPath": "response-3.body",
      "decodedBytes": 4394,
      "decodedSha256": "1d52ed29bf5c8e6610c4e6d0ea871bc67df1c4b8bcd5e98124ba00176a3ac748",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1427,
      "headersSha256": "47555954dd3e322ffcf859d23533ea062212867ed08be9da019b61c6bc088199",
      "redactedHeaderPairs": 0
    },
    {
      "id": 4,
      "url": "https://www.busybox.net/images/osuosl.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-4.body",
      "encodedBytes": 8683,
      "encodedSha256": "95e1dc8985f7ed00a3195f5591e6abf8e4be0a9f0bd3a50a89f2ebb8db443455",
      "decodedPath": "response-4.body",
      "decodedBytes": 8683,
      "decodedSha256": "95e1dc8985f7ed00a3195f5591e6abf8e4be0a9f0bd3a50a89f2ebb8db443455",
      "headersPath": "wire-4.headers.json",
      "headersBytes": 1420,
      "headersSha256": "725da4dc2ae4d5b4f71cf414365b383d14c9c1205b21db6e2f9ad87288f8b471",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.busybox.net/",
    "title": "BusyBox",
    "root": "e1",
    "nodeCount": 1505,
    "revision": 1509,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T07:32:45.245Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.busybox.net/",
      "root": "e1",
      "revision": 1509,
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
      "url": "https://www.busybox.net/",
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
          "url": "https://www.busybox.net/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 32,
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
    "index": 1,
    "reference": "e55",
    "href": "about.html",
    "url": "https://www.busybox.net/about.html",
    "text": "About BusyBox",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 10,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 1
  },
  "afterClick": {
    "url": "https://www.busybox.net/",
    "title": "BusyBox",
    "root": "e1",
    "nodeCount": 1505,
    "revision": 1509,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T07:32:45.266Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.busybox.net/",
      "root": "e1",
      "revision": 1509,
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
      "url": "https://www.busybox.net/",
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
          "url": "https://www.busybox.net/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 32,
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
  "sourceSha256": "dabe4002756bc5d4c29f1b2273ec0334fbc768f07587b14356202098db11f1c5",
  "compiledSha256": "d2790f7e8f29e5d4be288e9308d3a32894f437ef4a1321f843aae489dd0c47d9"
}
```
