# Native control pointer carets

September 4, 2026 continuation from `c0a717c`. `CONTROL-TEXT-SELECTION.md` records
the preceding native keyboard/selection rendering checkpoint. This continuation
places collapsed input/textarea carets from actual primary mouse coordinates;
it is not general pointer selection or a public DOM selection API.

## Shared geometry and ownership

`hitControlText` in `src/control-text-layout.ts` shares the existing wrapping,
line spacing, placeholder and focus-edge scroll computation. It finds the closest
visible logical row and native boundary, with exact midpoint ties toward the
following/right stop. Soft-wrap boundaries have an upstream hit position as well
as the next row's start; painted caret following-line affinity is unchanged.
Blank/trailing lines, partial edge cells and empty placeholder values are handled
without fake document text or Range geometry. Optional bounded allowed offsets
exclude the interior of native surrogate pairs in an already masked password.

Hit stops are collected only for hit testing. Ordinary `layoutControlText` painting
does not allocate the additional per-character stop objects. All original 68
geometry assertions remain unchanged; 450 complete layout outputs compare
byte-for-byte with the previous implementation. Existing text/font/texture limits
remain enforced, and allowed boundary lists are capped at 4097 entries.

`src/control-pointer.ts` converts existing client-border geometry plus used CSS
border/padding into the actual software-control content texture. The conversion
uses ceil-sized raster dimensions and preserves identity scaling for integer
dimensions. Frame/padding clicks clamp to the text viewport. It does not derive
an independent document box, change scroll state or retain a second caret owner.

The displayed hit is prepared before focus changes. An initially blurred long
control therefore uses its initial viewport, not the fallback end-caret viewport
that focus would otherwise expose. An already focused control uses its current
native scroll. After publishing the selected offset, the existing stateless
minimal focus-edge scroll is recomputed: preserving the old internal viewport or
keeping the caret at exactly the same screen position remains outstanding.

The mouse passes its actual mousedown point to the existing focus default. After
focus, the adapter checks current target/value/type/visibility and geometry before
`DocumentKeyboard.placeControlCaret` publishes through the authoritative owner.
That entrypoint validates native code-point boundaries and permits readonly
placement without allowing edits. Password hit filtering uses numeric code-point
boundaries; raw values do not enter descriptors, hit results or raster metadata.

## Cancellation and stale targets

Canceled or nonprimary mousedown does not place a caret. Coordinate-free native
activation and programmatic click retain their prior behavior. Disabled/inert
controls remain blocked; email/number native editing is not broadened. A final
focus redirect away skips placement without stealing focus back.

Focus-changing preparation installs a temporary change guard. Target value/type
notifications, structural or root-style changes, abnormal focus roundtrips, a
newer focus-handler selection or changed final geometry reject stale placement.
No already committed DOM write is rolled back and a newer caret is not overwritten.
Same-focus preparation avoids the extra listener. Guards release in `finally`,
including failed operations; a repeated-failure regression exercises 40 attempts.
These conservative native checks are not claimed to match every platform's
focus-handler behavior.

Research: UI Events default actions and mousedown, read September 4, 2026:
`https://w3c.github.io/uievents/TR.html`.
The specification describes text selection as a possible mousedown default and
default-action cancellation. This implementation remains an explicit native
collapsed-caret subset, not complete drag/selection, trusted-event or Pointer
Events conformance.

## Validation evidence

Evidence is retained under `node_modules/.cache/native-validation/`.

- `control-pointer-integration-baseline.log`: all seven original adapter tests
  fail against the previous collapse-to-end behavior.
- `control-pointer-integration-first.log`: 147 passing cases across parent
  pointer, new hit and unchanged layout files.
- `control-pointer-integration-midpoint-before.log`: a fresh integer-scaling
  regression fails with offset 1 instead of 3; eight other parent cases pass.
- `control-pointer-integration-midpoint-after.log`: all nine parent cases pass
  after multiplying before dividing in the texture projection.
