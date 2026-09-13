# Python documentation: underline-offset regression replay

**The actual Tutorial click still fails.** Supporting underline offset reduces
the applicable unsupported-property count from nine to eight; it does not resolve
the remaining layout or CSS value failures.

## Exact operation

One native `BrowserSession` homepage navigation replays the same eight retained
resources: seven September 11 captures and September 13 `basic.css`. The replay
uses 72,064 decoded bytes and **zero HTTP requests**. No fixture, stylesheet,
markup or diagnostic is rewritten. The native-discovered `e375` Tutorial link
receives one actual `Session.click`; there is no direct destination fallback.

Document remains 853 nodes, revision 860, with captured title
`3.14.7 Documentation`. That is the observed title, not a claim about the latest
Python release. Rules/declarations stay 584/1,075. The link destination remains
the Python documentation's `/3/tutorial/index.html`.

| Observation | Previous thickness runtime | New underline-offset runtime |
| --- | ---: | ---: |
| Applicable unsupported CSS properties | 9 | 8 |
| Applicable unsupported/invalid CSS values | 1 | 1 |
| Raw unsupported CSS properties | 57 | 54 |
| Raw unsupported/invalid CSS values | 6 | 6 |
| Cascade work | 93,872 | 93,886 |
| Formatting boxes / visited DOM nodes | 669 / 576 | 669 / 576 |
| Formatting text / work / deferred subtrees | 4,074 / 8,294 / 9 | 4,074 / 8,294 / 9 |

The click still reports inline vertical alignment twice, unsupported positioning
once and overflow once, alongside eight CSS properties and one CSS value. Raw
float/display/clear markers remain 8/9/3; these are not all independently fatal
coordinator failures. Genuine generated clearing boxes remain preserved.

The remaining property set includes hyphenation and vendor variants, cursor and
border radii; justification remains an unsupported value. Whole-page raster and
successful navigation remain unproven. The 52 new native raster cases, not this
blocked page, provide actual underline-position pixel evidence. Work counters and
one timing sample do not establish a performance improvement.

## Runtime and integrity

Execution: September 13, 2026, 17:11:28.434–17:11:28.691 UTC. Child PID 814041,
exit zero, 45,502 output bytes, absent process group. `observationComplete` is true;
`flowPassed` is false. Exit zero means the bounded observation completed.

Runtime: `native-underline-offset-september13-round00/snapshot01/dist` under the
native-validation cache; audited 20,313/0/2 unchanged skips. Only runtime pins and
the authorization differ from the previous replay wrapper. The internal `before`
prefix is retained for byte-identical wrapper reuse, not to mislabel this result.

Source/compiled inventories, all fixture bytes/metadata and framework hashes match
before and after. Queries, documents, images and session close; request queue is
drained. Private HOME/TMP are removed empty. Network/process denial logs are empty.
No scripts, SafeJS, credentials, devices, real TTY or challenge bypass is involved.

Evidence: `node_modules/.cache/native-validation/native-python-underline-offset-september13/`.
The 28-entry receipt ledger SHA-256 is
`715faeac8200e8d8c42c994bff0220049abfa779c789c12c5d1ab6d5467287c2`.
`COMPARISON.json` SHA-256 is
`77dc78d560cb045d8a6a7ea1d24dc4d571ab51fff574fda3ca9006dbf30f2f77`.
The prior `native-python-decoration-thickness-september13` evidence stays sealed
at its original path, with its original failed action and measurements intact.
