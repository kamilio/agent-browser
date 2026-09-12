# IANA native image-CSP post-change check — September 12, 2026

## Captured outcome: SVG unsupported, before commit

The **new, sole** bounded native run used committed **`04bc6968a7428dc8bfe1d2c361eb8e80ed53fd8c` / native15869**, exclusively from `native-image-csp-september12-round00/snapshot01/dist`. The native flow started at **21:07:20.781 UTC**, recorded its first failure at **21:07:21.567 UTC**, and finished at **21:07:21.620 UTC**. Supervisor interval: 21:07:20.669294–21:07:21.632817 UTC, 0.962592 seconds, exit **1**. No live retry or post-failure page analysis occurred.

One `BrowserSession.navigate` targeted `https://www.iana.org/help/example-domains`. The original native loader fetched its stylesheet and SVG logo, all **HTTP 200**. At the original loader-return observation boundary, native image `e35` had `state: broken`, `complete: true`, `error: unsupported`, natural dimensions zero and `originClean: false`. Owner-level `failure` was absent. The first recorded code was **`unsupported`**, preserved before the secondary `aborted: Navigation aborted` propagation.

The `png-resource-owner` recorded one image resource/request and **32,870 received bytes**, but zero decoded image bytes and zero decode work. This is a native unsupported-SVG image handling/decoding boundary, **not measured resource exhaustion, a Cloudflare challenge, or website/server denial**. The SVG is contacted in this new run; its earlier uncontacted status belongs only to the old run. The generic harness message does not expose a more specific decoder exception.

Actual counters: **3 GETs, 1 explicit initial navigate, 0 committed documents, 0 clicks, 0 explicit formatting inspections, 0 used-layout attempts**. Native committed title/body/link inspection and the reserved-domains destination remain untested. No general “IANA works” or full CSP/stylesheet correctness claim follows from image admission. Main's existing external-stylesheet CSP investigation is separate and untouched.

## Comparison with the preserved old run

| Evidence | Old native15522 | New native15869 |
| --- | --- | --- |
| Commit | `43060222e28db7abb3259b0ad50d230f359705c6` | `04bc6968a7428dc8bfe1d2c361eb8e80ed53fd8c` |
| First failure UTC, September 12 | 20:10:59.589 | 21:07:21.567 |
| Native image `e35` | `policy-denied`, before image wire | `unsupported`, after SVG HTTP 200 |
| GETs / image requests | 2 / 0 | 3 / 1 |
| Commits / clicks / formatting / used layout | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

Old evidence remains at `native-iana-public-flow-september12/` and `IANA-NATIVE-PUBLIC-FLOW.md`, unchanged. Its `RESULT.json` SHA-256 remains `8a401f75bd458305b09aee0630fe727af2c6fdfb8daa7c0f324e85b93cdfc29c`. HTML and stylesheet decoded-body hashes match across the two independently captured runs; this is not a replay of the old responses. Both captures retain their own response headers and timestamps. `www.iana.org` was already in the committed 86-host inventory: **no new host or aggregate-count expansion**.

## Exact capture and budgets

Fresh lane: `node_modules/.cache/native-validation/native-iana-image-csp-september12/`.

| Response, all on `www.iana.org` | Encoded bytes | Native-decoded response bytes | Decoded-body SHA-256 |
| --- | ---: | ---: | --- |
| `/help/example-domains` | 1,751 | 6,639 | `6fde51fc02d67b032e17adfe1ae5c67daf2c01bed20f533b7754ee32e14c4bc9` |
| `/static/css/iana_website.0feeb53883fa.css` | 14,085 | 88,658 | `cb9b57cb380a9ee01d4c1974a56fcb0d77c10be6303081a179a4ee7cd9ee4eba` |
| `/static/img/iana-logo-header.426b3ac01d35.svg` | 8,912 | 32,870 | `888b41c392a51d5aa6ca6df224e345f74ffbb97a48422753a3e4f90f305d0004` |

