# Website test inventory — September 13, thirty-eighth update

**Wikipedia's remaining inline-alignment guards fall from three to zero. Its
full-page geometry still fails.** This checkpoint adds no live requests or domains.

| Scope | Observed result | Not established |
| --- | --- | --- |
| Original Wikipedia portal, native attribution | One bottom-aligned heading and two top-aligned inline-block controls identified | Geometry or live acceptance |
| Native line-edge implementation | 72 new cases; 21,169 passed / zero failed / two unchanged skips | All-manifest coverage, general inline-subtree alignment or separate device gates |
| Original Wikipedia portal, unchanged-source replay | Alignment guards3→0; total issues202→199; CSS132unchanged | Input geometry, raster, search submission or navigation |
| Earlier website/research coverage | Historical reports preserved | No fresh Python, Internet, HTTPBin, W3C or other-site run here |

Attribution is at **21:09:43 UTC**; replay is at **21:28:05 UTC** on September13,
2026. Each uses one native load of the unchanged119573-byte response. Combined:
four queries, two formatting inspections, nine generated-style reads and one
geometry attempt; zero HTTP, actions and rasters. No captured content is stripped.

The final native gate selects413files/412strict roots from767manifest entries.
Its two skips and354unselected entries remain explicit. Earlier failed test lanes
are retained, not hidden. Single-run timings and work counts are not speedups.

Details: `WIKIPEDIA-INLINE-EDGE-REPLAY-SEPTEMBER-13.md` and
`INLINE-EDGE-ALIGNMENT.md`. Previous coverage remains in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-SEVENTH-UPDATE.md` and its predecessors;
this is an incremental checkpoint, not a replacement comprehensive inventory.

Remaining work: real CSS/direction/overflow/element requirements, Python/Internet
original-asset pointer flows, varied-site acceptance and repeatable performance.
Hardware/benchmark/Astra/verified Reddit-Poe research is not complete. Credential
providers, real passkey devices, SafeJS, sockets and real TTY/PTY retain separate
acceptance gates. No push. Overall browser goal: **ACTIVE**.
