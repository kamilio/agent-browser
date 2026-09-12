# Libarchive public-asset native flow — September 12, 2026

## Sealed outcome

**Bounded flow: FAIL. Evidence checks: PASS.** A passed evidence checker is not working-site acceptance.

The website document and stylesheet each returned HTTP200; the exact original-loader S3 image returned HTTP403 (263-byte XML response). The response policy stopped the initial navigation immediately: zero document commits, zero inspected anchors and zero clicks. Asset admission succeeded, but image retrieval, rendered-page acceptance and destination acceptance did not. No challenge was classified; the observed failure is the asset endpoint's HTTP restriction, not a successful image decode or proof that native formatting is fixed.

The inherited census label “after layout failure” describes the helper's historical use, not this run's first failure. Here the single census ran on the retained partial native DOM after the HTTP403 abort. Its independent CSS/non-CSS/deferred findings are diagnostic only.

UTC: 2026-09-12T09:24:22.288Z through 2026-09-12T09:24:22.671Z. Supervisor: 2026-09-12T09:24:22.171Z through 2026-09-12T09:24:22.680Z; 509 ms; exit 1; timed out false; process group absent true.

Failure: {"stage":"initial-navigation:response-policy","name":"Error","code":null,"message":"HTTP failure or classified access barrier"}.

Independent counters: {"nativeRequestAttempts":3,"transportRequests":3,"wireRequestCalls":3,"wireResponses":3,"wireRedirectResponses":0,"followedRedirects":0,"encodedBytes":7588,"decodedBytes":7588,"mockedRequests":0,"note":"Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture","adapterEntries":3,"admittedRequests":3,"rejectedAdapterEntries":0,"rejectedAdapterSamples":[],"admissionScope":"admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"}.

One session, 1 direct navigation, 0 genuine click calls. Initial document: null.

Discovery: not reached.

After click/failure: null. Destination observation: null.

## Exact asset and historical boundary

Exact image: https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png. At most one original fresh-page image-loader bodyless GET; actual 1; replies 1. previously locally denied; now native wire contact attempted.

Separate origin accounting: {"https://www.libarchive.org":{"adapterEntries":2,"admittedAdapterEntries":2,"nativeHops":2,"wireRequests":2,"wireResponses":2,"encodedBytes":7325,"decodedBytes":7325},"https://s3.amazonaws.com":{"adapterEntries":1,"admittedAdapterEntries":1,"nativeHops":1,"wireRequests":1,"wireResponses":1,"encodedBytes":263,"decodedBytes":263}}.

The original LIBARCHIVE-DOCUMENTATION-FLOW.md single-origin failure and original sealed lane remain unchanged. This is a NEW separately authorized session, not a retry inside that old contract and not a fix or reclassification of its boundary failure. Original Libarchive and historical Netlib seals and members were reverified, not rerun.

The existing inventory already counted www.libarchive.org and the locally denied s3.amazonaws.com: unique-host increment ZERO; the 78-host inventory is not edited. Contact status above distinguishes an allowed image from native rendering and website/challenge success. Parent independently verifies before integration.

## Contract and pinned release

Only https://www.libarchive.org/ and at most one genuine available current-DOM same-origin HTML documentation/about/FAQ link click. At most96 anchors inspected before URL deduplication; no invented references, forced destination, or alternate action. Original native document/CSS/image requests only, plus the ONE exact HTTPS S3 image. No query, alternate image/path, other S3 URL or off-origin redirect; apex and HTTP denied before transport.

Predeclared: 32 total bodyless GETs; 250ms monotonic per-origin pacing with deadline rechecks; 8MiB encoded/decoded session; 2MiB per response; 45s wall plus5s kill grace; native capacities unchanged. File/aggregate output6MiB; lane16MiB; minimum free64MiB. Explicit environment, private0700 empty HOME/TMP, no stdin/TTY, public-address and TLS validation, omitted credentials, empty cookies, unchanged native identity.

Only committed12650/8b112c85d478279fef3913e66f013d5b25a8410f snapshot: /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-list-style-september12-round02/snapshot01/dist. Pinned Node22.22.0; executable SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31.

