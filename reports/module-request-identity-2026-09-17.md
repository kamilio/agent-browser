# Module request identity and live redirects — September 17, 2026

## Browser correction

The native network module registry previously conflated the requested module
identity with the final response URL. Redirected aliases could collapse into
one source, while relative dependency resolution had no separate response base.

The registry now returns the canonical requested URL as `id` and retains the
response URL separately for resolving relative dependencies. Different request
aliases remain different sources and consume separate source budgets even when
their final URL or text matches. A response URL is not implicitly another known
referrer or cache entry. Request fragments remain in the request identity, not
copied into the response base; both URLs are independently bounded.

Preloaded `PageNetworkModuleEntry` values accept optional canonical `baseUrl`,
defaulting to `id`. Own data fields are snapshotted without executing accessors;
the host still owns source/base authorization. Evaluation requires the original
exact entry identity and source. Owner closure clears retained bases and caches.
No new dependency, runtime engine, implicit fetch path or limit increase is added.

## Isolated qualification

Baseline: `5910ec3ce5057f5f1000545e4d477db82317d6e9`. Qualification uses a clean
committed snapshot with four owned source/test overlays, not the dirty root.

| Run | Passed | Failed | Interpretation |
| --- | ---: | ---: | --- |
| red01 | 352 | 35 | Unchanged registry with new/updated behavioral tests |
| release01 | 387 | 0 | Corrected registry; separate test-only lint finding |
| release02 | 387 | 0 | Final selected native gate and all quality checks pass |

The 11 selected files come from the explicit native manifest. Registry cases
increase from 64 to 86 and extension integration cases from 16 to 19: **25
additional cases**, with existing incorrect final-identity expectations updated.
Coverage includes redirected relative imports, distinct aliases, request-cache
precedence, source accounting, entry metadata, fragments, and owner revocation.
Integration uses a fake core, not actual SafeJS.

Build, selected strict test types, format and lint all pass. The first quality
run's string-concatenation lint finding is fixed with a template literal; its
failure remains recorded. Source and compiled manifests pin **1,629 source and
2,412 compiled files**. All child groups close and private HOME/TMP stay empty.
The canonical 1,020-entry manifest still has 22 absent committed files. This is
not a new full-suite run or qualification of pre-existing dirty work.

## Fresh native resource flow

Select the public unpkg package alias explicitly, not from a popularity ranking
or a source-discovered link. Its resolved version is learned only from the
server's response. All acquisition uses the qualified native module registry,
`fetchScriptResource`, and `NodeNetworkTransport`.

| Observation | Result |
| --- | --- |
| First request | `https://unpkg.com/lit` → HTTP 302 |
| Server-directed final request | `https://unpkg.com/lit@3.3.3/index.js` → HTTP 200 |
| Final response received | September 17, 2026, 18:17:47.854 UTC |
| Content type | `text/javascript; charset=utf-8` |
| Final source bytes / code units | 157 / 157 |
| Source SHA256 | `b1993a57ee9b162bc5af6b2f4bc44623c0bd3496be5119c83d5325b04093b65c` |
| Actual HTTP requests / redirects / retries | 2 / 1 / 0 |
| Policy-fetch invocations | 1 |
| Returned identity | `https://unpkg.com/lit` |
| Response import base | `https://unpkg.com/lit@3.3.3/index.js` |
| Second resolution | Same frozen object, no additional request |
| Resolution after owner abort | Rejected with `aborted` |

The exact driver first passes with three synthetic routed responses under
kernel/JavaScript network denial: **zero wire requests**, not three live GETs.
The live flow then consumes its one-shot allowance, stays below the three-GET
limit, and passes. Both actual responses finish completely; both verified TLS
sockets and request/response objects close. Processes terminate normally,
cookies remain empty, and the owner is revoked. The artifact verifier checks
4,055 pinned inputs, source/body equality, redirect evidence and closure without
making any additional request.

Unlike the earlier Debian workflow, this policy helper requests redirects in
manual mode and consumes their bodies. Its complete-hop response-end checks
therefore pass; no earlier failed collector result is rewritten.

## Scope and next work

This fixes and validates requested identity across a real resource redirect.
It does **not** execute the downloaded source, fetch its dependencies, exercise
a live relative import, instantiate SafeJS, or qualify HTML module loading or
the Lit application. Relative dependency/base behavior is covered by native
mocked tests, not inferred from this small live resource. The recorded version
is an observation at the stated time, not a current-package recommendation.

Evidence is in the new `module-request-identity-september17` and
`module-alias-live-september17` lanes under
`node_modules/.cache/native-validation/`; the JSON companion includes their
integrity manifests. Historical reports remain at their original paths.

Next priorities remain actual SDK scheduling and HTML module lifecycle,
task-level website retesting, useful content and interaction coverage,
performance, avoidable crawler blocks and CAPTCHA handoff, real credential and
passkey/device acceptance, and the unfinished hardware/benchmark/social
research. Historical 100-page outcomes remain **33 useful / 67 other**; this
resource flow is not a rerun of that corpus. The overall browser goal is active.
