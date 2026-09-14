# Website inventory: September 14 twenty-second update

This append-only update adds **no live requests or new host**. It records one
current captured Wikipedia diagnostic and native extraction of an existing W3C
capture. Historical evidence and availability claims are not rewritten.

| Host | September 14 UTC | Scope and outcome |
| --- | --- | --- |
| `www.w3.org` | 12:42:07.189–12:42:07.516 | Native offline extraction of captured CSS Text section 7.1; source evidence only, not layout/CSSOM conformance. |
| `www.wikipedia.org` | Before the 13:13 observation | Initial harness identity check fails before any browser load; retained as a preparation/execution failure, not a tested page. |
| `www.wikipedia.org` | 13:13:00.256–13:13:00.631 | One native captured load, formatting/diagnostics, search lookup and geometry attempt; diagnostic completes but geometry remains unsupported. |

Wikipedia uses audited commit `6e95ddc` and the unchanged 119,573-byte original
portal capture. Overlapping formatting occurrences fall **138→137**, with
unsupported-property occurrences **64→63** and invalid-value occurrences still
**2**. Search input `e239` is found but not usable through supported geometry.
There is no form submission, raster or sprite acquisition. See
WIKIPEDIA-WORD-SPACING-DIAGNOSTICS-SEPTEMBER-14.md for exact measurements, preserved
first failure and explicit final-output sealing correction.

W3C extraction and its independent local evidence audit are documented in
WORD-SPACING.md and the durable `word-spacing-september14` evidence archive.
It interprets already captured text through this browser, without scripts or
wire requests, and does not establish current publisher content or conformance.

The genuine word-spacing feature adds 173 native passing cases. The final gate
passes 23,513 with the same two exclusions; supplemental controls add 264 distinct
existing cases. These are not additional websites or live acceptance. Original
research, broader site coverage, credentials/passkeys, SafeJS, device and
challenge-handling gates remain open.
