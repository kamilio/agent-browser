# zlib native website flow — September 12, 2026

## Outcome

**The bounded native documentation-link flow did not pass.** The initial page exhausted the authorized eight-GET allowance: one HTML document and seven original same-origin images returned HTTP 200, then a ninth adapter entry for `https://www.zlib.net/madler-email.png` was rejected locally before native transport or wire admission. The allowance was not increased. HTTP 200 or a committed DOM alone is not working-site acceptance.

There were **zero document commits, zero inspected anchors and zero clicks**. The native title, root reference and page/history snapshot were not observed because initial loading never committed. The final session records one navigation and zero commits. The original image owner counted eight image attempts, including the rejected ninth overall adapter entry; this is not eight image wire requests. No access restriction, Retry-After, redirect or CAPTCHA was observed in the eight responses; complete page-content classification was not reached.

- Child UTC: 2026-09-12T04:02:44.487Z through 2026-09-12T04:02:46.536Z.
- Supervisor UTC: 2026-09-12T04:02:44.368Z through 2026-09-12T04:02:46.545Z; 2177 ms; exit 1; timeout false; output-cap breach false; process group absent true.
- Initial native navigation calls: 1; genuine click calls: 0; wire GET constructions: 8; native transport requests: 8; adapter starts: 8; mocks: 0; followed redirects: 0.
- First failure: {"stage":"initial-navigation:network","name":"AssertionError","code":"ERR_ASSERTION","message":"Native request attempt cap exceeded"}.
- Initial committed state: not observed.
- Discovery: not reached.
- Destination: no successful destination-content observation; destination working-page acceptance is unproved.
- No retries, invented target, forced click, resource rewriting, alternate client, fallback or capacity increase.

## Released runtime and preservation

Pinned commit: `ffc7b2ef34b271c617ca846ec2296e8deede88b2`. Runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-collapsed-table-september12-round03/snapshot01/dist`. Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, v22.22.0; executable SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

Reverified all 20 gate receipts, full 1103 source / 1944 compiled inventories, and 21 commit-owned snapshot inputs against Git blobs. Gate evidence: 11784 passed, 0 failed, 2 unchanged exclusions; 213 selected suites, 212 strict roots, 607 manifest entries. No rebuild or gate rerun.

- source SHA256: `4bcebc7b8f7f0f18ad608efc218820db1bf5f89c34cd2aa9b3faa7ff51669938`.
- compiled SHA256: `10c5acd79ba2931c66c619e190b79b454e6eb73cc779759ff24ecf1ae090cbad`.
- nativeResults SHA256: `74e487ae54bd1f6eb3950b6e6c05e00b9c263bf0c943375b8695154311b0fddb`.
- summary SHA256: `436aa5c859e7522fa90c907cf64f89ac4b55b7986bbd635dce923b0baa6c1544`.
- audit SHA256: `8c649ca9ea7061e1de4a31f2c0230fd5131b705efc30215b583bc499fdb8ee61`.
- receipts SHA256: `6619f22bb91390250b5963b620abc95b3913998065c2855d0da2ddf84fe66f43`.
- commitVerification SHA256: `73baaa3d267f9f694d53dffb747aefd685bb17329a733b2705722ad0fd741bdb`.

61 exact-byte archives preserve authorization, root instructions, release summary, completed Lua report and both complete ledgers, harness including checks-fixed01.mjs, release receipt files and commit-owned inputs. Buffer equality, lengths and SHA256 were checked before adaptation and independently rechecked. The old probes were not executed. Unfinished other lanes and protected native-source-heading-source-10 were not read.

Full source/runtime inventories were recalculated before and after the single launch and during read-only verification. Original release, reference, security executable and executed-harness pins are unchanged. Shared working files are not substituted for the released runtime.

## Resources and exact capture

| Wire ID | Original URL | Kind | Status | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.zlib.net/` | document | 200 | 9230 / 32006 |
| 2 | `https://www.zlib.net/images/zlib3d-b1.png` | image | 200 | 21373 / 21350 |
| 3 | `https://www.zlib.net/images/zlib_ddj.png` | image | 200 | 17250 / 17227 |
| 4 | `https://www.zlib.net/zlib-email.png` | image | 200 | 942 / 919 |
| 5 | `https://www.zlib.net/images/li_blue.png` | image | 200 | 322 / 302 |
| 6 | `https://www.zlib.net/images/li_green.png` | image | 200 | 325 / 302 |
| 7 | `https://www.zlib.net/images/li_red.png` | image | 200 | 322 / 302 |
| 8 | `https://www.zlib.net/images/li_yellow.png` | image | 200 | 318 / 295 |

