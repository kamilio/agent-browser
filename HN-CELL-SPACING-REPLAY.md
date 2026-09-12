# Hacker News captured spacing delta on native15522

## Actual outcome

One bounded offline original-loader replay on committed
`43060222e28db7abb3259b0ad50d230f359705c6` removes all four captured cellspacing
presentation-hint guards. Native tables `e13`, `e17`, `e55`, and `e1266` retain
their original `cellspacing="0"` attributes and now compute `0px 0px` spacing.

**Used layout still fails.** The single coordinator attempt reports
`unsupported`: `Document width resolution requires an issue-free supported
formatting profile`. This is a verified narrow improvement, not working Hacker
News layout, successful navigation, a current website fetch or whole-site
acceptance. No content, stylesheet, response header or policy was removed.

Native interval: September12,2026,19:18:42.322–19:18:42.468 UTC. Supervisor
interval:19:18:42.168–19:18:42.487 UTC, exit0, no timeout or stderr. Exit0 means
the diagnostic recorded its result and cleanup, not that layout succeeded.

## Exact comparison

The baseline is the separately retained
`website-functional-september12-evening/hn-attribution01/RESULT.json`, SHA256
`740f99b0a331fc84cd0fd8644364440e503ce4b3094cd9277744d5a2174f5f47`, on
committed native15421. The following issue counts are directly compared, not
estimated from a fresh page or synthetic fixture:

| Formatting diagnostic | Before | After |
| --- | ---: | ---: |
| HTML table presentation hint | 4 | 0 |
| Unsupported/invalid CSS value | 11 | 11 |
| Unsupported CSS property | 2 | 2 |
| Unsupported media query | 1 | 1 |
| Other HTML presentation hint | 64 | 64 |
| Deferred table display marker | 4 | 4 |
| Unsupported image element | 2 | 2 |
| Unsupported overflow layout | 61 | 61 |

The two images remain complete/broken with `policy-denied`, zero natural
dimensions and zero image requests. All61hidden-overflow observations still
belong to `td.title` table cells. The four deferred table display markers are
not reclassified as an independent coordinator bug. No font or CSP fallback is
introduced by the spacing change.

The exact September11 HTML34946bytes and CSS7418bytes replay through two native
memory responses:42364decoded bytes,0wire requests/bytes,0clicks,1load,
1formatting inspection and1used-layout attempt. Page identity remains
Hacker News,1303nodes/revision1303. The DOM revision remains unchanged during
diagnostics. The fresh HN live stop in `HN-MODERN-NATIVE-FLOW.md` has different
response bytes and stops before commit; it is not this replay.

## Integrity and limits

New lane:
`node_modules/.cache/native-validation/html-cell-spacing-work-september12/hn-delta00/`.
`CONTRACT.md` authorizes only this post-fix offline delta; it does not authorize
retrying the live resource-policy stop or admitting denied image requests.

Runtime is the clean native15522 gate:15522passed/0failed/2unchanged exclusions,
297selected suites,296strict roots,675manifest entries,1184source/1996compiled
files. Its11source/manifest inputs match the actual local feature commit.
The gate is verified, not rerun by this replay. Source, compiled and20gate
receipt ledgers are checked before/after, as are the original23capture receipts.
No root dirty source is imported.

The existing kernel-denied network wrapper runs pinned Node22.22.0 with empty
sanitized HOME/TMPDIR,30second supervisor bound and6MiB output limit. Native
transport/navigation, original response/work limits and captured allowlist are
unchanged. Session/transport/queue and document/image owners close; active and
pending work is zero. No script, SafeJS, provider, credential, device, TTY or
socket self-probe runs. Original failed lanes and historical reports remain
unchanged.

`verify-hn-delta.mjs` reads the result, baseline, capture and release ledgers;
it checks only the narrow issue delta, original inputs and cleanup. It performs
no new native import, parse, decode, layout, click or network request. Its
post-run seal records this report and exact new-lane files. The overall browser
and wider acceptance gates remain open in `TASKS.md`.
