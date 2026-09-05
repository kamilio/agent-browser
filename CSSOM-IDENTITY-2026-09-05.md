# CSSOM identity research — September 5, 2026

## Status and attribution

This checkpoint records primary-source contracts for **future truthful native
identity and geometry APIs**, not acceptance of Screen, devicePixelRatio or
VisualViewport implementations. It does not claim those APIs currently exist
or work in this repository, and does not authorize either denied identity gate.

The new live CSSOM read succeeded using the **already committed, unchanged
`reader-marker-integrated.qF5Iaq` reader**, not the dt/dd patch that was still
pending when the capture ran.
The earlier p/li-depth changes are a possible explanation only: no controlled
old-module replay or causal bisection was performed. Parent validates its
reader changes and synthetic regressions separately.

## Source, receipts and preserved failure

Only acquired source: https://drafts.csswg.org/cssom-view/

This is an **editor's draft retrieved September 5, 2026**, not a frozen
Recommendation, implementation measurement or general browser-conformance pass.
All acquisition used this repository's native browser; writing this document
required no new request, test, build, source change or probe.

| Observation | Exact UTC time on September 5, 2026 | Result |
| --- | --- | --- |
| Original receipt | 03:23:40.344 | HTTP 200, then loader-stage `resource-limit` in the earlier recorded build |
| New native run | 06:10:29.109–06:10:29.966 | Successful load and scoped extraction with qF5Iaq |
| New receipt | 06:10:29.253 | HTTP 200; 1,196,447 decoded bytes, 137,852 encoded bytes |
| Original-byte archive | 06:10:29.258 | Saved before loader invocation, which followed in the same millisecond |
| Additional Screen extraction | 06:11:26.983 | Offline replay of the exact saved body; no HTTP request |

Both live receipts record this transport-decoded, pre-loader body SHA-256:
`0c344170f5e5ecc7ed4e69b82e07e73b7f96d88cd0c544577c26fb42bcf0fd8d`.
Saved bytes independently match it. This hash does not identify compressed
wire bytes, TLS traffic, an extracted document or a software build.

The historical failure remains at
`node_modules/.cache/native-validation/browser-research/fingerprint-identity/03-cssom.jsonl`;
its sibling `03-cssom.meta.txt` preserves the old invocation/build hashes.
The new result neither rewrites that failure nor invents its missing token/depth.
No first failing token exists in the successful new observation.

The new evidence root, abbreviated **C** below, is
`node_modules/.cache/native-validation/cssom-reader-capture/`:

- `C/response-body.bin`: original decoded bytes, archived before native loading.
- `C/receipt-before-loader.json`: response provenance, byte equality/hash proof.
- `C/capture.json`, `C/capture.jsonl`, `C/capture.time`, `C/capture.stderr`:
  original final record, native stdout, command times and stderr.
- `C/context.md`: live scoped definitions; `C/offline-screen.json` and
  `C/offline-screen.md`: additional native Screen context with offline timestamp.
- `C/REPORT.md`, `C/COMMANDS.md`, `C/PROMPT.md`, `C/AUDIT.json`: scope, methods,
  limitations and local artifact checks. Original ledgers remain unchanged.

The old recorded loader hash is
`ad7030bf078a15c179a4213f0049f40dc4b1660dfa9c86cae7bb16246599d496`;
the successful fixed loader hash is
`31199578ed51bb0a8d5bebeddd2f7c619341cc7082366c3b81d604abd819c176`.
Different identities are not proof of which code change caused the difference.

## Source-derived contracts

The anchors below belong to the single captured source, not additional requests.
Root references identify actual native scopes in the named cache artifact;
they are load-local references, not reconstructed source IDs.

### Device pixel ratio and zoom

Source: https://drafts.csswg.org/cssom-view/#dom-window-devicepixelratio
`C/context.md` roots **e4376/e4382** preserve the full algorithm:

1. Without an output device, return **1** and stop.
2. Otherwise determine CSS-pixel size at current **page zoom**, using visual
   scale factor **1.0**.
3. Determine the vertical size of an output-device pixel.
4. Return CSS-pixel size divided by that device-pixel size.

This is not permission to infer a measured hardware ratio from a configured
viewport. Root **e1514** distinguishes page zoom, which affects the initial
viewport, from visual magnification, which does not change the initial/actual
viewport. Root **e1522** notes that visual scaling is not limited to pinch input.

### Window, layout viewport and visual viewport

Sources on the captured URL: `#dom-window-innerwidth`, `#dom-window-innerheight`,
`#dom-window-outerwidth`, `#dom-window-outerheight`, `#dom-visualviewport-width`,
`#dom-visualviewport-height`.

- Live **e3602/e3622**: inner dimensions measure the viewport **including** a
  rendered scrollbar, or return **0** when no viewport exists.
- Live **e4364/e4370**: outer dimensions measure the **client window**, or
  return **0** when no client window exists. A native layout viewport does not
  establish a client window or justify copying its dimensions into outer values.
- Live **e1403/e3002**: VisualViewport has an associated document and layout
  viewport relationship; the Window accessor returns its associated object only
  for a fully active document, otherwise null.
- Live **e15747/e15761/e15793**: visual width/height return zero for an inactive
  associated document; otherwise exclude the corresponding rendered classic
  scrollbar fixed to the visual viewport. **e15782** explains CSS-pixel
  subtraction across zoom; **e15831/e15850** preserve the scale activity check.

