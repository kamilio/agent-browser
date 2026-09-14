# Actionable content output limits

Status: September 14, 2026. **Implemented and verified with298 targeted native
tests; the whole23,975-case historical release profile was not rerun.**

Fresh content-first browsing exposed a useful distinction: Wikipedia's HTML
loaded and parsed, but whole-page Markdown exceeded the256,000-byte output
quota. The research report previously retained only a generic resource-limit
failure at extraction. Native section reads recovered useful content from the
same saved response with zero further website requests.

## Change

Markdown line/separator quota failures and final serialized extraction quota
failures now carry the existing structured resource-limit contract:

```json
{
  "kind": "extraction.output",
  "unit": "bytes",
  "limit": 256000,
  "observed": 291313
}
```

The example is the owned regression fixture, not Wikipedia's measured overrun.
`researchNavigation` already propagates this diagnostic through
`failure.resourceLimit`; it can now distinguish a bounded section-reading
opportunity from a parser, structure or network failure. Both Markdown and JSON
final serialization are covered. UTF-8 byte counts, including separators and
metadata where applicable, remain the actual enforced measurements.

Limits, error codes and error messages are unchanged. There is no automatic
refetch, silent truncation, larger output allowance, layout change or claim that
the complete oversized document now fits. Callers still select useful sections
explicitly and preserve the original failure. Successful-capture replay admission
is not weakened to accept a failed receipt.

## Verification

- The three exact test files are already present in `native-tests.json`:
  `src/research-workflow.test.ts`, `src/extraction.test.ts`, and
  `src/resource-limit.test.ts`. No manifest entries were changed.
- Red:5 new cases fail,293 existing cases pass. Green and parent repeat:
  **298 pass,0 fail across3 files**. The regression proves captured source remains
  available, one mocked request closes, no access barrier is reported, the output
  diagnostic is precise, and a bounded section reads without another request.
- Additional cases cover UTF-8 Markdown line and separator limits, plus final
  serialized Markdown and JSON byte limits.
- Production `tsc --noEmit -p tsconfig.json` passes; this configuration excludes
  test files. No separate strict test-root typecheck or full native release gate
  is claimed. Tests use mock transport; no new website, socket or SafeJS probe.
- Formatting/whitespace checks pass. Combined Biome checking still reports
  pre-existing import organization in `src/extraction.ts`, reproduced from HEAD.
  Parent corrects the newly added import's ordering but leaves the unrelated
  existing ordering alone. Initial/final lint outputs are retained, not erased.

The worker's initial red-run attempt preceded its test patch because a temporary
write hit the full `/tmp`; that initial293-pass baseline is labeled separately.
The real red and green runs follow the applied test patch. No website retry is
hidden in those local preparation or test events.

Evidence, source patch/hashes, red/green logs, production typecheck, lint checks
and the original Wikipedia offline recovery are retained under
`node_modules/.cache/native-validation/wikipedia-content-september14/`.
`CONTENT-FIRST-BROWSING-SEPTEMBER-14.md` and the twenty-ninth inventory update
retain the fresh site results on the earlier runtime5c7a882. Those results are
not relabeled as tests of this new source change. Further content browsing,
readable table/boilerplate output and actual SafeJS acceptance remain open.
