# Captured MDN background cancellation: bounded cleanup

On September 14, 2026, a new captured MDN observation ran from
12:13:35.308 to 12:13:35.674 UTC on commit
`b5d2efdadf208457ca04345ced94ec093ab5fa35`. It verifies actual post-close
settlement, not successful navigation. The earlier failed immediate-cleanup
observation in MDN-BACKGROUND-IMAGE-ABORT-SEPTEMBER-14.md remains unchanged.

## Page result

The native browser interpreted the original September 11 HTML/CSS corpus. All
19 captured responses were used once, serving 270,288 decoded bytes. Attempt 20
stopped before transport at the same uncaptured background resource:
`https://developer.mozilla.org/static/client/high.712917a113e51658.svg`.

Initial navigation did not complete. There were zero queries, clicks, formatting
passes, destination requests, scripts or wire requests. The original corpus was
not extended; no SVG bytes were acquired or rendered. The blocker is a capture
boundary, not evidence of a Cloudflare challenge or an access-control workaround.

## Actual cleanup observation

The separately sealed harness preserves synchronous close, then reads existing
owner metrics for at most 1,000 ms / 1,002 samples. It neither force-closes the
candidate document nor clears counters. Image-owner references are retained only
after normal loader configuration. No page action is allowed during this wait.

| Metric | Immediately after close | Final sample |
| --- | ---: | ---: |
| Document nodes | 2,731 | 0 |
| Session pending loads | 1 | 0 |
| Active request-queue leases | 1 | 0 |
| Image-owner elements / resources | 43 / 7 | 0 / 0 |
| Image-owner active / queued work | 4 / 3 | 0 / 0 |
| Document-close notifications | 0 | 1 |
| Loader active | true | false |
| Image owner closed | false | true |

Cleanup settled by the second sample after 1.2483399999999847 ms. This is one
observed wait duration, not a latency guarantee or performance comparison.
Decoded image bytes and actual transport activity were zero in both samples.
The owner's seven scheduled resource requests are not seven adapter/wire calls.
Navigation/query/click/formatting/script/adapter counters did not change while
waiting. Final image resources, waiters, jobs, queue leases and document nodes
were zero; session, transport, cookies and image owner were closed.

Thus this new run demonstrates eventual cleanup of its aborted candidate. It
does not prove later settlement in the older run, whose verifier remains failed.
No production code changed: b5d2efd added five synthetic regression cases, and
its audited compiled runtime is byte-identical to the prior background runtime.

## Verification and containment

The prepared verifier passes nine integrity/containment/cleanup checks and three
first-blocker checks. Parent verification passes, retaining
`fullNavigationAcceptance: false`. The browser exits 1 for its preserved blocker;
that exit is not represented as a successful navigation. A separate parent
check rehashes all 49 sealed evidence artifacts, verifies the unchanged worktree
and confirms process-group absence.

Supervisor interval: 12:13:35.184–12:13:35.689 UTC, PID/process group 1582533,
43,713 output bytes. No timeout, output-cap, stream, integrity or private-directory
cleanup errors. Empty private HOME/TMP directories were removed. JavaScript
network/process guard attempts were empty; kernel denied-syscall telemetry was
not collected. No live website, credential/provider, passkey/device, SafeJS,
standalone socket or real TTY/PTY acceptance is implied.

A read-only subagent review found an inherited verifier restriction to the old
unsupported-click error. It was corrected before sealing to preserve any actual
first-blocker category, without weakening the real cleanup requirements. The
prepared source, review, scope, guards and verifiers are retained in the lane.

The 23,340-pass native gate with two unchanged exclusions was rehashed, not rerun
for this observation: 466 selected files, 465 strict roots, 2,901 source inputs
and 2,192 compiled files. See BACKGROUND-NAVIGATION-ABORT.md for that execution.

## Evidence and next steps

Original execution lane:
`/dev/shm/agent-browser-mdn-background-settlement-september14/`.
Durable byte-identical evidence copy:
`node_modules/.cache/native-validation/mdn-background-settlement-september14/`.
Copying is preservation, not another browser execution.

| Artifact | SHA-256 |
| --- | --- |
| before-RESULT.json | 4f9f6fe4abf9532bce4f1efa9163d2586680bdc335adcf4a08bb2177ea254939 |
| VERIFICATION.json | 2af8b6a33635d83f3ceaceef6500c7a070b0eed90f4b7152f4c0343901b00acc |
| PARENT-VERIFICATION.json | c8b76a898f38df5b30efc82c05106fd0c9035c0497f45a386896d3aee65b3770 |
| EVIDENCE.sha256 | 46744d0058deaf080efa9d15d09db6732c9d2f89061d4e0f1e8ddc5a2a736158 |

Next: separately scoped and authorized acquisition of missing assets, without
altering the closed historical corpus, before claiming further MDN navigation
or image-paint coverage. Broader website coverage, the original research topics,
Wikipedia geometry, credentials/passkeys/devices, SafeJS and socket/TTY gates
remain open. Preserve unrelated work; no push in this iteration.
