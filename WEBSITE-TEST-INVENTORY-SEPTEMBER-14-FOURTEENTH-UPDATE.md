# Website test inventory — September 14, fourteenth update

Append-only update to the thirteenth and preceding inventories. Historical
paths, measurements and failures remain unchanged. **No new live website or
domain is tested in this update.**

| Website/pages | New test | Result and boundary |
| --- | --- | --- |
| Python documentation homepage → Tutorial | Original two-page capture replayed at 09:12:45 UTC on runtime `565aa1e` | Passed ordinary discovered-link click, replacement document and native title/h1 checks; no live request or extra destination action |

The native browser rediscovers the Tutorial link, uses normal click geometry/hit
testing and commits the destination. Nine original resources/109,017 unique
bytes produce 16 responses/161,647 served bytes. No denial, fallback, new asset,
script or wire request; owners and process group close cleanly. Prepared result
verification and independent parent verification pass.

Compared with the actual 04:41 UTC Python flow on `23e988d`, navigation/content,
document sizes, loader-time scalar stylesheet metrics and raw issue counts are
unchanged. Each phase still reports 22 unsupported CSS properties and five
invalid/unsupported values. This is not a full formatting/raster audit or a
controlled performance comparison. The selected 22,926-pass/two-exclusion
native gate is rehashed, not rerun.

See `PYTHON-CURRENT-REPLAY-SEPTEMBER-14.md` for exact scope, original paths,
measurements, hashes and durable-copy provenance. The earlier missing Python
destination failure is preserved, not relabeled as this success.

Next: observed inline logical-spacing/unit gaps, with native regressions and a
separate captured-site recheck. Prior Wikipedia/MDN interaction limitations,
original research, broader live sites/forms, credentials/passkeys/devices,
SafeJS, socket/real terminal and challenge gates remain open. Goal active;
nothing pushed.
