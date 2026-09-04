# Native file-control rendering

September 4, 2026 integration on `0f1c342`, extending `FILE-SELECTION.md`.
Visible file inputs now participate in existing native layout and software
painting. This does not implement an operating-system chooser or guest File API.

## Rendering contract

The descriptor reads only the existing document-owned selection metadata. Painting
does not create an owner or copy file payloads. Single/multiple controls display
Choose File/Choose Files, empty labels, one owned basename or a bounded file count.
Local paths and fakepath values are never painted or written into DOM attributes.
Long names clip within the existing control rectangle; no tooltip is synthesized.

Intrinsic dimensions are selection-independent: width is 34 glyph advances plus
24 pixels, and the existing font/height rules remain authoritative. The inapplicable
size attribute does not resize a file control. Existing disabled colors, focus
edge, authored paint, raster clipping and work/pixel/font limits remain enforced.
Unsupported filename glyphs still reject explicitly; this is not full Unicode
font coverage. The button-like label does not open a chooser on click.

No formatting-tree or layout algorithm change was needed: its supported-control
path consumes the new descriptor. Parent integration promotes two actual native
host double-click fixtures from hidden to visible file inputs, retaining both
reset defaults and one multipart submit before navigation interrupts the gesture.
A further parent test verifies fixed file-control pixels/geometry across root
scroll (40,200), correct element crop and focus without root movement.
The direct-file session fixture now returns explicit picker intent after its
first click; actual host dispatch rejects that unimplemented chooser default
without issuing a second click. Renderability does not imply picker execution.

## Current evidence

Both focused runs pass **166 tests across seven files**, including 23 file-rendering
cases. Source type checks/builds, strict checks for four affected test files and
six-file Biome checks pass. Native tests do not establish external acceptance.

Final authorized explicit native suites pass **10,517 tests across 309 isolated
files**. The working suite reports **11,648 passes and the same fifteen pending
assertion failures across 331 files**. The existing fourteen obsolete positioning/
capability assertions and one onload-object assertion remain untouched, as do the
twenty-two additional preexisting working-tree test files absent from the archive.

Fresh current-base captures from `scripts/capture-file-controls.ts` were generated
and all three inspected. They are 640x320 native-module PNGs, not runtime or CLI
captures. Evidence is under
`node_modules/.cache/native-validation/file-control-rendering-integration-captures`.

| Phase | PNG bytes | Native raster work |
| --- | ---: | ---: |
| before | 21,132 | 1,151,472 |
| selected | 20,524 | 1,166,064 |
| cleared | 21,132 | 1,151,472 |

Before/cleared pixels and hashes are identical. The four rectangles remain
(16,68,440,28), (16,128,440,28), (16,188,440,28), (16,248,260,28). Selected captions
show single.txt, three files, disabled.txt and the clipped long name, with four
controls painted and zero formatting issues in each fixture phase. The JSON
retains current generation time, hashes, descriptors, geometry and metrics.

The original worker handoff/captures under
`/tmp/agent-browser-file-control-rendering-a580e89.3VXcGR` remain unchanged, even
where new current-base pixels happen to match. Other integration evidence uses
the `file-control-rendering-integration` prefix in the native-validation cache.
An initial full native run found the old direct-file layout rejection assertion;
it is replaced by picker-intent assertions, with separate final-run logs rather
than relabeling that initial failure as a pass.

## Open gates

Production upload client/server integration is separate work. Native chooser,
guest File/FileList/DataTransfer, drag/drop, complete filename typography and
full upload UI semantics remain absent. Live websites, socket/TTY/PTY, actual
subprocesses and released-SafeJS execution remain separately authorized gates.
No such probe ran, and no runtime dependency or alternate browser engine was added.
