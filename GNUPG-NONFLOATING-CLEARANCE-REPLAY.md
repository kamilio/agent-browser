# GnuPG non-floating-clearance full-capture replay — September 12, 2026

## Actual outcome

**Captured-only flow did not pass.** No fresh HTTP or live-site acceptance is claimed.

- Native UTC: 2026-09-12T07:10:25.407Z through 2026-09-12T07:10:26.705Z.
- Classification: native-click-guard; observed failure: {"name":"AgentBrowserError","code":"unsupported","message":"Clearance requires a supported block owner"}.
- Captured access/challenge barrier: null.
- 1 initial navigation; 1 genuine discovered-link click; 1 commits.
- 6 native requests; 6 adapter attempts; 6 exact mocks; 0 successful wire calls; 0 replay misses.
- 58 anchors inspected before URL deduplication; selected {"index":36,"ref":"e282","text":"FAQs","url":"https://www.gnupg.org/documentation/faqs.html","href":"faqs.html","browsingTarget":"_self","download":false,"ping":false,"displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":9,"ancestorComplete":true,"match":true,"eligible":true,"eligibleOccurrences":1}.
- Source decoded SHA256: cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438. Native serialized DOM: {"bytes":8088,"sha256":"99c90697dffc8991a4b26775b1f62d25fa6e0ef5e6c61dc53e00d76cd0212443","nodeCount":428,"revision":434}; after click: {"bytes":8088,"sha256":"99c90697dffc8991a4b26775b1f62d25fa6e0ef5e6c61dc53e00d76cd0212443","nodeCount":428,"revision":434}.
- Initial title/URL/history: {"url":"https://www.gnupg.org/documentation/","title":"GnuPG - Support","nodeCount":428,"root":"e1","revision":434,"sameDocument":true,"history":{"key":"h1-1","url":"https://www.gnupg.org/documentation/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.gnupg.org/documentation/","active":true,"requiresResubmission":false}],"retainedBytes":44,"evictedDocuments":0}}.
- After-click title/URL/history: {"url":"https://www.gnupg.org/documentation/","title":"GnuPG - Support","nodeCount":428,"root":"e1","revision":434,"sameDocument":true,"history":{"key":"h1-1","url":"https://www.gnupg.org/documentation/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.gnupg.org/documentation/","active":true,"requiresResubmission":false}],"retainedBytes":44,"evictedDocuments":0}}.

## Release and historical comparators

Only committed runtime 5c6aea54cf6d9ce61569f57518cd836ebe8bf506, gate12187/0/2, native-nonfloating-clear-september12-round02/snapshot01/dist was executed. All20 gate receipts,1121 source files,1944 compiled files and12 commit-owned inputs including manifest were verified. Actual Git outputs were collected before sealing; all subsequent checks are byte-only under unconditional socketpair denial.

Original11901 live observation remains historical: {"stage":"native-documentation-link-click","name":"AgentBrowserError","code":"unsupported","message":"Float integration with atomic, flex, grid and table reflow is not coordinated"}; 6 original wire requests.

Completed12037 full-image replay remains historical: {"name":"AgentBrowserError","code":"unsupported","message":"Non-floating clearance requires margin coordination"}; 6 mocks and0 wire calls. Neither historical page was rerun. Source-only unloaded-image diagnosis was not used as a comparator.

All six original responses (HTML, CSS and four PNGs) were verified as raw/decoded bytes and ordered headers before copying. All six replayed: true. Native decoded bytes: 34877; wire encoded transfer bytes: 0.

## One bounded diagnostic census

Census calls: 1. Raw CSS: {"unimplemented-or-invalid-css-value":7,"unimplemented-css-property":43,"unimplemented-or-invalid-css-selector":2}. Applicable CSS: {"unimplemented-or-invalid-css-value":2,"unimplemented-css-property":14,"unimplemented-or-invalid-css-selector":2}. Independent non-CSS: {"float-layout-not-supported":9,"clear-layout-not-supported":8}. Deferred counts: {}.

Missing observations are not zeros. The census is not a sole-cause claim; no CSS/source stripping, guessed rule excerpt, post-failure geometry probe or retry was used.

## Bounds, ownership and artifacts

45s wall plus5s kill grace;6MiB file/aggregate-output cap;16MiB lane;64MiB minimum free;250ms monotonic mock pacing. Supervisor elapsed 1.4177850726991892s, exit1, process group absent true.

