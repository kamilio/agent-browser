# Website test inventory — September 14, fifteenth update

Append-only update to the fourteenth and preceding inventories. Historical
paths, measurements and failures remain unchanged. **No new live website or
domain is tested in this update.**

| Website/page | New check | Result and boundary |
| --- | --- | --- |
| MDN, Document.querySelector | Original capture replayed at 09:54:18 UTC on committed runtime `be3aaf6`; formatting and cached diagnostics | Verified; applicable unsupported-property occurrences 64→54, raw 126→113, total overlapping formatting occurrences 206→196. No click, width/geometry/raster probe or live request |

Nineteen original resources supply 270,288 decoded bytes once each. One native
navigation, formatting build, cached diagnostics read and hint query; unchanged
bounded attribution. Inputs remain stable and owners/process group close.

Formatting metrics and all other raw/applicable issue counts are unchanged.
Samples remain nonexhaustive: 128 retained, 18 omitted rather than 31. Cascade
work rises by 1,305 and generated-content work by 117; no performance claim.
The absence of a retained inline-spacing rejection does not establish complete
coverage.

Exact scope, original evidence, hashes and durable-copy provenance:
`MDN-INLINE-SPACING-REPLAY.md`. The 22,991-pass/two-exclusion native gate is
rehashed, not rerun. Real rectangle/pixel/hit behavior belongs to the separate
synthetic implementation tests, not this captured formatting diagnosis.

Next: a separately scoped current-runtime MDN ordinary-click check, retaining
the original corpus and fail-closed missing-destination behavior. Prior click
and Wikipedia geometry failures remain failures until rechecked. Original
research, broader live sites/forms, credentials/passkeys/devices, SafeJS,
socket/real terminal and challenge gates remain open. Goal active; no push.
