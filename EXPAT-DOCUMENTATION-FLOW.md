# Expat native documentation flow — September 12, 2026

## Outcome

**Native interaction flow: FAIL. Evidence checks: PASS (35 checks).**

The authorized flow did not satisfy the click-driven destination acceptance gate. No fallback, retry, second session, alternative destination or changed capacity was attempted.

First failure: `initial-navigation:network`; `ERR_ASSERTION`; Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance.

The fresh native stylesheet loader requested `https://fonts.googleapis.com/css?family=Roboto:300,400,500,700`. The same-origin-only boundary rejected that request locally before native transport. Only `libexpat.github.io` was contacted. This is a harness-policy boundary failure, not evidence of a remote challenge or a destination rendering failure. The initial navigation did not commit, so anchor discovery and the sole permitted click were never reached.

Probe UTC: 2026-09-12T09:50:12.059Z through 2026-09-12T09:50:12.768Z.
Supervisor UTC: 2026-09-12T09:50:11.941Z through 2026-09-12T09:50:12.781Z; 840 ms; exit 1; timeout false; process group absent true.

Evidence verification is not working-site acceptance by itself. This report neither claims general browser parity nor upgrades any historical failed flow. The parent must independently verify this sealed lane before any inventory integration.

## Pinned release and scope

Only the committed `8b112c85d478279fef3913e66f013d5b25a8410f` list-style release snapshot was imported, using pinned Node 22.22.0. Working image-border changes were not executed. Rechecked 20 release receipts, 1136 source files and 1952 compiled files, before and after the session; all remained byte-identical.

Historical gate: 12650 passed, 0 failed, 2 unchanged exclusions; 244 selected suites, 243 strict roots, 638 manifest entries. The gate was verified, not rerun. All 11 commit-owned snapshot inputs, including the manifest, matched actual freshly captured `git show` stdout buffers (200747 bytes). The readonly verifier uses those captured bytes without spawning Git.

Source ledger SHA-256: `1c3c866ca1e71753c964e068a1a9eb4e865c329ae22a9ec098100555dfc1a8b9`.
Compiled ledger SHA-256: `022786d991e3c63dc1cbd2d4be6727bdbbedde73636daf69f759f27277bd9356`.
Authorization SHA-256: `bc890b292d15e19070156acf2f21fc16a580c843ec38d6252515ebc5c220f7ec`.

Only this new report and private lane `node_modules/.cache/native-validation/native-expat-flow-september12` are owned by this task. No source, TASKS, inventory, commit or push changes. Existing uncommitted work and historical reports retain their original paths and measurements. The Libarchive public-asset harness/checker was adapted from exact archived bytes, not executed again; its two original receipt ledgers were independently rechecked. Its S3 asset exception is absent from this session.

## Sealed session contract

One native-browser session starts at `https://libexpat.github.io/`. At most 96 current-DOM body anchors are inspected, with native availability checked before URL deduplication. At most one available discovered same-origin HTML documentation/FAQ/about link is clicked; no hardcoded element reference or destination. HTML-like directory, extensionless and HTML paths require the actual destination response to be HTML. No forms, downloads, archives, accounts or search submissions.

Only original native document/CSS/image requests to `https://libexpat.github.io` are admitted. Other origins, HTTP, alternate hosts and unauthorized redirects are denied before destination transport and logged. Predeclared limits: 32 bodyless GETs; 250 ms monotonic per-origin pacing with adapter/hop/wire deadline rechecks; 8 MiB encoded and decoded session limits; 2 MiB per response; 45 seconds plus 5-second kill grace; 6 MiB per output/file, 16 MiB lane, minimum 64 MiB free disk. Other native capacities are unchanged.

Private 0700 lane and empty HOME/TMP; private files; explicit environment; no stdin or TTY. Public-address checks, TLS certificate validation and `AgentBrowser/0.1` identity remain unchanged. Empty cookies, omitted credentials, no credential headers. Page scripts and real SafeJS are disabled; no foreign browser or HTTP client. No credentials, .env, pass, provider or device access; no protected payload access. No retries, source stripping, capacity increases, identity rotation, challenge workarounds or CAPTCHA bypass. Stop at first restriction, challenge, Retry-After or capacity boundary.

## Observed interaction and hosts

Native navigation calls: 1; click calls: 0; committed documents: 0.
Inspected anchors: not reached; eligible occurrences: not reached; unique eligible destinations: not reached.
Initial document: No committed initial document state was captured.

