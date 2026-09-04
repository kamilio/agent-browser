# Native PNG captures through the agent interface

September 4 file-publication hardening: `CAPTURE-PUBLICATION.md` adds trusted
directory and pre-installation temporary-file checks shared with state files.
Capture results report local temporary cleanup separately from remote cleanup;
plain CLI output warns when either is unconfirmed. These are native filesystem
regressions, not new live capture or portability acceptance measurements.

September 3 `PDF.md` adds a separate native paginated PDF path using the same
artifact store, safe file writer and playground download flow. Statements below
about PDF absence describe this earlier PNG-only checkpoint.

The later `PNG-COMPRESSION.md` checkpoint reduces default PNG payloads without
changing pixels or artifact semantics. Measurements and PNG digests below describe
the original stored-output baseline unless stated otherwise.

The later `INLINE-CAPTURES.md` checkpoint adds supported wrapped-inline targets
and optional playground capture scope. Single-block restrictions below describe
the original export checkpoint, not the current target set.

The `screenshot` command now captures the engine's actual normal-flow output.
The CLI saves a private PNG, and the playground has an explicit Render pane and
PNG download action. This connects the renderer to users; it does not establish
full browser CSS, image/font, public-site or PDF compatibility.

No dependencies or external browser engines were added. No service was started
or restarted for this checkpoint. Live sockets, a live playground and new public
websites were not exercised; the verification boundaries are recorded below.

## CLI

With a built package and an existing local command service/session:

```sh
node packages/browser-agent/dist/src/cli.js -s=research screenshot --filename=page.png
node packages/browser-agent/dist/src/cli.js -s=research screenshot '#article' --filename=article.png --json
node packages/browser-agent/dist/src/cli.js -s=research screenshot 'getByTestId("article")' --hires
```

- No target means the current logical viewport. A target uses the existing unique
  reference/CSS/literal locator resolver, then requires exactly one visible,
  positive-area normal-flow block box. The border box is rounded outward to pixel
  boundaries. Offscreen blocks can be captured without pretending to scroll.
- Inline/fractured targets, display:contents, hidden/empty targets and unsupported
  layout fail explicitly. Full-document/scrolling capture and general inline bounds
  remain open. The existing 4,096-per-axis and 4,194,304-pixel raster limits apply.
- The engine currently has device scale factor one. `--hires` is accepted and
  recorded; device and CSS pixel scales therefore coincide. It does not secretly
  upscale the bitmap or claim high-density rendering support.
- `--filename` is a **local CLI client** operation. It is never sent to the remote
  command host for a server-side file write. A missing filename generates a unique
  `agent-browser-<uuid>.png` in the current working directory. Only bounded PNG
  paths without control characters are accepted; parent directories must exist.
- The client creates a private mode-0600 sibling temporary file with exclusive
  creation, writes verified chunks, syncs it, then hard-links the complete file to
  its final name without replacing anything. Existing files/symlinks cause a clear
  refusal. Identity-checked temporary cleanup runs on success and failure. This
  requires a filesystem supporting same-directory hard links; no unsafe overwrite
  fallback is used. Directory metadata durability across power loss is not claimed.
- JSON output reports the final path, capture metadata and `remoteCleanupConfirmed`.
  A failed deletion means cleanup is unconfirmed, not proof that the artifact still
  exists. Default output reports the saved path. PNG/base64 bytes are not dumped into
  the agent's terminal transcript. Literal target text stays literal even when it
  resembles a command option or session flag.

The core API rejects `screenshot --filename=...`: API clients retrieve bytes through
the artifact protocol instead. There is no PDF implementation in this checkpoint.

## Bounded artifact protocol

A core `screenshot [target] [--hires]` returns small metadata: artifact ID, PNG media
type/byte length, dimensions, document ref/revision, target, clip, scale, partial
profile and paint counters. It does not insert the whole image into a JSON frame.

```sh
agent-browser -s=research artifact-list --json
agent-browser -s=research artifact-read CAPTURE_ID --offset=0 --length=65536 --json
agent-browser -s=research artifact-delete CAPTURE_ID
```

Each read returns at most 65,536 decoded bytes as base64, with ID, offset, byte count,
total length and EOF. Existing two-MiB HTTP/process frame limits are unchanged.
IDs include a per-store random UUID and a nonreused counter, avoiding stale ID
reuse across actor restarts. Ownership is session-scoped. A closed session clears
its artifacts; captures intentionally survive navigation and tab closure until
deletion or session close.

