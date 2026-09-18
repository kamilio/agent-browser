# Classic native Image constructor

Explicit classic page runtimes now provide `Image` when their native document
binding has `createElement`. Construction returns the existing native `img`
capability, not a second DOM or fabricated image. The factory is captured during
initialization, so later publisher replacement of globals does not replace the
native constructor's document capability. Closing the document or runtime revokes
retained construction and property access. Legacy/nonclassic defaults are unchanged.

Detached images use the existing bounded image owner, real decoder, shared resource
cache, load/error callbacks, CSP checks and cancellation. Constructor dimensions
use guest numeric conversion followed by unsigned 32-bit conversion. Native
width/height setters accept primitives only; object/function coercion at that
synchronous boundary is intentionally unsupported. Getters use native dimension
attributes or decoded intrinsic dimensions, not computed CSS layout sizes.

This is not full HTMLImageElement inheritance. Live-host prototype reflection,
`Image.prototype`/`instanceof` conformance and subclassing are not promised. The
actual SDK rejects prototype reflection; no prototype emulation bypass is added.

## Evidence

- Parent native integration: 342 passing tests in 12 explicit native files;
  build, types and formatting pass. Seven new lint issues were corrected. The
  remaining whole-file lint failure is the previously documented, unchanged
  `ScriptDom.ranges` assignment-in-expression.
- ASSETS27: actual public-SDK synthetic construction, PNG decode, shared-resource
  load callbacks, retained constructors, failure/CSP handling and closure pass.
  Prototype rejection is checked explicitly. The earlier failed aggregate test
  incorrectly assumed prototype reflection support and remains preserved.
- Source-linked CDN PNG and vbPreload captures return HTTP 200 on September 18,
  2026 at 14:22:02.441 and 14:22:03.283 UTC respectively, with 149 and 1388 bytes.
  Capture success is not reader extraction or script execution.
- Captured inline startup reaches the core externals script request with the
  corrected native classic-fetch fixture, but the combined CDN-image assertion
  still fails. The fixture confirms `URL` and `URLSearchParams` are absent.
  No full application, live-CSP navigation, meeting or audio success is claimed.
