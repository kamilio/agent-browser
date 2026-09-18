# Binary fetch response reads — September 18, 2026

## Implemented

`PageFetch` responses now expose asynchronous `arrayBuffer()`. It shares the
existing one-shot body consumer with `text()` and `json()`, preserving exact
binary bytes instead of decoding them as UTF-8. The response already owns a
copy of the transport payload; consumption returns that exact-length backing
buffer without a second host-side body copy. Guest conversion may still copy.

Consumption preserves bodyUsed, cancellation reasons, CORS/redirect filtering,
clones, retention/lifetime limits and closure. Null bodies return fresh empty
buffers repeatedly; empty non-null bodies still consume once. Consumed buffers
remain caller-owned when the fetch owner closes. No dependency, binary request
body, Blob, stream, global Response constructor or automatic network access added.

## Concrete website dependency

Git's Pagefind module was captured on **September 17, 2026, 09:55:18.205 UTC**.
The preserved 45,555-byte body has SHA-256
`252d272bd34d483d19a752060f6a065114d15ab12c42d8f905ca565e2768a009`.
Its metadata loader calls `compressed_resp.arrayBuffer()` before decompression;
index and fragment loaders also need binary reads. This is source inspection,
not a newly observed script execution failure. The method is independently
confirmed absent from the committed baseline `288ee9e`.

Original source and receipt remain at
`node_modules/.cache/native-validation/git-search-module-september17/live/body.html`
and the adjacent `RESULT.json`. The original unsupported-MIME reader failure
remains historical evidence; it is not relabeled as successful page extraction.

## Native validation

- New tests against baseline production: **387 pass / 34 fail in 15 files**.
  All 34 failures belong to the new binary-body test file; no existing test fails.
- Candidate: **421 pass / 0 fail in 15 files**, including **40 binary-body tests**,
  in **5.277 seconds**. Build, type checking, format and lint pass.
- Coverage includes invalid UTF-8/NUL/BOM bytes, Buffer/subarray ownership, clone
  isolation, competing readers, null/empty bodies, filtered responses, resource
  limits, arbitrary abort reasons, revocation and failure paths.
- Native and replay processes/groups are absent afterward; their HOME/TMP are
  empty. Quality tools create only their reported `.cache` and
  `node-compile-cache` entries. This is not a full-suite pass.
- An initial preparation selection named an existing file outside the committed
  native manifest. Preparation stopped before tests/candidate creation; that
  unrelated selection was removed, not silently authorized or committed.

## Offline captured-data replay

The qualified compiled `PageFetch` reads three original publisher bodies through
an explicit in-memory adapter. No website code is evaluated. Receipt/body hashes
are checked before and after; clone and transport buffers are mutated to prove
that consumed bytes remain independent.

| Historical resource | Captured UTC on September 17 | Bytes |
| --- | --- | ---: |
| English metadata | 10:04:13.184 | 4,419 |
| `en_cc40c7f` index | 10:22:29.120 | 29,553 |
| `en_2ac05e1` fragment | 10:38:46.332 | 817 |

All **34,789 bytes** retain their original hashes through `arrayBuffer()`.
Bounded decompression and the existing native source parser then reproduce
**85 matches for the literal stored term `rebas` within the supplied chunk**.
The first is document 7, fragment `en_2ac05e1`; the saved fragment identifies
**Reference**, `/docs.html`, 145 words. This is not global search coverage,
executed Pagefind ranking or a working browser search UI.

There are three in-memory adapter calls, six response objects including clones,
**zero real network attempts**, zero retained fetch bytes and zero outstanding
response-accounting leases at closure. Returned buffers remain readable afterward.
The replay's measured body/parser work is 24.952 ms; this is an offline operation
measurement, not a website speedup or cross-version benchmark.

## Evidence and open gates

Evidence phase:
`node_modules/.cache/native-validation/binary-fetch-september18`.
Qualified runtime: `/tmp/agent-browser-binary-fetch-oybLr7/candidate`.
**1,684 source pins / 2,504 compiled pins** are verified. The JSON companion keeps
the original paths, hashes, native failures, quality and replay results.

The network guard is a cooperative native fixture control, not a hostile-code
security boundary. No actual SafeJS, website JavaScript/WASM, socket, credential,
passkey, device, Zoom join or recording is exercised. Prior WebSocket SDK results
do not validate this newly added asynchronous fetch-return path. Its actual-SDK
and live-website acceptance remain open, along with Pagefind UI/WASM, Zoom/media,
research, diverse-site outcomes and crawler/access-challenge handling. No default
runtime change or push; the full browser goal remains active.