Original viewport, native capacities, response bytes and resource policy retained. Strict kernel socket/socketpair and network-system-call denial plus JavaScript network/process/runtime guards; private HOME/TMP; explicit environment; no stdin/TTY, credentials, providers, devices, real SafeJS or protected source-heading payload access.

Sampled owner cleanup: {"documents":true,"images":true,"events":true,"controls":true,"session":true,"transport":true}. Scope is only actual instrumented document/image/event/control owners plus session and transport; empty samples do not prove cleanup.

One session only. Missing destination responses stop as replay-miss, never success. No production/shared files, manifest, historical evidence or74-host inventory edits; no commit/push. Parent owns independent verification and integration.

Artifacts: new12187/stdout.json, progress.jsonl, native-dom.html, INVOCATION.json, EXECUTION.json; original/ raw/decoded capture; previous/ sealed full-image comparator; archive/ gate receipts and Git blobs; GIT-COMMANDS.json; PREFLIGHT.json; COMPARISON.json; CHECKS.json; exact ARTIFACTS.txt and two SHA256 seals.

## Read-only verification

From repository root; no page execution, writes, HTTP or Git subprocess. Do not redirect into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-gnupg-clearance-replay-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/python3 -I -B "$LANE/offline.py" verify </dev/null
```

## Exact machine-verifiable comparison

```json
{
  "scope": "One full six-response captured-only replay; original11901 live and12037 full-image replay retained without reruns; not fresh live acceptance;74-host inventory unchanged.",
  "recordedLive": {
    "runtime": 11901,
    "commit": "1478cd7c1b9263c17fc1f445009287bcd8db8575",
    "startedAt": "2026-09-12T05:22:36.338Z",
    "finishedAt": "2026-09-12T05:22:38.505Z",
    "passed": false,
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
    "committed": {
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
    "inspectedAnchors": 58,
    "clickCalls": 1,
    "commits": 1,
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
    "images": {
      "partial": true,
      "profile": "png-resource-owner",
      "elements": 4,
      "resources": 4,
      "active": 0,
      "queued": 0,
      "requests": 4,
      "updates": 4,
      "receivedBytes": 14766,
      "decodedBytes": 238432,
      "decodeWork": 1135467,
      "scanWork": 856,
      "waiters": 0,
      "delivered": 4,
      "closed": false,
      "images": [
        {
          "ref": "e41",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png",
          "naturalWidth": 356,
          "naturalHeight": 120,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e401",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/traueranzeige-g10_v2015.png",
          "naturalWidth": 200,
          "naturalHeight": 73,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e405",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/mastodon-icon.png",
          "naturalWidth": 32,
          "naturalHeight": 34,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "pHYs",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "pHYs",
            "tEXt"
          ]
        },
        {
          "ref": "e414",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/cc-by-sa_80x15.png",
          "naturalWidth": 80,
          "naturalHeight": 15,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "gAMA",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "gAMA",
            "tEXt"
          ]
        }
      ]
    },
    "census": {
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
      "formattingCssIssues": {
        "css:unimplemented-or-invalid-css-value": 3,
        "css:unimplemented-css-property": 14,
        "css:unimplemented-or-invalid-css-selector": 2
      },
      "nonCssIssues": {
        "float-layout-not-supported": 9,
        "clear-layout-not-supported": 8
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
      "deferredCount": 0,
      "deferredSamples": [],
      "revisionBefore": 434,
      "revisionAfter": 434
    },
    "cleanup": {
      "eventOwnersInstrumented": 1,
      "imageOwnersInstrumented": 1,
      "eventOwnerCleanupProved": true,
      "imageOwnerCleanupProved": true,
      "documentOwnersInstrumented": 1,
      "controlOwnersInstrumented": 1,
      "documentOwnerCleanupProved": true,
      "controlOwnerCleanupProved": true,
      "scope": "Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"
    }
  },
  "previousCapturedReplay": {
    "runtime": 12037,
    "commit": "addf9898d11f2d2a16b56499393b740e0d74271a",
    "startedAt": "2026-09-12T06:17:15.629Z",
    "finishedAt": "2026-09-12T06:17:16.927Z",
    "supervisor": {
      "mode": "new12037",
      "startedAt": "2026-09-12T06:17:15.514Z",
      "storageBefore": {
        "allocated": 9039872,
        "logical": 8593130,
        "maximumFile": 3506990,
        "free": 3800748032,
        "ok": true
      },
      "signals": [],
      "terminationReasons": [],
      "outputTruncated": false,
      "pid": 3724593,
      "exitCode": 1,
      "groupPresentAfterExit": false,
      "groupAbsentFinal": true,
      "finishedAt": "2026-09-12T06:17:16.935Z",
      "elapsedSeconds": 1.4180720765143633,
      "outputBytes": {
        "stdout": 58248,
        "stderr": 0
      },
      "storageAfter": {
        "allocated": 9089024,
        "logical": 8641812,
        "maximumFile": 3506990,
        "free": 3800657920,
        "ok": true
      },
      "privateDirectoriesEmpty": true
    },
    "flowPassed": false,
    "classification": "native-click-guard",
    "failure": {
      "name": "AgentBrowserError",
      "code": "unsupported",
      "message": "Non-floating clearance requires margin coordination"
    },
    "navigationCalls": 1,
    "clickCalls": 1,
    "commits": 1,
    "nativeRequests": 6,
    "adapterAttempts": 6,
    "mocks": 6,
    "successfulWireCalls": 0,
    "encodedTransferBytes": 0,
    "decodedBytes": 34877,
    "mockIntervalsMs": [
      250.55349999999999,
      251.08957299999997,
      250.77329200000008,
      251.591499,
      251.12623400000007
    ],
    "replayMisses": [],
    "localImageRejections": [],
    "committed": {
      "url": "https://www.gnupg.org/documentation/",
      "title": "GnuPG - Support",
      "nodeCount": 428,
      "root": "e1",
      "revision": 434,
      "sameDocument": true,
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
      }
    },
    "selected": {
      "index": 36,
      "ref": "e282",
      "text": "FAQs",
      "url": "https://www.gnupg.org/documentation/faqs.html",
      "href": "faqs.html",
      "browsingTarget": "_self",
      "download": false,
      "ping": false,
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 9,
      "ancestorComplete": true,
      "match": true,
      "eligible": true,
      "eligibleOccurrences": 1
    },
    "inspectedAnchors": 58,
    "afterClick": {
      "url": "https://www.gnupg.org/documentation/",
      "title": "GnuPG - Support",
      "nodeCount": 428,
      "root": "e1",
      "revision": 434,
      "sameDocument": true,
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
      }
    },
    "images": {
      "partial": true,
      "profile": "png-resource-owner",
      "elements": 4,
      "resources": 4,
      "active": 0,
      "queued": 0,
      "requests": 4,
      "updates": 4,
      "receivedBytes": 14766,
      "decodedBytes": 238432,
      "decodeWork": 1135467,
      "scanWork": 856,
      "waiters": 0,
      "delivered": 4,
      "closed": false,
      "images": [
        {
          "ref": "e41",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png",
          "naturalWidth": 356,
          "naturalHeight": 120,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e401",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/traueranzeige-g10_v2015.png",
          "naturalWidth": 200,
          "naturalHeight": 73,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e405",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/mastodon-icon.png",
          "naturalWidth": 32,
          "naturalHeight": 34,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "pHYs",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "pHYs",
            "tEXt"
          ]
        },
        {
          "ref": "e414",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/cc-by-sa_80x15.png",
          "naturalWidth": 80,
          "naturalHeight": 15,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "gAMA",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "gAMA",
            "tEXt"
          ]
        }
      ]
    },
    "census": {
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
      "formattingCssIssues": {
        "css:unimplemented-or-invalid-css-value": 3,
        "css:unimplemented-css-property": 14,
        "css:unimplemented-or-invalid-css-selector": 2
      },
      "nonCssIssues": {
        "float-layout-not-supported": 9,
        "clear-layout-not-supported": 8
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
      "deferredCount": 0,
      "deferredSamples": [],
      "revisionBefore": 434,
      "revisionAfter": 434
    },
    "censusCalls": 1,
    "cleanup": {
      "documents": true,
      "images": true,
      "events": true,
      "controls": true,
      "session": true,
      "transport": true
    }
  },
  "release": {
    "validation": "/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-nonfloating-clear-september12-round02",
    "commit": "5c6aea54cf6d9ce61569f57518cd836ebe8bf506",
    "passed": 12187,
    "sourceCount": 1121,
    "compiledCount": 1944,
    "inputCount": 12,
    "selected": 231,
    "strict": 230,
    "manifest": 625,
    "source": "dabe4002756bc5d4c29f1b2273ec0334fbc768f07587b14356202098db11f1c5",
    "compiled": "d2790f7e8f29e5d4be288e9308d3a32894f437ef4a1321f843aae489dd0c47d9",
    "native": "659727a60ac78db6c2abf0c299f21568ef91a22fe417c11502166ffbcdef436f",
    "summary": "5728a84726e6aca2ed719ec76a0c8ce3c3c32ec1955fb6a98aa7d01394fae2ed",
    "audit": "2af5b45d138e03074ca6b5a8e3d56eddbc833b59126c2a20c752bf25abc67836",
    "receipts": "add18a0d0f12a01ed260f266d559140bda6502edca3f613508e92296ba6a84cc",
    "verification": "668f40c99c6580dbdc6fadea366371126e7e754a5dc72c7419d99a8a8fa73c38"
  },
  "currentReplay": {
    "runtime": 12187,
    "commit": "5c6aea54cf6d9ce61569f57518cd836ebe8bf506",
    "startedAt": "2026-09-12T07:10:25.407Z",
    "finishedAt": "2026-09-12T07:10:26.705Z",
    "flowPassed": false,
    "classification": "native-click-guard",
    "failure": {
      "name": "AgentBrowserError",
      "code": "unsupported",
      "message": "Clearance requires a supported block owner"
    },
    "barrier": null,
    "supervisor": {
      "mode": "new12187",
      "startedAt": "2026-09-12T07:10:25.293Z",
      "storageBefore": {
        "allocated": 9261056,
        "logical": 8821629,
        "maximumFile": 3551478,
        "free": 3610759168,
        "ok": true
      },
      "signals": [],
      "terminationReasons": [],
      "outputTruncated": false,
      "pid": 3761937,
      "exitCode": 1,
      "groupPresentAfterExit": false,
      "groupAbsentFinal": true,
      "finishedAt": "2026-09-12T07:10:26.714Z",
      "elapsedSeconds": 1.4177850726991892,
      "outputBytes": {
        "stdout": 58232,
        "stderr": 0
      },
      "storageAfter": {
        "allocated": 9310208,
        "logical": 8870296,
        "maximumFile": 3551478,
        "free": 3610669056,
        "ok": true
      },
      "privateDirectoriesEmpty": true
    },
    "navigationCalls": 1,
    "clickCalls": 1,
    "commits": 1,
    "nativeRequests": 6,
    "adapterAttempts": 6,
    "mocks": [
      {
        "at": "2026-09-12T07:10:25.414Z",
        "monotonicMs": 107.63346,
        "pacingDeadlineMs": null,
        "pacingSleeps": 0,
        "previousMockAt": null,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/documentation/",
        "archiveIndex": 1,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:36.806Z",
        "decodedBytes": 8307,
        "decodedSha256": "cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438",
        "headersSha256": "97cb2f4184f1a1f40be0f2362f5067b5a729c553b2f9619e814dd022298608d7",
        "rawHeaderSha256": "30c0d214ab6e2ea7029cf90390d9110243be1c461770a1b48a356a4a57cb7e4f",
        "originalEncodedSha256": "3e8d139291f92135b5432c6d33caf6072363c44e921955f86156bd60654fddce",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      },
      {
        "at": "2026-09-12T07:10:25.665Z",
        "monotonicMs": 359.120838,
        "pacingDeadlineMs": 357.63346,
        "pacingSleeps": 2,
        "previousMockAt": 107.63346,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/share/site.css",
        "archiveIndex": 2,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:37.149Z",
        "decodedBytes": 11804,
        "decodedSha256": "48233e2b7bd1f22cca5f901465a95ff7fb8d9bb80f862378d8530b2fa422863b",
        "headersSha256": "be735a91336f3102485227f34c702c3d22f5e2389376bc1b94d16dd48dfc9f69",
        "rawHeaderSha256": "aa435d5a27bb5505563cf84beff08e6f75ec11fad6cf406195f5b25e134caa83",
        "originalEncodedSha256": "12fffe7d37fb32e413c9cd063e3fc6362612ee8d03a5e88690596d0c0c22ec53",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      },
      {
        "at": "2026-09-12T07:10:25.916Z",
        "monotonicMs": 610.248444,
        "pacingDeadlineMs": 609.120838,
        "pacingSleeps": 1,
        "previousMockAt": 359.120838,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png",
        "archiveIndex": 3,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:37.472Z",
        "decodedBytes": 9024,
        "decodedSha256": "015aeb94125ecedefd25c7fadd7f3a9b2461eb4ba117ec6b10f577792e51e479",
        "headersSha256": "e01ef94cabb437ea768fcca416dc5f086f7944569bba6aeed175862c12305509",
        "rawHeaderSha256": "d8a58f6ba340db873a605b9de42f7b7bad94a22be46217fbcb26bff2060365f6",
        "originalEncodedSha256": "015aeb94125ecedefd25c7fadd7f3a9b2461eb4ba117ec6b10f577792e51e479",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      },
      {
        "at": "2026-09-12T07:10:26.167Z",
        "monotonicMs": 860.724824,
        "pacingDeadlineMs": 860.248444,
        "pacingSleeps": 1,
        "previousMockAt": 610.248444,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/share/traueranzeige-g10_v2015.png",
        "archiveIndex": 4,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:37.823Z",
        "decodedBytes": 3821,
        "decodedSha256": "e0950effbe2e332c27101d2407a173743b214867ea1c91051c51eafe3bd0c2af",
        "headersSha256": "4f594db88a32bf283664e7e5c858c662a3fded446f1c95227f99f55ec744b064",
        "rawHeaderSha256": "dcea345833e3ad6e0fa330664964f79962587f7303e0843440fdce2a0d9fb41f",
        "originalEncodedSha256": "e0950effbe2e332c27101d2407a173743b214867ea1c91051c51eafe3bd0c2af",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      },
      {
        "at": "2026-09-12T07:10:26.417Z",
        "monotonicMs": 1111.200884,
        "pacingDeadlineMs": 1110.724824,
        "pacingSleeps": 1,
        "previousMockAt": 860.724824,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/share/mastodon-icon.png",
        "archiveIndex": 5,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:38.149Z",
        "decodedBytes": 1249,
        "decodedSha256": "c8a8448c8195e33897ea085749b458d8ce21d4706fe6b50168fd60f3b495019a",
        "headersSha256": "0972000a157250de5c1a4ffdf4e4c629bc97e92681a8b3f21c4f1cfc789b740d",
        "rawHeaderSha256": "c2a5eeceb316b5af634b41daef329b37d58034661e510f6e786c4b5356e326c8",
        "originalEncodedSha256": "c8a8448c8195e33897ea085749b458d8ce21d4706fe6b50168fd60f3b495019a",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      },
      {
        "at": "2026-09-12T07:10:26.669Z",
        "monotonicMs": 1362.36933,
        "pacingDeadlineMs": 1361.200884,
        "pacingSleeps": 1,
        "previousMockAt": 1111.200884,
        "kind": "mock-response",
        "url": "https://www.gnupg.org/share/cc-by-sa_80x15.png",
        "archiveIndex": 6,
        "status": 200,
        "originalReceivedAt": "2026-09-12T05:22:38.470Z",
        "decodedBytes": 672,
        "decodedSha256": "5283893486a4fafa05b9cfecd1181b7b41f0367a5b1cfdd693bd423a1cccf5f3",
        "headersSha256": "df639927469b24aa0a5fe5fbe1240b031e87fe5b93c3b1ccabb7f4d5a3fbb4e9",
        "rawHeaderSha256": "f3a11f3366bd077b4d46a100c52edbe47bd9d2f6fa712113d9d4d6544de48703",
        "originalEncodedSha256": "5283893486a4fafa05b9cfecd1181b7b41f0367a5b1cfdd693bd423a1cccf5f3",
        "actualWireEncodedBytes": 0,
        "bodyBufferEqual": true
      }
    ],
    "successfulWireCalls": 0,
    "encodedTransferBytes": 0,
    "decodedBytes": 34877,
    "mockIntervalsMs": [
      251.48737799999998,
      251.12760599999996,
      250.47638000000006,
      250.47606000000007,
      251.1684459999999
    ],
    "replayMisses": [],
    "localImageRejections": [],
    "committed": {
      "url": "https://www.gnupg.org/documentation/",
      "title": "GnuPG - Support",
      "nodeCount": 428,
      "root": "e1",
      "revision": 434,
      "sameDocument": true,
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
      }
    },
    "selected": {
      "index": 36,
      "ref": "e282",
      "text": "FAQs",
      "url": "https://www.gnupg.org/documentation/faqs.html",
      "href": "faqs.html",
      "browsingTarget": "_self",
      "download": false,
      "ping": false,
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 9,
      "ancestorComplete": true,
      "match": true,
      "eligible": true,
      "eligibleOccurrences": 1
    },
    "inspectedAnchors": 58,
    "afterClick": {
      "url": "https://www.gnupg.org/documentation/",
      "title": "GnuPG - Support",
      "nodeCount": 428,
      "root": "e1",
      "revision": 434,
      "sameDocument": true,
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
      }
    },
    "images": {
      "partial": true,
      "profile": "png-resource-owner",
      "elements": 4,
      "resources": 4,
      "active": 0,
      "queued": 0,
      "requests": 4,
      "updates": 4,
      "receivedBytes": 14766,
      "decodedBytes": 238432,
      "decodeWork": 1135467,
      "scanWork": 856,
      "waiters": 0,
      "delivered": 4,
      "closed": false,
      "images": [
        {
          "ref": "e41",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/logo-gnupg-light-purple-bg.png",
          "naturalWidth": 356,
          "naturalHeight": 120,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e401",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/traueranzeige-g10_v2015.png",
          "naturalWidth": 200,
          "naturalHeight": 73,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "bKGD",
            "pHYs",
            "tIME"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "bKGD",
            "pHYs",
            "tIME"
          ]
        },
        {
          "ref": "e405",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/mastodon-icon.png",
          "naturalWidth": 32,
          "naturalHeight": 34,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "pHYs",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "pHYs",
            "tEXt"
          ]
        },
        {
          "ref": "e414",
          "state": "complete",
          "complete": true,
          "currentSrc": "https://www.gnupg.org/share/cc-by-sa_80x15.png",
          "naturalWidth": 80,
          "naturalHeight": 15,
          "originClean": true,
          "ignoredAncillaryChunks": [
            "gAMA",
            "tEXt"
          ],
          "mediaType": "image/png",
          "ignoredMetadata": [
            "gAMA",
            "tEXt"
          ]
        }
      ]
    },
    "census": {
      "scope": "one bounded native failure census; authoritative counts and actual deferred samples only; no rule substring excerpts or sole-cause claim",
      "metrics": {
        "visitedDomNodes": 244,
        "boxes": 283,
        "outsideMarkers": 6,
        "textCodeUnits": 2264,
        "work": 3712,
        "deferredSubtrees": 0
      },
      "issues": {
        "css:unimplemented-or-invalid-css-value": 2,
        "css:unimplemented-css-property": 14,
        "css:unimplemented-or-invalid-css-selector": 2,
        "float-layout-not-supported": 9,
        "clear-layout-not-supported": 8
      },
      "nonCssIssues": {
        "float-layout-not-supported": 9,
        "clear-layout-not-supported": 8
      },
      "cssIssues": {
        "css:unimplemented-or-invalid-css-value": 2,
        "css:unimplemented-css-property": 14,
        "css:unimplemented-or-invalid-css-selector": 2
      },
      "nonAdvisoryIssues": {
        "css:unimplemented-or-invalid-css-value": 2,
        "css:unimplemented-css-property": 14,
        "css:unimplemented-or-invalid-css-selector": 2,
        "float-layout-not-supported": 9,
        "clear-layout-not-supported": 8
      },
      "styles": {
        "partial": true,
        "cascadeBuilds": 1,
        "properties": [
          "display",
          "visibility"
        ],
        "boxProperties": [
          "top",
          "right",
          "bottom",
          "left",
          "border-top-width",
          "border-right-width",
          "border-bottom-width",
          "border-left-width",
          "border-top-style",
          "border-right-style",
          "border-bottom-style",
          "border-left-style",
          "width",
          "height",
          "min-width",
          "min-height",
          "max-width",
          "max-height",
          "box-sizing",
          "margin-top",
          "margin-right",
          "margin-bottom",
          "margin-left",
          "padding-top",
          "padding-right",
          "padding-bottom",
          "padding-left"
        ],
        "flexProperties": [
          "flex-direction",
          "flex-wrap",
          "flex-grow",
          "flex-shrink",
          "flex-basis",
          "order",
          "justify-content",
          "align-items",
          "align-self",
          "align-content",
          "row-gap",
          "column-gap"
        ],
        "gridProperties": [
          "grid-template-columns",
          "grid-template-rows",
          "grid-template-areas",
          "grid-auto-columns",
          "grid-auto-rows",
          "grid-auto-flow",
          "grid-row-start",
          "grid-column-start",
          "grid-row-end",
          "grid-column-end"
        ],
        "flowProperties": [
          "position",
          "float",
          "clear",
          "overflow-x",
          "overflow-y",
          "z-index"
        ],
        "interactionProperties": [
          "pointer-events"
        ],
        "listProperties": [
          "list-style-type",
          "list-style-position"
        ],
        "tableProperties": [
          "table-layout",
          "border-collapse",
          "border-spacing",
          "caption-side",
          "empty-cells",
          "vertical-align"
        ],
        "outlineProperties": [
          "outline-width",
          "outline-style",
          "outline-color",
          "outline-offset"
        ],
        "textProperties": [
          "font-family",
          "font-size",
          "font-weight",
          "line-height",
          "white-space",
          "overflow-wrap",
          "text-align"
        ],
        "textFont": "Agent Mono",
        "textFontWeights": [
          400,
          700
        ],
        "paintProperties": [
          "border-top-color",
          "border-right-color",
          "border-bottom-color",
          "border-left-color",
          "color",
          "caret-color",
          "accent-color",
          "background-image",
          "background-position",
          "background-size",
          "background-repeat",
          "background-attachment",
          "background-origin",
          "background-clip",
          "background-color"
        ],
        "paintColorSpace": "srgb-8bit",
        "customProperties": "unregistered-bounded-substitution",
        "boxValues": "computed-subset-not-used-geometry",
        "layout": false,
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "colorScheme": {
          "profile": "native-ua-color-preference",
          "preference": null,
          "systemIntegration": false,
          "siteOverrides": false,
          "effective": "light"
        },
        "externalSheets": 1,
        "importedSheets": 0,
        "rules": 126,
        "declarations": 309,
        "codeUnits": 11833,
        "work": 24017,
        "issues": {
          "unimplemented-or-invalid-css-value": 7,
          "unimplemented-css-property": 43,
          "unimplemented-or-invalid-css-selector": 2
        },
        "applicableIssues": {
          "unimplemented-or-invalid-css-value": 2,
          "unimplemented-css-property": 14,
          "unimplemented-or-invalid-css-selector": 2
        }
      },
      "rawCssIssues": {
        "unimplemented-or-invalid-css-value": 7,
        "unimplemented-css-property": 43,
        "unimplemented-or-invalid-css-selector": 2
      },
      "applicableCssIssues": {
        "unimplemented-or-invalid-css-value": 2,
        "unimplemented-css-property": 14,
        "unimplemented-or-invalid-css-selector": 2
      },
      "recoveryDiagnostics": {
        "discarded-incomplete-css-rule": {
          "raw": 0,
          "applicable": 0,
          "formatting": 0,
          "advisory": true
        },
        "unimplemented-or-invalid-css-rule": {
          "raw": 0,
          "applicable": 0,
          "formatting": 0,
          "advisory": false
        }
      },
      "deferredReasonCounts": {},
      "cssDiagnosticSources": {
        "rawCssIssues": "styles.metrics().issues",
        "applicableCssIssues": "styles.metrics().applicableIssues"
      },
      "deferred": [],
      "noscriptEntries": [],
      "formattingNodes": 277,
      "revisionBefore": 434,
      "revisionAfter": 434
    },
    "censusCalls": 1,
    "domBefore": {
      "bytes": 8088,
      "sha256": "99c90697dffc8991a4b26775b1f62d25fa6e0ef5e6c61dc53e00d76cd0212443",
      "nodeCount": 428,
      "revision": 434
    },
    "domAfter": {
      "bytes": 8088,
      "sha256": "99c90697dffc8991a4b26775b1f62d25fa6e0ef5e6c61dc53e00d76cd0212443",
      "nodeCount": 428,
      "revision": 434
    },
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "cleanup": {
      "documents": true,
      "images": true,
      "events": true,
      "controls": true,
      "session": true,
      "transport": true
    }
  },
  "comparison": {
    "allSixOriginalResponsesReplayed": true,
    "fullImageComparatorsOnly": true,
    "noOldPageRerun": true,
    "noSoleCauseClaim": true,
    "originalFailureChanged": true,
    "previousReplayFailureChanged": true,
    "sourceResponseSha256": "cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438",
    "historicalViewport": {
      "width": 1280,
      "height": 720
    }
  }
}
```