Observed UTC wire-start intervals: 251, 258, 251, 251, 251, 251, 251 ms. The original native OriginRequestPacer uses a performance.now recheck loop; wire instrumentation additionally enforces and verifies monotonic intervals of at least 250 ms. Late wire events after child output: []. The verifier permits at most one actual matching late close, never an expected copied event or additional request.

Encoded HTTP payloads, independently decoded native response bodies, original Node raw header name/value arrays, lengths and SHA256 hashes are preserved separately. These are HTTP response observations, not TCP/TLS packet captures. Any credential response-header pair exclusions are explicitly counted in the machine claims; no request credentials are sent. Full body/header hashes are in the machine-verifiable claims and both sealed ledgers.

Original cross-origin image rejections, strictly local before wire/native transport: []. Original DOM/resources are not removed. Same-origin HTTPS document/CSS guards remain strict. Original stylesheet policy observations: [].

## Failure census

Raw/applicable CSS, non-CSS formatting guards and deferred-node census are **unobserved, not zero**. The request-cap abort occurred inside initial loading before a page handle existed, so the completed-page diagnostic path was not reached. No external stylesheet request occurred; this does not establish that inline CSS was issue-free. No offline replay, extra native parse, new probe or hidden navigation was used to fill this evidence gap. No layout failure or sole CSS cause is inferred from the transport-budget stop.

## Cleanup and boundaries

