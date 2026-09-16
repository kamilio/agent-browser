# Compact tables in native reader link workflows

## Feature

The maintained `research-link-content` command now accepts one optional
`--compact-tables` flag in either existing selection mode. It forwards the
existing formatter option only to destination Markdown extraction and returns
`extraction.compactTables:true`. The flag takes no value; duplicates, malformed
value positions and mixed selection modes still fail before I/O.

Defaults, exact-target native selection/click behavior, URL/access policy,
row-list preference, resource limits and caller-owned output cleanup stay
unchanged. No new formatting heuristic, page runtime or dependency is added.
Enclosed row/cell begin markers shorten; text, links, cell order, table boundaries
and partial-structure warnings remain. Simple row lists may not change.

## Same-body measurements

Each saved native destination body is loaded once and extracted both ways.
These are Markdown-content bytes, not total JSON bytes or speed measurements.
The compact content differs only by the documented marker substitutions; all
other extraction metadata is identical except the explicit compact-mode flag.

| Saved destination | Default bytes | Compact bytes | Saved |
| --- | ---: | ---: | ---: |
| Wikipedia Grace Coolidge article |212988|208126|4862, or2.28%|
| CNET Shenzhen article |20676|20676|0|
| Target product page |2282|2282|0|

Six additional native-click replays exercise all three fully captured source/
destination pairs, once with defaults and once with compact output. All six
match these expected content hashes, use exactly twelve mocked GETs and close
their documents/transports. Both measurement and replay processes have kernel-
denied network. These checks make **zero new website requests**.

## Validation

- Clean baseline: `ac94c34` (full hash in JSON),1517 committed source/script/config
  inputs. Final candidate overlays only the command and one new test file.
- Production-only core:925pass/0 in12 selected native-manifest files.
  Final: **1006pass/0 in13**, including81 new cases. Exact final tests on old
  production:33pass/48fail. No full940-file manifest or actual SDK claim.
- Build, selected types, scoped formatting and lint pass. Production is unchanged
  from the core candidate through final validation; later edits fix test
  expectations only. Compiled changes are confined to the command artifacts.
- Initial runs retain994pass/12fail, a duplicate994/12 after a failed patch did
  not apply, then998/8. The tests incorrectly expected a literal unescaped period
  and absence of an internal optional field whose value is undefined. Correct
  those assumptions without changing browser output or removing coverage.
- Six actual compiled CLI controls pass: help, duplicate flag, boolean value,
  consumed target value, mixed selection modes and synthetic userinfo rejection.
  They run with kernel-denied network. Native unit tests use a JavaScript guard
  only. All completed test/check processes and groups close without forced signals.

## Separate live check

At10:41:16.347364UTC on September16,2026, the final compiled CLI runs with
`--compact-tables --target-link` from
`https://en.wikipedia.org/wiki/Main_Page` to
`https://en.wikipedia.org/wiki/Grace_Coolidge`. Both native GETs return200.
It selects the intended reference, dispatches mousedown/mouseup/click and
extracts **208230 Markdown bytes** with compact provenance.

The output has2374 lines. Compared with the prior separately reviewed page after
normalizing its table markers,2368 lines are identical; three revision-link lines
and three article paragraphs differ. All six deltas were inspected. Therefore
the fresh byte difference is not treated as a controlled compaction measurement.
Substantive article content remains available, but the earlier content review
was sampled and neither run verifies the article's facts or full rendering.

Exactly **two new GETs**, no retries, redirects, credentials, page scripts,
alternate clients, identity changes or challenge solving. Requests/sockets,
documents and process group close. The live allowance and prerequisite hashes
are separate from historical runs. The100-entry corpus results remain unchanged.

## Remaining limits

This removes modest marker overhead, not the article's language links, navigation,
citations or categories. It does not promise faster network loading or complete
content under every output cap. Native output remains partial and
`extracted-unverified` with `contentSuccess:null`. SafeJS scheduling, dynamic-page
behavior, full rendering, access handoff, credentials/passkeys and real-input
acceptance remain open. See RESEARCH-LINK-CONTENT.md and TASKS.md.
