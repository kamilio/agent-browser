# Bounded selector reuse — September 18, 2026

## Outcome

Reuse exact non-nested selector results within one native CSS cascade, with
bounded retained maps and selector text. Preserve declaration order, specificity,
pseudo-element handling, diagnostics, nesting bypass and recalculation ownership.
Diagnostic-only rules finish attribution without repeatedly traversing cached
matches. The CSS work limit remains unchanged; no runtime dependency is added.

This finishes previously uncommitted work from
`pseudo-cascade-reuse-september17`, on the current canonical baseline
`7496b3c9e6c5069113f0822beac8b3efc81ef3d9`. The unrelated pre-existing import/order
changes in `src/styles.ts` are excluded from the canonical candidate and commit.

## Native evidence

Phase: `node_modules/.cache/native-validation/selector-reuse-final-september18/`.
Candidate: `/tmp/agent-browser-selector-final-GiNG06/candidate`.

- Focused native qualification: **883 passed / 0 failed in 18 files**.
- Build, selected test types, formatting and lint exit zero. Native test
  HOME/TMP are empty; compiler/formatter caches remain separately recorded.
- Candidate manifests verify **1,665 source and 2,464 compiled files**.
- The explicit manifest has 1,043 entries, of which 22 committed paths are
  unavailable. The broader available-file run is recorded separately below.
- Broader available-file run: **51,400 passed / 13 failed in 1,021 files**, 670.456 seconds. Four CLI expectation failures reproduce on the unchanged baseline; nine other cases pass on both versions with the previous full-suite 15-second timeout instead of this run's three seconds. Each diagnostic rerun has1,003 passes/four failures in8 files; all1,007 outcomes match. Original failures remain recorded; no full-suite pass is claimed. All test children/groups close with empty HOME/TMP.

`REVIEW.md` reports no new scoped blocker. The earlier diagnostic-only traversal
finding and negative control remain at their original paths in
`pseudo-cascade-reuse-september17`: `native-red03/EXECUTION.json` records 15
passing and two expected failing tests against the earlier integration.
The final focused run passes both iteration regressions. A generator's explicit
`return undefined` fixes the earlier test-only type error; old failed typecheck
receipts remain historical evidence, not rewritten success.

## Captured-page content

`native-style-content-core01/EXECUTION.json` passes the guarded **offline** replay
of previously captured Grokipedia HTML and three CSS resources. No request was
made to Grokipedia or the stylesheet CDN, and no page script or SDK was executed.
Every input pin remains unchanged; document owners and child/group close, with
empty HOME/TMP and zero forbidden-operation reports.

- All **63 article sections** remain visible, in order, with matching normalized
  source/extracted text hashes and matching extracted fragment hashes.
- Captured styles produce **63 block containers with paragraph boundaries**,
  using **4,485,889 work units**, below the unchanged 5,000,000 limit.
- Styled Markdown: **66,067 bytes**, SHA256
  `cfcb515b43564bdffcfe95629aa8a439c9486d827626610907eb53d1cfcc3436`.
- Unloaded-style control: **66,052 bytes**, SHA256
  `a0266336ffd47163bc6927b198c9bbec5536e21ff3c0630a2599c6591d6a5078`.
- The entire non-whitespace text difference is exactly 14 code units of
  source-hidden TTS controls. There is no additional article-text loss.

The replay checks actual output files against historical pins and stronger
whole-output assertions. It does not rename an old live measurement as a new
website visit. No percentage speedup, new timing comparison, general rendering
compatibility, dynamic website support or CAPTCHA bypass is claimed.

## Remaining gates

Broader website coverage, research-source verification, credentials/passkeys and
native Zoom media remain unfinished. The new SafeJS0.1.640 scoped authorization
was approved during this work and is recorded separately in
`safejs-runtime-0640-september18/APPROVAL.json`; dependency staging and the single
ordered real-SDK attempt are separate from this CSS validation. No push.
