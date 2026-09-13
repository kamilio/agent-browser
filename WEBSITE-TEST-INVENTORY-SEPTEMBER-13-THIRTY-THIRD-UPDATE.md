# Website test inventory — September 13, thirty-third update

**The Internet checkbox page has fewer CSS guards, but the real pointer click
still fails.** No new website, live request or successful interaction is claimed.

## Added coverage

| Scope | Result | Not established |
| --- | --- | --- |
| Same-capture, complete-asset native checkbox replay | Applicable property guards 11→8; raw property diagnostics 374→359 | Full live-page or pointer acceptance |
| Native semantic inverse/restore | False→true→false; six untrusted events | A working pointer click |
| One genuine native pointer click | Fails before events at remaining CSS guards | Successful checkbox interaction |
| New alias unit/regression validation | 134 new cases; all 652 focused candidate cases pass | Broader vendor-prefix support |
| Fresh selected native release gate | 20,672 passed / zero failed / two unchanged skips | 358 unselected manifest entries or separate acceptance gates |

The new replay runs September 13, 2026, 18:33:38.576–18:33:38.993 UTC, with
**zero HTTP requests**. All four September 11 HTML/CSS/PNG resources, 391,809 bytes,
remain unchanged. The earlier September 13 fresh HTML-only GET is not counted
again. Prior inventories and reports retain their own paths and measurements.

## Progress and limits

`-moz-box-sizing` and `-webkit-box-sizing` now share real canonical native state,
cascade, CSSOM and geometry. The action harness does not filter CSS, substitute
semantic actions for pointer clicks or fabricate coordinates. Captured formatting
observations are unchanged; remaining property, at-rule, selector and layout
guards still prevent the full interaction.

The single instrumented offline observation uses 0.41 seconds and **134.36 MiB
peak RSS**; this is not a repeated performance result or a speed/memory improvement.
The selected gate covers 402 files / 401 strict roots / 760 manifest entries.
The increase of 274 passing cases consists of 134 new alias cases and 140 existing
cases newly selected. Two stale word-wrap test expectations were corrected against
the already-existing canonical property list; initial failures remain preserved.

Implementation: `CSS-BOX-SIZING-ALIASES.md`.
Actual replay, remaining guards and pinned evidence:
`INTERNET-CHECKBOX-BOX-SIZING-SEPTEMBER-13.md`.
Previous live-source and attribution checkpoint:
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-SECOND-UPDATE.md`.

## Next coverage

Continue real navigation/form tests on varied pages while retaining failures;
separate fresh network observations from deterministic full-asset replays.
Internet pointer flow, Wikipedia full geometry and Python Tutorial click remain
open. Repeatable performance and safe access-block/human-challenge handling remain
open. Hardware/benchmark/Astra research freshness and verified Reddit/Poe opinions
are still incomplete. No challenge bypass or fingerprint spoofing is introduced.
Credential/provider, passkey-device, SafeJS, socket and TTY gates remain separate.
Pre-existing working-tree edits remain preserved. Overall browser goal: **ACTIVE**.
