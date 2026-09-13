# Website testing inventory: September 13, nineteenth update

This adds a verified repair for the W3C Selectors reader failure and two separate
native-only hardware research visits. Previous inventories, capture times,
failed wrappers and measurements remain unchanged. Reader acceptance, source
extraction, fixture rendering and full website rendering are distinct gates.

## Reader repair and tests

The retained native-token trace identifies the first table's omitted column-group
end. The reader retained that group on its open stack, preventing existing row/
cell/section logic from finding the immediate table ancestor. Repeated omitted
row/cell ends then accumulated false depth. A guarded scope pop fixes that
bookkeeping without changing the source or limits. Details and limitations:
`RESEARCH-COLUMN-GROUPS.md`.

- New suite: 28 cases; unchanged baseline 22 failures and six passing controls.
  All other selected baseline tests pass. Initial baseline preparation stopped
  at strict compilation because two fixture parameters inferred literal128;
  explicit numeric parameter types corrected the fixture before execution.
- Corrected focused gate: **569 passed**, zero failed; build, strict compilation,
  formatting and source stability verified.
- Canonical native gate: **18931 passed**, zero failures, two
  unchanged exclusions, 371 selected suites and
  370 strict roots. Manifest: 742 entries;
  371 remain outside this explicit run. The historical strict-root omission is
  unchanged, not silently counted as newly accepted.
- Runtime: `node_modules/.cache/native-validation/native-reader-colgroup-september13-round00/snapshot01/dist`, base `ee8237a8f3383c360a9e7db03e69d71ec43467a9`.
  Root `dist` was not rebuilt; pre-existing dirty work remains separate.
- Gate 2026-09-13T11:59:45.611Z–2026-09-13T12:04:02.699Z; audit 2026-09-13T12:04:02.804Z.
  1281 source files, 2116 compiled files and
  1278 unchanged tracked inputs.

Source inventory: `0118f871692b76a20d5150f8fc15e5928dffb98d54fad801d4dab049905223ba`.
Compiled inventory: `b2a50c6b1f62b880c7c2c00c1d5d34f7f62caa3971703804ae2d8336f9ac756c`.
Native results: `2813a7625582c75bc232ae0f816905a2f037b52055a552e11b2a3d670cc5269d`.
Summary: `b6b448755a24827119bc565b5f81096093f27d41fc92129df6da1fb0ce27f6da`.

## W3C Selectors: same original bytes, successful reader

Website: `https://www.w3.org/TR/selectors-4/`.
Original capture: September 13, 2026, **11:15:53 UTC**, HTTP200,
978,757 bytes; this turn does not recapture it. Body:
`native-pseudo-content-source-september13/source-1-response-1.body` under the
validation cache, SHA-256 `5d3b3f7e1fcc562dcec1a01ad2c5651e9f0bac294b255a75352e9df202604e6d`.

| Result | Before: audited18903 | After: audited18931 |
| --- | --- | --- |
| Reader admission | resource-limit | succeeds |
| Depth result | reader.depth129, limit128 | DOM depth13, same limit128 |
| Native reader nodes | no owner returned | 22522 |
| Headings queried | not reached | 138 |
| Tables queried | not reached | 1 |
| Match-against-tree section | not reached | queryable |
| Actual HTTP requests | 0 | 0 |

Before phase: 2026-09-13T12:03:20.805Z–2026-09-13T12:03:20.821Z.
After phase: 2026-09-13T12:04:14.151Z–2026-09-13T12:04:14.390Z.
Both use native long-v1/default raw policy and 50,000 nodes / depth128 /
3,000,000 document text units / 1,024 changes. No threshold is raised.
The after reader reports 975,551 source code units, 453,377 text code units,
614,032 output code units and 30,930 tokens; scripts/styles remain omitted.
Three native queries use 700859 work and leave the revision
unchanged. The earlier full-DOM parse's 22,686 nodes/depth13 is historical
evidence, not a new full-DOM fallback in this gate.

