# Image-role source qualifications — September 16, 2026

## Result and scope

The native reader and extractor now preserve source-authored aria-label/title
qualifications on included HTML elements with an exact role=img. This repairs
MDN's two omitted experimental API warnings. It also adds explicit annotations to
four other captured pages without replacing their original content. See
IMAGE-SOURCE.md for the contract, bounds and distinction from rendered image or
accessible-name support.

This is a focused source-content fix, not a full browser pass. The separate MDN
template/noscript compatibility notice remains missing. No absent browser-support
matrix, verified review rating, working interaction or access permission is inferred.
Historical100-page verdicts and reports retain their original measurements.

## Candidate and isolation

- Base HEAD: 5918dcb3b78c3df9b128a7746f24432294abc789; final candidate: release05.
- Final source snapshot: /tmp/agent-browser-image-source-Tp1EdB/candidate-release05; all1534 source/config/test inputs and
  2312 compiled artifacts match their pinned manifests. The seven workspace
  overlays also match. Exact file hashes and36 selected test paths are in JSON.
- Compiled comparison against the prior runtime:2308 to2312 artifacts,2295
  unchanged,13 changed,4 added and none removed. No dependency is added.
- Canonical native manifest:950 entries; dirty workspace:953. Only36 explicitly
  selected existing/new native files were run; this does not certify the full list.
- Preserve42 pre-existing dirty tracked and697 untracked files. TASKS and the
  native manifest receive only this feature's additions in the focused commit.

## Native tests and review

Final release05: **3,118 passed,0 failed across36 files**,19.6031 seconds for the
recorded run. Build, selected-test types, formatting and lint all exit0. There are
58 helper cases and97 integration cases,155 new cases in total. The duration is a
single validation observation, not a performance benchmark.

The initial independent review identified three defects: duplicate annotations on
selected inline wrappers, annotations entering flattened literal pre content, and
an unbounded image-role anchor title bypassing the reader limit. Added tests
reproduce six failures across those three issues, including four reader profiles.
With release02 production and the exact final integration-test file,91 cases pass
and6 fail; final release05 passes all97. The final independent static review finds
all three corrected and no remaining blockers within its focused scope. The
reviewer did not execute gates; main's recorded runs supply that evidence.

Preserved development attempts:

| Candidate | Native passed/failed | Quality result |
| --- | ---: | --- |
| core01 | 3021/0 | Test typing and one test lint issue; build/format pass |
| release01 | 3107/1 | All quality checks pass; undersized byte-boundary fixture fails |
| release02 | 3108/0 | All pass; later review finds three edge defects |
| release03 | 3118/0 | Build/types reject unreachable code-type comparison |
| release04 | Not run | Same build/type failure; intended patch had not applied |
| release05 | 3118/0 | All pass |

The pre-feature production comparison with87 original integration cases records
36 passed/51 failed. It includes the new helper/test overlay, not an unchanged
baseline checkout. Initial review reproduction red02 records91/6; red03 repeats
91/6 with the exact final formatted test file. All artifacts remain intact.

## Saved-response differential coverage

**114 saved bodies:111 successful extraction pairs and3 matching non-HTML
failures.** All111 retain prior content predicates and challenge classifications.
Five pages gain43 emitted annotations:

| Capture | URL | Before Markdown bytes | After Markdown bytes | Annotations |
| --- | --- | ---: | ---: | ---: |
| entry-8 | https://www.homedepot.com/ | 36295 | 37217 | 22 |
| entry-28 | https://www.instagram.com/ | 2020 | 2063 | 1 |
| entry-46 | https://www.caranddriver.com/ | 22116 | 22154 | 1 |
| entry-95 | https://www.ign.com/ | 14283 | 14767 | 12 |
| developer-mdn | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise | 40101 | 40555 | 7 |

These are source labels: Home Depot stars, Instagram's existing page label,
Car and Driver's icon title, IGN loading/play/comments labels, and MDN's baseline,
browser and experimental labels. They are not independently verified ratings or
support values; Instagram's existing login-page result is not promoted to success.
Whole-document metadata counts differ from the annotations emitted in main content.

For ordinary-content comparison, a separate post-extraction diagnostic mutation
removes only aria-label/title from role=img nodes, retaining role, text, children,
focus and visibility. Re-extracted complete Markdown must equal the baseline.
Metadata comparison excludes imageSource, identity/revision and the two documented
reader title-retention counters. This diagnostic projection is not normal reader
behavior. All returned documents close. These replays make **zero live requests**.

## Actual CLI and source fidelity

Three final compiled native CLI invocations replay Python asyncio tasks, MDN
Promise and the GitHub repository through one native routed saved response each.
Kernel network denial and the JavaScript guard remain active. Complete extraction
objects match their earlier independently checked outputs, not just snippets.

An independent Python standard-library HTML parser compares every source PRE
block with emitted fences in source order:34 Python,18 MDN and1 GitHub block
match exactly after documented Markdown-container/final-newline normalization.
An additional18 comparisons cover the fresh MDN receipt. Its seven main-content
image annotations, including both full experimental warnings, also match the
source attributes in order. This does not execute code examples or independently
audit imageSource JSON; native fixtures cover JSON metadata.

The initial comparator failed because its own generated regex was wrongly
escaped. That failure remains recorded; a separate corrected comparator uses
explicit character escaping and marker search. No production fix or extra live
request was attributed to that verifier correction.

## One fresh MDN request

- Native GET received at 2026-09-16T15:39:50.266Z: HTTP200,201396 decoded and
  26894 encoded bytes; body SHA256 67ce22318a16b3305b8d0fe5f34f37d1d7c5e47c7251af4f7de5dd9256f94714.
- One request, zero redirects/retries/mocks; no scripts, credentials, alternate
  client/browser, fingerprint changes or challenge solver. Request, socket,
  authorized TLS connection and native transport close.
- **This live request used release02**, before the three edge corrections.
  Final release05 replays this exact captured receipt, with complete extraction
  equality. It is not a second live request or a final05 live-network claim.
- The body is identical to the earlier developer-documentation capture. Output
  contains40555 Markdown bytes and7 annotations. Outcome remains
  extracted-unverified/contentSuccess=null; the template fallback is still absent.

## Evidence and remaining work

Evidence directory: /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/image-source-september16

Sealed at 2026-09-16T16:00:23.921Z: 291 files,26435332 bytes. ARTIFACTS.json SHA256:
ef607b0704cb17e45f10ec26b90d8cca7fd4d66e2063531d2dc795d8997ef5ae. The inventory excludes itself and SEALED.json.
All43 recorded validation processes/groups are terminal and absent at the final
audit, including failed attempts; no timeout or termination signal is recorded.
Native/probe HOME/TMP directories are empty. Quality-run TMP emptiness is not
claimed. All37 distinct pinned helper/input paths checked by the audit still match.
Both independent reviews and all failed attempts are retained.

The pending full-suite failures (62 across26 files),22 missing committed test
files, actual SafeJS, rendering, credentials, passkeys, devices, TTY and restricted
site handoff gates remain open. This patch does not solve JavaScript-dependent
shells or access barriers, nor establish an overall speed improvement. The full
native-browser performance/functionality goal remains active.
