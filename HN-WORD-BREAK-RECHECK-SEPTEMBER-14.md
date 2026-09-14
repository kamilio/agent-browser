# Hacker News captured word-break recheck

**One applicable unsupported declaration is removed; link geometry remains
unsupported.** This is a September 14, 2026 native replay of the unchanged
September 11 HN HTML/CSS capture, not a new live visit or a successful link flow.

## Observed result

- Runtime and launch HEAD: `cd62d4d1c6b09a7dec51a302f5a9511ab964c73d`.
- Native interval: **16:18:22.688–16:18:22.907 UTC**, September 14.
- One native BrowserSession load through the original document loader, one
  formatting inspection, cached diagnostic read, `.morelink` query and geometry
  attempt. Zero clicks, destination requests, rasters, scripts or wire requests.
- HN title, 1,303 nodes and revision 1,306 remain unchanged. Native discovery
  again finds anchor e1261, `href="?p=2"`, with a formatting node.
- The two original responses preserve exact statuses, ordered headers and body
  hashes: 34,946 HTML bytes plus 7,418 CSS bytes, **42,364 decoded mocked bytes**.
  There is no resource substitution, omitted stylesheet or live fallback.

Compared with `HN-CURRENT-CAPTURED-DIAGNOSTICS-SEPTEMBER-14.md` at 14:04 UTC,
the applicable `.title a { word-break: break-word }` declaration no longer
produces an unsupported-property error. That was **one declaration matching
61 elements**, not 61 independent parser errors. Total overlapping formatting
issue occurrences fall from **135 to 134**; every other category is unchanged:

| Remaining category | Occurrences |
| --- | ---: |
| Unsupported/invalid CSS value | 2 |
| Unsupported media query | 1 |
| HTML presentation hint | 64 |
| Deferred table display marker | 4 |
| Unsupported image element | 2 |
| Unsupported overflow layout | 61 |

Geometry still returns `unsupported` and lists two CSS values, 64 presentation
hints, two image elements and 61 overflow-layout occurrences. Layered vote-arrow
backgrounds and table-cell overflow remain independent blockers. No rectangle
is fabricated and no forced click or direct destination navigation occurs.
The earlier runtime is `39b55d9`; intervening table/fieldset changes are not
misattributed to word-break, although the measured category difference is exact.

The diagnostic cache has 17 samples, zero omitted occurrences and no truncation;
its API remains explicitly non-exhaustive. Non-applicable unsupported stylesheet
properties are not erased or claimed supported. Formatting metrics remain
1,390 boxes, 1,295 visited DOM nodes, 3,927 text code units, six deferred subtrees
and 13,666 work units. This is not a speed or memory benchmark.

## Verification and boundaries

The selected native profile is verified, not rerun: 23,935 passes, zero failures
and two unchanged exclusions. All 2,949 source and 2,200 compiled files are
rehashed before/after this separate scope; the dirty root source is not imported.
The 23-entry original capture ledger remains unchanged. The separate two failing
soft-hyphen sizing characterizations in `WORD-BREAK.md` remain open.

Child and supervisor exit zero; the independent verifier and parent comparison
pass. The diagnostic exit does not mean successful geometry. Kernel and JS
network/process/addon guards remain, with zero guard attempts. Private empty
HOME/TMP are removed, native owners close, the process group is absent and there
are no integrity, cleanup, timeout, truncation or stream errors. The run's
one-use locks are consumed; no retry, SafeJS, credential, passkey/device or real
TTY/PTY probe occurs. No challenge behavior or live-site acceptance is established.

The verifier seals 27 files; the closed lane contains 28 including its ledger:
`/dev/shm/agent-browser-hn-word-break-recheck-september14/`.
Parent comparison and postprocessing notes are separately retained at
`/dev/shm/agent-browser-hn-word-break-parent-september14/`.
The native result SHA-256 is
`16e910672c2a0fe812bf32cbc6aa5d9e83fe8de05b7f3f5faabf4924de0a11e6`.
The evidence-ledger SHA-256 is
`317e9d6881d896e596762f220d2e0669f5423975cae33301775138a7a63eec67`.
Durable closeout belongs under
`node_modules/.cache/native-validation/hn-word-break-recheck-september14/`.

The feature's separate durable archive is verified at 16:17:26.699 UTC:
278,395,968 bytes, SHA-256
`32a7aabd9b8ce9c4fe961a2c56a82008b54e8356754a21f59d8d241b39c1a7d5`,
with 5,168 byte-identical final-gate files. Original dirty work and 697 original
untracked files are preserved. Overall browser/research/performance goals remain
active. Next: repair the characterized shared soft-hyphen minimum-width defect
and continue isolated site-blocker work. No push.
