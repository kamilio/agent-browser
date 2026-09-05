# Native splitText range transfer

Continuation after `eccf642`, September 5, 2026. Direct native Text splitting now
shares the existing live range owner rather than relying on a post-call wrapper
repair. Final integrated checks pass 741 tests across 24 named files in each
tree, with exact canonical/new-build capture equality.

## Behavior and scope

Attached text endpoints strictly after the split move into the new sibling with
the split offset subtracted. Endpoints exactly at the split stay in the original.
Parent boundaries immediately after the original advance once, just like later
parent boundaries affected by insertion. Detached suffix endpoints clamp to the
original prefix length; they do not move into a different root. Existing UTF-16,
zero/end/empty splits, retained text quotas and preflight node limits remain.

The DOM Living Standard split algorithm was reviewed on September 5, 2026; its
displayed revision date was August 25, 2026. This is a bounded native implementation
of that behavior, not external browser or web-platform-test execution.

```text
https://dom.spec.whatwg.org/#concept-text-split
```

Ordinary owner-mediated and script split already worked before this patch.
They remain controls, not newly introduced methods. The wrapper's old saved
boundaries could overwrite a native listener's later changes or revive removed
suffix endpoints. Removing that repair also fixes these tested embedding-hook
cases. This does not make guest MutationObservers synchronous, nor promise a
general ordering guarantee for arbitrary native listeners registered before the
range owner. Normalize endpoint merging remains an independent outstanding gate.

## Ownership and mutation details

The native split childList record carries immutable private weak metadata naming
the original, new sibling and split offset. DomRangeOwner consumes it with the
insertion, transfers text boundaries and handles the equal parent boundary once.
It tracks the new sibling for subsequent mutation/removal. If the range was
registered on detached text before a parent was attached, the split establishes
the missing ancestor tracking while transferring the existing endpoints.

The paired attached characterData notification identifies the same already
handled operation. It does not apply the old deletion again to ranges edited by
intervening native listeners. Detached characterData instead uses precise suffix
deletion metadata. Original public record keys, symbols, frozen arrays, oldValue
and childList-before-characterData ordering are unchanged; metadata is neither
serialized nor installed in guest records. Weak keys are an ownership design,
not a measured GC/RSS result.

The canonical wrapper retains validation and its existing reentrant-operation
guard but delegates actual updates. There is no saved-range restoration after
the native call. Direct listener edits to the original or suffix, nested native
split and suffix removal therefore retain their newer state.

## Baseline and focused evidence

The ten parent listener/late-attachment cases collect on exact `eccf642`: one
control passes and nine assertions fail. First production v1 passes 70 of 71
tests across five named files, exposing missing ancestor tracking only for the
direct late-attached-parent case. Production v2 repairs it; all 71 pass, including
all ten new cases. No failing assertion was removed. Baseline, first and second
populated reports remain in `node_modules/.cache/native-validation/` as
`split-text-parent-baseline.json`, `split-text-first.json` and
`split-text-second.json`.

The independent binding/core lane contributes 73 cases. Exact baseline has
57 passing controls and sixteen direct-native failures; the same final test
passes all 73 on production v2. Owner/script controls remain passing, including
UTF-16 and detached cases. Raw and queued observer payloads, scalar conversion,
atomic limits, follow-up edits/moves/removals and closure are covered. The first
fixture publication/lint corrections and a later host-object diagnostic exception
are preserved. The final delivery compares tail-move containers by boolean
identity while retaining exact offsets, so all sixteen baseline failures are
ordinary assertions rather than incidental getter exceptions. Strict checks and
Biome pass on both archives. See
`node_modules/.cache/native-validation/parallel-split-text-bindings-eccf642/report.md`;
`bindings-v2.patch` is the integrated delivery, not the original patch.

The independent rendering lane contributes 30 cases, with fifteen existing
canonical controls. The final exact baseline passes all fifteen controls and
two native cases, retaining thirteen direct-path failures; v2 passes all thirty.
Independent literal final-node fixtures verify boundaries, direction, geometry,
full fresh/prepared pixels, tail edits/removal and closure. The initial fixture
mistakenly retained a range after selection.collapse created a new selected range;
its original failure remains, and the corrected test explicitly checks both
identities. See `node_modules/.cache/native-validation/parallel-split-text-rendering-eccf642/REPORT.md`.

Native injected command-host capture compares eight cases using exact baseline
owner.splitText versus broken native splitText, then actual direct splits on
both new builds. All eight new cases match canonical output, including complete
source/layout, ranges, revisions, journals, raw mutation payloads, counters and
prepared-layout rejection. Forty-eight canonical/integrated/working PNGs compare
byte-for-byte; 64 total PNGs retain all broken-baseline evidence. Only explicit
API routes, local PNG paths and random artifact handles are normalized. Original
values remain in raw evidence. All 32 hosts close and all 64 artifacts release.
The parent inspected backward cross-split highlights and the parent boundary
after the original. See
`node_modules/.cache/native-validation/parallel-split-text-capture-eccf642/FINAL.md`.

The broken baseline differs by 5,085 pixels, entirely within caret/highlight
regions. In these eight unwrapped ASCII cases, canonical splitting preserves
decoded glyph pixels, but source references and range-rectangle segmentation
legitimately change. No general split-run layout invariance is assumed. Seven
cases advance revision 21 to 24, end-split advances 21 to 22, and all CSS cascade
counts move six to seven. Capture audits verify 27 source-to-dist emits and 54
source/dist hashes. These are bounded native measurements, not timing/RSS or
external browser acceptance.

## Final integration

All 113 new cases pass. The fixed 24-file suite passes 741 tests in the isolated
tree and 741 in the working tree, without failures, skips or runtime errors.
Both project type checks and dist-only builds pass, along with strict checking
of all three new test files, scoped Biome for them and dom-range, and formatting
of both production files. One pre-existing DocumentTree organizeImports
diagnostic is reproduced on exact `eccf642` and the working file; no broad
formatting cleanup is bundled. Final logs and populated reports use
`node_modules/.cache/native-validation/split-text-integration-final-*`.

Both manifests match with 402 unique entries, no missing working files and 22
pre-existing pending-only isolated gaps. The full manifest was not executed.
After final parent builds, all 54 capture source/dist fingerprints still match:
`node_modules/.cache/native-validation/split-text-parent-final-fingerprints.json`.
The focused change excludes every pre-existing pending source/doc delta.

All current execution is native/injected and in memory. Full-manifest execution,
actual SafeJS, live sites, socket/service processes, real TTY/PTY, GUI/browser
interop and portability remain separately authorized gates in `TASKS.md`.
