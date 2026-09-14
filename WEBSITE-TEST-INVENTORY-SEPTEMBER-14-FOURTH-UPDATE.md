# Website test inventory — September 14, fourth update

**Adds captured Python action-progress evidence, not a successful destination
navigation or a fresh website request.** The preceding inventory remains at
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRD-UPDATE.md`; its historical source
measurements and stop boundaries are not rewritten.

| Site/scope | New observation, September 14, 2026 UTC | Limit |
| --- | --- | --- |
| `docs.python.org/3/`, overflow V2 replay | 03:43:00: overflow diagnostic 1 to 0; total issues 21 to 20; Tutorial click fails with `Invalid overflow ownership` | Eight original resources; zero HTTP; no destination request |
| `docs.python.org/3/`, post-ownership replay | 04:13:57: the same discovered click reaches the Tutorial GET attempt; ownership error absent; remaining 20 issues and formatting metrics unchanged | The ninth adapter attempt is denied before transport because the destination response is outside this corpus; no completed navigation |
| Native nested pointer actions | Nine new cases verify click/double-click/hover reveal, clipping and event revalidation; stale capability advertisement corrected | Synthetic fixtures only; not an additional tested website |

Both Python replays retain the original eight responses and 72,064 decoded bytes
per run, with zero wire requests. The second run adds no resource or fallback.
Its `flowPassed` is false. The refusal is the local offline fixture allowlist,
not evidence of a Python-site access restriction, Cloudflare challenge or CAPTCHA.

The post-ownership run uses the audited `23e988d` ownership snapshot, not the
later capability build. Eighteen run ledgers verify; process group `1261783` is
absent, owners close and empty private directories are removed. Full outcome,
source bindings and evidence hashes are in `PYTHON-OWNERSHIP-REPLAY.md`.
The earlier V2 result and native correction are in `PYTHON-OVERFLOW-REPLAY.md`.

The newer, separate nested-actionability gate records **22,074 pass/0 fail/2
unchanged exclusions**, 438 selected files and 437 strict roots. It does not
retroactively change the replay's 22,065-test runtime binding. See
`NESTED-ACTIONABILITY.md` for its native-only scope.

## Next Coverage

- A separately bounded two-document Python flow using the already captured
  Tutorial response, with exact asset admission and a genuine discovered click.
- A distinct original MDN capture comparison to test whether later positioning,
  Grid and overflow work changes its recorded first blocker.
- Public-form interactions under their own synthetic-value action scope.

These are candidates, not executed or currently reachable sites. No new live
host, source-read success, script/device/credential access or research completion
is claimed. The stopped CSSOM acquisition stays closed. Broader browser,
performance, challenge and four-topic research gates remain open; goal **ACTIVE**.
