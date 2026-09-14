# Hyphenation and captured Python replay — September 14, 2026

Commit `0ab2f0a` implements native discretionary soft hyphens, inherited controls
and three legacy aliases. The implementation/profile and source limitations are
in `TEXT-HYPHENATION.md`. This follow-up checks the unchanged captured Python
homepage; it is not a fresh live capture or a completed Tutorial flow.

## Bounded observation

Lane `native-python-hyphenation-september14` runs one native observation at
**00:27:41.765–00:27:41.887 UTC on September 14, 2026**. Its pipe-only process
runs 00:27:41.637–00:27:41.898 UTC and exits zero. It performs one homepage
navigation, two native queries, one discovered Tutorial click attempt and one
formatting inspection after that click fails.

The original eight resources remain byte-identical: seven September 11 captures
and the September 13 `basic.css`, totaling 72,064 decoded bytes. The inherited
`before-RESULT.json` filename remains literal. This mixed-date offline fixture
set is not represented as a newly captured homepage. There are **zero HTTP
requests**, no script execution, no direct-destination fallback, no source
rewriting, no stylesheet stripping and no extra resource scope.

## Exact delta

The baseline is `native-python-justify-september13`, not the older radius replay.

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Unsupported CSS property | 4 | 0 |
| Unsupported/invalid CSS value | 0 | 0 |
| Float layout | 8 | 8 |
| Display layout | 9 | 9 |
| Position layout | 1 | 1 |
| Overflow layout | 1 | 1 |
| Clear layout | 3 | 3 |
| Total raw formatting issues | 26 | 22 |

The four removed property occurrences were previously attributed by the native
CSS diagnostic to `hyphens: auto` and its `-moz-`, `-ms-` and `-webkit-` variants.
No other issue count changes. Formatting metrics also remain unchanged: 576
visited DOM nodes, 669 boxes, 4,074 text code units, 8,965 work units and nine
deferred subtrees. This is an isolated support delta, not a benchmark.

The discovered Tutorial click still fails with code `unsupported`. Its width
resolution message now lists only **position-layout-not-supported (1)** and
**overflow-layout-not-supported (1)**. The CSS property/value guards are gone.
The sidebar's sticky position and overflow remain real implementation work;
the other raw formatting diagnostics stay recorded rather than being removed
to force success. The original document remains available after the failure.

Actual soft-hyphen layout, source ranges, pixels and hits are validated by native
synthetic regressions. The captured page still fails before a successful flow,
so this observation does not establish full-page geometry, painting or click
acceptance. The native auto profile installs no automatic language dictionary.

## Containment and provenance

Original probe and guard bytes, empty private HOME/TMP, deadlines, output caps
and run-once protection are retained. Native owners close without cleanup
errors, private directories are removed, and process group 1105721 is absent.
The bounded observation succeeds; `flowPassed` remains false.

Independent post-run verification passes 29 checks at 00:27:45.169 UTC.
Replay evidence ledger SHA-256:
`eb057f6f48545bd8e0824f5474225a460cc02c204089b1c7e8f9916d489c03eb`.
The native result record SHA-256 is
`818ce6473ecdc609ae23e2f30141c53ba2a90bc948a858aed3ac26d870f821af`.
The structured parent comparison is
`hyphenation-work-september14/python-replay/RESULT.json`, SHA-256
`49ddd2d702ae0b0edb5bd62bbec775665065fbc4b5286c48cadcfdae3ad27d40`.
Complete prepared/before/after runtime, fixture and framework inventories match.

A separate native offline source parse, 00:16:13.330–00:16:13.554 UTC, retains
the full CSS Text hyphenation section from the unchanged September 13 body.
That source identifies the August 14, 2026 CRD. The source task also makes zero
HTTP requests; it is neither a new source download nor latest-edition research.
Its limits and exact source hash are recorded in `TEXT-HYPHENATION.md`.

The selected native suite passes 21,590/0/2 unchanged skips, with 39 new feature
cases. Neither the suite nor these offline observations establish performance,
whole-site conformance, SafeJS, credentials/providers/devices/passkeys, real TTY,
broad socket or CAPTCHA acceptance. Hardware/benchmark/Astra and verified
Reddit-Poe research remains incomplete. Local commits only; no push.

Next: shared sticky-position geometry and nested overflow/scroll behavior,
followed by original-resource live flows. Overall browser goal remains active.
