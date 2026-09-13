# Website test inventory — September 13, forty-second update

**Adds native rounded CSS and three unchanged captured-site checks, not new
domains or successful live website flows.** Historical coverage remains in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-FORTY-FIRST-UPDATE.md` and its predecessors.

| Site/scope | New observed result | Still not established |
| --- | --- | --- |
| `docs.python.org/3/`, original eight-resource replay | Unsupported properties 7→4; original Tutorial click attempted | Successful click; remaining CSS/value/position/overflow support |
| `www.wikipedia.org`, unchanged captured portal | Unsupported properties 85→65; original input geometry attempted | Successful geometry or full-asset live flow |
| `www.kernel.org`, original HTML and two stylesheets | Raw/applicable CSS issues 61/25→53/20; exact radius-only attribution delta | Full-resource geometry, click or completion of the earlier live scope |
| Native rounded-CSS integration | 184 new cases; 21,517 passed, zero failed, two unchanged skips | Clone, unequal-height slices, legend-bearing fieldsets or browser-wide conformance |

All three observations occur on September 13, 2026, 23:23–23:25 UTC and make
**zero new HTTP requests**. Same source bytes and unchanged non-radius issues
are preserved. Observation process success is distinct from user-flow success:
Python's click and Wikipedia's geometry still fail explicitly.

The native gate selects 419 files / 418 strict roots from a 773-entry manifest;
354 files remain unselected. This is not a device/provider, SafeJS, socket,
real-TTY, benchmark, challenge-solving or whole-site acceptance gate. No research
topic is newly declared complete.

Implementation/profile: `ROUNDED-CSS-DOCUMENT.md`.
Exact scopes, timestamps, remaining failures and evidence hashes:
`ROUNDED-WEBSITE-REPLAYS-SEPTEMBER-13.md`.

Next: remaining website-specific blockers and original-resource flows, with
performance measured separately. Overall goal **ACTIVE**. Changes are committed
locally; pre-existing edits are preserved and nothing is pushed.
