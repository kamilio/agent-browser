# SWE-bench reader recovery — September 11, 2026

This is a fresh native-browser request followed by one admitted local JSON
replay. Earlier network/reader/source failures retain their original outcomes
and artifact paths. This result does not reopen or promote an old failed receipt.

## Fresh website result

At 05:30:51.609–05:30:51.799 UTC, the native research CLI retrieves
https://www.swebench.com/ with the existing long-v1 profile and explicit
separate-omitted-raw-v1 policy. It returns HTTP200, extracted-unverified,
partial true and null contentSuccess, with 11 nontruncated DOM-reader heading
entries. No barrier is classified. Process and launcher both exit zero, stderr
is empty, and the outer deadline does not expire.

The invocation uses reader/capture/headings, 250ms pacing and the explicit raw
policy. Long-v1's 4,000,000-byte response/source admission and 2,000,000-unit
text ceiling remain unchanged. No retry, followed content link, credentials,
proxy, alternate client, script execution or challenge bypass is used.

- One actual request, zero redirects/mocks, zero active requests at exit and a
  closed native transport.
- 342,899 encoded and 2,392,125 decoded body bytes.
- Reader textCodeUnits: 7,893; sanitized output: 12,548 code units.
- 1,219 reader tokens, zero tokenizer issues; 682 nodes scanned for headings.
- 23 omitted script elements, 59 discard steps, 2,367,316 discarded raw code
  units and 14,785,674 raw-work units against the fixed 32,000,000-unit quota.
- Maximum raw scanning window: 65,536 code units. These are accounting bounds,
  not measured heap usage, CPU throughput or rendered-text quantities.

The decoded body SHA256 is
`c862011a4ee1d1a7199fad6ca0905fa5c64f58216f7217ac1eddf37f28788433`, matching the
previously captured body that failed the legacy text accounting. This new report
is distinct: 3,197,159 bytes, SHA256
`e49f111390795becd94597af47c653b7bff4f091db026b60c6bd959c6f408491`.
The 190ms native report interval is one observation, not a speedup claim.

Evidence: `node_modules/.cache/native-validation/native-swebench-reader-raw-live-september11/`.
The preflight checks the passing 22-file validation and matches all 988 source
inputs. All 1,776 compiled files and all source inputs remain unchanged after
the operation; INTEGRITY.json retains their exact before/after hashes.

## Admitted JSON replay

At 05:32:28.319–05:32:28.508 UTC, one local extractResearchReplayJson call uses
the new receipt SHA, expected long-v1 profile and independently checked expected
body size/hash. The section selector comes from the new DOM outline's unique
level4 SWE-bench heading, not from guessed CSS or earlier lexical source ranges.

Admission succeeds, the raw policy propagates to the loader, and the selected
section matches exactly once. Output is extracted-unverified, partial true and
null contentSuccess with no classified barrier. The semantic JSON includes the
benchmark description, instance count and link label. No link is opened, score
reproduced or dataset count independently audited.

The replay outputs 3,466 bytes, SHA256
`6efefc2d25e884efe5ace16c62ed0d87dfc4b8c64478b2aa1a8d172878266d78`.
It reports zero network requests; all guarded DNS/network/server/child/worker/
native-addon attempt counts are zero. Source/compiled/fresh-receipt hashes stay
unchanged, owned receipt bytes are zeroed and the process exits zero. The helper
owns admitted-body cleanup; the regression tests cover its success/failure
wiping. This local harness does not independently inspect that internal buffer.

Evidence: `node_modules/.cache/native-validation/native-swebench-reader-raw-replay-september11/`.
The original extraction JSONL, metadata, guards, policy, timestamps and status
are retained. API guards are not a claim of OS-level network containment.

## Scope and remaining work

The native semantic reader still omits scripts/styles and ignores hidden-content
semantics. The result proves bounded loading, heading discovery and selected
JSON extraction of this captured page, not functioning interactive leaderboards,
visual equivalence, model rankings or whole-browser compatibility. The default
2MB network profile is unchanged; this large page still needs explicit long-v1.

READER-OMITTED-RAW.md records implementation details and 2,823 passing selected
tests, including 222 new cases. The general browser goal, varied-site coverage,
CAPTCHA friction, fingerprinting, research and real secrets/passkey/runtime gates
remain active in TASKS.md. No CAPTCHA or broad performance outcome is claimed.
