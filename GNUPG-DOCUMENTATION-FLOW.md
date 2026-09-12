# GnuPG documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow failed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T05:22:36.338Z through 2026-09-12T05:22:38.505Z.
- Supervisor UTC: 2026-09-12T05:22:36.223Z through 2026-09-12T05:22:38.515Z; 2292 ms; exit 1; timeout false; process group absent true.
- First failure: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Float integration with atomic, flex, grid and table reflow is not coordinated"}.
- Counts: 1 initial navigation, 1 genuine click, 1 actual document commits, 6 native transport requests, 6 wire GETs, 6 adapter request-start observations, 6 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.gnupg.org/documentation/","title":"GnuPG - Support","root":"e1","nodeCount":428,"revision":434,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T05:22:38.491Z","reason":"before-or-after-click-state","url":"https://www.gnupg.org/documentation/","root":"e1","revision":434,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.gnupg.org/documentation/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.gnupg.org/documentation/","active":true,"requiresResubmission":false}],"retainedBytes":44,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":6}.
- Discovery: 58 anchors inspected, availability before deduplication; 8 eligible occurrences and 8 unique destinations; selected {"index":36,"reference":"e282","href":"faqs.html","url":"https://www.gnupg.org/documentation/faqs.html","text":"FAQs","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":9,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":1}.
- After click/failure: {"url":"https://www.gnupg.org/documentation/","title":"GnuPG - Support","root":"e1","nodeCount":428,"revision":434,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T05:22:38.502Z","reason":"before-or-after-click-state","url":"https://www.gnupg.org/documentation/","root":"e1","revision":434,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.gnupg.org/documentation/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.gnupg.org/documentation/","active":true,"requiresResubmission":false}],"retainedBytes":44,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":6}.
- Destination observation: not observed; destination content acceptance unproved.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.gnupg.org/documentation/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-table-percentage-september12-round01/snapshot01/dist`; commit `1478cd7c1b9263c17fc1f445009287bcd8db8575`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code and the parent CSS recovery implementation were not executed.

Reverified 20 gate receipts, 1106 source files, 1944 compiled files, and 8 commit-owned inputs. Historical gate: 11901 passed, 0 failed, 2 unchanged exclusions; 216 selected suites, 215 strict roots, 610 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `e212ee5d3c7ecfdcc82ed69e2e28f9569b2e41c20f18b4a4fbf4ed3a668958d7`.
- compiled SHA256: `8acb255db90a057ecdeaa44d60b194330bfa375d3ece491f411d1fe049958ac4`.
- nativeResults SHA256: `e627b7343374ef9851808107dcdb0c5d1ae9d1baae0a725644d49bd07b7e78ea`.
- summary SHA256: `de78affe02713d824000f18b41e867d377c7b00eaa75fa85e9b35144d7635250`.
- audit SHA256: `32afae80eeb85d0610ac668c29a7cf48be848e3f6b8effe8b74f4699ebb2d540`.
- receipts SHA256: `164e5df5c3c522db6c210f85c3fe4216f1d27a1fd19d5c661059436284d40bdc`.
- commitVerification SHA256: `78897d0bedd6cb2b2767c5d03d1d0f0fc4dfc64198c322793bb7b97c780435ec`.

The completed zlib32 flow remains failed and untouched. Both original seals (238/240 receipts) and their members are verified before/after this run and during read-only verification. 21 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.gnupg.org/documentation/` | document | 200 | 2881 / 8307 |
| 2 | `https://www.gnupg.org/share/site.css` | stylesheet | 200 | 3412 / 11804 |
| 3 | `https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png` | image | 200 | 9024 / 9024 |
| 4 | `https://www.gnupg.org/share/traueranzeige-g10_v2015.png` | image | 200 | 3821 / 3821 |
| 5 | `https://www.gnupg.org/share/mastodon-icon.png` | image | 200 | 1249 / 1249 |
| 6 | `https://www.gnupg.org/share/cc-by-sa_80x15.png` | image | 200 | 672 / 672 |

Native measured totals: 21059 encoded bytes, 34877 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## One bounded failure census

- Raw CSS: {"unimplemented-or-invalid-css-value":13,"unimplemented-css-property":43,"unimplemented-or-invalid-css-selector":2}; authoritative source styles.metrics().issues.
- Applicable CSS: {"unimplemented-or-invalid-css-value":3,"unimplemented-css-property":14,"unimplemented-or-invalid-css-selector":2}; authoritative source styles.metrics().applicableIssues.
- Formatting CSS: {"css:unimplemented-or-invalid-css-value":3,"css:unimplemented-css-property":14,"css:unimplemented-or-invalid-css-selector":2}.
- Independent non-CSS formatting issues: {"float-layout-not-supported":9,"clear-layout-not-supported":8}.
- Non-advisory non-CSS issues: {"float-layout-not-supported":9,"clear-layout-not-supported":8}.
- Deferred nodes: 0; 0 bounded actual-node samples. DOM revision 434/434.
- Counts do not identify a sole cause. No naive substring CSS excerpts, suppression, layout fallback or second interaction.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":1,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":true,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":1,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":true,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: []. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only GNUPG-DOCUMENTATION-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-gnupg-flow-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/setpriv --no-new-privs /usr/bin/python3 -I -B "$LANE/strict-offline-exec.py" /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import "$LANE/network-guard.mjs" "$LANE/verify.mjs" </dev/null
```

## Exact machine-verifiable claims

```json
{
  "budget": {
    "checks": [
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "historicalZlibFlowNotReclassifiedOrExecuted",
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
      "wireRequests": 6,
      "adapterEntries": 6,
      "commits": 1,
      "clicks": 1,
      "failure": {
        "stage": "native-documentation-link-click",
        "name": "AgentBrowserError",
        "code": "unsupported",
        "message": "Float integration with atomic, flex, grid and table reflow is not coordinated"
      },
      "wallMs": 2292
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
      "visitedDomNodes": 244,
      "boxes": 283,
      "outsideMarkers": 6,
      "textCodeUnits": 2264,
      "work": 3712,
      "deferredSubtrees": 0
    },
    "formattingNodes": 277,
    "nonCssFormattingIssues": {
      "float-layout-not-supported": 9,
      "clear-layout-not-supported": 8
    },
    "formattingCssIssues": {
      "css:unimplemented-or-invalid-css-value": 3,
      "css:unimplemented-css-property": 14,
      "css:unimplemented-or-invalid-css-selector": 2
    },
    "rawCssIssues": {
      "unimplemented-or-invalid-css-value": 13,
      "unimplemented-css-property": 43,
      "unimplemented-or-invalid-css-selector": 2
    },
    "applicableCssIssues": {
      "unimplemented-or-invalid-css-value": 3,
      "unimplemented-css-property": 14,
      "unimplemented-or-invalid-css-selector": 2
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
      "css:unimplemented-or-invalid-css-value": 3,
      "css:unimplemented-css-property": 14,
      "css:unimplemented-or-invalid-css-selector": 2
    },
    "nonAdvisoryNonCssFormattingIssues": {
      "float-layout-not-supported": 9,
      "clear-layout-not-supported": 8
    },
    "deferredCount": 0,
    "deferredSamples": [],
    "revisionBefore": 434,
    "revisionAfter": 434,
    "soleCauseClaimed": false,
    "attribution": "formattingCssIssues contains applicable formatting CSS entries, never the full raw CSS set; rawCssIssues comes only from styles.metrics().issues and applicableCssIssues only from styles.metrics().applicableIssues; non-CSS formatting issues remain independent; no suppression or partial-layout fallback"
  },
  "destination": null,
  "flowPassed": false,
  "startedAt": "2026-09-12T05:22:36.338Z",
  "finishedAt": "2026-09-12T05:22:38.505Z",
  "failure": {
    "stage": "native-documentation-link-click",
    "name": "AgentBrowserError",
    "code": "unsupported",
    "message": "Float integration with atomic, flex, grid and table reflow is not coordinated"
  },
  "accounting": {
    "nativeRequestAttempts": 6,
    "transportRequests": 6,
    "wireRequestCalls": 6,
    "wireResponses": 6,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 21059,
    "decodedBytes": 34877,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 6,
    "admittedRequests": 6,
    "rejectedAdapterEntries": 0,
    "rejectedAdapterSamples": [],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.gnupg.org/documentation/",
      "status": 200,
      "kind": "document",
      "encoding": "gzip",
      "encodedPath": "wire-1.body",
      "encodedBytes": 2881,
      "encodedSha256": "3e8d139291f92135b5432c6d33caf6072363c44e921955f86156bd60654fddce",
      "decodedPath": "response-1.body",
      "decodedBytes": 8307,
      "decodedSha256": "cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1269,
      "headersSha256": "30c0d214ab6e2ea7029cf90390d9110243be1c461770a1b48a356a4a57cb7e4f",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.gnupg.org/share/site.css",
      "status": 200,
      "kind": "stylesheet",
      "encoding": "gzip",
      "encodedPath": "wire-2.body",
      "encodedBytes": 3412,
      "encodedSha256": "12fffe7d37fb32e413c9cd063e3fc6362612ee8d03a5e88690596d0c0c22ec53",
      "decodedPath": "response-2.body",
      "decodedBytes": 11804,
      "decodedSha256": "48233e2b7bd1f22cca5f901465a95ff7fb8d9bb80f862378d8530b2fa422863b",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1237,
      "headersSha256": "aa435d5a27bb5505563cf84beff08e6f75ec11fad6cf406195f5b25e134caa83",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-3.body",
      "encodedBytes": 9024,
      "encodedSha256": "015aeb94125ecedefd25c7fadd7f3a9b2461eb4ba117ec6b10f577792e51e479",
      "decodedPath": "response-3.body",
      "decodedBytes": 9024,
      "decodedSha256": "015aeb94125ecedefd25c7fadd7f3a9b2461eb4ba117ec6b10f577792e51e479",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1089,
      "headersSha256": "d8a58f6ba340db873a605b9de42f7b7bad94a22be46217fbcb26bff2060365f6",
      "redactedHeaderPairs": 0
    },
    {
      "id": 4,
      "url": "https://www.gnupg.org/share/traueranzeige-g10_v2015.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-4.body",
      "encodedBytes": 3821,
      "encodedSha256": "e0950effbe2e332c27101d2407a173743b214867ea1c91051c51eafe3bd0c2af",
      "decodedPath": "response-4.body",
      "decodedBytes": 3821,
      "decodedSha256": "e0950effbe2e332c27101d2407a173743b214867ea1c91051c51eafe3bd0c2af",
      "headersPath": "wire-4.headers.json",
      "headersBytes": 1084,
      "headersSha256": "dcea345833e3ad6e0fa330664964f79962587f7303e0843440fdce2a0d9fb41f",
      "redactedHeaderPairs": 0
    },
    {
      "id": 5,
      "url": "https://www.gnupg.org/share/mastodon-icon.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-5.body",
      "encodedBytes": 1249,
      "encodedSha256": "c8a8448c8195e33897ea085749b458d8ce21d4706fe6b50168fd60f3b495019a",
      "decodedPath": "response-5.body",
      "decodedBytes": 1249,
      "decodedSha256": "c8a8448c8195e33897ea085749b458d8ce21d4706fe6b50168fd60f3b495019a",
      "headersPath": "wire-5.headers.json",
      "headersBytes": 1074,
      "headersSha256": "c2a5eeceb316b5af634b41daef329b37d58034661e510f6e786c4b5356e326c8",
      "redactedHeaderPairs": 0
    },
    {
      "id": 6,
      "url": "https://www.gnupg.org/share/cc-by-sa_80x15.png",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-6.body",
      "encodedBytes": 672,
      "encodedSha256": "5283893486a4fafa05b9cfecd1181b7b41f0367a5b1cfdd693bd423a1cccf5f3",
      "decodedPath": "response-6.body",
      "decodedBytes": 672,
      "decodedSha256": "5283893486a4fafa05b9cfecd1181b7b41f0367a5b1cfdd693bd423a1cccf5f3",
      "headersPath": "wire-6.headers.json",
      "headersBytes": 1073,
      "headersSha256": "f3a11f3366bd077b4d46a100c52edbe47bd9d2f6fa712113d9d4d6544de48703",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.gnupg.org/documentation/",
    "title": "GnuPG - Support",
    "root": "e1",
    "nodeCount": 428,
    "revision": 434,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T05:22:38.491Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.gnupg.org/documentation/",
      "root": "e1",
      "revision": 434,
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
      "url": "https://www.gnupg.org/documentation/",
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
          "url": "https://www.gnupg.org/documentation/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 44,
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
    "nativeRequestAttempts": 6
  },
  "selected": {
    "index": 36,
    "reference": "e282",
    "href": "faqs.html",
    "url": "https://www.gnupg.org/documentation/faqs.html",
    "text": "FAQs",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 9,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 1
  },
  "afterClick": {
    "url": "https://www.gnupg.org/documentation/",
    "title": "GnuPG - Support",
    "root": "e1",
    "nodeCount": 428,
    "revision": 434,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T05:22:38.502Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.gnupg.org/documentation/",
      "root": "e1",
      "revision": 434,
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
      "url": "https://www.gnupg.org/documentation/",
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
          "url": "https://www.gnupg.org/documentation/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 44,
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
    "nativeRequestAttempts": 6
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
  "sourceSha256": "e212ee5d3c7ecfdcc82ed69e2e28f9569b2e41c20f18b4a4fbf4ed3a668958d7",
  "compiledSha256": "8acb255db90a057ecdeaa44d60b194330bfa375d3ece491f411d1fe049958ac4"
}
```