DOM/title/history limitation: the failure census sampled the actual partially loaded native document (299 revision; 256 visited DOM nodes), but no committed initial title/history snapshot exists. Session accounting recorded zero commits. No destination URL/title/history/document identity can be claimed, and offline evidence checking does not reconstruct a successful interaction.
Selected DOM link: None selected.
Destination: No destination document captured.

Contacted hosts (HTTP replies observed): libexpat.github.io.
Wire-attempt hosts: libexpat.github.io.
Locally denied hosts: fonts.googleapis.com.
Host denial does not imply contact. No global unique-host count or inventory update is claimed.

Native request-start observations: 4; adapter entries: 4; admitted adapter calls: 3; rejected adapter calls: 1; native transport requests: 3; wire constructions: 3; wire responses: 3; followed redirects: 0; mocks: 0. Native encoded bytes: 41186; decoded bytes: 247529. Per-origin accounting and raw-body/header SHA-256 receipts are included below. Wire instrumentation observes native request construction and HTTP payloads, not packets or TLS handshakes.

## Failure census and cleanup

One bounded readonly native formatting census captured 306 formatting nodes and 0 deferred nodes, with 0 samples. Raw CSS issues, applicable CSS issues, formatting CSS and non-CSS issues remain separate. DOM revision was unchanged. No issue suppression, source repair, second click or sole-cause claim.

Session and transport are closed; pending/active queues and cookies were independently checked. Process-group absence was observed after child exit. Cleanup proves only sampled owners, never unsampled subsystems or leak freedom. Owner results: event=false, image=false, document=true, controls=false. HOME/TMP remain empty. Failed preparations/checks, if any, remain in the lane and seals; evidence verification never substitutes for a completed click.

## Readonly verification

From the repository root:

```sh
/bin/sh node_modules/.cache/native-validation/native-expat-flow-september12/verify-verified.sh
```

The verifier is readonly, runs with explicit environment/private HOME/TMP/no stdin/TTY, and uses kernel seccomp denial of socket/socketpair/connect/bind/send/receive/listen plus an offline network guard. No socket self-probe, live browser, Git subprocess or new network request is needed. It rehashes release/reference evidence, actual Git buffers, executed harness, returned accounting, body/header bytes, report claims and exact artifact inventory. `RECEIPTS.sha256` and `FINAL-RECEIPTS.sha256` seal this report and artifacts; the final ledger excludes itself. Final verifier stdout must be captured outside the sealed lane if the parent saves it.

## Machine-verifiable claims