- `parallel-control-text-hit-c0a717c/REPORT.md`: 71 new pure hit cases, all 139
  focused cases passing, 450 complete unchanged layouts, strict/build/style checks
  and the stop-allocation guard. Earlier artifacts remain preserved.
- `parallel-control-pointer-command-c0a717c/BASELINE.md`: 25 independent command
  cases initially produce 17 failures and eight passes against original production.
- `parallel-control-pointer-command-c0a717c/FINAL.md`: 28 command cases pass
  against the supplied corrected production, with strict/build/style checks.
  The additional three cases cover focus redirect, removal and changed padding.

The three new explicit native test files add **108 cases**: nine adapter, 71 hit
geometry and 28 actual-command cases. Final focused suites pass **736 cases /
23 files in both isolated and working trees**, recorded in
`control-pointer-integration-first-focused-{isolated,working}.log`. Matching
`types`, `build`, `strict` and `biome` logs record passing project no-emit types
and explicit `--outDir dist` builds in both trees, strict compilation of all
three new tests, and Biome on five changed production modules plus three tests.
Both manifests contain 373 unique entries; the same 22 pre-existing pending files
remain absent from the archive. The exact scoped wrapper was approved after one
approval-timeout retry, not as a full-manifest authorization.

No full manifest, broad substitute suite, denied transport test, SafeJS, live
website, real socket, TTY/PTY, GUI or service-process acceptance is inferred from
these in-memory checks. Existing unrelated lint and pending-work limitations
are not claimed fixed.

## Fresh native captures

`control-pointer-host-capture.mjs` uses actual BrowserCommandHost mouse commands,
injected in-memory transport and no page runtime. The retained previous control
snapshot supplies the exact `c0a717c` production baseline. Twelve phases cover
filled text, start/middle/end hits, select-all/collapse, long focused/blurred input,
scrolled textarea, masked midpoint and canceled mousedown. Each exported PNG is
followed by artifact deletion and an empty-list assertion.

`control-pointer-host-before.*` and its PNGs remain unchanged. The first
`control-pointer-host-after.*` run exposed the integer-scale rounding defect:
30/220*220 produced a slightly smaller point, selecting native password offset 1
instead of midpoint-tie offset 3. A new ninth adapter test reproduced it before
the multiply-before-divide fix. That first run and both regression logs remain
preserved rather than rewritten.

`control-pointer-host-after-v2.*`, `control-pointer-host-working-v2.*` and
`control-pointer-host-comparison.{json,log}` record the corrected comparison.
All twelve working-build PNGs match the isolated build byte-for-byte. Values,
serialized DOM, document scroll, placed boxes and outer control geometry remain
identical to baseline. Every changed pixel is inside a control text clip, and
each focused numeric offset matches the intended native hit. Canceled mousedown
is byte-identical to the preceding masked-midpoint phase. Input-middle and final
masked-midpoint captures were visually inspected.

Changed pixel counts are respectively 0, 20, 22, 0, 0, 18, 0, 1350, 1350, 1546,
28 and 28. Existing document glyph/caret and paint-budget metrics remain identical;
they do not count native control texture detail or measure CPU/RSS.

## Temporary disk pressure

The root filesystem filled during this work; the project disk still had space.
`control-pointer-disk-recovery.md` records approved read-only diagnostics and the
verified relocation of a completed 128MB validation snapshot onto the project
filesystem. Its original path remains a symlink to the complete preserved copy.
No unrelated 35GB temporary directory or historical source/evidence was removed.
This recovered working capacity, not overall system disk-health acceptance.

## Outstanding scope

Dragging, Shift-extension, word selection, general contenteditable hit placement,
persistent/manual widget scrolling, IME/bidi, platform appearance and complete
selection APIs remain open. Native control texture detail still does not count
as editable-document `paintedCarets` or document selection glyph telemetry.
The original browser/runtime/live gates remain in `TASKS.md`.