Layout viewport, visual viewport, client window and output device are different
concepts. Linked CSS Viewport/CSS2 documents were not fetched; missing external
definitions are not inferred to complete a wider implementation specification.

### Screen is exposed information, not necessarily physical hardware

Sources: https://drafts.csswg.org/cssom-view/#the-screen-interface and
https://drafts.csswg.org/cssom-view/#web-exposed-screen-information

Live **e2971/e2985** associate Screen with Window and note that WindowProxy
access can change across navigation. In `C/offline-screen.md`, **e1540/e1615**
preserve the total/available exposed-area algorithms: first use the named
WebDriver BiDi emulated area when present; otherwise total area can use output
device or viewport area, and available area can additionally use the available
rendering surface. These areas are expressed in CSS pixels. This does not
authorize a BiDi dependency, other browser engine or fabricated emulation claim.

Offline **e5512/e5521/e5530/e5539** map availWidth/availHeight and width/height
to those distinct exposed areas. **e1534** explains consistent privacy handling.
Thus the draft permits a viewport-based **exposed-area policy**, but it does
not make a configured viewport a measurement of the user's physical monitor.
Any future viewport-backed Screen must document that choice and maintain
consistent API relationships rather than advertise invented hardware facts.

Offline **e5548/e5563** cover colorDepth/pixelDepth: exclude alpha, estimate when
necessary, respect the lower bound of three times the color media feature,
and use 24 when unknown or withheld for privacy. The two values agree for
compatibility. Blindly advertising 32-bit RGBA storage as display color depth
does not follow this contract.

## Future implementation requirements and separate evidence

These are requirements for future work, **not claims of implemented APIs**.

| Area | Required behavior/design decision | Separate evidence needed |
| --- | --- | --- |
| Host model | Explicitly distinguish output device, client window, layout viewport and privacy-exposed screen; do not silently probe private hardware | Reviewed host/profile contract and native absence/configuration cases |
| DPR/zoom | No-output-device fallback 1; otherwise follow pixel-size ratio and distinguish page from visual zoom | Controlled native calculation cases, then separately authorized guest exposure/lifecycle verification |
| Window dimensions | Preserve no-viewport/no-client-window zero cases and rendered-scrollbar semantics | Native geometry/scrollbar cases; separately authorized runtime property behavior |
| Screen | Explicit exposed total/available-area policy, Window ownership and navigation behavior; viewport values are not physical measurements | Policy/consistency review, native cases and separately authorized lifecycle evidence |
| VisualViewport | Preserve associated document, fully-active checks, dimensions, scrollbar subtraction and visual scaling | Native state/geometry cases and independently authorized guest/runtime checks |
| Color information | Match exposed colorDepth/pixelDepth, alpha exclusion, media-feature consistency and unknown/privacy fallback | Native consistency cases, no fabricated physical-display measurements |
| Confidentiality | Preserve sealed-session command, trace, console and artifact restrictions; geometry/identity must not become an export bypass | Dedicated security review and synthetic confidentiality regressions without real secrets |
| Engine independence | Keep the standalone native engine; no Chromium/Firefox/remote-browser substitution or new runtime dependency beyond approved SafeJS | Dependency/architecture review; no live challenge-bypass or compatibility inference |

Neither denied identity gate may be reopened through this documentation task.
Runtime, socket/listener, SDK, TTY, account/device and real credential gates
require their own explicit authorization. Native tests, when separately run,
cannot prove those gates. Do not claim fingerprinting resistance or Cloudflare
challenge success from standards text, synthetic geometry or reader success.

## Bounds and independently checked evidence

The capture used **one native HTTPS request**, zero redirects/retries, zero
mocked requests and closed/zero-active cleanup. No linked test or source was
visited. Transport/source ceilings stayed at or below 2,000,000 bytes/code units;
DOM bounds stayed 50,000 nodes, depth 128 and 2,000,000 text code units, with the
reader's own stricter limits unchanged. No DOM rewrite or parser substitute.

| Extraction | Scopes | Serialized bytes | Largest scope |
| --- | ---: | ---: | ---: |
| Live | 121 | 89,829 | 1,699 |
| Offline Screen context | 17 | 15,482 | 1,605 |
| Combined, including repeated context/metadata | 138 | 105,311 | 1,699 |

All scopes stayed <=32,000 bytes and the phase <=256,000; none failed. Both
loads retained document revision 32,354 during query/extraction. The reader
remains partial: omitted scripts/styles/subtrees, stripped IDs and unsupported
hidden-content semantics. This is not rendering or guest-runtime acceptance.

At **2026-09-05T06:15:15.067Z–06:15:15.118Z**, existing ledgers were independently
verified read-only with `sha256sum -c` from `/home/kjopek/project/agent-browser`:

| Ledger under C | Successful entries | Exit |
| --- | ---: | ---: |
| `SHA256SUMS` | 23 evidence artifacts | 0 |
| `INPUT-SHA256SUMS` | 1,584 fixed-build inventory entries | 0 |
| `PRIOR-SHA256SUMS` | 1 original failure record | 0 |
| `HISTORICAL-METADATA-SHA256SUMS` | 1 original invocation/build record | 0 |

No mismatch or missing-file exception occurred. The build inventory was already
checked during capture; rechecking it is not another 1,584 unique artifacts,
tests or live validations. The prior-record checks also overlap other preserved
evidence. Ledger coverage is limited to enumerated files; this new document and
the later handoff prompt were not inserted into historical ledgers. No old
evidence/log was rewritten, and no project test or denied probe was run.