There is no persistent disk store and no silent eviction: at most eight artifacts
and 32 MiB of encoded bytes are retained per command host/owned actor. Capacity
exhaustion requires deletion. The store owns a defensive byte copy; callers cannot
mutate future reads. The cap bounds retained storage, not total renderer/encoder
peak memory or the aggregate of multiple separate actors.

The package exports `capturePng(execute, target?, signal?)` for a bounded in-memory
PNG and `readCapture(execute, metadata, consume, signal?)` for sequential consumption.
The former captures and attempts deletion in a finally block; the latter reads an
existing artifact and leaves ownership with its caller. Both validate metadata,
chunk identity/order/length, canonical base64 and the initial PNG header/dimensions.
They are not general PNG decoders or cryptographic transport verifiers. The CLI
writer streams into the temporary file rather than retaining another whole PNG.

Deletion is best-effort when the service/token is gone. Successful clients disclose
unconfirmed cleanup; after an interrupted/revoked client, inspect `artifact-list` or
close the session. No background expiry is promised. The command/session limits
still count every chunk request.

## Playground

The new Render pane explicitly requests a capture rather than repeatedly rendering
on each observer refresh. Its image shows actual native PNG bytes, dimensions and
the captured revision, labelled as a one-time **partial** view. The PNG export button
captures afresh and uses a separate short-lived download Blob URL. Failed rendering
shows the actual error; no placeholder image is substituted.

Navigation/session invalidation and disconnect revoke the preview URL and cancel
pending capture reads. Same-document changes made elsewhere can leave a previous
capture visible; its revision label and explicit Render action avoid representing
it as live. A successful capture releases its server artifact. Cancellation after
authorization revocation can leave a bounded artifact until explicit deletion/close.

The service serves a fixed allowlist of three additional package modules used by
the preview client, not arbitrary filesystem paths. CSP permits Blob images only;
remote image origins and embedding remain disallowed. Existing host/origin checks,
same-origin resource policy and command authentication are preserved.

## Evidence and resource costs

- `reports/capture-export-focused-2026-09-02.json`: 1,921 passing tests in 86 files,
  including 35 new artifact, client, CLI, element-capture, UI and asset cases.
  Tests include cross-session/restart identity, retention limits, framing a PNG
  larger than two MiB, fractional crop bounds, private atomic writes, existing
  files/symlinks, corrupt/interrupted transfers, cancellation and cleanup.
- The actual CLI entry point is tested against an injected in-memory service and
  saves a verified PNG. UI handlers run against a lightweight fixture DOM and the
  real command host. HTTP asset handlers use a mocked listener, not a real socket.
  These tests are not live browser/UI or live API acceptance.
- `reports/capture-export-safejs-fixture-2026-09-02.json`: nine actual experimental-
  core checks. An interpreted click changes transferred PNG pixels. The normal CLI
  writer produces a real private file; element/resize/cleanup and built preview
  module availability are checked. The largest JSON frame is 87,618 bytes.
- `reports/capture-export-{final,cleanup,css,document}-regression-2026-09-02.json`
  records final export reruns and 23 existing paint/document checks with the same
  experimental core. Temporary regression PNGs are not new live-site evidence.
- `reports/capture-export-native-render-2026-09-02.png`: visually inspected
  1,024 × 768 native HTML output, 3,146,804 bytes; SHA-256
  `c90236a2d8db076a60620e1d5dd0671683bf30cdcd8e1b693a94c98801f2bb1e`.
  This image was rendered and transferred by our engine, not manually positioned
  panels or a desktop browser capture. The runtime remains the existing experimental
  core, not an accepted released SafeJS artifact.
- `reports/capture-export-native-{small,medium,large}-2026-09-02.json`: three fresh
  Node processes, six assertions each, with 100 colored paragraphs. These measure
  rendering, PNG encoding, owned artifact storage, JSON-frame round trips, base64
  decode and release **in one process**, without network or disk latency:

| Viewport | Capture/transfer ms | PNG bytes | Frames | Peak process RSS MiB |
| --- | --- | --- | --- | --- |
| 640 × 480 | 166.0 | 1,229,438 | 21 | 104.3 |
| 1,280 × 720 | 419.4 | 3,687,468 | 59 | 113.1 |
| 2,048 × 1,024 | 955.8 | 8,390,340 | 131 | 129.5 |

All maximum frames are 87,618 bytes. Client results remain retained after close;
forced GC is not used. This original profile predates PNG compression. These single-run
measurements are not Worker heap-fit, wire throughput or service cold-start claims.

Build, strict changed-test checks, focused lint/formatting and existing renderer
regressions pass. Full reference coverage, page-script/framework compatibility,
live-site rendering, inline/general element screenshots, actual high-density
layout, PDF and released-SDK acceptance remain open. The full goal remains active.
