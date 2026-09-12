# Tukaani native documentation flow — September 12, 2026

## Outcome

**Native interaction flow: FAIL. Evidence checks: PASS (36 checks).**

The click-driven destination acceptance gate did not pass. No retry, fallback, forced URL/ref, second session, source stripping or capacity increase was attempted.

Classification: Native layout boundary. First failure: native-documentation-link-click; unsupported; Document width resolution requires an issue-free supported formatting profile.
This classification is not a sole-cause claim. Local admission, native layout/capacity, transport and remote restrictions are distinct. A denial or failure is not whole-site incompatibility evidence.

Probe UTC: 2026-09-12T10:55:30.610Z through 2026-09-12T10:55:31.655Z.
Supervisor UTC: 2026-09-12T10:55:30.492Z through 2026-09-12T10:55:31.665Z; 1173 ms; exit 1; timeout false; process group absent true.

Evidence verification is not working-site acceptance by itself. The parent must independently verify this sealed lane before integration; this run does not claim that the parent already did so.

## Release and predeclared scope

Only committed 96541506e7878af0bea70ed002bf13111765da3c, native-quirks-image-september12-round01/snapshot01/dist, was executed using pinned Node 22.22.0. Before and after: 20 release receipts, 1144 source files, 1960 compiled files, and 10 commit-owned snapshot inputs including the manifest matched captured actual Git bytes. Release evidence: 13042 passed, zero failed, two unchanged exclusions; 250 selected suites, 249 strict roots, 644 manifest entries. Release tests were verified, not rerun.

The private lane PREDECLARATION.md and INVOCATION.json fix one fresh native BrowserSession at https://www.tukaani.org/, allowing only HTTPS origins https://www.tukaani.org and https://tukaani.org and genuine native redirects between them. Native document/CSS/image loading only with original-loader subresource provenance. The selected click must be same-origin with the actually committed homepage, not an assumed alias. At most 96 current DOM anchor observations occur before URL deduplication; at most one genuine available documentation/FAQ/about/project click follows.

32 bodyless GETs, concurrency one, 250 ms monotonic per-origin pacing/deadline rechecks, 2 MiB encoded/decoded per response, 8 MiB encoded/decoded per session, 45 s wall plus 5 s kill grace, 6 MiB file/combined output, 16 MiB allocated lane and minimum 64 MiB free. Other native capacities remain unchanged. Empty 0700 HOME/TMP, explicit environment, no stdin/TTY, unchanged AgentBrowser identity, public-address checks and TLS verification, empty cookies and credentials omit. Page scripts and real SafeJS disabled. No foreign browser or alternate HTTP client. No credentials, accounts, forms, downloads, archives, providers, devices or protected source-heading payload access.

No retries, CAPTCHA bypass, identity rotation, limit increase or source stripping. Stop at first restriction, challenge, Retry-After, local admission or capacity boundary. No source, TASKS, inventory, commit or push changes. Only this report and its private lane are new write scope; pre-existing work and historical lanes remain unchanged.

## Contact and accounting

Actually contacted hosts (native response observed): [
  "www.tukaani.org"
].
Wire-attempted hosts: [
  "www.tukaani.org"
].
Locally denied hosts: [].
These categories are independent, not guessed host counts; there is no global inventory or whole-site claim.

Adapter entries 2; admitted 2; locally rejected 0; native request-start events 2; native transport requests 2; wire constructions 2; wire responses 2; wire redirects 0; followed redirects 0; mocks 0. Native encoded bytes 10113; decoded bytes 32394. Native instrumentation is not packet capture. Each response status and exact encoded/decoded/header byte count and SHA-256 is in the machine-verified claims below. Credential-bearing headers, if any, are excluded and their redaction count retained.

## Native document and interaction

