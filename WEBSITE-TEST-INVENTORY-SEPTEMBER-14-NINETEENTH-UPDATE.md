# Website test inventory — September 14, nineteenth update

Append-only update to the eighteenth and preceding inventories. **No new live
website or domain is tested.** Historical execution paths and outcomes remain.

| Website/page | New check | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture on committed `bce6e10`, 11:49:00 UTC | Initial navigation stops at the first uncaptured background SVG; no query, click or destination request. Original overall verification fails its immediate cleanup snapshot |

Nineteen original responses serve 270,288 bytes; attempt20 is denied before
transport for `high.712917a113e51658.svg`. Zero wire, scripts, acquired SVG bytes,
rendering, fallback or retry. This is a closed-corpus boundary, not Cloudflare.

A fact-only audit verifies containment, unchanged evidence and process absence,
while explicitly leaving captured acceptance and logical cleanup unproven.
Separate native cancellation regressions pass; they do not rewrite this failure.
See `MDN-BACKGROUND-IMAGE-ABORT-SEPTEMBER-14.md` and
`BACKGROUND-NAVIGATION-ABORT.md` for exact scope and measurements.

Next: bounded cleanup-aware capture supervision, then separately authorized asset
acquisition and resumed meaningful MDN interaction testing. Original research,
Wikipedia geometry, broader live interactions, credentials/providers/passkeys/
devices, SafeJS, socket/TTY and challenge-handling gates remain open.
