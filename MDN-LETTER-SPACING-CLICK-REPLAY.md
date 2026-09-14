# Captured MDN click after letter spacing — September 14, 2026

## Actual outcome

**The ordinary click still fails native width admission.** On committed runtime
`e5f76b6f849ff64a52afcf16abafd0fb0a866de6`, the new native observation runs
10:55:31.937–10:55:32.359 UTC. It uses the original September 11 capture, not a
new live request. Initial navigation succeeds; one `main a[href]` query returns
49 links and rediscovers `e1673`, the first matching `querySelectorAll()` link.

Normal `BrowserSession.click` reaches its scroll/layout step and throws code
`unsupported` at `native-discovered-link-click`. Unsupported-property occurrences
in that exception fall **54→51** compared with the actual 10:04:18 click on
`be3aaf6`, recorded in `MDN-CURRENT-CLICK-SEPTEMBER-14.md`. All six other named
categories and counts are unchanged:

| Current width-admission issue | Occurrences |
| --- | ---: |
| Unsupported CSS at-rule | 14 |
| Unsupported/invalid CSS value | 15 |
| Unsupported CSS property | 51 |
| Unsupported/invalid CSS selector | 2 |
| Unsupported HTML presentation hint | 1 |
| Unsupported element layout | 1 |
| Unsupported SVG layout | 1 |

Counts overlap and are not unique affected nodes or a correctness score. Do not
compare them directly with the separate default-formatting diagnostic profile.
There is no click success, destination request, transport denial or Cloudflare
challenge. `observationComplete` is true; flow, destination completion and
navigation admission remain false.

## Preserved scope and validation

The same 19 responses serve 270,288 decoded bytes once each. Query work stays
50,087; the structural index covers 2,731 DOM nodes in one build. Two links match
the destination, with the same first selected reference. No asset, destination,
retry, forced click, direct-navigation fallback or post-click browser probe is
added. The uncaptured destination remains pre-transport deny-only. There are
zero wire/script requests and zero recorded JavaScript network/process attempts.

The supervisor, fixture loader, preparer, common helper and JS/kernel guards are
byte-identical to the prior lane. Workload changes only its provenance. A new
binding audit handles the actual letter-spacing release's artifact schema;
it does not rewrite historical evidence to pretend the schemas were identical.
The prior corrected verifier changes only expected commit and output filename.
All eight checks, three observation checks and independent parent verification
pass. The historical verifier's original missing-import failure is preserved.

The 23,097-pass/zero-failure/two-exclusion native gate is **rehashed, not rerun**.
The parent compares 1,365 committed runtime/test/configuration files against its
validated snapshot. Complete snapshot-input and compiled ledgers verify 2,885
inputs and 2,188 compiled files; the input count includes repository documents.
All 459 selected native files remain manifest-listed.

Supervision runs 10:55:31.814–10:55:32.372 UTC, exits 1 for the observed native
failure and emits 51,750 bytes. No timeout, cap, spawn, stream, integrity or
cleanup failure occurs. Process group 1525119 is subsequently absent; owners
close and private HOME/TMP directories are removed empty. Kernel denied-syscall
telemetry is not collected. No speed or memory improvement is claimed.

Original lane: `/dev/shm/agent-browser-mdn-letter-spacing-september14/`.
Durable copy: `node_modules/.cache/native-validation/mdn-letter-spacing-september14/`.
Historical paths/timestamps and failures remain unchanged; copying is not a run.

| Original artifact | SHA256 |
| --- | --- |
| `before-RESULT.json` | `c2595f8ad1614c3213b032abaa9a5ab80c711da325d0ad8ecd0b2f61ba4a4c4a` |
| `VERIFICATION.json` | `748b5e853a8249fdcf3b4f17adf52d05a88d78836016b0688a55955331865f69` |
| `PARENT-VERIFICATION.json` | `9afde0793dde18fdefdc3f32cb5fa7b0ab005ea4c7e04b10564050fe688f449d` |
| `EVIDENCE.sha256`, 38 entries | `96ef889dfcf85f478f29eed92521b5a58d30bfb577f0e4117e85d9b4f5b3a341` |

## Next implementation direction

Prior native-produced diagnostics identify background URL/position/size/repeat,
masks, transforms, aspect ratio, font/viewport units and embedded content among
remaining gaps. Those historical samples are truncated, not a new exhaustive
diagnostic pass. Source inspection confirms `css-background.ts` currently accepts
only neutral non-color values, while `document-images.ts` has no CSS background
discovery. Simply accepting `no-repeat`/`contain` would not implement rendering.

Prioritize an actual single-layer CSS-background pipeline: stylesheet-relative
URL provenance, existing image/network/CSP ownership, bounded image discovery,
correct position/size/repeat painting, invalidation and cleanup. Keep the current
19-resource corpus closed; any extra asset capture needs its own scope. Do not
suppress capability diagnostics or bypass whole-document click admission.

Wikipedia geometry, the original four research topics, broader live forms/sites,
credentials/providers/passkeys/devices, SafeJS, socket/TTY and challenge gates
remain open. The overall browser goal is active; nothing is pushed.
