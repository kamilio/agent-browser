# Website evidence — September 13, 2026, twelfth update

This supplements the eleventh update with actual caption implementation, native
CSS22 source reading and a new offline execution of the unchanged TestPages body.
The page's caption and collapsed-border diagnostics clear, but full-page geometry
still fails. Earlier source captures, failures and runtime measurements remain
at their original paths.

## Unchanged public table page

Source: `https://testpages.eviltester.com/pages/basics/html-tag-table/`.
The prior fresh public capture remains the one from 08:35 UTC: one navigation,
two GETs including the original URL's observed same-origin redirect. This new
replay makes **zero HTTP requests** and does not reload external resources.

At 09:07:11.891–09:07:12.176 UTC, one socket/process-sealed native execution uses
audited runtime 18,111/base `c6d6627`, not root dist or a different browser engine.
The exact 158,955-byte body retains SHA256
`67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.
DOM nodes remain 3,153/revision 3,154. Three queries observe one table, one caption
and ten cells; one formatting inspection and one table-geometry request follow.

Actual table `e3000` keeps grid node 3438. Caption `e3002` has node 3439 and moves
beside the grid beneath anonymous wrapper 3617. The wrapper has no DOM reference
or painting; its top-caption/grid children are genuine retained nodes.

| Observation | Historical 17,962 | New 18,111 |
| --- | ---: | ---: |
| Visited DOM nodes | 3,073 | 3,073 |
| Formatting boxes including outside markers | 3,893 | 3,894 |
| Outside markers | 276 | 276 |
| Formatting text code units | 9,272 | 9,272 |
| Counted formatting work | 230,592 | 234,223 |
| Raw deferred table shells | 1 | 1 |
| Caption-layout diagnostic | 1 | 0 |
| Collapsed-border diagnostic | 1 | 0 |

The remaining raw table shell denotes native table coordination; it is not
silently counted as an already rendered box. The former collapsed-border marker
also clears when the caption is separated from the grid; it did not prove that
native collapsed-table support was universally missing.

Whole-page geometry still returns `unsupported`: one stylesheet-integrity/CORS
requirement, one unloaded external stylesheet, and two invalid/unsupported CSS
values remain. There is **no table rectangle, raster, pointer action or form
submission**. Diagnostic exit zero only means the inspection expectations pass.
The earlier 17,962 offline execution retains its real exit one and original error.
Extra formatting work is recorded honestly; these counters are not a speed test.

Evidence:
`node_modules/.cache/native-validation/native-testpages-caption-september13/`.
`RESULT.json` links the original failure and source evidence by path/hash.
`EVIDENCE.sha256`:
`b27a85e888515945f769ff84e27231104b9561dd6b5a8cffd14b564388a0e0b1`.
Source/compiled pins match before/after; owners close, process group is absent,
guards record zero attempts, and private HOME/TMP is removed empty. No scripts,
resources, source rewriting, credentials/devices, SafeJS, TTY or alternate browser.

## Native CSS22 source reading

One separate native GET to `https://www.w3.org/TR/CSS22/tables.html` at 08:46:31 UTC
returns HTTP 200 without redirects: 74,776 decoded bytes, body SHA256
`a57bee3e57104001442a313f695fd2e0aff808d9fb56f6e5655a1a3256b9e05e`.
The response's Last-Modified is April 8, 2016; no latest-draft claim is made.

One sealed native semantic-reader load retains 2,045 nodes. Three selectors use
38,212 query-work units and retain 32 source blocks totaling 6,564 code units,
with no selected block dropped. Wrapper/grid ownership and property distribution
are source statements; the CAPMIN/automatic-width recipe is explicitly
non-normative. Repository ownership, cache and resource design remain implementation
decisions rather than quotations from the standard. No rendering is tested here.

Evidence and qualified interpretation:
`node_modules/.cache/native-validation/native-table-caption-source-september13/`.
`EVIDENCE.sha256`:
`c7d49b2cd6637f51c3b7f71a15fb6671ae3848cdba85b4aa8f0cc35748ebb55c`.
This source lane uses historical audited 18,046/base `cd906c3`; it is separate
from the new page replay and does not rerun that earlier native audit.

