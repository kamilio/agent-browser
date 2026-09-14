# Website test inventory — September 14, eleventh update

Append-only update to the tenth and preceding inventories. Historical paths,
measurements and failures remain unchanged. **No new live website or domain is
tested in this update.**

| Website/page | New test | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture replayed natively at 07:55:01 UTC on runtime `fefbb8b`; formatting and cached CSS diagnostics | Completed and independently verified; applicable unknown-property occurrences 70→68, total overlapping formatting occurrences 212→210; retained font:inherit rejection gone; no click, width resolution, geometry or raster |

The run serves 19 original responses/270,288 bytes once each with zero wire,
denials, scripts, credentials or additional assets. Sampling remains bounded
and nonexhaustive. Ten formatting issue categories remain; all formatting metrics
and the other applicable issue counts are unchanged.

Evidence and hashes: `MDN-FONT-WIDE-REPLAY.md`. Implementation and 22,741 selected
native passes/two unchanged exclusions: `FONT-WIDE-INHERITANCE.md`. These are
different acceptance gates, not interchangeable success claims.

Next is a separately scoped current-runtime diagnostic on the existing Wikipedia
portal capture, not an assumption that repeated MDN observations establish varied
website coverage. No fresh Wikipedia result is claimed here. MDN's destination
remains uncaptured, and earlier Python two-page success is not a new observation
in this update. Original research, broader live-site/forms, credentials/passkeys/
devices, SafeJS, socket, real terminal and challenge gates remain open. Historical
evidence must not be deleted to make space for new checks. Overall goal active;
nothing pushed.
