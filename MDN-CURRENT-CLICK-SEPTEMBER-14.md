# Captured MDN ordinary click — September 14, 2026

## Result: still blocked by native layout

The native observation runs **10:04:18.305–10:04:18.726 UTC** on committed
runtime `be3aaf699412909e0675c10f3e6487795c61b1f2`. Initial navigation succeeds;
the ordinary discovered-link click fails before destination admission. This is
an offline replay of the original September 11 capture, not new live browsing.

`main a[href]` returns 49 links using 50,087 query work and one structural build
over 2,731 DOM nodes. Two links match `Document/querySelectorAll`; the first is
rediscovered as `e1673`, text `querySelectorAll()`. Its normal `BrowserSession.click`
reaches scroll/layout admission and throws `AgentBrowserError`, code `unsupported`.
No semantic-navigation fallback, forced click or geometry guard bypass is used.

The exception names these width-resolution blockers:

| Issue | Occurrences |
| --- | ---: |
| Unsupported CSS at-rule | 14 |
| Unsupported/invalid CSS value | 15 |
| Unsupported CSS property | 54 |
| Unsupported/invalid CSS selector | 2 |
| Unsupported HTML presentation hint | 1 |
| Unsupported element layout | 1 |
| Unsupported SVG layout | 1 |

These are overlapping capability counts, not unique affected nodes. The earlier
ordinary-click observation at 05:17:20 UTC on `23e988d` named 78 unsupported
property occurrences; the current exception names 54. Both clicks fail. Do not
compare this coordinated-layout exception directly with the 196 default-formatting
occurrences in `MDN-INLINE-SPACING-REPLAY.md`: they use different layout profiles.

The first failure is `native-discovered-link-click`; `observationComplete` is
true, but `flowPassed`, `destinationNavigationCompleted` and
`actionAdmittedToNavigation` are all false. Nineteen accepted fixture requests
serve 270,288 bytes. There are zero destination requests, denied fixture requests,
wire requests, script executions or recorded JavaScript guard attempts. This
is not a Cloudflare challenge or a destination transport failure.

## Scope and verification

The original corpus and URL/status/header/body identities are unchanged. The
destination is absent from the corpus: reaching it would cause a terminal
pre-transport denial, not a successful destination load. The supervisor and
network/process restrictions match the historical click lane. Only workload
provenance and fixture-location binding change; historical cascade limits remain
explicit, so this is not a controlled single-change performance benchmark.

Supervision runs 10:04:18.181–10:04:18.740 UTC and exits 1 for the observed native
failure, with 51,772 output bytes and no timeout, cap, spawn or stream failure.
Process group 1494251 is absent afterward; owners and private directories close
cleanly and source/fixture/framework integrity checks pass. Empty JavaScript
guard records are not kernel denied-syscall telemetry.

The original verifier fails one cleanup assertion because its own `lstatSync`
import is missing. Its code and failed `VERIFICATION.json` remain unchanged.
`verify-result-corrected.mjs` changes only that import and its exclusive output
filename; all eight checks and three observation checks pass on the **same run**.
Independent parent verification passes. No browser rerun occurs for this repair;
successful evidence verification does not turn the failed click into a pass.

The prior native gate is rehashed, not rerun: 22,991 passes, zero failures, two
unchanged exclusions, 455 selected files, 1,363 source and 2,184 compiled files.

Original lane: `/dev/shm/agent-browser-mdn-current-click-september14/`.
Durable copy: `node_modules/.cache/native-validation/mdn-current-click-september14/`.
Original paths, timestamps and results are retained; copying creates no new run.

| Artifact | SHA256 |
| --- | --- |
| `before-RESULT.json` | `accd47244dc1fd05f4b93e22c44c3ae1feb8bd41a70c5b0acf1d116eda1c7e1e` |
| Original failed `VERIFICATION.json` | `b0f6c543c583abae65ed7f669eed8360a86c906846820af2afa4d0283f661ce8` |
| `VERIFICATION-CORRECTED.json` | `3eeb0da1435e932dd552307795d0b1eb776e496ab608ee0566d0ad0e5c22b976` |
| `PARENT-VERIFICATION.json` | `e41b2d49833ba6effe99c2e7d09bf3207ee10ef954f35813dfffbf2152e4308d` |
| `EVIDENCE.sha256` | `a9b04aa938bb84c72b17b70e001044abb46f750f15ddcf51fdc957d2852cb58a` |

## Implementation direction and remaining gates

Source tracing in the lane's `ROOT-CAUSE.md` identifies whole-document capability
admission before pointer dispatch. Count-only issue maps and truncated diagnostic
samples cannot prove that unsupported content is harmless to the clicked target.
Keep fail-closed geometry and hit testing; implement missing behavior instead.
Actual text letter spacing is the next bounded candidate, not a promised MDN fix.

Wikipedia geometry, broader live sites/forms, original four-topic research,
credential/providers/passkeys/devices, SafeJS, socket/real terminal and challenge
acceptance remain open. The overall browser goal is active; nothing is pushed.
