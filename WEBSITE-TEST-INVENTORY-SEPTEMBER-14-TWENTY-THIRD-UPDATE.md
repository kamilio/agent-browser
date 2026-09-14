# Website inventory: September 14 twenty-third update

This append-only update adds **no live requests and no new host**. It records
one new native diagnostic against the original Wikipedia portal capture.
Historical reports, capture paths and measurements remain unchanged.

| Host | September 14 UTC | Scope and outcome |
| --- | --- | --- |
| `www.wikipedia.org` | 13:51:28.935–13:51:29.302 | One captured native load, formatting/diagnostics, search lookup and geometry attempt on `39b55d9`; diagnostic completes, geometry remains unsupported. |

Overlapping formatting issue occurrences fall **137→131** and applicable
unsupported-property occurrences **63→57**. Applicable invalid-value occurrences
remain **2**. Input `e239` is found and has a formatting node, but this is not
a usable search flow: there is no typing, click, submission, raster, sprite
acquisition or network request. These counters are not a speed benchmark.

The underlying native opacity feature performs actual grouped compositing,
with 244 new passing cases. The audited native gate passes 23,757 with zero
failures and the same two exclusions. It explicitly records one migration of an
existing unsupported-effect fixture; it does not count that as a new case.
Supplemental controls add 264 distinct existing cases. Native tests are not
additional websites or evidence for live, credential, device or SafeJS gates.

All 12 diagnostic verifier checks and the independent parent metadata/hash audit
pass. The original 33-entry seal matches, and the final 36-entry seal and evidence
are preserved byte-for-byte. See WIKIPEDIA-OPACITY-DIAGNOSTICS-SEPTEMBER-14.md
for exact measurements, scope and durable evidence paths.

Layered background, clipping, appearance, direction and other compatibility gaps
remain. Next work should broaden captured-host coverage while continuing genuine
rendering fixes. Original research, fresh live-site coverage, provider/passkey
acceptance and challenge-handling gates remain open; no completion is claimed.
