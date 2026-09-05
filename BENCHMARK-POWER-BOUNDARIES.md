# Benchmark power figures need a measurement boundary

This note records one native-browser-only primary-source follow-up on September
5, 2026. It adds measurement-method context, not an efficiency ranking, a hardware
purchase recommendation or a locally reproduced benchmark.

## What the retrieved guide establishes

The MLCommons inference power guide describes a certified analyzer on the system
under test's power supply, with a separate director running the measurement
server. It distinguishes preliminary range discovery from testing: automatic
ranges can be used during discovery, but testing must use the determined ranges
rather than automatic mode. These are setup constraints, not measured results.

**Inference:** a GPU-only power number should not silently be treated as the
guide's described system-supply measurement. The retrieved page alone does not
settle every included component, director overhead or official timed-window
boundary. Comparing efficiency still needs an explicit measurement boundary and
compatible workload/quality/latency conditions. No joules-per-token, power draw,
token throughput, matched hardware comparison or current price was measured here.

## Source and evidence

Source: `https://docs.mlcommons.org/inference/power/`, selected from the ordinary
Power navigation link in the previously saved MLCommons native extraction.
The new source response arrived **September 5, 2026, 13:18:07.541 UTC**; this is
retrieval time, not an established publication/update date or latest-version claim.

Evidence directory:
`node_modules/.cache/native-validation/text-line-extraction/research/benchmarks/`.
`REQUEST.md` and `APPROVAL.md` retain exact command/provenance and fresh approval;
`01-power.stdout.jsonl` is the unmodified native receipt. Its SHA-256 is
`81319016c7b9a6cbd4a93a6ad51f0ed40165f8445f4137490fb2b0f589bbd640`.
The captured transport-decoded body is 28,688 bytes, SHA-256
`ca964d90922786ce0bcf4620dfadb97a40af2d2d97fe893075c5f07e54d099f6`.
The 6,753 encoded response bytes are a different measurement.

The primary-source statements are in `01-power.extraction.md` at lines 69, 77,
81 and 85. `REPORT.md` records the narrower conclusions and reader omissions;
`verification.json` and the parent audit check saved capture/extraction consistency.
The directory belongs to a completed frozen increment and is not rewritten here.

One fresh authorized request used the native semantic reader with body capture:
HTTP 200, zero redirects, exit 0, empty stderr and closed transport. It remains
`partial:true`, `contentSuccess:null`, `extracted-unverified`. No source command,
electrical procedure, analyzer, benchmark, model download or alternate browser ran.
This documentation commit performs no additional request or acceptance probe;
all historical research and stopped access gates retain their original outcomes.
