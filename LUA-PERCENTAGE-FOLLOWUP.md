# Parent verification of the percentage-table Lua replay

The new one-session replay uses the released 1478cd7 native runtime, whose
historical gate has 11901 passing tests. It does not use the later 61ca986 CSS
recovery release, and the previous two-run comparison remains closed.

The parent independently reproduces all 16 read-only checks on September 12,
2026 at 05:16:30 UTC. Nine actual local Git command outputs (the pinned tree and
eight exact blobs) agree with the archived proof before the socket-denied verifier
runs. The verifier launches no browser, uses no HTTP and writes no evidence files.
It verifies all 120 final-ledger entries and exact membership of 121 artifacts,
the original capture/replay/correction seals, the release inventories, actual
owner cleanup, execution bounds and corrected native CSS source spans.

## Observed improvement and remaining failure

- Exactly one new native page session replays four unchanged captured responses;
  all four are mocks, with zero live HTTP requests. One document commits.
- A current-DOM-discovered `manual.html` link receives one genuine click, which
  fails at the native formatting-profile guard before a destination request.
- Collapsed-border guards fall from seven in the recorded 11784 comparison to
  zero on 11901. The independent presentation-hint and table display guards remain.
- Raw CSS issues remain 10 invalid values, 11 unsupported properties and one
  unsupported selector; applicable counts remain 5, 5 and 1. No CSS is stripped.
- Formatting work rises from 30299 to 31358 for the same 2381 formatting nodes.
  Native DOM serialization and body text remain byte-equal; bounded extraction
  still fails at its unchanged structure limit. This is not a speedup claim.
- Document/image/event/control owners and session resources close as recorded.
  This is sampled cleanup evidence, not process-wide leak freedom.

Full evidence: `LUA-PERCENTAGE-TABLE-REPLAY.md`. The unchanged native run window is
September 12, 2026, 05:09:11.740–05:09:12.597 UTC, distinct from the original Lua
HTTP capture at 03:03:55.333–03:03:57.239 UTC and the parent audit.

Report SHA256:
`fe4a086023586aa1e978f333c1104e238c285dcc94cb3187e4d3892c107c7159`.
Final ledger SHA256:
`df4abac7a47f7b4cca9a76b341608dd9c27f1e5b49b52b2a970dc322efb8fa48`.
Parent proof:
`node_modules/.cache/native-validation/css-rule-work-september12/parent-lua-verification`.

The captured-site result demonstrates the percentage-table guard reduction,
not a functioning Lua manual flow or full table/CSS parity. It adds no new host;
the 71-host inventory still counts attempted hosts, not working websites. Live
flows, research completeness, provider/device and challenge gates remain separate.
