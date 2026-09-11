# Native outside-marker source — September 11, 2026

## Source status and answer

The authorized native GET of `https://www.w3.org/TR/css-lists-3/` returned HTTP
200. Its native heading outline identifies the document as **W3C Working Draft,
17 November 2020**. This report describes that fetched version, not an assumed
newer Editor's Draft or a browser-interoperability result.

### Defined in the fetched source

- §2 restricts marker generation to list items. §3 associates each marker box
  with its list item; §3.1 generates `::marker` as that item's first child,
  preceding `::before`.
- For an outside marker on a block-container list item, §3.5 makes the marker a
  block container outside the principal block box. It requires the inline-start
  side according to `marker-side`'s writing-mode reference.
- The outside marker is fixed relative to the principal block's border and does
  not scroll with its content. It is not the same placement model as an inside
  marker, which is inline at the start of the contents.

### Explicitly underdefined or unanswered

- §3.5 leaves exact marker location, painting order and float-adjacent placement
  undefined. It permits marker contents/size to affect principal-block height,
  first-line height or creation of a line box, while leaving that interaction
  undefined. Thus zero height contribution is not a normative guarantee here.
- The extracted sections prescribe neither a first-block-child descendant
  baseline nor an anchor when no in-flow line exists. They also supply no
  intrinsic-width or principal-width equation for outside markers.

## Implementation interpretation, not a conformance claim

Keep the marker associated with the owning list item's principal box. Do not
silently drop the marker or convert an outside marker into inside content to
escape the measured formatting failure. A first-descendant-line baseline policy,
empty/no-line fallback, separation from flow height, and horizontal gutter or
intrinsic-width treatment must be identified as implementation choices unless
additional primary evidence establishes them.

Parent should test those choices with first block children, nested blocks,
multiple lines and no in-flow lines, including ownership, painting, scroll
attachment and principal-box geometry. This source check does not implement or
test any of them. In particular, the absence of a fully defined positioning
algorithm is not evidence that any particular geometry is already correct.

The source explicitly marks outside layout as incomplete. The two authorized
extractions therefore resolve the defined/undefined distinction but do **not**
fill the requested precise baseline/no-line/intrinsic-width rules. No additional
specification, Editor's Draft, browser engine or live page was consulted.

## Exact native evidence

New lane:
`node_modules/.cache/native-validation/native-list-marker-source-september11/`.

- One credential-omitting, bodyless native GET, with no redirects or subresources.
  Requested and final URL are the authorized CSS Lists URL above.
- Live child: **15:10:48.999–15:10:49.260 UTC**, exit zero, process group absent.
- Response: **251,726 decoded bytes**, **40,065 encoded bytes**, HTTP 200.
- Reader: `extracted-unverified`, barrier `null`, **49 headings**, no outline
  truncation. `contentSuccess` is `null`; rendered-page success is not claimed.
- Offline child: **15:11:39.601–15:11:39.972 UTC**, exit zero, process group absent.
  Exactly two observed-heading native extractions, zero navigation or wire.

| Extraction | Observed heading and selector | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `section-1.jsonl` | `e762`, §2 Declaring a List Item; `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h2:nth-child(9)` | 4,324 | `78a6802003ca001ab49ce8db1fb304d6b3d5d46850246c3a75cf2e9005f7f49f` |
| `section-2.jsonl` | `e796`, §3 Markers, including §§3.1/3.5; `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h2:nth-child(11)` | 91,081 | `e4b0e0fc8284fff8c2a01f5373df61c0ab52827ad83c6b4e22b235a81f858779` |

The source-version heading is `e22` in `live.jsonl`. Subsequent examination of
§3.5 used only the already-extracted semantic JSON; it was not another extraction
or a raw-HTML fallback.

- Captured body SHA-256:
  `f898eb5b58818862a598d23d225da2ca3a58396b7bb32c9515c2cc8e31470ccf`.
- Live receipt SHA-256:
  `f36e0dd5154a0734e728c05a9f7020218c53b54244db7a1ed23d9f41d32b46c5`.
- Exact request/status/safe metadata and transport counts:
  `SOURCE-TARGET.json`, `LIVE-AUDIT.json`, `response-1.json`,
  `response-1.headers.json`, `live.jsonl`.
- Offline input pins, selections and cleanup:
  `OFFLINE-INPUT.json`, `SELECTIONS.json`, `section-N-input.json`,
  `section-N-audit.json`, `RESULT.json`.

## Isolation and limitations

The immutable **6805-pass** fixed reader, with **1006 source / 1788 compiled
files**, is reused without copying or rebuilding it. This is its historical gate,
not a new test run or the parent's newer MDN build. Source and compiled pins,
original Grid capture evidence and previous alignment receipts remain unchanged.

The original `long-v1` admission, separate omitted-raw policy, reader/document
limits, 4,000,000-byte response/capture ceiling, 15-second transport timeout,
20-second navigation timeout, 30+5-second child bound and 6 MiB output/file caps
remain intact. The transport wrapper restricts the underlying admission to the
single authorized primary request, without redirects or retries.

Live transport closed with zero active requests, one actual request and zero
mocked requests. Offline seccomp/network/process guards recorded no attempts;
each extracted document closed to zero nodes, both process groups exited, and
private temporary directories were empty and removed. No scripts, SafeJS,
credential/provider/device access, real TTY or alternate browser was used.

`VERIFICATION.json` binds the report, source receipts, counters and pin checks;
`RECEIPTS.sha256` covers the private lane. Only this new report/lane changed: no
production sources, tests, TASKS, manifests, previous evidence or commits.
