# Python tutorial direct native content check — September 13, 2026

**PASS for bounded direct target-content inspection only.** One authorized
native GET returned HTTP 200; one isolated long-v1 semantic reader load passed.
No successful Tutorial click, layout/image regression or full-browser acceptance
is claimed. Parent owns source/tests, TASKS, global inventories and commits.

## Request and pinned build

- Exact requested/final URL: `https://docs.python.org/3/tutorial/index.html`.
  One native document request, one actual GET, zero redirects, retries,
  linked-source/subresource requests or mock requests. Native
  `NodeNetworkTransport`, fresh empty cookies, credentials omit, 250ms pacing
  configured, 3MiB decoded-body/aggregate limits. With one GET no inter-request
  interval was exercised. No challenge/login diagnostic, 429 or Retry-After.
- Actual wire start: `2026-09-13T14:41:34.230Z`; response retained:
  `2026-09-13T14:41:34.253Z`. HTTP 200, `text/html`, gzip,
  **36,953 decoded / 7,681 encoded bytes**. Server Date:
  `Sun, 13 Sep 2026 14:41:34 GMT`; Last-Modified:
  `Sun, 13 Sep 2026 14:38:01 GMT` (server metadata, not inferred publication).
- Decoded body SHA-256:
  `416dac2041f601e3273d5a67549046c8e7e445453a992b8c7689c02242e76460`.
- Only `native-research-element-preflight-september13-round00/snapshot01/dist`;
  base `974a3bbca0ef0af3becf242f3f05bfd2370613f0`;
  1,289 source/input files, inventory SHA-256
  `bfc81f3308a3d35766e6b3911ac7a8bdf51af9d87364378edaec3d83925d917f`;
  2,124 compiled files, inventory SHA-256
  `6bec295291cc5a30586ce6de68e0229e13f356e49a67bb818701aab536689ce6`.
- Existing pinned audit, NOT rerun here: **19,764 pass / ONE table-source
  failure / TWO unchanged skips**, 383 selected suites, 382 strict roots,
  748 manifest entries. 55 new preflight and 118 restored selector cases pass;
  two prior selected failures fixed. **Full selected suite remains not green.**

## Native semantic observations

- Reader UTC `2026-09-13T14:41:38.305Z`–`2026-09-13T14:41:38.410Z`;
  one long-v1 load with default raw policy, identical captured bytes,
  **1,087 nodes**, revision **1,087 → 1,087**. Reader succeeded before any
  fallback was eligible: **zero full-DOM comparison loads**.
- Three native queries: `title,h1,h2,h3,h4,h5,h6` found 10 elements
  (**9 headings plus title**), work 21,580; `pre,code` found **0 pre blocks /
  11 code elements**, work 7,604; `a[href]` found **174 links**, work 3,706.
  Total query work **32,890**, text-walk work **392**. These are semantic
  reader counts, not complete source-DOM, visual or accessibility counts.
- **24 complete labels / 338 UTF-16 text units**: ten heading/title labels
  and fourteen document-order link labels, including one whitespace-only
  image-link text label. No truncation/skipped labels; no pre block labels
  because none were present. Inline code was counted, not extracted.
- Native title `e5`: `The Python Tutorial — Python 3.14.7 documentation`;
  heading `e168`: `The Python Tutorial¶`; link `e53`:
  `1. Whetting Your Appetite`, href `appetite.html`; heading permalink `e170`:
  href `#the-python-tutorial`. Version is observed page text, not a claim
  about the latest Python release. No links were followed or clicked.
- Reader declares partial semantics, scripting/styling/hidden-content semantics
  false; 36,933 source code units, 10,451 text units, 20,502 output units,
  1,748 tokens, 73 omitted tokens, zero tokenizer issues. Omitted subtrees:
  meta17/link14/script13/style1/input7/svg1; 426 ignored attributes,
  16 unwrapped elements. This is not rendering or full-DOM equivalence.

## Bounds, cleanup and evidence

- Per-phase bounds: 50,000 nodes, depth128, 3,000,000 text units,
  1,024 changes; four queries/2,000,000 query work, 100,000 walk work,
  24 complete labels/16,000 text units. No actions, geometry, raster,
  resources, scripts, SafeJS, alternate client, raw-source label scans,
  credentials, profiles, devices, TTY/PTY or prohibited payload inspection.
- Both phases exit 0 without timeout; supervisor UTC live
  `14:41:34.132Z`–`14:41:34.260Z`, reader `14:41:38.262Z`–`14:41:38.423Z`
  on September 13, 2026. 30s+5s grace, 10MiB stream/file caps. Recorded maximum
  RSS: live 80,212KiB, reader 88,804KiB. Private HOME/TMP initially/finally
  empty and removed; process groups absent. Transport/cookies closed with
  zero active work/cookies; reader closes **1,087 → 0 nodes**, query owner
  closed with zero indexed nodes. No network/process guard attempts;
  offline kernel `NoNewPrivs=1`, `Seccomp=2` paired with JS denials.
- Complete source/compiled inventories match before and after both phases;
  all eight ledgers and each listed file are verified again during sealing.
  Evidence lane:
  `node_modules/.cache/native-validation/native-python-tutorial-september13/`.
  `AUTHORIZATION.md`, `BOUND-AUDIT.json`, `LIVE-AUDIT-0.json`,
  `CAPTURE-0.json`, `reader-0-AUDIT.json`, phase execution/integrity/cleanup
  receipts and resource records retain exact observations and native refs.
  `PRE-SEAL-VERIFICATION.json` records receipt checks; `DIGESTS.sha256` seals
  every lane file except itself plus this report and the sibling handoff.
  Paths and digests are verified after manifest creation, then edits stop.

## Outstanding acceptance

`PYTHON-DOCS-QUEUED-FLOW.md` and `PYTHON-IMAGE-FALLBACK-REPLAY.md` remain
unchanged: their Tutorial click failed before destination navigation. This
newly authorized direct request adds previously absent destination content
coverage, **not a repaired or successful click**, layout/image acceptance,
execution of tutorial examples or visits to tutorial chapters. No original
four-topic research completion or overall browser-goal completion is claimed.
Native gates were not rerun; parent handles the selected table-source failure,
TASKS/global inventory updates and commits. This worker changes only its new
lane, this report and its handoff; no commits or pushes.
