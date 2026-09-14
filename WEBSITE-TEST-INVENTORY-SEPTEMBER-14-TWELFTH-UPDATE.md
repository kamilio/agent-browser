# Website test inventory — September 14, twelfth update

Append-only update to the eleventh and preceding inventories. Historical paths,
measurements and failures remain unchanged. **No new live website or domain is
tested in this update.**

| Website/page | New test | Result and boundary |
| --- | --- | --- |
| Wikipedia portal | Original capture loaded natively at 08:07:54 UTC on runtime `fefbb8b`; formatting, cached CSS diagnostics, search input lookup and one geometry attempt | Diagnostic observation verified; total overlapping formatting occurrences 167→160 versus September 13 radius replay. Geometry remains unsupported; no search submission, click, destination, raster or live request |

One original body/119,573 decoded bytes is consumed by native `loadBrowserDocument`,
not `BrowserSession` navigation. No scripts, image/stylesheet callback, recorded
JavaScript guard attempts, credentials or additional assets. Kernel denial
telemetry is not collected. The search input is found, but
width-resolution guards reject its rectangle. This is not a passing site flow.

Formatting CSS-property diagnostic occurrences decrease 65→64 and overflow occurrences
7→1; other issue categories stay unchanged. DOM/formatting sizes and three
deferred subtrees stay unchanged; formatting work increases by three units.
The first current native CSS snapshot for this page retains 128 samples and
omits 14. It exposes sprite backgrounds, transitions, opacity, transforms and
other real gaps without interpreting captured bodies outside the browser.

Evidence, exact scope, hashes and durable-copy provenance:
`WIKIPEDIA-CURRENT-DIAGNOSTICS-SEPTEMBER-14.md`. The reused 22,741-pass selected
native gate/two exclusions was rehashed, not rerun; it is not live-site evidence.
New RAM artifacts are copied byte-for-byte to project cache after space recovers;
original execution paths and historical reports are not rewritten.

Prior MDN/Python observations remain historical, not fresh tests in this update.
MDN's destination and Wikipedia's missing sprite/logo assets are not silently
fetched. Original research, broader live sites/forms, credentials/passkeys/devices,
SafeJS, socket, real terminal and challenge gates remain open. Continue actual
native behavior and regression work, not diagnostics-only syntax acceptance.
Overall goal active; nothing pushed.