Reverified20 receipts,1136 source files,1952 compiled files,commit verification and11 actual captured Git snapshot inputs. Historical native gate:12650 passed,0 failed,2 unchanged exclusions;244 selected suites,243 strict roots,638 manifest entries. 11 commit-owned inputs including manifest. No rebuild or native-suite rerun; native passes do not establish live acceptance.

- source: 1c3c866ca1e71753c964e068a1a9eb4e865c329ae22a9ec098100555dfc1a8b9
- compiled: 022786d991e3c63dc1cbd2d4be6727bdbbedde73636daf69f759f27277bd9356
- native: aa12c811cc11221897253131b5fc4d7ceab4bcdddd2da121fdb39e9db5bc43fb
- summary: 67c14e5f3cee26c130e331798a0e0e8125cda5922537744e64196a12b84ee96f
- audit: 186d31a2143e8b518467bdcfb32cee1281ed928d29ed067e7a964b724be9c43b
- receipts: aaa0523a45bc37f3f10e9c17d8e8176ead7f13820fc5ecca1c2d17cb122fc535
- commitVerification: a99d85c4eb82c0187931c735e71b79291d7d73e77193a5f40b6da91859534cc4

Actual Git stdout/stderr buffers are captured for all11 inputs; read-only verification compares bytes against the snapshot, never invoking Git or relaxing socket/socketpair denial.

## Response evidence and cleanup

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | https://www.libarchive.org/ | document | 200 | 6635 / 6635 |
| 2 | https://www.libarchive.org/style.css | stylesheet | 200 | 690 / 690 |
| 3 | https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png | image | 403 | 263 / 263 |

Exact encoded body, decoded body and ordered response-header artifacts and SHA256 values are in the machine claims. Cookie/credential header pairs are excluded; this is native transport instrumentation, not packet capture.

