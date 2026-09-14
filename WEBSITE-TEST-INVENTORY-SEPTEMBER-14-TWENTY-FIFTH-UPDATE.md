# Website inventory: September 14 twenty-fifth update

This append-only update adds **one captured attempt on one previously tested
host, zero new hosts and zero live requests**. It supplements, not replaces,
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-TWENTY-FOURTH-UPDATE.md` and earlier website
inventories. Only this native browser interprets the captured page.

| Host | September 14 native UTC | Runtime | Actual outcome |
| --- | --- | --- | --- |
| `man7.org` | 14:58:56.168–14:58:57.018 | `bdb923d11ba2f1ea9182263714acb6c2be217c91` | ls(1) commits; date(1) is rediscovered; one genuine click attempt passes the previous table-width guard, then fails on percentage cell-descendant heights. |

Four unchanged September 12 responses replay once each: **39,562 decoded bytes**.
There is one initial navigation/commit, two selector queries, 64 inspected
anchors, one attempted click, zero destination requests/commits and zero wire
traffic. The original optional tracker is denied locally; it is not a visited
host or a challenge. No scripts, credentials, providers, passkeys, devices,
SafeJS, real TTY/PTY, extra assets, forced clicks or direct-navigation fallbacks
are exercised.

## Progress and remaining limits

The prior owner-corrected check stopped at `Percentage table role sizing
requires cycle resolution`. The exact same workload on the validated
percentage-container-width implementation now stops later at `Percentage cell
descendant heights require table reflow`. This is a narrower, actionable native
layout blocker, not successful navigation, a destination capture miss, or
whole-site acceptance. The uncaptured date(1) response remains an independent
limit that this observation does not reach.

The browser/supervisor exit 1. All **18 evidence/cleanup checks pass**, including
unchanged runtime and fixture inventories, bounded observation and owner/process
cleanup. Verifier success is explicitly not site success. The parent also
records one argument-assertion error before any run lock or browser spawn; it is
not another website attempt.

Full report: `MAN7-TABLE-WIDTH-RECHECK-SEPTEMBER-14.md`.
Evidence: `/dev/shm/agent-browser-man7-table-width-september14/`, with a sealed
byte-verified durable copy under
`node_modules/.cache/native-validation/man7-table-width-september14/`.
Prior reports, captures and their measurements remain unchanged.

Next priorities are the actual percentage-height semantics exposed here,
Hacker News word breaking/layered backgrounds, and complete captured/live flows
across more hosts. Do not count this repeated host as added coverage, infer
performance improvement from elapsed time, or claim the outstanding research,
provider/passkey, device, challenge or broader browser gates are complete.
