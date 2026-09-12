# CSS Text source capture — extraction stopped

## Outcome

On September 12, 2026, one newly issued native source-only GET returned HTTP 200
from `https://www.w3.org/TR/css-text-3/`. The private harness then failed before
any HTML parse because it called `.toLowerCase()` on an absent `cf-mitigated`
header. This is a harness failure, not evidence of a native parser defect or a
remote challenge. No retry, alternate client, second capture or recovery parse
was performed. The exact failed harness and its original receipts are retained.

**No extracted CSS facts are available from this run.** Percentage basis,
anonymous blocks and first-formatted-line treatment, `each-line`/`hanging`
grammar, and all requested `text-transform` rules remain unanswered by this
evidence. No cached source, prior knowledge or raw-HTML extraction substitutes
for the missing native parse.

## Observed response

- Request start: `2026-09-12T15:44:46.949Z`; receipt: `2026-09-12T15:44:47.016Z`.
- HTTP 200, `text/html; charset=utf-8`, Brotli encoding, no redirects.
- Encoded body: 95,159 bytes; transport-decoded body: 540,326 bytes.
- Decoded body SHA-256: `17c26f1b41455947f106dac81736944b12da328ee4892c7c5b601f5b65ced55a`.
- Encoded body SHA-256: `618e6087bf6edbfa05fc1c632259a0c28e6ac7588e124e3b096b6cac28b77f46`.
- Response Date: `Sat, 12 Sep 2026 15:44:47 GMT`.
- Last-Modified: `Fri, 14 Aug 2026 15:43:35 GMT`.
- Server cache metadata: `cf-cache-status: HIT`, `age: 451317`.

This is a newly fetched response, not a new claim of document revision or
“latest” content. The response came through the server's cache. Its HTML title,
document date and substantive content were not parsed or verified. No
`Retry-After` or `cf-mitigated` response header was present; body-based challenge
detection was not reached. Full headers, including an unused server-issued
cookie, are private evidence and are not reproduced here.

## Runtime and boundaries

The runtime was Node `v22.22.0`, binary SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`,
with only native modules from the immutable release13769 snapshot's `dist/src`:
`native-block-content-alignment-september12-round01/snapshot01/dist/src`.
Release commit: `4c2d78c8b7c6c10acef91a04ed6b17613ce0f345`.

Read-only actual Git retrieval outside kernel isolation captured 17 objects
before and after: the commit, root tree, src tree and 14 input blobs. Their Git
object IDs, tree links and input bytes matched the immutable snapshot both times.
All 20 release receipts and the 1,160-source/1,972-compiled inventories matched
their pinned hashes before and after. The existing 13,769-pass gate is historical
runtime provenance; it was not rerun and is not website/feature acceptance.

The sole request used native `NodeNetworkTransport.request`, its default public
address/DNS/TLS checks, `AgentBrowser/0.1`, a fresh empty cookie jar and credentials
`omit`. The observed TLS session was authorized TLSv1.3. No cookie was accepted,
stored or sent. No assets, scripts, SafeJS, external engines, credentials,
providers, alternate HTTP clients, proxy or origin expansion were used.

Declared caps remained unchanged: at most two bodyless GETs, one same-origin
redirect, concurrency one, native 250 ms minimum start spacing, 2 MiB encoded
and decoded per response, 4 MiB totals each, 45 seconds plus 5 seconds kill grace,
6 MiB each/combined stdout/stderr, 16 MiB lane and 64 MiB free before execution.
With one request, spacing is configured but no inter-request interval is measured.

The live child exited 1 after 0.287358 seconds. Its stdout/stderr contained
494/0 bytes; there were no timeout, output/storage cap events or termination
signals. Its process group was absent after exit. HOME/TMPDIR stayed empty;
stdin was DEVNULL and no TTY/PTY was used. Transport closed with zero active
requests; the empty cookie jar was closed.

## Parse and exact error

Actual HTML parse attempts: **0**. Heading queries, sibling inspections and
extracted contexts: **0**. No native document/query instance was created, so
document revisions and query cleanup metrics are not applicable. The one-parse
budget was not consumed or silently expanded. The planned 256-heading,
512-siblings/context, 40,000-combined-context-unit and 65,536-total-extracted-unit
bounds were never reached.

The exact exception was:

```text
TypeError: Cannot read properties of undefined (reading 'toLowerCase')
capture.mjs:69:53
```

The failure is preserved in `RESULT.json`, `capture.stdout`, `EXECUTION.json` and
the invocation's harness hashes. The capture entrypoint is not repaired or rerun.
Any subsequent extraction needs explicit authorization rather than an implicit
retry under this stopped run.

## Evidence and read-only verification

Private lane:
`node_modules/.cache/native-validation/native-text-indent-transform-source-september12`.
It contains the original task/release instructions, before/after actual Git bytes,
release checks, request and wire metadata, encoded and decoded source bodies,
invocation, original harness, failure result and execution receipts.
`RECEIPTS.sha256` and `SEAL.json` bind this report and the lane's evidence.

Run the verifier without network or page reparse:

```sh
export TMPDIR=/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/html-cell-padding-work-september12/spec/tmp
python3 -I -B node_modules/.cache/native-validation/native-text-indent-transform-source-september12/run.py verify
```

The verifier runs under kernel socket/socketpair denial, reads sealed bytes,
checks the report/evidence hashes, original invocation pins, release inventories,
20 gate receipts, actual captured Git object bindings, budgets, failure and
cleanup. It does not execute Git, access the network, decode/reparse the page or
write verification output to the lane. A verifier pass means the stopped-run
evidence is internally consistent, **not** that source extraction succeeded.

No production source, manifest, TASKS, historical report/capture or unrelated
working changes were edited. No commits or pushes were made. Overall browser,
layout, performance, credential/passkey/challenge and feature acceptance gates
remain outside this source-only work.