```json
{
  "scope": {
    "contactedHosts": [
      "libexpat.github.io"
    ],
    "attemptedWireHosts": [
      "libexpat.github.io"
    ],
    "locallyDeniedHosts": [
      "fonts.googleapis.com"
    ],
    "inventoryEdited": false,
    "perOriginAccounting": {
      "https://libexpat.github.io": {
        "adapterEntries": 3,
        "admittedAdapterEntries": 3,
        "nativeHops": 3,
        "wireRequests": 3,
        "wireResponses": 3,
        "encodedBytes": 41186,
        "decodedBytes": 247529
      },
      "https://fonts.googleapis.com": {
        "adapterEntries": 1,
        "admittedAdapterEntries": 0,
        "nativeHops": 0,
        "wireRequests": 0,
        "wireResponses": 0,
        "encodedBytes": 0,
        "decodedBytes": 0
      }
    },
    "noExactAssetException": true,
    "readonlyEvidenceCheckNotInteractionSuccess": true
  },
  "budget": {
    "checks": [
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "referenceExpatAdaptationNotReclassifiedOrExecuted",
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
      "adapterEntries": 4,
      "commits": 0,
      "clicks": 0,
      "failure": {
        "stage": "initial-navigation:network",
        "name": "AssertionError",
        "code": "ERR_ASSERTION",
        "message": "Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"
      },
      "wallMs": 840
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
      "visitedDomNodes": 256,
      "boxes": 315,
      "outsideMarkers": 9,
      "textCodeUnits": 1915,
      "work": 3506,
      "deferredSubtrees": 0
    },
    "formattingNodes": 306,
    "nonCssFormattingIssues": {
      "float-layout-not-supported": 14
    },
    "formattingCssIssues": {
      "css:unimplemented-css-at-rule": 11,
      "css:unimplemented-or-invalid-css-value": 54,
      "css:unimplemented-css-property": 666,
      "css:unimplemented-or-invalid-css-selector": 599,
      "css:css-import-not-loaded": 1,
      "css:unimplemented-or-invalid-media-query": 8,
      "css:external-stylesheet-not-loaded": 2
    },
    "rawCssIssues": {
      "unimplemented-or-invalid-css-value": 156,
      "unimplemented-css-property": 1409,
      "unimplemented-css-at-rule": 13,
      "unimplemented-or-invalid-css-selector": 599,
      "css-import-not-loaded": 1,
      "unimplemented-or-invalid-media-query": 8,
      "external-stylesheet-not-loaded": 2
    },
    "applicableCssIssues": {
      "unimplemented-css-at-rule": 11,
      "unimplemented-or-invalid-css-value": 54,
      "unimplemented-css-property": 666,
      "unimplemented-or-invalid-css-selector": 599,
      "css-import-not-loaded": 1,
      "unimplemented-or-invalid-media-query": 8,
      "external-stylesheet-not-loaded": 2
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
      "css:unimplemented-css-at-rule": 11,
      "css:unimplemented-or-invalid-css-value": 54,
      "css:unimplemented-css-property": 666,
      "css:unimplemented-or-invalid-css-selector": 599,
      "css:css-import-not-loaded": 1,
      "css:external-stylesheet-not-loaded": 2
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "float-layout-not-supported": 14
    },
    "deferredCount": 0,
    "deferredSamples": [],
    "revisionBefore": 299,
    "revisionAfter": 299,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T09:50:12.059Z",
  "finishedAt": "2026-09-12T09:50:12.768Z",
  "failure": {
    "stage": "initial-navigation:network",
    "name": "AssertionError",
    "code": "ERR_ASSERTION",
    "message": "Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance"
  },
  "accounting": {
    "nativeRequestAttempts": 4,
    "transportRequests": 3,
    "wireRequestCalls": 3,
    "wireResponses": 3,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 41186,
    "decodedBytes": 247529,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 4,
    "admittedRequests": 3,
    "rejectedAdapterEntries": 1,
    "rejectedAdapterSamples": [
      {
        "entry": 4,
        "url": "https://fonts.googleapis.com/css?family=Roboto:300,400,500,700",
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
      "url": "https://libexpat.github.io/",
      "status": 200,
      "kind": "document",
      "encoding": "gzip",
      "encodedPath": "wire-1.body",
      "encodedBytes": 1656,
      "encodedSha256": "411c33a9cf77753437c19f3b49d1f05af34e3a5700fe51450d621e739b437528",
      "decodedPath": "response-1.body",
      "decodedBytes": 5774,
      "decodedSha256": "a3d1fe794bf34337527e052b85dccbed0be15c83fc491dc7e5fd7e65a426bcd8",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 2594,
      "headersSha256": "d2e16cb15ad10ef787683d27f669133eeb053a530fa8e20d309809e0c3376932",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://libexpat.github.io/3rdparty/bootstrap/3.0.0/css/bootstrap.min.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "gzip",
      "encodedPath": "wire-2.body",
      "encodedBytes": 16376,
      "encodedSha256": "c9d9aca34be6d2a3d44f23a2475d3e8613c1b475f6c65425ecd8078232e412a8",
      "decodedPath": "response-2.body",
      "decodedBytes": 97339,
      "decodedSha256": "1cbda21998b65e08a7e936114cabd7f7783d0f590dd6efdd58c7faa8b6e7b9aa",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 2646,
      "headersSha256": "97c0ed66bdacab0bac949976fa42ac6a0f8cc1b8c07bbc8f04d9364f11993eaf",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://libexpat.github.io/3rdparty/bootswatch/paper/bootstrap.min.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "gzip",
      "encodedPath": "wire-3.body",
      "encodedBytes": 23154,
      "encodedSha256": "91c642d3f5a06ee13c0af9b4b2f7749150fcc2a54b083aea74ac9728073ca89d",
      "decodedPath": "response-3.body",
      "decodedBytes": 144416,
      "decodedSha256": "8cd35c46a5610950577a2ddba0a65651f7784b2ff19e9e6d3e72833fa785f5f2",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 2643,
      "headersSha256": "fa76c82459dc5b3afa7d3963b9c193ee391fa3ff470bfa054fbff86d7a492d5a",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": null,
  "selected": null,
  "afterClick": null,
  "ownerEvidence": {
    "eventOwnersInstrumented": 0,
    "imageOwnersInstrumented": 0,
    "eventOwnerCleanupProved": false,
    "imageOwnerCleanupProved": false,
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
