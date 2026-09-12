# GnuPG clearance followup — September 12, 2026

The new12187/5c6aea5 captured-only replay **still fails**. One fresh native
session replays the exact six original responses, including four images:
34,877 decoded bytes, zero HTTP/wire calls, one document commit, one genuine
discovered FAQ click and no replay miss. No destination is fetched or fabricated.
Native UTC:07:10:25.407–07:10:26.705 on September12,2026.

The observed first barrier changes from the previous12037 replay's non-floating
clearance rejection to **Clearance requires a supported block owner**. Captured
access/challenge barrier is null. This is not a CAPTCHA or authorization claim,
nor does moving to another native guard make the flow successful.

Full-image formatting remains277 nodes,244 visited DOM nodes,283 boxes and
work3712, with no deferred subtree. Raw invalid CSS values fall13→7 and
applicable invalid values3→2. Unsupported properties remain43 raw/14 applicable,
selectors2/2, and raw float/clear diagnostics9/8. These are measured changes,
not sole-cause attribution. DOM/title/history remain unchanged by the failed
click, and all sampled document/image/event/control owners close.

## Independent evidence check

The parent reproduces22 read-only checks,281/283-entry ledgers and13 actual
pinned Git outputs (tree plus12 commit-owned inputs). The verifier denies
sockets/socketpair, records no guard attempts and executes no page.
Parent verification UTC:07:12:44.720. Sealed report:
`GNUPG-NONFLOATING-CLEARANCE-REPLAY.md`, SHA256
`4dd869f96f300d36512d5ad929de5c2b8763ecd1908bace030d12ba7319a348d`.
Final artifact ledger SHA256:
`27a3eb9b0eff3799e8633159f8a1432af3c9f6b463f3addd9f4f84b6158120bb`.

## Separate source-only ownership diagnosis

After verification, one socket-denied source-only probe parses the original
HTML and attaches its exact captured stylesheet using the committed12187 runtime.
It starts no BrowserSession, loads no images, invokes no geometry or click and
makes zero HTTP requests/mocks. The bounded formatting build has279 nodes;
that unloaded-image number is **not** substituted for the full replay's277.

Of eight retained clear owners, six are ordinary inline anchors carrying
`clear:left`: refs e367,e372,e377,e382,e387,e392. The other two are block boxes
e360 (footer div) and e408 (paragraph), both `clear:both`. The inline anchors
match the owner-kind rejection condition. The next change must correct clear
applicability while retaining specified/computed CSS and genuine block/floating
clearance, not remove the guard indiscriminately or strip the stylesheet.
Independent unsupported CSS remains; this diagnosis is not a working-flow proof.

Probe evidence: `node_modules/.cache/native-validation/inline-clearance-work-september12/gnupg-source-probe`.
Supervisor UTC:07:14:28.415–07:14:28.561; exit0, document closed, no guard attempts.
Probe source SHA256:
`4c0bde0f3904448e97ce1fe5171049a15f877dfcae31e7a573e56f617d91a696`.
HTML/CSS SHA256 remain the exact values recorded in the original GnuPG report.

The attempted-host inventory remains74. Original11901 live observations,
12037 replay and all earlier reports retain their paths and measurements.
Neither this replay nor the source-only diagnosis is fresh live-site acceptance.
Research completeness and provider/device/TTY/realSafeJS/challenge gates remain open.