For each ordinal 1–3, `wire-N.body` and `wire-N.headers.json` retain exact encoded bytes and ordered raw headers; `response-N.body` and `response-N.headers.json` retain original native-decoded bytes and metadata. These are separate captured files, not reconstructed bodies. All three wire captures are complete. SVG content type was `image/svg+xml`; native-decoded response bytes must not be confused with successfully decoded image pixels.

Combined charge: **152,915 bytes** = 24,748 encoded + 128,167 decoded, below 8 MiB. Actual wire spacing: 285.229462 ms then 273.924041 ms; concurrency remained one. Original native TLS authorization/public-address checks were retained, AgentBrowser/0.1 unchanged. No redirects, Retry-After/challenge headers, off-origin requests, accepted cookies, credential request headers, mocks, route fulfillment, scripts or SafeJS were observed. No response, identity, CSS/DOM, policy or budget was changed. The original 32 GET / 250 ms / 2 MiB response / 4 MiB worst-case reservation / 45+5 second / 6 MiB file-output / 16 MiB lane / 64 MiB free guards remained in force.

`RESULT.json` and `progress.jsonl` retain original loader provenance, native image state, raw/applicable stylesheet diagnostics and exact failure ordering. Those CSS diagnostics were not erased or promoted to a layout pass. `INVOCATION.json` pins executed helper bytes; `RUN-ONCE.lock` consumes the live attempt. Live evidence was made owner-read-only immediately after capture.

## Integrity, cleanup, and handoff

Before and after the live run, kernel-network-denied checks recomputed **1,192 source / 2,004 compiled files and 20 gate receipts**, including exact native15869/0/2 gate, audit and commit proof. Separate read-only Git captures retrieved **13 actual commit/tree/blob objects covering 10 committed snapshot input blobs** per phase. One additional read-only baseline tree enumeration per phase supported independent Git blob-SHA1 comparison of **1,182 unchanged inputs** against `b409832f8a7ec0b66e55c4ee8fef355b4393002f`. No original audit script, build, tests, or browser run was reexecuted.

- Source ledger: `de97bc2f4bb4abd07042a18f56971052c81a423d062500f519f6c0e4588e7998`.
- Compiled ledger: `93654a56016cb0ad6f514802609ea1d0c6c57ef15d808045a10785628f5b89d5`.
- Gate receipts: `7f4a02cd9ca5430a786ab672813f036dcfb29b4f10456e3e746c3c9aae3a6b49`.
- Commit proof: `a7912e00f665aaff978360f217a16621cfcfe74d34dc313c0cc7b28235fe4051`.

After session close and a measured **51.806153 ms** settlement, actual document/image/event/file-input/mouse owners were closed and empty: document nodes/text zero, image elements/resources/active/queued/waiters zero, event listeners/dispatches zero, file controls/bytes zero, mouse buttons/pressed/busy zero. The image owner's cumulative one request and 32,870 received bytes remain correctly nonzero historical counters. Session tabs/pending loads/commits, transport and queue active/pending, storage entries/events pending, accepted/retained cookies, and cleanup errors were zero. The supervisor recorded no signals, timeout or output truncation; the process group was absent and private HOME/TMPDIR empty. These are actual nonempty owner samples.

`SETUP-BOUNDARY.md` preserves a pre-live malformed patch rejection. Already-executed Git/preflight helper bytes and receipts were not overwritten; separate baseline helpers completed the additional checks before the only live attempt. This setup editing failure caused no HTTP or browser execution.

The outcome-derived read-only verifier checks hashes, before/after Git/gate/baseline evidence, three original request provenances, native unsupported-state ordering, zero downstream actions, original-helper pins, supervisor boundaries and settled owners. `SEAL.json` records verification and the `RECEIPTS.sha256` ledger; files use owner-read-only permissions and hashes, **not a filesystem immutable flag**. The live outcome remains failed even when evidence verification passes.

Changed paths are **only** this new report and the fresh lane (harness, authorization/setup notes, captures, receipts, verifier and seal). No prior evidence, production, tests, manifest, TASKS, index or Git mutations; no commit/push. Main owns independent integration.

Read-only verification, with no network or browser reexecution:

```sh
/usr/bin/python3 -I -B node_modules/.cache/native-validation/native-iana-image-csp-september12/run.py verify
```
