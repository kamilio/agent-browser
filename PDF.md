# Native paginated PDF export

The `pdf` command, local CLI writer and playground PDF button now export the
current document using this engine's own layout, painter, compression and PDF
encoder. No Chromium, Firefox, remote rendering service or runtime dependency is
used. The profile is **screen-layout pages with native raster visuals and a
positioned searchable text layer**, not desktop-browser print layout.

## Agent and human interfaces

```sh
agent-browser pdf --filename=page.pdf
agent-browser -s=research pdf --filename=article.pdf --json
```

The CLI requires the existing local command service. A missing filename produces
a UUID-based `.pdf` name in the local working directory. The PDF command accepts
no element target: it exports the whole current document, clipped horizontally
to the viewport. `resize` controls the viewport width and page height.

The command host returns metadata plus a session-owned artifact ID, not megabytes
of inline base64. `artifact-read`, `artifact-list` and `artifact-delete` work for
both PNG and PDF. PDF metadata includes page count, source revision, viewport
dimensions, source clips and native resource counters. `capabilities.pdf` states
the partial profile, pagination behavior, print-media gap and quotas.

`capturePdf` downloads bounded chunks and releases the remote artifact;
`readPdf` supports streaming consumption. The Node CLI writes a private `0600`
temporary file, checks transfer framing, synchronizes it and publishes through
the existing no-replace hard-link path. Existing files and symlinks are not
silently overwritten. Server-side `--filename` remains unsupported: the path
belongs to the local client, never to the browser worker.

The playground footer's PDF action downloads `agent-browser.pdf`. It uses the
same session and artifact flow, cancels stale downloads, releases short-lived
blob URLs and reports unsupported-layout errors instead of creating placeholder
documents. It is distinct from the optional element scope in the PNG pane.

## Layout, pagination and text

One prepared document layout is reused for all pages. The prepared painter rejects
a changed revision or closed document rather than painting stale geometry.
Pagination covers normal-flow height and supported visual overflow. The page
width/height follow the existing viewport; each PDF page has the same paper size.
Short source slices leave white padding at the bottom of the paper.

Breaks move upward rather than cutting through supported text glyph intervals.
An unbroken interval taller than the page fails explicitly. Backgrounds and other
supported paint are geometrically sliced; CSS page-break rules, `@page`, print
media, repeated headers/footers, widow/orphan rules and horizontal tiling are not
implemented. This is not an A4/Letter reflow preset.

Each page image contains actual native RGB pixels. RGBA is composited against
white and compressed with the existing bounded zlib encoder. CSS pixels map to
0.75 PDF points, preserving the screen's 96 px/in scale. PDF uses classic byte
cross-reference tables, explicit stream lengths and a page tree.

The invisible text layer comes from positioned layout glyphs, not OCR or the
unprocessed HTML source. It excludes display-none, visibility-hidden and fully
transparent text. It is **not a redaction guarantee** for text geometrically
occluded by other content. The existing supported ASCII/NBSP repertoire maps
through WinAnsi and an explicit ToUnicode CMap. A standard Courier font and
horizontal scaling represent the native monospace advance; visible output stays
the exact native image, not substituted Courier outlines.

Only exactly adjacent glyphs with the same baseline and size are combined into
one text operation. Gaps, font changes and new lines start new positioned runs.
Text is hex-encoded so page text cannot inject PDF operators. The encoder emits
no JavaScript, actions, external URLs, forms or attachments. This is not tagged
PDF, PDF/UA, PDF/A, encrypted PDF or full-font/Unicode coverage.

## Resource limits

| Limit | Maximum |
| --- | ---: |
| Pages | 32 |
| Page width or height | 4,096 CSS px |
| Full paper area per page | 4,194,304 px |
| Encoded image pixels across pages | 16,777,216 |
| Search-layer glyphs | 100,000 |
| PDF bytes | 33,554,432 |
| Reported native layout/paint work | 128,000,000 |
| Compression work | 128,000,000 |

Existing layout, raster, font and document budgets apply as well. Pages are painted
and encoded sequentially; all uncompressed page images are not retained together.
The one layout and bounded glyph projection are reused. Work counters describe
their documented stages, not every host instruction or a formal memory ceiling.

PNG and PDF share the existing eight-artifact/32 MiB retained-byte store and
65,536-byte chunk limit. Navigation preserves retained artifacts; explicit
deletion and session/host closure release them. Client-retained output bytes
remain the client's responsibility. Treat exports as private document data.

## Verification — September 3, 2026

The final explicit safe selection passes **2,246 tests across 101 files**. Build,
strict changed-test typechecking, focused lint, formatting and whitespace checks
pass. Live socket/server/PTY and restricted timer probes are not included.

Native tests verify stream lengths, exact xref offsets, deterministic encoding,
independent zlib inflation, alpha compositing, text escaping/grouping, dimensions,
quotas, line-aware pagination, prepared-layout reuse and stale-owner rejection.
Command/client tests cover multi-chunk transfers larger than a command frame,
session ownership, shared PNG/PDF capacity, corruption, cancellation, private
atomic files and refusal to replace existing files. The actual CLI entry point
and playground handlers run against injected in-memory services, not live sockets.

`scripts/check-pdf.ts` changes a real document through production page bindings
and the existing experimental SafeJS core. The installed Ghostscript **9.50** is
an independent test validator only, not a runtime dependency or PDF generator.
It parses and renders all three PDF pages, and every RGB pixel matches the native
page slice plus white paper padding at 96 dpi. Its independent text extraction
finds the actual guest-modified `EDIT`, `TWO` and `THREE` content. Eight checks pass
before and after layout reuse and text compaction. The rendered first-page PNG
was visually inspected.

After the final build, the prior actual-core PNG export probe passes all nine
checks and the CharacterData/layout/pixel probe passes all fifteen. The compact
preview bytes equal the independently rendered and visually inspected baseline.

The compact artifact is `reports/pdf-native-compact-2026-09-03.pdf` (2,803 bytes),
with SHA-256
`f8e45561633294ccd90c1173b3c9f02133f105ff75ba386e4eff3f43d927519b`.
Its preview is `reports/pdf-native-compact-2026-09-03.png`. Earlier 3,269-byte
artifacts and reports remain as the per-glyph text-operation baseline.

### Native resource samples

`check-pdf-resources.ts` uses in-memory rows at a 512 × 512 viewport, without a
guest realm, networking or frontend. Each sample passes six assertions for one
layout, complete coverage, glyph counts, compression, quotas and native cleanup.

| Rows | Pages | Before text compaction | Current bytes | Current elapsed | Current peak RSS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 10 | 1,065,222 | 388,613 | 339.157 ms | 90,756 KiB |
| 1,000 | 20 | 2,143,028 | 781,334 | 608.340 ms | 126,792 KiB |

The byte reduction is deterministic for these fixtures. These are single local
timing/RSS samples, not a speed or memory improvement claim: the larger compact
sample is slightly slower and has higher peak RSS than its earlier run. They do
not establish Worker heap fit, service cold start, real-site performance or
released-SDK acceptance. Full CSS/print compatibility and live frontend/site
acceptance remain open.

## Design references

- Adobe PDF reference: https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.7old.pdf
- Ghostscript output devices, including independent text extraction:
  https://ghostscript.readthedocs.io/en/latest/Devices.html

These guide and validate the implemented subset; they are not a claim of full
standards or reader interoperability conformance.
