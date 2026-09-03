# Page-owned PNG image resources

The subsequent `JPEG-DECODING.md` checkpoint generalizes this owner to PNG and
8-bit Huffman JPEG. Session requests advertise both explicit MIME types; decoder
limits remain enforced. `images` distinguishes formats and reports ignored JPEG
metadata separately from PNG ancillary chunks. The original PNG lifecycle evidence
below remains a historical checkpoint.

September 3, 2026: the native PNG decoder now participates in document loading,
session networking, live page JavaScript and agent inspection. This advances K08
beyond a standalone codec. The subsequent `IMAGE-LAYOUT.md` checkpoint adds loaded
PNG normal-flow replaced boxes and painting into document screenshots/PDFs. Pending
or broken resources still fail unsupported formatting rather than disappearing.

## Implemented lifecycle

- The HTML loader configures one `DocumentImages` owner before parser scripts run.
  It discovers connected `img` elements and retains explicitly registered detached
  images. Creating an image through the DOM facade registers it before source
  changes. Native document mutation hooks trigger bounded, coalesced reconciliation.
- HTTP(S) `src` resolves against the document base. Sources share one request and
  decoded buffer per normalized network URL within a document. Fragment identifiers
  stay in `currentSrc` but not request/cache keys. There is no cross-document cache.
- Source changes invalidate pending `decode()` waits, release the old consumer and
  abort unused requests. Another consumer can retain a shared in-flight request.
  Late responses cannot replace a newer source. Removing `src` releases the resource;
  detached but registered image objects remain consumers until changed or closed.
- The native decoder supplies actual RGBA pixels and intrinsic dimensions. A new
  optional `decodePng({ maxPixels })` ceiling validates IHDR before decompression
  and raster allocation, allowing the owner to enforce its remaining pixel budget.
- Live guest properties include `complete`, `currentSrc`, `naturalWidth`,
  `naturalHeight`, reflected `src`/`alt`, `decode()`, `onload` and `onerror`.
  `document.images` uses the existing live collection/identity implementation.
  Load/error dispatch uses owned non-bubbling, non-cancelable events. Handler
  attributes and ordinary listeners share the existing event machinery.
- The automatic classic-script loader waits for image settlement after deferred/
  asynchronous scripts and DOMContentLoaded, before complete/readystatechange and
  Window load. Later source changes use the same active-document transport. Guest
  handlers can mutate the actual DOM; snapshots see those mutations.
- Closing a document aborts requests, clears alarms and pending events, rejects
  decode waits, releases decoded buffers and unregisters mutation hooks. Lifetime
  scan/update exhaustion halts and closes the image owner, preserving its failure
  code in metrics rather than leaving stale resources active.

## Network and inspection

The session provides a dedicated image transport through its existing network
adapter and routes. Every redirect target is parsed and checked before issuing the
next request; HTTP downgrades from HTTPS pages are refused. Up to twenty redirects
are followed manually. Owner/navigation cancellation applies even if a transport
ignores its abort signal. The normal network adapter retains its DNS/address,
origin, port, response-size and aggregate-session policies.

Default image requests use the page's cookie context with credentials included,
not a top-level navigation. Cross-origin redirect state is carried forward. The
owner records whether every URL in the chain stays on the document origin; a
cross-origin excursion returning to the original origin is still not origin-clean.
No canvas pixel-read API or CORS permission is inferred from that diagnostic flag.

The `images` extension command reports scoped refs, lifecycle states, intrinsic
dimensions, redacted source URLs, error codes, origin-clean status, ignored PNG
ancillary chunk names and owner counters. It reconciles pending image state rather
than performing a separate scraping/fetching implementation. Ordinary reads of
settled unchanged sources do not refetch them. Output uses the existing bounded
command frame; oversized inspection fails rather than bypassing that boundary.

`requests`/`request` include `kind: "image"` entries with redacted redirects and
network outcomes. Successful HTTP transport and successful PNG decoding are
distinct: an HTTP 200 HTML body is a completed network request but a broken image
with an unsupported-MIME error. Diagnostic queries/fragments are removed; hostnames
and paths may still contain sensitive data. Guest `currentSrc` is not redacted.

## Bounds and remaining gaps

| Owner ceiling | Default |
| --- | --- |
| Registered image elements | 256 |
| Lifetime resource attempts | 128 |
| Concurrent transfers | 4 |
| Accepted response body | 8 MiB per image |
| Received response-body budget | 32 MiB per owner |
| Retained decoded pixels | 16 MiB shared across consumers |
| Decode work | 33,554,432 units per image |
| Source field/URL length | 4,096 UTF-16 units |
| Lifetime selection updates | 1,024 |
| Lifetime discovery/policy scan work | 2,000,000 visited nodes |
| Concurrent decode waits | 128 |
| Active request deadline | 10 seconds |

