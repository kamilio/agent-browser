# Python text-decoration thickness replay — September 13, 2026

**Applicable CSS value errors decrease from two to one. The real Tutorial click
still fails.** Thickness is implemented in native parsing, styles and raster ink;
this captured-page observation is not a complete Python rendering pass.

## Same input, actual action

One native BrowserSession navigation replays `https://docs.python.org/3/` from
the exact same eight captured resources and metadata as
`PYTHON-CSS-NESTING-REPLAY-SEPTEMBER-13.md`. Seven captures are from September 11;
the missing `basic.css` capture is from September 13. They total 72,064 decoded
bytes. There are **zero wire requests**, redirects, retries or new resources.

The original 853-node document, revision 860 and captured title
`3.14.7 Documentation` are unchanged. The browser rediscovers the same `Tutorial`
link, `e375`, to `https://docs.python.org/3/tutorial/index.html` and calls
Session.click once. It fails before requesting the destination; no direct URL
fallback is substituted for that failed click. The title is capture evidence,
not an assertion about the latest Python version.

## Observed change

| Native metric | Nesting runtime | Thickness runtime |
| --- | ---: | ---: |
| Applicable unsupported properties | 9 | 9 |
| Applicable invalid/unsupported values | 2 | 1 |
| All parsed property/value diagnostics | 57 / 7 | 57 / 6 |
| Charged rules / declarations | 584 / 1,075 | 584 / 1,075 |
| Cascade work | 93,132 | 93,872 |
| Visited nodes / formatting boxes | 576 / 669 | 576 / 669 |
| Formatting text units / work | 4,074 / 8,294 | 4,074 / 8,294 |
| Deferred subtrees | 9 | 9 |
| Actual Tutorial click | Fails | Fails |

The earlier exact attribution identified `text-decoration:underline 1px` as a
matching unsupported value. Native thickness support now handles that declaration
without rewriting the page or filtering diagnostics. Independent regression
fixtures prove actual stroke widths and unchanged geometry. The blocked homepage
replay itself does not exercise a complete raster or successful action.

The remaining actual click error reports nine property errors, one value error,
two inline vertical-alignment issues, one positioning issue and one overflow
issue. Prior source attribution identifies the remaining value as justification;
properties include hyphenation and vendor variants, cursor, three border-radius
declarations and underline offset. Raw float 8 / display 9 / clear 3 coordinator
markers also remain, without being reclassified as independently proved fatal
errors. Generated clear-both boxes remain present.

Cascade work increases by 740 units as the browser processes supported decoration
components. There is **no speedup claim** and single-run timings are not a
performance benchmark. All remaining partial/unsupported diagnostics are retained.

## Execution and evidence

The new observation runs `16:49:34.790–16:49:35.043 UTC`, exit 0,
45,458 combined stream bytes. Exit 0 denotes a completed observation;
`flowPassed` remains **false** with the original action error preserved.

Runtime: `native-decoration-thickness-september13-round00/snapshot01/dist`,
validated by 20,177 native passes / zero failures / two unchanged skips. Exact
pins are in `TEXT-DECORATION-THICKNESS.md` and the lane authorization. Fixtures,
source/runtime and framework inventories remain unchanged across execution.
Owners close, queues drain, empty private HOME/TMP directories are removed, and
the process group is absent. Network/process-denial counters remain empty.

No scripts, SafeJS, alternative browsers, credentials/passkey devices, real
TTY/PTY, socket probes, fingerprint spoofing or challenge solving are exercised.
The internal `before` receipt prefix only reuses the unchanged wrapper; the new
enclosing lane and runtime identify this as the after-thickness observation.

Lane: `node_modules/.cache/native-validation/native-python-decoration-thickness-september13/`.
Its 28 lane-relative payload entries have ledger SHA-256
`1626aa0487477a9ccb60a5262a82ad455ffc71236c4d5d06ee945f9d54f82608`.
`COMPARISON.json` SHA-256:
`2f6977b8442425e70d5263927d2b90eca28ae3a449d8d4139e5540783349a661`.
All preceding failures and measurements retain their original paths and values.
