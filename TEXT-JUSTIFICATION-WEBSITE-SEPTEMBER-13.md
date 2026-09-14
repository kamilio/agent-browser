# Justification and captured Python replay — September 13–14, 2026

Commit `3b85a5b` implements bounded native inter-word justification. The feature
profile, limitations, synthetic regression evidence and full native gate are in
`TEXT-JUSTIFICATION.md`. This report adds a captured-site observation; it does
not relabel historical captures as fresh live testing.

## Exact Python scope

Lane: `native-python-justify-september13`, retaining the preparation date in its
name. The native observation actually runs on **September 14, 2026,
00:04:34.776–00:04:34.897 UTC**. Its process runs
00:04:34.651–00:04:34.906 UTC and exits zero.

There is one native homepage navigation, two native queries, one discovered
Tutorial click attempt and one formatting observation. It serves the exact
eight original captured resources, totaling 72,064 decoded bytes: seven
September 11 fixtures and the unchanged September 13 `basic.css`. The literal
`before-RESULT.json` filename remains inherited from the original harness.
This is a mixed-date offline fixture set, not a new complete homepage capture.

**Zero HTTP requests** occur. There is no script runtime, source rewriting,
stylesheet stripping, direct-destination fallback or request-scope widening.
The original native probe and both guards retain their prior bytes. Empty
private HOME/TMP directories, pipe-only execution, deadlines, output caps and
run-once protections remain in force.

## Observed change

Against the previous `native-python-radius-september13` observation:

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Unsupported/invalid CSS value | 1 | 0 |
| Unsupported CSS property | 4 | 4 |
| Float layout | 8 | 8 |
| Display layout | 9 | 9 |
| Position layout | 1 | 1 |
| Overflow layout | 1 | 1 |
| Clear layout | 3 | 3 |
| Total formatting issues | 27 | 26 |

The removed value diagnostic corresponds to the previously native-attributed
`text-align: justify` declaration. Formatting topology/work remains unchanged:
576 visited DOM nodes, 669 boxes, 4,074 text code units, 8,965 work units and
nine deferred subtrees. This isolates a CSS support improvement; it is not a
page-wide pixel comparison or a performance measurement.

The Tutorial click **still fails with `unsupported`**. Its remaining width
resolution guards are four unsupported-property occurrences, one position
issue and one overflow issue. The old justification-value guard is absent.
The other raw formatting diagnostics remain visible rather than being deleted
to force a successful result. The original document remains available.

Actual justification geometry is covered by the synthetic native tests. This
captured page still fails its prerequisites before a successful clicked flow,
so this replay does not establish full-page layout, paint or click acceptance.

## Cleanup and remaining work

Native session, network, queue, documents, images and query owners close;
active requests and pending loads return to zero. Private directories are empty
and removed, and process group 1079166 is absent. Process success means the
bounded observation completed, not that the Tutorial flow passed.

Independent post-run verification passes 29 checks at
00:04:38.556 UTC. The complete 49-entry replay evidence ledger SHA-256 is
`8e41b91576666c1a93db25cba87002af207f1164bd3c9630cc0ed0d683f6f54b`;
the unchanged-result record hashes to
`3a2ed1cc6baaeed99d520f860064f32fe5a72e0e3ff238f5224b83d81e186a21`.
The parent replay summary is
`text-justify-work-september13/python-replay/RESULT.json`, SHA-256
`b5bf32a5d39ebad823fdfd641d9999d25ded1aff0f5021ac4e13ead30986dcfe`.
Prepared/before/after runtime, original-fixture and framework inventories match.

The four remaining properties were previously attributed to `hyphens: auto`
and its three vendor-prefixed variants. The sidebar's sticky position and
overflow behavior remain separate implementation gates. Language-aware
hyphenation, sticky/scroll integration and the full original-resource live flow
must be investigated rather than treating this CSS-value delta as completion.

One separate native standards-page GET occurred on September 13 at
23:42:24.402 UTC: W3C CSS Text Level 3, HTTP 200, followed by bounded native
offline extraction. It returned the August 14, 2026 CRD; no latest-edition claim
is made. See the source provenance in `TEXT-JUSTIFICATION.md`.

The full native gate remains 21,551 passed / zero failed / two unchanged skips,
not a credential/provider/device, SafeJS, socket, real-TTY, challenge-solving,
benchmark or whole-browser acceptance result. Hardware/benchmark/Astra and
verified Reddit-Poe research remains incomplete. Changes are local; nothing is
pushed, historical reports remain unchanged and the overall goal stays active.
