# Website inventory: September 14 twenty-eighth update

This append-only update adds **one captured native diagnostic, zero live visits
and zero new hosts** after the twenty-seventh update's successful live man7 flow.
Historical capture paths, clocks and measurements remain unchanged.

| Host | September 14 native UTC | Runtime | Actual result |
| --- | --- | --- | --- |
| `news.ycombinator.com` | 16:18:22.688–16:18:22.907 | `cd62d4d1c6b09a7dec51a302f5a9511ab964c73d` | Original captured document loads; applicable word-break diagnostic disappears; `.morelink` geometry remains unsupported. |

Two original September 11 responses replay through the native loader with
42,364 decoded mocked bytes, zero wire requests and zero live fallback. The
single query finds e1261 (`?p=2`); no click or destination request occurs.
Formatting issue occurrences decrease from 135 to 134 by removing one applicable
unsupported-property declaration. Remaining background, presentation-hint,
image and table-cell-overflow issues are not suppressed or fixed by this run.

Native execution, verifier and independent parent comparison pass for diagnostic
completion only. All native/process/private owners close; no script, SafeJS,
credential, device, TTY/PTY or challenge probe runs. This is not a successful HN
link flow, full rendering acceptance, fresh HN visit or performance measurement.

Report: `HN-WORD-BREAK-RECHECK-SEPTEMBER-14.md`.
Evidence: `/dev/shm/agent-browser-hn-word-break-recheck-september14/`, with separate
parent closeout and durable copies under
`node_modules/.cache/native-validation/hn-word-break-recheck-september14/`.
The feature's 23,935 selected native passes coexist with two explicitly failing
soft-hyphen characterizations. That shared sizing defect and the broader browser,
website, research, provider/passkey and performance gates remain open.
