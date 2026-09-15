# GitHub source fidelity and complete-file recovery

Date: **September 15, 2026 (UTC)**. Parent browser commit:
`9bc9bc5ae3e9f17c33d94602693f2e2adb4c9d9c`. This follow-up preserves the original
100-page sweep and all earlier developer-page receipts and measurements.

## Implemented behavior

GitHub's server-rendered source used nested `div` rows, not `pre`/`code`. Ordinary
extraction flattened indentation/blank lines, escaped punctuation and emitted
the separate line-number gutter. The new strict layout recognizer emits one
preformatted block with original cell refs, inferred LF separators and explicit
`sourceCodeBlocks` metadata. It preserves ordinary content when the structure,
visibility, IDs, labels or bounded work checks do not qualify.

No DOM mutation, reader attribute expansion, dependency, script execution or
budget increase is involved. Empty reader-visible gutter alert spans are allowed
only in the observed trailing shape. Source node/depth costs remain charged even
when scaffolding is omitted. See `../SOURCE-CODE-BLOCKS.md` for the contract.

## Native and saved-body gates

- Baseline: **902 passed / 0 failed** across 13 manifest-listed files.
- Final old production with final test bytes: **964 passed / 20 failed**. Those
  expected failures demonstrate the missing source reconstruction behavior.
- Final candidate: **984 passed / 0 failed** across 14 files, including all
  **82 new regressions**. Build, selected test types, format and lint pass.
  This is not a full 918-file native-manifest or real SafeJS SDK run.
- Eight saved successful pages compared through clean baseline/candidate builds.
  Seven controls are byte-identical: GitHub repository/directory/README, PyPI,
  Tokio docs/source and Requests documentation. The successful isolated comparison
  loaded and closed **43 documents**, including timing repetitions, with no IO
  attempts under JS and kernel socket-denial guards.
- Saved `api.py`: full Markdown changes from **17,039 to 16,070 bytes**. Its
  180 rows contain **7,151 source bytes**; focused code Markdown is **7,160 bytes**.
  Scoped Markdown and JSON equal an independent oracle parsed from the captured
  nonexecuted `application/json` `rawLines` array. No source was executed or fetched
  by an alternate client to construct that oracle.

### Failures retained and addressed

Static review found structural whitespace contamination, width-sized validation
stacks and unbounded structural-text scanning. These were corrected and reviewed
again. First candidate tests also exposed non-flat JSON scaffolding and overly
restrictive scoped proof accounting; both were corrected.

The next candidate passed its synthetic tests but failed saved `api.py` because
eight gutters contain an empty alert span. Native-reader inspection identified
the exact shape; seven additional cases cover it and negative controls. A prior
test that deliberately rejected that now-supported empty span was updated to
reject visible extra text instead. Early formatting failures, a failed patch
hunk, all test iterations and the failed replay remain in the lane. Final
`red05` and `release04` use identical test bytes.

## Fresh native browsing

All targets are exact hyperlinks extracted by the native browser: the two blob
links from the earlier source directory, then Raw from the fresh `models.py`
page. The clean candidate matches the pinned source/compiled manifests; no dirty
root build is used. HTML checks began at **21:50 UTC**.

| Target | HTTP | Body bytes | Markdown bytes | Verified source result |
| --- | ---: | ---: | ---: | --- |
| `https://github.com/psf/requests/blob/main/src/requests/api.py` | 200 | 335544 | 16070 | All 180 JSON source lines match the reconstructed block. |
| `https://github.com/psf/requests/blob/main/src/requests/models.py` | 200 | 886125 | 43718 | Only the first 1,000 of 1,184 source lines appear in SSR; exact prefix verified. |
| `https://github.com/psf/requests/raw/refs/heads/main/src/requests/models.py` | 200 | 41462 | 41470 | Publisher redirect to `raw.githubusercontent.com`; all 1,184 lines plus terminal LF recovered. |

**Three navigations, four HTTPS GETs, three hash-verified captures, zero retries.**
All three live child processes/groups, four requests and four observed sockets
closed. Empty HOME/TMP, no credential headers, no script/SDK/code execution,
no challenge solver or browser impersonation. No npm/access-barrier retry.
The first two navigations permit same-origin HTTPS only; Raw has its own narrow
GitHub/raw-content HTTPS redirect scope. Default downgrade protection remains.
Existing 2MB body/256KB output limits, 192MiB heap, 45-second outer deadlines and
four-request ceiling per target remain. Children run sequentially.

Reader options match the original observation: source completeness,
`separate-omitted-raw-v1` and explicit UTF-8 fallback. Neither code reconstruction
nor the test procedure overrides explicit visibility policy.

### Important completeness distinction

The first live audit correctly failed its whole-file assertion for `models.py`.
GitHub's HTML stops at row 1,000, even though the captured JSON contains 1,184
lines. The corrected audit records an exact SSR prefix, **not a complete file**.
The subsequent Raw navigation independently returns all 41,462 bytes; they equal
the complete JSON lines joined with LF plus an observed final LF. The raw text
extraction preserves every byte inside its Markdown fence.

`sourceCodeBlocks` counts rendered rows and cannot itself detect missing rows or
certify source-file completeness. Its unknown terminal-newline field applies to
SSR reconstruction; the separate raw-recovery receipt verifies a terminal LF.
Automatic complete-file discovery/recovery remains future work. This workflow
does not manufacture missing DOM refs or silently splice script data into code.

## Timing and remaining limits

Twelve alternating baseline/candidate repetitions on the same saved `api.py`
produced median **42.15ms / 40.93ms** for load, extraction, invariant checks and
cleanup in a warm process. Raw samples are retained. This small local observation
is not a statistically established speedup, cold-navigation result or general
browser performance guarantee.

Site UI noise, other source-layout families, JavaScript-only applications and
access barriers remain. Full native-manifest, real SDK, credentials/passkeys and
TTY gates are not implied by these results. The wider browser goal stays active.

Machine summary: `github-source-lines-2026-09-15.json`. Original artifacts remain
under `node_modules/.cache/native-validation/github-source-lines-september15/`,
including source/compiled manifests, native logs, both comparisons, layout
inspection, live/Raw receipts, link chains, observer records and `AUDIT.json`.
