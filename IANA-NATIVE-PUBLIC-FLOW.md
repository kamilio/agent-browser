# Native IANA public-document flow — September 12, 2026

## Outcome: blocked before document commit

The sole live attempt at 20:10:58–20:10:59 UTC used approved **native15522**, commit `43060222e28db7abb3259b0ad50d230f359705c6`, from `native-html-cell-spacing-september12-round00/snapshot01/dist`. It did not use Main's subsequent float repair or native15601 runtime. This is a captured failure, not a successful website-flow acceptance gate.

One `BrowserSession.navigate` requested `https://www.iana.org/help/example-domains`. The original native loader discovered and fetched one stylesheet. Both responses were HTTP 200; the native image owner then exposed this first observed failure before the loader returned for commit:

- Stage: `native-image-state`; code: **`policy-denied`**.
- Native image reference `e35`: `state: broken`, `complete: true`, `error: policy-denied`, natural width/height zero, `originClean: false`.
- Image URL: `https://www.iana.org/static/img/iana-logo-header.426b3ac01d35.svg`.
- Image owner: one element, zero resources, zero requests, zero received/decoded bytes; owner-level `failure` absent.
- Native navigation subsequently propagated `aborted: Navigation aborted`. That secondary error does not replace the first image policy state.

The image URL was **not fetched**. This is neither measured resource-cap exhaustion nor an observed unsupported-image decoding result; it is also not evidence that IANA denied an image HTTP request. The captured document and stylesheet headers contain CSP. The harness did not change CSP, resource availability, CSS, DOM, identity, credentials, or limits. Observation occurred at the original loader-return boundary, not via instrumentation of the exact instant the image state first changed.

Actual counters: **2 GETs, 1 initial navigate, 0 commits, 0 clicks, 0 explicit formatting inspections, 0 used-layout attempts**. Native title/body/link discovery and the reserved-domains destination remain untested. No post-failure page analysis, alternate URL, retry, substitute navigation, scripts, SafeJS, or other browser/client ran.

## Exact private capture

Lane: `node_modules/.cache/native-validation/native-iana-public-flow-september12/`.

| Response | Encoded bytes | Decoded bytes | Native decoded SHA-256 |
| --- | ---: | ---: | --- |
| Initial `/help/example-domains` | 1,751 | 6,639 | `6fde51fc02d67b032e17adfe1ae5c67daf2c01bed20f533b7754ee32e14c4bc9` |
| Original-loader `/static/css/iana_website.0feeb53883fa.css` | 14,085 | 88,658 | `cb9b57cb380a9ee01d4c1974a56fcb0d77c10be6303081a179a4ee7cd9ee4eba` |

`wire-1/2.body` and `wire-1/2.headers.json` preserve exact encoded bodies and ordered raw HTTP headers; `response-1/2.body` and corresponding header JSON preserve native-decoded bodies and response metadata. The numbered names denote two separate files, not a directory. Both encoded captures are complete. Total encoded+decoded charge: **111,133 bytes** (15,836 + 95,297), below 8 MiB. Actual wire starts were 291.354303 ms apart. Native TLS authorization succeeded for both requests; native public-address/TLS checks were unchanged. No redirect, challenge/restriction header, Retry-After, cookie acceptance, credential header, mock, route fulfillment, or off-origin wire request was observed.

`RESULT.json` and `progress.jsonl` retain the native resource snapshot, raw/applicable stylesheet diagnostics, precise first failure, propagated error, and actual cleanup owners. CSS diagnostics are preserved, not asserted away or treated as layout acceptance. `INVOCATION.json` pins the executed harness; `RUN-ONCE.lock` consumes the attempt. Supervisor elapsed time was 0.705100 seconds, exit 1, no timeout/signals/output truncation; child process group absent afterward. Live artifacts were made owner-read-only immediately after capture.

## Cleanup, verification, and seal

After session close and a measured 51.148256 ms settlement, the actual document owner had zero nodes/text, closed mutation and inline-declaration owners; the actual image owner was closed with zero elements/resources/active/queued/waiters. The actual event, file-input, and mouse owners were closed and empty. Session tabs/pending loads, request queue active/pending, transport active, storage entries/events pending, and cookie accepted/retained counts were zero; cleanup errors were zero. HOME/TMPDIR remained empty. These are instrumented nonempty owner samples, not empty-array cleanup claims.

Before/after checks independently read **14 actual Git objects covering 11 inputs**, verified their commit/tree/blob relationships against the pinned snapshot, and recomputed **1,184 source / 1,996 compiled files plus 20 gate receipts**. Actual read-only Git ran outside the syscall seal; integrity and final verification ran under kernel network-syscall denial. No tests/build/live attempt were reexecuted. This verifies the pinned historical native15522/0/2 gate evidence, not Main's newer runtime or a fresh regression run.

The outcome-specific `verify.mjs` checks captured hashes, request provenance/caps, native failure ordering, zero downstream actions, executed-helper pins, supervisor evidence, and settled owner cleanup without browser imports or network access. `SEAL.json` records that verification and the `RECEIPTS.sha256` ledger. Seal means owner-read-only permissions plus SHA-256 evidence, not a filesystem immutable flag. Prior float-source evidence and all production files remain unchanged; Main independently verifies and commits this report.

Read-only verification command:

```sh
/usr/bin/python3 -I -B node_modules/.cache/native-validation/native-iana-public-flow-september12/run.py verify
```
