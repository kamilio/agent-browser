# Website test inventory — September 14, thirteenth update

Append-only update to the twelfth and preceding inventories. Historical paths,
measurements and failures remain unchanged. **No new live website or domain is
tested in this update.**

| Website/page | New test | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture replayed natively at 08:53:38 UTC on committed runtime `565aa1e`; formatting and cached CSS diagnostics | Completed and verified; applicable unknown-property occurrences 68→64, raw 132→126, overlapping formatting occurrences 210→206. No click, width/geometry resolution, raster or live request |

The source-only loader serves the same 19 original resources/270,288 decoded
bytes once each. One native BrowserSession navigation, one default formatting
build, one cached diagnostics read, one hint query and unchanged bounded native
attribution. No scripts, credentials, new assets or recorded JS guard attempts;
kernel denied-syscall telemetry is not collected.

All formatting metrics and other raw/applicable issue counts stay unchanged.
Sampling remains nonexhaustive: 128 retained, 31 omitted rather than 37. Cascade
work increases 2,151 units; no speed or memory claim. Real box/pixel/hit behavior
belongs to the separately tested implementation, not this diagnostic inspection.

Exact scope, baseline, evidence hashes and durable-copy provenance:
`MDN-LOGICAL-BLOCK-REPLAY.md`. The final selected native gate has 22,926 passes
and two unchanged exclusions; it was rehashed, not rerun for this page check.
The earlier 22,910-pass development revision is not the bound runtime.

Next: recheck the existing Python two-page capture on current code for an actual
interaction on a different site. Prior Python success and Wikipedia's geometry
failure are historical, not fresh results here. MDN's uncaptured destination,
missing assets, original research, broader live sites/forms, credentials/passkeys/
devices, SafeJS, socket/real terminal and challenge gates remain open. Goal active;
nothing pushed.
