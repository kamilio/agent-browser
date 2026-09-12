# Netlib documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T08:08:58.792Z through 2026-09-12T08:08:59.190Z.
- Supervisor UTC: 2026-09-12T08:08:58.677Z through 2026-09-12T08:08:59.198Z; 521 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Document width resolution requires an issue-free supported formatting profile"}.
- Counts: 1 initial navigation, 1 genuine click, 1 actual document commits, 2 native transport requests, 2 wire GETs, 2 adapter request-start observations, 2 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.netlib.org/","title":"The Netlib","root":"e1","nodeCount":163,"revision":164,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T08:08:59.177Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/","root":"e1","revision":164,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.netlib.org/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":true,"requiresResubmission":false}],"retainedBytes":31,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Discovery: 21 anchors inspected, availability before deduplication; 2 eligible occurrences and 1 unique destinations; selected {"index":15,"reference":"e133","href":"misc/faq.html","url":"https://www.netlib.org/misc/faq.html","text":"Frequently Asked Questions about Netlib (FAQ)","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":6,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":2}.
- After click/failure: {"url":"https://www.netlib.org/","title":"The Netlib","root":"e1","nodeCount":163,"revision":164,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T08:08:59.186Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/","root":"e1","revision":164,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.netlib.org/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":true,"requiresResubmission":false}],"retainedBytes":31,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.netlib.org/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-center-element-september12-round00/snapshot01/dist`; commit `607251ac70e165f7c84a6696b6d95d370d5c778f`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code was not executed; only the released center-element snapshot was used.

Reverified 20 gate receipts, 1127 source files, 1944 compiled files, and 8 commit-owned inputs. Historical gate: 12350 passed, 0 failed, 2 unchanged exclusions; 237 selected suites, 236 strict roots, 631 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `99f475ae85789ef66e7e64db3d5ddbb5f6744dc2644ede250d99b3c0c41a9fa1`.
- compiled SHA256: `78de8856b5d2c23442ca8852454adf47afc24256782ba80aab34a1bdb9f14dce`.
- nativeResults SHA256: `b29fad782de47a30d682cb6f3103cbe69351b93a7f289a8de056ecb0be69c6b4`.
- summary SHA256: `1166d9ad7843f304bfc74218a5436777eca87abd434f83ad69ee916e40616804`.
- audit SHA256: `66b5a3c1c09c0c5b911ddd955a1b1f14f200c5955cbdb6a2c8891e59a3ecb0da`.
- receipts SHA256: `a0710d0b6687e5982b25387fd51b4488c00518497989127a2b5924e1b44d6d03`.
- commitVerification SHA256: `559b8a4bd1d396fe28a51cfc8685d088949e0c57536adb46ecd791b90311c289`.

The historical 12037 Netlib flow remains failed and untouched, not a rerun baseline. The completed BusyBox harness/checker supplies the implementation pattern, not a successful website outcome. All four original seals (152/154/146/148 receipts) and their members are verified before/after this run and during read-only verification. 30 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation and failed checks belong to this lane only; any failures are preserved and enumerated below. Historical failures are not attributed to this new session. Repeated Netlib adds no host to the unchanged 75-attempt inventory. Center motivation does not prove resolution of independent formatting profiles. The checker normalizes ordered raw headers offline with IncomingMessage._addHeaderLines while retaining distinct native raw values. No socket self-probes or refetch.

The candidate filter conservatively requires an actual .htm/.html path and guide/FAQ/about/help/manual/documentation wording. Directory and extensionless anchors are not substitutes; destination text/html MIME is checked if reached.

Working HEAD observations: before 607251ac70e165f7c84a6696b6d95d370d5c778f; after 607251ac70e165f7c84a6696b6d95d370d5c778f. These are independent of the pinned runtime commit. Git status snapshots retain path metadata only; protected payloads and credentials were not read. Concurrent external edits are not attributed to this lane.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.netlib.org/` | document | 200 | 3921 / 3921 |
| 2 | `https://www.netlib.org/netlib2.gif` | image | 200 | 6710 / 6710 |

Native measured totals: 10631 encoded bytes, 10631 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## Historical comparator, not a new baseline

The preserved 12037 Netlib session ran at 2026-09-12T06:26:34.198Z through 2026-09-12T06:26:34.567Z. This fresh 12350 session ran at 2026-09-12T08:08:58.792Z through 2026-09-12T08:08:59.190Z. Both failed at the genuine documentation-link click, with one committed document and no destination navigation. Neither outcome is reclassified.

Both sessions captured the same decoded homepage bytes (3921 bytes, SHA256 `e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236`) and original GIF bytes (6710 bytes, SHA256 `87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d`). These are independent fresh captures, not replay. Historical records remain in their original lane and are separately hash-verified.

The historical bounded census recorded one deferred `center` (`e21`). The fresh bounded census records one deferred `img` (`e23`, width 147, height 148), with `element-layout-not-supported: 1` and empty raw/applicable CSS issue maps. This identifies the observed remaining independent profile, not a controlled attribution to one code change or proof that center support solves every descendant profile. No second click, forced FAQ request, new host-inventory entry, or native acceptance claim follows.

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

No source, TASKS, inventory, commit or push changes. Only NETLIB-CENTER-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-netlib-center-flow-september12"
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
      "eightExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
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
      "wallMs": 521
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
      "visitedDomNodes": 146,
      "boxes": 174,
      "outsideMarkers": 17,
      "textCodeUnits": 1128,
      "work": 2000,
      "deferredSubtrees": 1
    },
    "formattingNodes": 157,
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
        "id": 7,
        "ref": "e23",
        "kind": "deferred",
        "domTag": "img",
        "display": "inline",
        "contentMode": null,
        "deferredReason": "element-layout-not-supported",
        "attributes": {
          "width": "147",
          "height": "148"
        },
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
            "width": "147px",
            "height": "148px",
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
  "startedAt": "2026-09-12T08:08:58.792Z",
  "finishedAt": "2026-09-12T08:08:59.190Z",
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
      "headersSha256": "f41e82b76665b3572829491417749ab170260c6a06ce20f391915db83284fec9",
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
      "headersSha256": "ab7a9e438ae8244bca188ccdd00d0cd9abe345041adf249ba5a41ea76c03542c",
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
      "at": "2026-09-12T08:08:59.177Z",
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
      "at": "2026-09-12T08:08:59.186Z",
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
  "sourceSha256": "99f475ae85789ef66e7e64db3d5ddbb5f6744dc2644ede250d99b3c0c41a9fa1",
  "compiledSha256": "78de8856b5d2c23442ca8852454adf47afc24256782ba80aab34a1bdb9f14dce"
}
```
