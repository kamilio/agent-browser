# Netlib documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T06:26:34.198Z through 2026-09-12T06:26:34.567Z.
- Supervisor UTC: 2026-09-12T06:26:34.084Z through 2026-09-12T06:26:34.576Z; 492 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Document width resolution requires an issue-free supported formatting profile"}.
- Counts: 1 initial navigation, 1 genuine click, 1 actual document commits, 2 native transport requests, 2 wire GETs, 2 adapter request-start observations, 2 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.netlib.org/","title":"The Netlib","root":"e1","nodeCount":163,"revision":164,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T06:26:34.555Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/","root":"e1","revision":164,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.netlib.org/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":true,"requiresResubmission":false}],"retainedBytes":31,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Discovery: 21 anchors inspected, availability before deduplication; 2 eligible occurrences and 1 unique destinations; selected {"index":15,"reference":"e133","href":"misc/faq.html","url":"https://www.netlib.org/misc/faq.html","text":"Frequently Asked Questions about Netlib (FAQ)","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":6,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":2}.
- After click/failure: {"url":"https://www.netlib.org/","title":"The Netlib","root":"e1","nodeCount":163,"revision":164,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T06:26:34.564Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/","root":"e1","revision":164,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.netlib.org/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":true,"requiresResubmission":false}],"retainedBytes":31,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.netlib.org/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

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

The completed IANA flow remains failed and untouched. Its successful checks-verified.mjs supplies the checker, not its failed original checks.mjs. Both original seals (194/196 receipts) and their members are verified before/after this run and during read-only verification. 26 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation and failed checks belong to this lane only; any failures are preserved and enumerated below. IANA historical failures are not new Netlib failures. The checker normalizes ordered raw headers offline with IncomingMessage._addHeaderLines while retaining distinct native raw values. No socket self-probes or refetch.

The candidate filter conservatively requires an actual .htm/.html path and guide/FAQ/about/help/manual/documentation wording. Directory and extensionless anchors are not substitutes; destination text/html MIME is checked if reached.

Working HEAD observations: before 18a6c7a2879dc9c68fd4e06dca93fe7249172c81; after 18a6c7a2879dc9c68fd4e06dca93fe7249172c81. These are independent of the pinned runtime commit. Git status snapshots retain path metadata only; protected payloads and credentials were not read. Concurrent external edits are not attributed to this lane.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.netlib.org/` | document | 200 | 3921 / 3921 |
| 2 | `https://www.netlib.org/netlib2.gif` | image | 200 | 6710 / 6710 |

Native measured totals: 10631 encoded bytes, 10631 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## One bounded failure census

- Raw CSS: {}; authoritative source styles.metrics().issues.
- Applicable CSS: {}; authoritative source styles.metrics().applicableIssues.
- Formatting CSS: {}.
- Independent non-CSS formatting issues: {"element-layout-not-supported":1}.
- Non-advisory non-CSS issues: {"element-layout-not-supported":1}.
- Deferred nodes: 1; 1 bounded actual-node samples. DOM revision 164/164.
- Counts do not identify a sole cause. No naive substring CSS excerpts, suppression, layout fallback or second interaction.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":1,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":true,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":1,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":true,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: []. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only NETLIB-DOCUMENTATION-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-netlib-flow-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/setpriv --no-new-privs /usr/bin/python3 -I -B "$LANE/strict-offline-exec.py" /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import "$LANE/network-guard.mjs" "$LANE/verify-verified.mjs" </dev/null
```

## Exact machine-verifiable claims

```json
{
  "budget": {
    "checks": [
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "historicalIANAFlowNotReclassifiedOrExecuted",
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
        "message": "Document width resolution requires an issue-free supported formatting profile"
      },
      "wallMs": 492
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
      "visitedDomNodes": 129,
      "boxes": 153,
      "outsideMarkers": 17,
      "textCodeUnits": 924,
      "work": 1686,
      "deferredSubtrees": 1
    },
    "formattingNodes": 136,
    "nonCssFormattingIssues": {
      "element-layout-not-supported": 1
    },
    "formattingCssIssues": {},
    "rawCssIssues": {},
    "applicableCssIssues": {},
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
    "nonAdvisoryFormattingCssIssues": {},
    "nonAdvisoryNonCssFormattingIssues": {
      "element-layout-not-supported": 1
    },
    "deferredCount": 1,
    "deferredSamples": [
      {
        "id": 5,
        "ref": "e21",
        "kind": "deferred",
        "domTag": "center",
        "display": "inline",
        "contentMode": null,
        "deferredReason": "element-layout-not-supported",
        "attributes": {},
        "actualStyles": {
          "visibility": {
            "display": "inline",
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
            "border-spacing": "0px 0px",
            "caption-side": "top",
            "empty-cells": "show",
            "vertical-align": "baseline"
          }
        }
      }
    ],
    "revisionBefore": 164,
    "revisionAfter": 164,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T06:26:34.198Z",
  "finishedAt": "2026-09-12T06:26:34.567Z",
  "failure": {
    "stage": "native-documentation-link-click",
    "name": "AgentBrowserError",
    "code": "unsupported",
    "message": "Document width resolution requires an issue-free supported formatting profile"
  },
  "accounting": {
    "nativeRequestAttempts": 2,
    "transportRequests": 2,
    "wireRequestCalls": 2,
    "wireResponses": 2,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 10631,
    "decodedBytes": 10631,
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
      "url": "https://www.netlib.org/",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-1.body",
      "encodedBytes": 3921,
      "encodedSha256": "e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236",
      "decodedPath": "response-1.body",
      "decodedBytes": 3921,
      "decodedSha256": "e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 980,
      "headersSha256": "e8aaf747a6f2bbbe8bf9acd4161e9033e3b8dbc0a0987de2a1ca4f69aec29f4b",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.netlib.org/netlib2.gif",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-2.body",
      "encodedBytes": 6710,
      "encodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "decodedPath": "response-2.body",
      "decodedBytes": 6710,
      "decodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1169,
      "headersSha256": "8e379b291ef8fce57d397b74929fae1c60e9b9fd67f89a8ee86a2308747d506d",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.netlib.org/",
    "title": "The Netlib",
    "root": "e1",
    "nodeCount": 163,
    "revision": 164,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T06:26:34.555Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.netlib.org/",
      "root": "e1",
      "revision": 164,
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
      "url": "https://www.netlib.org/",
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
          "url": "https://www.netlib.org/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 31,
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
    "index": 15,
    "reference": "e133",
    "href": "misc/faq.html",
    "url": "https://www.netlib.org/misc/faq.html",
    "text": "Frequently Asked Questions about Netlib (FAQ)",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 6,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 2
  },
  "afterClick": {
    "url": "https://www.netlib.org/",
    "title": "The Netlib",
    "root": "e1",
    "nodeCount": 163,
    "revision": 164,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T06:26:34.564Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.netlib.org/",
      "root": "e1",
      "revision": 164,
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
      "url": "https://www.netlib.org/",
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
          "url": "https://www.netlib.org/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 31,
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