## CSSOM source check remains incomplete

A separate native GET to `https://drafts.csswg.org/cssom-view/` at
09:04:24.921 UTC returns HTTP 200 without redirects: 1,196,447 decoded bytes,
137,853 encoded bytes, SHA256
`8ef0a42bbe635083640f0f80c635e4efffd6ff7b81269f719aedabf50d66f091`.
It uses audited 18,046, independently of the caption replay.

The sealed native semantic-reader load retains 32,355 nodes. Its first required
id-or-named-anchor query for `dom-element-getclientrects` returns zero matches
and uses 273,134 query-work units. The assertion stops execution with exit one;
only one of three permitted queries runs. No algorithm paragraph, excerpt or
bounding-rectangle query follows. This is not a query-budget exhaustion or a
successful CSSOM rule verification, and the consumed lane is not retried.

The reader unwraps some tags and can lose IDs on unwrapped elements; this is a
possible explanation from local code, not proof of this anchor's original markup.
The absence of a reader-DOM match does not prove the source algorithm is absent.
The captured source needs a separately scoped native follow-up. Native fixtures
exercise the new rectangle behavior, but independent CSSOM source confirmation
remains open. Earlier supplementary web attempts yielded no usable retained
source text and are not credited as verification.

Evidence:
`node_modules/.cache/native-validation/native-caption-cssom-source-september13/`.
`EVIDENCE.sha256`:
`5e4debefb6c265898c69bbc3ca11795d36382efb67518c55ab42497497138185`.
The offline report retains a stale copied scope label saying CSS22; its checked
URL/hash/byte count establish the actual CSSOM input. The original artifact is
not rewritten to hide that metadata error. Runtime pins, closed native owners,
absent processes, zero guard attempts and private-directory cleanup verify.

## Implementation and validation

See `TABLE-CAPTIONS.md` for normal/relative/floated wrappers, caption minimum sizing,
separate percentage bases, real grid/caption rectangles, paint and used-margin
ownership. Inline-table, absolute/fixed tables, flex/grid items and other stated
profile limits remain open rather than fabricated as working.

Two suites add 65 cases: 48 layout and 17 geometry. The initial 61-case baseline
gives 7 pass/54 fail on unchanged production. Review finds dropped caption
align-content; four supplemental cases fail on the earlier caption implementation,
with 44 unselected layout cases reported as pending. Reusing existing block
alignment fixes those cases, including mutation and unsupported-value handling.

Final focused validation passes 573/0/0 across 16 suites/16 strict roots.
Clean broad round01 passes 18,111/0/2 unchanged historical exclusions across
352 suites/351 strict roots. The 730-entry manifest leaves 378 suites unrun;
the historical snapshot strict-only omission remains. Build/strict/format/input
integrity and 1,253 unchanged tracked inputs pass, with 1,265 source and 2,100
compiled files. No unrelated dirty work or root dist is bundled into validation.

Broad run: 09:02:33.012–09:06:42.612 UTC; audit: 09:07:11.810 UTC.
Audit:
`node_modules/.cache/native-validation/native-table-caption-september13-round01/AUDIT.json`.
Source inventory SHA256:
`88dbe40e49e8d1f137bd6582799e39109748e6fa64f2e923319e9f708804be17`.
Compiled inventory SHA256:
`decd47f8a67e75320c73f92cf37fc03573a3cdba89f657697785024c933ae927`.
Provisional broad 18,107 round00 predates the alignment correction; it is not
the final audited runtime. All earlier attempts remain recorded.

Next work includes the page's actual stylesheet/CSS requirements, avoidable
caption bookkeeping overhead, broader native website performance/compatibility,
the original four research topics and separate credential/passkey/SafeJS/TTY/
human-challenge gates. Neither this page nor the overall browser goal is complete.