Observed owner cleanup: {"eventOwnersInstrumented":0,"imageOwnersInstrumented":1,"eventOwnerCleanupProved":false,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":1,"controlOwnersInstrumented":0,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":false,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Empty owner samples never prove cleanup. Full immediate/final session, queue, transport, document, image, event and control metrics are in stdout.jsonl and progress.jsonl.

Boundaries: only this repository native browser; public-address checks, certificate validation, original AgentBrowser/0.1 identity, credentials omit, empty cookie jar; bodyless GETs only, eight maximum; 30s deadline + 5s termination grace; 6 MiB file/output and 12 MiB lane caps; at least 64 MiB free; private 0700 lane/HOME/TMP, explicit environment, no stdin/TTY. No mocks, providers, page JS, real SafeJS, devices, downloads, credentials or challenge handling. Stop on real HTTP failure, Retry-After or classified restriction; no bypass. No broader browser acceptance is inferred.

No source, TASKS, inventory, commit or push changes. Only ZLIB-NATIVE-FLOW.md and this new private lane are owned. Parent owns shared inventory, outstanding goal gates and final commit.

Preparation, offline syntax validation and postflight evidence checks passed on their first attempts. The single failed live-flow result, including its first failure, distinct caught navigation-abort error and all adapter/wire records, is preserved without rerun. There were no late wire events in this run; the Lua late-close example was not copied as an expectation. One document and one image owner were observed closed and empty; event/control owners were not instrumented, so their cleanup is unproved rather than vacuously passed.

The additional offline scope-verifier's first attempt failed its file-mode check: newly added files inherited group/other permission bits despite the containing lane remaining private0700. Its exact verifier bytes, original stderr/stdout and sampled modes are preserved. Only this lane's file permissions were corrected to0600; corrected verification uses distinct fixed01 logs. No executed-harness bytes or live results were changed, and there was no live rerun. See `VALIDATION-CORRECTION.md` in the lane. Parent's later test-only f941456/11848 evidence is not substituted for this explicit ffc7b2/11784 runtime; all Git comparisons use the authorized commit, not HEAD.

## Read-only reproduction

From the repository root, run the following offline verifier. It hashes all receipts and report, rechecks response decoding and cross-file assertions, release inventories, archives, and exact artifact membership. It performs no live navigation, socket probe, rebuild, historical probe execution or file write.

```sh
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import ./node_modules/.cache/native-validation/native-zlib-flow-september12/network-guard.mjs ./node_modules/.cache/native-validation/native-zlib-flow-september12/verify-readonly.mjs
```

## Exact machine-verifiable claims

```json
{
  "flowPassed": false,
  "startedAt": "2026-09-12T04:02:44.487Z",
  "finishedAt": "2026-09-12T04:02:46.536Z",
  "failure": {
    "stage": "initial-navigation:network",
    "name": "AssertionError",
    "code": "ERR_ASSERTION",
    "message": "Native request attempt cap exceeded"
  },
  "accounting": {
    "nativeRequestAttempts": 8,
    "transportRequests": 8,
    "wireRequestCalls": 8,
    "wireResponses": 8,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 50082,
    "decodedBytes": 72703,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 9,
    "admittedRequests": 8,
    "rejectedAdapterEntries": 1,
    "rejectedAdapterSamples": [
      {
        "entry": 9,
        "url": "https://www.zlib.net/madler-email.png",
        "name": "AssertionError",
        "code": "ERR_ASSERTION",
        "message": "Native request attempt cap exceeded"
      }
    ],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.zlib.net/",
      "status": 200,
      "kind": "document",
      "encoding": "gzip",
      "encodedPath": "wire-1.body",
      "encodedBytes": 9230,
      "encodedSha256": "5077967ebad3aae65b5496fdca8490882ef32419d06e7061e264d6f1ce03360e",
      "decodedPath": "response-1.body",
      "decodedBytes": 32006,
      "decodedSha256": "a2654af9cc15e4943a11c8aa27ce378f7293230d2953f18609fca7485b9423a5",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 1686,
      "headersSha256": "a5d1e682fd92fc5f168c98a38cb18d274cc460b050b1b2da22b1dbcc47b5caf8",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.zlib.net/images/zlib3d-b1.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-2.body",
      "encodedBytes": 21373,
      "encodedSha256": "4eee70f5e0a6cbaa8edb47948d3105190f281605094a26ff523b2be45efe8faa",
      "decodedPath": "response-2.body",
      "decodedBytes": 21350,
      "decodedSha256": "6b07c17f68a007b4930aa473f943a68ba7da5ed9e180e2ced23faca428697d2e",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1696,
      "headersSha256": "161f4d1cd03c5a1537f5c28c42e2274011c7842095e78b89e44fceb68790051a",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://www.zlib.net/images/zlib_ddj.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-3.body",
      "encodedBytes": 17250,
      "encodedSha256": "6411bff29eae6b48cf89cf4752fb8139153ff0fe09c1b7c8264b1229abfa9603",
      "decodedPath": "response-3.body",
      "decodedBytes": 17227,
      "decodedSha256": "b9c50afcdbe2bc64a88fd75fb754de0ecc0da8756842f8aa9709251703c84e40",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1695,
      "headersSha256": "0cae122a269c6d3727f9e3da5f317c473090d6f3c9b3e218db5da3a4bcd9ef5a",
      "redactedHeaderPairs": 0
    },
    {
      "id": 4,
      "url": "https://www.zlib.net/zlib-email.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-4.body",
      "encodedBytes": 942,
      "encodedSha256": "0dadc968e89681d6a2b4f16ea08298e4ad73081b1d01a326766951f6d9359378",
      "decodedPath": "response-4.body",
      "decodedBytes": 919,
      "decodedSha256": "d19a90be9072b591afbb2b86fcc55d941a29e493aed6160c9d36aaf9fa79776a",
      "headersPath": "wire-4.headers.json",
      "headersBytes": 1684,
      "headersSha256": "26f70c3b8aa3a2e6327f8a21f3c24f4810bf61f0c665c285748737abc0bb739d",
      "redactedHeaderPairs": 0
    },
    {
      "id": 5,
      "url": "https://www.zlib.net/images/li_blue.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-5.body",
      "encodedBytes": 322,
      "encodedSha256": "ea357efa9291d5d51841a6bff903c44e5c3c838ab896693332f86c3eb41a4982",
      "decodedPath": "response-5.body",
      "decodedBytes": 302,
      "decodedSha256": "b12d1b2a46ad7bb8f13c54e4a68a070a65b264e8d0eeffde01a1374db24b3ed1",
      "headersPath": "wire-5.headers.json",
      "headersBytes": 1688,
      "headersSha256": "2968abd08465c7c8f61c154913ff374f0a15946fd2b69be74b011bf45e5250a9",
      "redactedHeaderPairs": 0
    },
    {
      "id": 6,
      "url": "https://www.zlib.net/images/li_green.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-6.body",
      "encodedBytes": 325,
      "encodedSha256": "236229e7c6543cdc2a551e288aa6abe629228aefaf8a0ab15f8bc36facedcde6",
      "decodedPath": "response-6.body",
      "decodedBytes": 302,
      "decodedSha256": "0ef29e0e417588163795e594655f0f8f8694bc26d1a95d7eacd32e8093e2cd2a",
      "headersPath": "wire-6.headers.json",
      "headersBytes": 1689,
      "headersSha256": "5eb26fc160e987a0548e0ff90a78a42cfd3b112a769defcd82a0e3b49bff2665",
      "redactedHeaderPairs": 0
    },
    {
      "id": 7,
      "url": "https://www.zlib.net/images/li_red.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-7.body",
      "encodedBytes": 322,
      "encodedSha256": "509d7259e8f431a86b357dce93ed86e86998ae252cc69cddb02d43f51d0f5d19",
      "decodedPath": "response-7.body",
      "decodedBytes": 302,
      "decodedSha256": "ecbbf1b6975047f1cf3c1bf7f4b2ace14da8e3cfa4bc84572eea2cc48eb9c9e1",
      "headersPath": "wire-7.headers.json",
      "headersBytes": 1687,
      "headersSha256": "b7767a379c8976b825078edf944405fdf6a792954a87e6dfef250dc55ebe0684",
      "redactedHeaderPairs": 0
    },
    {
      "id": 8,
      "url": "https://www.zlib.net/images/li_yellow.png",
      "status": 200,
      "kind": "image",
      "encoding": "gzip",
      "encodedPath": "wire-8.body",
      "encodedBytes": 318,
      "encodedSha256": "bbd723987820705f57dffcf2104341bfe2fe3540ea646d0b211f97971dcc7f3b",
      "decodedPath": "response-8.body",
      "decodedBytes": 295,
      "decodedSha256": "9e4963cdc2098ba0890fbdde7795547c2193a7088f4b11c054d4872e36ba252f",
      "headersPath": "wire-8.headers.json",
      "headersBytes": 1690,
      "headersSha256": "452c6cfda8d37efc87550be53e1be1416820e061bd32adb16b41dc9446865e9f",
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
  "sourceSha256": "4bcebc7b8f7f0f18ad608efc218820db1bf5f89c34cd2aa9b3faa7ff51669938",
  "compiledSha256": "10c5acd79ba2931c66c619e190b79b454e6eb73cc779759ff24ecf1ae090cbad"
}
```
