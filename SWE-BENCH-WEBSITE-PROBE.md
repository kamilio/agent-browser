# Native SWE-bench website probe — September 11, 2026

The native research CLI attempted `https://www.swebench.com/` with reader mode,
JSON table metadata and 250ms pacing. This is a new live operation, not a replay
of the earlier successful README investigation or a synthetic website fixture.

## Actual outcome

At 04:09:47.269–04:09:47.376 UTC, the operation stops at the existing decoded
response limit. It reports failure at the network stage, with resource-limit
kind `network.response-decoded`, limit 2,000,000 bytes and observed 2,009,628 bytes.
The research process exits 1; stderr is empty. Its report interval is 107ms,
which is not a completed-page latency or throughput measurement.

- One request, zero redirects and zero mocked requests.
- Encoded accounting: 342,899 bytes; decoded accounting: 2,009,628 bytes.
- No active requests remain and the native transport closes.
- `primaryResponse` and `finalUrl` are null. No HTTP status is admitted.
- No document or JSON extraction is produced, and contentSuccess is false.
- No challenge diagnostic is produced: classification was not reached. This is
  not evidence that a CAPTCHA was present or absent, nor that the site refused
  access. The observed failure is the browser's response-budget enforcement.

No retry, alternate URL/client, followed link, credentials, raw body capture or
page script is used. The command's existing network limits remain unchanged.
No model ranking, benchmark-method finding or source-content claim follows.

## Engine and evidence

The probe uses the compiled research-workflow round03 engine, not dirty-root
code. All 980 source/configuration inputs match committed c13667a before the
operation. All 2748 source/dist files match their recorded hashes afterward.
The synthetic evidence for that feature retains its documented three baseline
selector assertion failures; it is not represented as a full green test suite.

Evidence directory:
`node_modules/.cache/native-validation/native-swebench-json-september11/`

- Native report: `stdout.jsonl`, 672 bytes, SHA-256
  `d00977b555dc2ee18d19c32452084469625a1a97516843a28d30176ecf22aee4`.
- Engine ledger: `ENGINE-SHA256SUMS`, SHA-256
  `647f1983a5a529b2a2858c587d37894401e26af59e414415e07379b50f282798`.
- Outer status: `exit-code.txt` is 1. Engine post-check status is 0.
- The probe prompt, original streams and timestamps retain the actual scope.

## Follow-up

This page needs an explicitly larger admission profile or a bounded long-source
workflow before JSON extraction can be assessed. The existing long-v1 profile
allows 4MB but deliberately requires a single reader/body-capture/heading pass;
it is not a drop-in larger JSON extraction flag. That path is not attempted here,
and whether 4MB suffices for this page is unknown.

Next work should preserve bounded capture/replay and source-selection checks,
rather than silently raising default limits or retrying on a different client.
Early bounded response-head diagnostics would also make body-limit failures more
informative without pretending a complete response was accepted. Live structured
table compatibility and the broader research topics remain incomplete.