Initial committed state: {
  "url": "https://www.tukaani.org/",
  "title": "The Tukaani Project",
  "root": "e1",
  "nodeCount": 249,
  "revision": 250,
  "sameDocument": true,
  "observedColorScheme": {
    "at": "2026-09-12T10:55:31.641Z",
    "reason": "before-or-after-click-state",
    "url": "https://www.tukaani.org/",
    "root": "e1",
    "revision": 250,
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
    "url": "https://www.tukaani.org/",
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
        "url": "https://www.tukaani.org/",
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
  "nativeRequestAttempts": 2
}.
Anchor observations: 14; eligible occurrences 5; unique destinations 5; selected {
  "index": 13,
  "reference": "e227",
  "href": "about.html",
  "url": "https://www.tukaani.org/about.html",
  "text": "Tukaani developers",
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
}.
Navigation calls 1; click calls 1; click result null.
Destination: null.


## Failure census and cleanup

One bounded readonly census on failure, if a native document remained: {
  "scope": "one bounded readonly native formatting build after layout failure; no second interaction",
  "nativeLimits": {
    "maxOwnedNodes": 50000,
    "maxBoxes": 50000,
    "maxDepth": 256,
    "maxTextCodeUnits": 1000000,
    "maxWork": 2000000
  },
  "metrics": {
    "visitedDomNodes": 232,
    "boxes": 332,
    "textCodeUnits": 1441,
    "work": 3090,
    "deferredSubtrees": 0
  },
  "formattingNodes": 332,
  "nonCssFormattingIssues": {
    "overflow-layout-not-supported": 1
  },
  "formattingCssIssues": {
    "css:unimplemented-css-at-rule": 1,
    "css:unimplemented-or-invalid-css-selector": 28,
    "css:unimplemented-css-property": 43,
    "css:unimplemented-or-invalid-css-value": 6
  },
  "rawCssIssues": {
    "unimplemented-css-property": 120,
    "unimplemented-or-invalid-css-value": 31,
    "unimplemented-css-at-rule": 1,
    "unimplemented-or-invalid-css-selector": 28
  },
  "applicableCssIssues": {
    "unimplemented-css-at-rule": 1,
    "unimplemented-or-invalid-css-selector": 28,
    "unimplemented-css-property": 43,
    "unimplemented-or-invalid-css-value": 6
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
    "css:unimplemented-css-at-rule": 1,
    "css:unimplemented-or-invalid-css-selector": 28,
    "css:unimplemented-css-property": 43,
    "css:unimplemented-or-invalid-css-value": 6
  },
  "nonAdvisoryNonCssFormattingIssues": {
    "overflow-layout-not-supported": 1
  },
  "deferredCount": 0,
  "deferredSamples": [],
  "revisionBefore": 250,
  "revisionAfter": 250,
  "soleCauseClaimed": false,
  "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
}.
Raw CSS, applicable CSS, non-CSS formatting issues and deferred samples retain their distinct sources. A skipped or failed census is not a zero-issue result. No second interaction or partial-layout fallback is implied.

Cleanup owner evidence: {
  "eventOwnersInstrumented": 1,
  "imageOwnersInstrumented": 1,
  "eventOwnerCleanupProved": true,
  "imageOwnerCleanupProved": true,
  "documentOwnersInstrumented": 1,
  "controlOwnersInstrumented": 1,
  "documentOwnerCleanupProved": true,
  "controlOwnerCleanupProved": true,
  "scope": "Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"
}.
Immediate/final samples and any bounded settlement are retained in stdout.jsonl. Empty sample arrays do not prove an uninstrumented owner's cleanup.

## Preparation, sealing and parent verification

This new lane reuses the corrected PCRE framework without executing or modifying that historical lane. Actual Git output is captured through Python file descriptors under unconditional socket/socketpair denial. Historical preparation and checker failures stay in their original PCRE lane, unchanged; they are not represented as Tukaani failures. Any new failed preparations/checks are retained in this lane and listed in the machine-verifiable budget claims.

Adapted helper sources, original byte copies, historical seals and actual Git stdout/stderr are preserved privately. RELEASE/PREFLIGHT/INTEGRITY and before/after inventories bind the runtime. REPORT-CLAIMS.json, RECEIPTS.sha256 and FINAL-RECEIPTS.sha256 bind this report and the exact artifact inventory.

Readonly parent command (no live execution, Git subprocess, socket or socketpair):

    /bin/sh /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-tukaani-flow-september12/verify-verified.sh

The verifier uses a strict seccomp wrapper and captured actual Git bytes. Parent review must independently check its output before any integration. Historical paths/results are unchanged and this is not a provider, performance, real SafeJS, TTY, device or broad compatibility pass.

## Machine-verified claims

```json
{
  "scope": {
    "contactedHosts": [
      "www.tukaani.org"
    ],
    "attemptedWireHosts": [
      "www.tukaani.org"
    ],
    "locallyDeniedHosts": [],
    "inventoryEdited": false,
    "perOriginAccounting": {
      "https://www.tukaani.org": {
        "adapterEntries": 2,
        "admittedAdapterEntries": 2,
        "nativeHops": 2,
        "wireRequests": 2,
        "wireResponses": 2,
        "encodedBytes": 10113,
        "decodedBytes": 32394
      },
      "https://tukaani.org": {
        "adapterEntries": 0,
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
      "historicalPCREFlowNotReclassifiedOrExecuted",
      "documentLimitsAndDisabledPageRuntimePreserved",
      "independentAdapterNativeWireAndMockAccounting",
      "responseAndTotalTransferCapsObserved",
      "noWireRequestsAfterGlobalStop",
      "freshSingleNavigationAtMostOneRealClick",
      "discoveredDocumentationOnlyNoDownloadOrForcedNavigation",
      "tenExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
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
      "wallMs": 1173
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
      "visitedDomNodes": 232,
      "boxes": 332,
      "textCodeUnits": 1441,
      "work": 3090,
      "deferredSubtrees": 0
    },
    "formattingNodes": 332,
    "nonCssFormattingIssues": {
      "overflow-layout-not-supported": 1
    },
    "formattingCssIssues": {
      "css:unimplemented-css-at-rule": 1,
      "css:unimplemented-or-invalid-css-selector": 28,
      "css:unimplemented-css-property": 43,
      "css:unimplemented-or-invalid-css-value": 6
    },
    "rawCssIssues": {
      "unimplemented-css-property": 120,
      "unimplemented-or-invalid-css-value": 31,
      "unimplemented-css-at-rule": 1,
      "unimplemented-or-invalid-css-selector": 28
    },
    "applicableCssIssues": {
      "unimplemented-css-at-rule": 1,
      "unimplemented-or-invalid-css-selector": 28,
      "unimplemented-css-property": 43,
      "unimplemented-or-invalid-css-value": 6
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
      "css:unimplemented-css-at-rule": 1,
      "css:unimplemented-or-invalid-css-selector": 28,
      "css:unimplemented-css-property": 43,
      "css:unimplemented-or-invalid-css-value": 6
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "overflow-layout-not-supported": 1
    },
    "deferredCount": 0,
    "deferredSamples": [],
    "revisionBefore": 250,
    "revisionAfter": 250,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T10:55:30.610Z",
  "finishedAt": "2026-09-12T10:55:31.655Z",
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
    "encodedBytes": 10113,
    "decodedBytes": 32394,
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
      "url": "https://www.tukaani.org/",
      "status": 200,
      "kind": "document",
      "encoding": "gzip",
      "encodedPath": "wire-1.body",
      "encodedBytes": 1234,
      "encodedSha256": "c7201f7fd4ed3572672dc836bb51080aff122c4fa3536a8d929dfd8fda6db87a",
      "decodedPath": "response-1.body",
      "decodedBytes": 3508,
      "decodedSha256": "696f1d4cf70104eac21dadb68af0636dbd26946b3069d137fcec7a38c64a530f",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1967,
      "headersSha256": "d167aa5f2ffe71c2aac6bb28c03ad84f6ea5d219ec72bbea890baab31a9f7e1f",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.tukaani.org/style.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "gzip",
      "encodedPath": "wire-2.body",
      "encodedBytes": 8879,
      "encodedSha256": "37b751463c6c41db993d5477573636eb42c2a45b00899251c3f01814f3745f73",
      "decodedPath": "response-2.body",
      "decodedBytes": 28886,
      "decodedSha256": "ca5c92840049243ffcf2f48cb1294f5afa678c501458f880ab2801fc5bfb0dba",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1274,
      "headersSha256": "9448d9d37bff6ebac115bed4229accc99e880f006d5bc65383ac8b06a7fab48f",
      "redactedHeaderPairs": 0
    }
  ],
  "wireResponseReceipts": [
    {
      "id": 1,
      "url": "https://www.tukaani.org/",
      "status": 200,
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1967,
      "headersSha256": "d167aa5f2ffe71c2aac6bb28c03ad84f6ea5d219ec72bbea890baab31a9f7e1f",
      "redactedHeaderPairs": 0,
      "encodedPath": "wire-1.body",
      "encodedBytes": 1234,
      "encodedSha256": "c7201f7fd4ed3572672dc836bb51080aff122c4fa3536a8d929dfd8fda6db87a",
      "decodedReceiptScope": "Decoded receipts exist only for responses returned by native transport; intermediate redirect bodies are not reconstructed as native observations"
    },
    {
      "id": 2,
      "url": "https://www.tukaani.org/style.css",
      "status": 200,
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1274,
      "headersSha256": "9448d9d37bff6ebac115bed4229accc99e880f006d5bc65383ac8b06a7fab48f",
      "redactedHeaderPairs": 0,
      "encodedPath": "wire-2.body",
      "encodedBytes": 8879,
      "encodedSha256": "37b751463c6c41db993d5477573636eb42c2a45b00899251c3f01814f3745f73",
      "decodedReceiptScope": "Decoded receipts exist only for responses returned by native transport; intermediate redirect bodies are not reconstructed as native observations"
    }
  ],
  "initialState": {
    "url": "https://www.tukaani.org/",
    "title": "The Tukaani Project",
    "root": "e1",
    "nodeCount": 249,
    "revision": 250,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T10:55:31.641Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.tukaani.org/",
      "root": "e1",
      "revision": 250,
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
      "url": "https://www.tukaani.org/",
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
          "url": "https://www.tukaani.org/",
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
    "nativeRequestAttempts": 2
  },
  "selected": {
    "index": 13,
    "reference": "e227",
    "href": "about.html",
    "url": "https://www.tukaani.org/about.html",
    "text": "Tukaani developers",
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
    "url": "https://www.tukaani.org/",
    "title": "The Tukaani Project",
    "root": "e1",
    "nodeCount": 249,
    "revision": 250,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T10:55:31.652Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.tukaani.org/",
      "root": "e1",
      "revision": 250,
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
      "url": "https://www.tukaani.org/",
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
          "url": "https://www.tukaani.org/",
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
  "sourceSha256": "d6def5f5dc5b444fd5f1ef05c02e95ad961c83d0124bfb0316ff466b989d3815",
  "compiledSha256": "a6a08e4c041dd8f7adadf214dd7c385e43d0ccc14078a39856d9c2c862d9ecf7"
}
```