The original token prefix is identical before/after: table, colgroup, four cols,
thead, tr, with no end-colgroup token. The table start is at source offset60295;
the following thead starts60464. These are native tokenizer offsets, not raw HTML
regex extraction. The encoding sniffer is a separate short tokenizer instance;
the corrected harness selects the first table-bearing instance rather than
assuming instance zero is the sanitizer.

Final evidence: `native-reader-colgroup-replay-september13-round01/EVIDENCE.sha256`,
SHA-256 `8f43a9833b87984d10b2899cf2d20608ad3f139c228f128dec2d8fa270e0f17d`.
All native owners close, process groups are absent, private HOME/TMP directories
are empty/removed, and source/runtime inventories match. No page actions, styling,
scripts, credentials, SafeJS, real TTY, devices or challenge solving occur.
Successful inert reading does not establish full-page geometry or rendering.

## Preserved diagnostic failures

- `native-reader-depth-diagnostic-september13` retains the real native depth
  failure and last64 tag metadata. Its wrapper exits1 because its expected error
  omitted the native unit:levels field. A separate audit verifies the native
  reproduction while keeping wrapperPassed:false; nothing is relabeled green.
- The unsuffixed `native-reader-colgroup-replay-september13` before phase retains
  the same native failure but its wrapper selects the six-token encoding sniffer
  and fails an empty-prefix assertion. No after phase runs there. The corrected
  round01 is a separate fresh zero-HTTP gate, not a rewritten earlier result.

Diagnostic ledger: `027067ed7762254dd29132408f94fd5992489ae435202fdde298ab643fd641b8`.
Original replay-wrapper ledger: `90b07aef8b53409ed55c4cff5ddbf2137952a92d70841429f218f7ed1ece0cfc`.

## Two separate hardware website visits

The hardware worker used only the earlier audited18903 native runtime; these
visits are not misattributed to the new reader build or counted as its regression
acceptance. It checked prior research before selecting missing evidence.

| Website | Fresh capture (UTC, September13) | Verified scope |
| --- | --- | --- |
| NVIDIA RTX PRO 6000 Workstation product page | 12:01:06.505; one GET200 | Native capacity/power/form-factor rows extracted |
| Apple Mac Studio specifications | 12:01:16.690; one GET200 | Native reader succeeds; only title admitted |

The new NVIDIA rows establish vendor-listed 96GB GDDR7 ECC, 1792GB/sec, maximum
600W and a 5.4×12-inch dual-slot Workstation Edition card. They are not LLM
measurements, a system-PSU recommendation, price/stock verification or a model-fit
guarantee. No fresh Apple chip or memory configuration is established. Apple's
title-only selection is an extraction limitation, not a reader-depth failure.
The RTX5090 page was not requested again; its earlier September13 evidence keeps
its original timestamp and caveats.

Totals: two navigations, two GETs, no redirects/retries/subresources, two reader
loads, zero full-DOM fallbacks. Thirteen complete blocks / 1,796 text units are
admitted across the two bodies, with per-body bounds preserved. All four capture/
reader phases exitzero; empty credential jars and native owners close; 92 sealed
entries and build inventories verify. Full report and exact source URLs/native
references: `LOCAL-LLM-HARDWARE-RESEARCH-SEPTEMBER-13.md`.
Hardware evidence ledger:
`c52a885b6b5c88b5d9d089669e0d59eefeb8778138a7b96443dbfbbf47d25430`.

## Open work

The reader-depth defect for this retained source is repaired and verified, not
the whole browser goal. Next research work includes properly associated Apple
configuration extraction and comparable workload evidence before hardware
rankings. Hardware performance/value ranking and the original benchmark/Astra/
Poe topics remain incomplete. Varied-site rendering, generated positioning,
credential/passkey devices, SafeJS, real TTY and human challenge handoff remain
separate open gates. No CAPTCHA or access-control bypass is established here.