One bounded read-only failure census: {"scope":"one bounded readonly native formatting build after layout failure; no second interaction","nativeLimits":{"maxOwnedNodes":50000,"maxBoxes":50000,"maxDepth":256,"maxTextCodeUnits":1000000,"maxWork":2000000},"metrics":{"visitedDomNodes":258,"boxes":342,"outsideMarkers":29,"textCodeUnits":2749,"work":4391,"deferredSubtrees":1},"formattingNodes":313,"nonCssFormattingIssues":{"positioned-layout-requires-coordination":1,"element-layout-not-supported":1},"formattingCssIssues":{"css:unimplemented-or-invalid-css-value":1,"css:unimplemented-css-property":2},"rawCssIssues":{"unimplemented-or-invalid-css-value":1,"unimplemented-css-property":3},"applicableCssIssues":{"unimplemented-or-invalid-css-value":1,"unimplemented-css-property":2},"observedColorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"cssDiagnosticSources":{"rawCssIssues":"styles.metrics().issues","applicableCssIssues":"styles.metrics().applicableIssues"},"nonAdvisoryFormattingCssIssues":{"css:unimplemented-or-invalid-css-value":1,"css:unimplemented-css-property":2},"nonAdvisoryNonCssFormattingIssues":{"positioned-layout-requires-coordination":1,"element-layout-not-supported":1},"deferredCount":1,"deferredSamples":[{"id":5,"ref":"e17","kind":"deferred","domTag":"img","display":"block","contentMode":null,"deferredReason":"element-layout-not-supported","attributes":{"style":"position: absolute; top: 0; right: 0; border: 0;"},"actualStyles":{"visibility":{"display":"block","unpositionedDisplay":"inline","visibility":"visible","displayed":true,"visible":true},"box":{"top":"0px","right":"0px","bottom":"auto","left":"auto","border-top-width":"0px","border-right-width":"0px","border-bottom-width":"0px","border-left-width":"0px","border-top-style":"none","border-right-style":"none","border-bottom-style":"none","border-left-style":"none","width":"auto","height":"auto","min-width":"auto","min-height":"auto","max-width":"none","max-height":"none","box-sizing":"content-box","margin-top":"0px","margin-right":"0px","margin-bottom":"0px","margin-left":"0px","padding-top":"0px","padding-right":"0px","padding-bottom":"0px","padding-left":"0px"},"table":{"table-layout":"auto","border-collapse":"separate","border-spacing":"0px 0px","caption-side":"top","empty-cells":"show","vertical-align":"baseline"}}}],"revisionBefore":271,"revisionAfter":271,"soleCauseClaimed":false,"attribution":"formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"}. Raw CSS, applicable CSS, non-CSS formatting issues and deferred samples remain separate; no sole-cause claim, CSS suppression, native repair or partial rendering fallback.

Sampled owner cleanup: {"eventOwnersInstrumented":0,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":false,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":0,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":false,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Empty owner arrays do not prove cleanup; transport/session queues and actual sampled owners are independently checked.

Preserved preparation/check failures: [].

No retries, cap changes, source stripping, identity rotation, CAPTCHA bypass, forms, accounts, downloads, credentials/.env/pass/providers/devices/realSafeJS/protected payload reads or foreign browser/HTTP client. Stop on restriction/challenge/Retry-After/capacity. Broader browser and acceptance gates remain outstanding.

No source, TASKS, inventory, commit or push changes. Own only LIBARCHIVE-PUBLIC-ASSET-FLOW.md and the new private lane; shared edits belong to other work and are not bundled.

## Read-only verifier

From repository root; no writes, network, Git subprocesses, browser launch, old evidence rerun or socket self-probe. Never redirect output into the sealed lane.

```sh
sh node_modules/.cache/native-validation/native-libarchive-public-asset-flow-september12/verify-verified.sh
```

The wrapper uses pinned Node22, an explicit empty environment/HOME/TMP and unconditional kernel socket/socketpair/connect/send/receive denial. It rechecks captured actual Git bytes, all release inputs, historical seals, body/header hashes, counters, cleanup, report claims and exact artifact inventories.

## Exact machine-verifiable claims

```json
{
  "asset": {
    "url": "https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png",
    "allowedGets": 1,
    "actualGets": 1,
    "originalLoaderProvenanceVerified": true,
    "changedContactStatus": "previously locally denied; now native wire contact attempted",
    "replies": 1,
    "perOriginAccounting": {
      "https://www.libarchive.org": {
        "adapterEntries": 2,
        "admittedAdapterEntries": 2,
        "nativeHops": 2,
        "wireRequests": 2,
        "wireResponses": 2,
        "encodedBytes": 7325,
        "decodedBytes": 7325
      },
      "https://s3.amazonaws.com": {
        "adapterEntries": 1,
        "admittedAdapterEntries": 1,
        "nativeHops": 1,
        "wireRequests": 1,
        "wireResponses": 1,
        "encodedBytes": 263,
        "decodedBytes": 263
      }
    },
    "oldSingleOriginFailureUnchanged": true,
    "uniqueHostIncrement": 0,
    "existingInventoryHosts": 78,
    "inventoryEdited": false
  },
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
      "elevenExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
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
      "wireRequests": 3,
      "adapterEntries": 3,
      "commits": 0,
      "clicks": 0,
      "failure": {
        "stage": "initial-navigation:response-policy",
        "name": "Error",
        "code": null,
        "message": "HTTP failure or classified access barrier"
      },
      "wallMs": 509
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
      "visitedDomNodes": 258,
      "boxes": 342,
      "outsideMarkers": 29,
      "textCodeUnits": 2749,
      "work": 4391,
      "deferredSubtrees": 1
    },
    "formattingNodes": 313,
    "nonCssFormattingIssues": {
      "positioned-layout-requires-coordination": 1,
      "element-layout-not-supported": 1
    },
    "formattingCssIssues": {
      "css:unimplemented-or-invalid-css-value": 1,
      "css:unimplemented-css-property": 2
    },
    "rawCssIssues": {
      "unimplemented-or-invalid-css-value": 1,
      "unimplemented-css-property": 3
    },
    "applicableCssIssues": {
      "unimplemented-or-invalid-css-value": 1,
      "unimplemented-css-property": 2
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
      "css:unimplemented-or-invalid-css-value": 1,
      "css:unimplemented-css-property": 2
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "positioned-layout-requires-coordination": 1,
      "element-layout-not-supported": 1
    },
    "deferredCount": 1,
    "deferredSamples": [
      {
        "id": 5,
        "ref": "e17",
        "kind": "deferred",
        "domTag": "img",
        "display": "block",
        "contentMode": null,
        "deferredReason": "element-layout-not-supported",
        "attributes": {
          "style": "position: absolute; top: 0; right: 0; border: 0;"
        },
        "actualStyles": {
          "visibility": {
            "display": "block",
            "unpositionedDisplay": "inline",
            "visibility": "visible",
            "displayed": true,
            "visible": true
          },
          "box": {
            "top": "0px",
            "right": "0px",
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
    "revisionBefore": 271,
    "revisionAfter": 271,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T09:24:22.288Z",
  "finishedAt": "2026-09-12T09:24:22.671Z",
  "failure": {
    "stage": "initial-navigation:response-policy",
    "name": "Error",
    "code": null,
    "message": "HTTP failure or classified access barrier"
  },
  "accounting": {
    "nativeRequestAttempts": 3,
    "transportRequests": 3,
    "wireRequestCalls": 3,
    "wireResponses": 3,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 7588,
    "decodedBytes": 7588,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 3,
    "admittedRequests": 3,
    "rejectedAdapterEntries": 0,
    "rejectedAdapterSamples": [],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.libarchive.org/",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-1.body",
      "encodedBytes": 6635,
      "encodedSha256": "6d374ad773e834962527629511c35c3f9797a079c27d5908d1008e7e5cb68abd",
      "decodedPath": "response-1.body",
      "decodedBytes": 6635,
      "decodedSha256": "6d374ad773e834962527629511c35c3f9797a079c27d5908d1008e7e5cb68abd",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1624,
      "headersSha256": "f83d63d52e46deec2c6dc80f9a4370aaa639565c843cd5d1878be67d1fc4dcba",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.libarchive.org/style.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "identity",
      "encodedPath": "wire-2.body",
      "encodedBytes": 690,
      "encodedSha256": "d8554387e3b605ec2b8d1fdbb356f1f37fd0d97896135d969d3a863f7eb47e48",
      "decodedPath": "response-2.body",
      "decodedBytes": 690,
      "decodedSha256": "d8554387e3b605ec2b8d1fdbb356f1f37fd0d97896135d969d3a863f7eb47e48",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1627,
      "headersSha256": "59d713a3383e59d7765f4defcb2ebecf3a3385922d8e987684f5179fa75c8f52",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png",
      "status": 403,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-3.body",
      "encodedBytes": 263,
      "encodedSha256": "5cc0084b09b58fab17421e33153e4738c6f95a516055243a18339843d69e18e4",
      "decodedPath": "response-3.body",
      "decodedBytes": 263,
      "decodedSha256": "5cc0084b09b58fab17421e33153e4738c6f95a516055243a18339843d69e18e4",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1168,
      "headersSha256": "3acb4d6b49d455a4a7806cedc7fef0a57c2e5f5902bb6c6f78697213cccc6444",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": null,
  "selected": null,
  "afterClick": null,
  "ownerEvidence": {
    "eventOwnersInstrumented": 0,
    "imageOwnersInstrumented": 1,
    "eventOwnerCleanupProved": false,
    "imageOwnerCleanupProved": true,
    "documentOwnersInstrumented": 1,
    "controlOwnersInstrumented": 0,
    "documentOwnerCleanupProved": true,
    "controlOwnerCleanupProved": false,
    "scope": "Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"
  },
  "sourceSha256": "1c3c866ca1e71753c964e068a1a9eb4e865c329ae22a9ec098100555dfc1a8b9",
  "compiledSha256": "022786d991e3c63dc1cbd2d4be6727bdbbedde73636daf69f759f27277bd9356"
}
```
