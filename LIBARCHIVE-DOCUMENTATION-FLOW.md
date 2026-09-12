# Libarchive documentation native flow — September 12, 2026

## Actual outcome

**Policy-stopped before document commit or anchor discovery.** The native loader requested an image from `s3.amazonaws.com`; the exact-origin adapter denied it before native transport or wire admission and stopped the session. Only `www.libarchive.org` was contacted: two bodyless GETs, for `/` and `/style.css`, both HTTP 200. There were zero clicks, zero committed documents, and no destination observation. This is not a finding that no eligible documentation anchor exists.

The one post-failure census describes the partial, uncommitted native document; its CSS/non-CSS issues are not established causes of the policy stop. Image and document owner cleanup were sampled and verified. Event/control owners were not sampled, so their cleanup remains unproved. The rejected S3 URL is an adapter-only attempted resource, not an additional contacted host or an origin authorization.

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T08:42:36.618Z through 2026-09-12T08:42:36.964Z.
- Supervisor UTC: 2026-09-12T08:42:36.503Z through 2026-09-12T08:42:36.972Z; 469 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"initial-navigation:network","name":"AssertionError","code":"ERR_ASSERTION","message":"Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"}.
- Counts: 1 initial navigation, 0 genuine click, 0 actual document commits, 2 native transport requests, 2 wire GETs, 3 adapter request-start observations, 3 adapter entries, 1 rejected adapter entries, 0 mocks.
- Initial state/title/history: null.
- Discovery: not reached.
- After click/failure: null.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.libarchive.org/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; off-origin requests, including images and apex-origin redirects, are denied and logged, ending the flow.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-gif-image-september12-round00/snapshot01/dist`; commit `e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code was not executed; only the released GIF-image snapshot was used.

Reverified 20 gate receipts, 1132 source files, 1952 compiled files, and 12 commit-owned inputs. Historical gate: 12470 passed, 0 failed, 2 unchanged exclusions; 240 selected suites, 239 strict roots, 634 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `3b212e3dcaf2ff048cc0fb15a08395086be338d399ac7be9ddb24907a449add1`.
- compiled SHA256: `e17e8efa3f522ad7c4d9aef4f24e22366fb4cca6f44ae868c53ed72613dcd744`.
- nativeResults SHA256: `7155438d09b235f026f5a10fc84614700559c9a30f54057bf564df52e0735b97`.
- summary SHA256: `37b39dcf9d1f29192cb295b8ec3ba4bea7697765bdea179ba747619633e8c01f`.
- audit SHA256: `09db366205e8947b7be4ff53fee288df86c75463c37ac5b97b5fcacbdc583db0`.
- receipts SHA256: `9eacc4ddfde4dea6d35069cbd2ab2cbc7d1f87602eefddcbe9761ac269f14dd5`.
- commitVerification SHA256: `9da545f8a3beee47841df3036ffba0f6f9a861630caacfd268100827758a887e`.

The historical 12037 Netlib flow remains failed and untouched, not a rerun baseline. The completed Netlib-center harness/checker supplies the implementation pattern, not a successful website outcome. All four original seals (140/142/146/148 receipts) and their members are verified before/after this run and during read-only verification. 30 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation and failed checks belong to this lane only; any failures are preserved and enumerated below. Historical failures are not attributed to this new session. This is a separate Libarchive candidate-site attempt, not GIF animation or broader browser acceptance. The existing 75-host inventory is unchanged; parent independently integrates actual attempted hosts. The checker normalizes ordered raw headers offline with IncomingMessage._addHeaderLines while retaining distinct native raw values. No socket self-probes or refetch.

The candidate filter conservatively requires an actual .htm/.html path and documentation/about/details/overview/reference wording. Directory and extensionless anchors are not substitutes; destination text/html MIME is checked if reached.

Working HEAD observations: before e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3; after e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3. These are independent of the pinned runtime commit. Git status snapshots retain path metadata only; protected payloads and credentials were not read. Concurrent external edits are not attributed to this lane.

Actual wire-attempted hosts: ["www.libarchive.org"]. Adapter-requested hosts: ["www.libarchive.org","s3.amazonaws.com"].

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.libarchive.org/` | document | 200 | 6635 / 6635 |
| 2 | `https://www.libarchive.org/style.css` | stylesheet | 200 | 690 / 690 |

Native measured totals: 7325 encoded bytes, 7325 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## One bounded failure census

- Raw CSS: {"external-stylesheet-not-loaded":1}; authoritative source styles.metrics().issues.
- Applicable CSS: {"external-stylesheet-not-loaded":1}; authoritative source styles.metrics().applicableIssues.
- Formatting CSS: {"css:external-stylesheet-not-loaded":1}.
- Independent non-CSS formatting issues: {"positioned-layout-requires-coordination":1,"element-layout-not-supported":1}.
- Non-advisory non-CSS issues: {"positioned-layout-requires-coordination":1,"element-layout-not-supported":1}.
- Deferred nodes: 1; 1 bounded actual-node samples. DOM revision 270/270.
- Counts do not identify a sole cause. No naive substring CSS excerpts, suppression, layout fallback or second interaction.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":0,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":false,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":0,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":false,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: []. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only LIBARCHIVE-DOCUMENTATION-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-libarchive-flow-september12"
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
      "wireRequests": 2,
      "adapterEntries": 3,
      "commits": 0,
      "clicks": 0,
      "failure": {
        "stage": "initial-navigation:network",
        "name": "AssertionError",
        "code": "ERR_ASSERTION",
        "message": "Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"
      },
      "wallMs": 469
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
      "css:external-stylesheet-not-loaded": 1
    },
    "rawCssIssues": {
      "external-stylesheet-not-loaded": 1
    },
    "applicableCssIssues": {
      "external-stylesheet-not-loaded": 1
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
      "css:external-stylesheet-not-loaded": 1
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
    "revisionBefore": 270,
    "revisionAfter": 270,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T08:42:36.618Z",
  "finishedAt": "2026-09-12T08:42:36.964Z",
  "failure": {
    "stage": "initial-navigation:network",
    "name": "AssertionError",
    "code": "ERR_ASSERTION",
    "message": "Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"
  },
  "accounting": {
    "nativeRequestAttempts": 3,
    "transportRequests": 2,
    "wireRequestCalls": 2,
    "wireResponses": 2,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 7325,
    "decodedBytes": 7325,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 3,
    "admittedRequests": 2,
    "rejectedAdapterEntries": 1,
    "rejectedAdapterSamples": [
      {
        "entry": 3,
        "url": "https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png",
        "name": "AssertionError",
        "code": "ERR_ASSERTION",
        "message": "Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"
      }
    ],
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
      "headersSha256": "9f128f7ea1c9c68410c28b1d30b2e5db53d3bc21eeb342f945c0f99768cea18c",
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
      "headersSha256": "9dc23acde2b1e08aace4a9ff441de627fe33080bbbd5ec4e71894b1d55c00a42",
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
  "sourceSha256": "3b212e3dcaf2ff048cc0fb15a08395086be338d399ac7be9ddb24907a449add1",
  "compiledSha256": "e17e8efa3f522ad7c4d9aef4f24e22366fb4cca6f44ae868c53ed72613dcd744"
}
```