Callers can lower owner limits, never raise them. Received-byte accounting uses
response body sizes, not compressed wire bytes. It includes rejected bodies and can
cross the budget when an already-issued response arrives; queued transfers stop
once exhausted. The transport independently bounds bodies and total traffic.
Buffers for up to four in-flight responses and decoder scratch space are additional
to retained RGBA pixels. These are explicit component limits, not a total-process
RSS or Worker memory guarantee. `decodeWork` reports successful decoder work;
failed decodes still have the per-attempt ceiling and lifetime attempt bound.

This is a partial HTML image lifecycle, not full image-element conformance:

- Only explicit `image/png` HTTP(S) responses decode. Other formats, MIME sniffing,
  data/blob URLs, responsive `srcset`/`picture`, explicit CORS/referrer-policy
  attributes and the `Image()` constructor remain unsupported.
- Header or discovered meta CSP conservatively blocks image fetching; directive
  evaluation is not implemented. Mixed content is refused, not auto-upgraded.
- Source replacement clears previous dimensions immediately rather than retaining
  a separate current/pending image pair. Same-value reload rules, density correction,
  speculative loading, lazy loading and full HTML task ordering are not implemented.
- Native events remain untrusted under the existing event profile. Async handler
  tails retain the selected runtime's existing scheduler limitations. Released-SDK
  acceptance and the previously recorded media function-identity gap remain open.
- PNG color profiles and animation are reported but ignored as documented in
  `PNG-DECODING.md`. Loaded-image sizing/compositing is subsequently implemented in
  `IMAGE-LAYOUT.md`; object-fit, full accessibility and visible public-site acceptance
  remain future gates.

## Evidence

Final validation: `reports/image-resources-focused-final-2026-09-03.json` passes
all 2,663 tests across 109 explicit safe files, including 28 image-owner and seven
image-session cases. Package build, strict changed-test checking, sixteen-file lint,
seventeen-file formatting and package whitespace checks pass. No dependency is added.

`document-images.test.ts` and `image-session.test.ts` cover actual resource bytes,
shared requests, source replacement, decode cancellation, events, detached images,
base changes, budgets, malformed/unsupported responses, redirects, CSP, redaction,
session isolation and close behavior. Existing loader/network tests now assert real
image traffic rather than claiming it was not sent. Disabled script fetching stays
absent from that fixture.

`reports/image-resources-safejs-2026-09-03.json` records twelve passing assertions
through the production HTML loader, session image port and real experimental
SafeJS core. Parser code installs an image handler; image completion precedes
Window load. A later `src` change resolves the guest decode promise and mutates the
DOM. A second image shares the blue 5 x 4 RGBA buffer without refetching; a failed
source fires the real guest error handler. Closing the agent tab releases resources.
The largest command frame is 1,517 bytes. All responses are in-memory mocked data;
no live website, network socket or browser service is used.

`reports/image-resources-safejs-final-2026-09-03.json` and
`reports/image-resources-safejs-repeat-2026-09-03.json` repeat all twelve assertions
successfully after final fixes, including the live `document.images` collection.
Both retain the 1,517-byte maximum frame. The separate
`reports/image-resources-media-regression-2026-09-03.json` passes eleven existing
responsive agent/capture checks with maximum frame 1,348 bytes; it does not claim
that image pixels are rendered or that the known runtime alias gap is fixed.

The initial broad report, `image-resources-focused-2026-09-03.json`, retains 2,662
passes and one failed quota-cleanup assertion. It exposed a synchronous refresh
failure that skipped owner teardown. Refresh now halts the owner on that failure;
the targeted owner/session/PNG rerun passes all 214 tests. Final broad validation
is recorded separately rather than overwriting the failure.

## Next integration tasks

- [x] Native PNG codec, page-owned resources, live image state and agent inspection.
- [x] Loaded PNG inline/block image boxes with intrinsic dimensions and authored sizing (`IMAGE-LAYOUT.md`).
- [x] Shared native PNG compositing for document PNG/PDF and element captures (`IMAGE-LAYOUT.md`).
- [ ] Playground image preview and visible real-site image acceptance.
- [ ] Responsive sources, remaining image APIs/formats, fonts, SVG and canvas.

Primary reference consulted September 3, 2026: HTML image element and image-data
algorithms at https://html.spec.whatwg.org/multipage/embedded-content.html#the-img-element
and https://html.spec.whatwg.org/multipage/images.html#updating-the-image-data .
