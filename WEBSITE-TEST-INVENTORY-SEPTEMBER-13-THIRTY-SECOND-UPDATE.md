# Website test inventory — September 13, thirty-second update

**The Internet's current checkbox HTML is unchanged, but its actual native pointer
click still fails.** This broadens testing beyond the recent Wikipedia/Python
checks without inventing a new host or rewriting September 11 evidence.

## What ran

| Scope | Result | Not established |
| --- | --- | --- |
| One fresh native GET, `https://the-internet.herokuapp.com/checkboxes` | HTTP 200; 2,008 bytes exactly match historical body; no access challenge | Current CSS/image equality, full live page load or action |
| Separate native parse of fresh HTML | Two enabled checkboxes, expected initial states; one form; clean close | BrowserSession, layout, pointer or form submission |
| Normal BrowserSession replay of all four original HTML/CSS/PNG resources | Semantic inversion/restoration succeeds; exactly one real pointer click fails before events | Full checkbox interaction acceptance |
| No-action native CSS attribution | All 11 property guards, two selector guards and eight applicable at-rules identified | Browser support for those features or active animation/font use |

All observations occur September 13, 2026. Replay: 18:03:10.789–18:03:11.209 UTC.
Fresh GET wrapper: 18:07:13.359–18:07:13.485 UTC. Fresh native parse:
18:07:18.943–18:07:19.076 UTC. Final diagnostic:
18:08:01.531–18:08:01.891 UTC. Exactly **one new HTTP request** across these scopes;
all replay/attribution phases are offline. No fresh CSS or image request occurs.

## Interaction and performance

The retained page has 81 nodes and two controls. Native `e56` changes false→true→
false through semantic calls, with six ordered untrusted control events. Its
genuine `session.click` fails at CSS width-resolution guards and emits no events.
No CSS/image dropping, guessed coordinate, action substitution or retry is used.
All six generated Foundation table pseudos now appear as native table shells, but
that alone does not make the page actionable.

One instrumented full-asset offline run reports 0.41 seconds elapsed and
**131.5 MiB peak RSS**. This exceeds the provisional 100 MiB small-page target;
the small DOM has large retained stylesheets. It is not a repeated benchmark,
live speedup or successful-click latency measurement.

## Remaining causes

Property occurrences: text-size-adjust vendor variants (2), box-sizing vendor
aliases (3), appearance on an unknown pseudo match (1), cursor (1), interpolation
mode (1), legacy `*zoom` (1), direction (1), text-rendering (1). The two unsupported
selector lists target WebKit search decorations and Mozilla focus-inner boxes.
Seven keyframe definitions plus one font-face rule trigger the eight applicable
at-rule guards; a print-only page rule is not applicable.

Three incomplete diagnostic attempts remain preserved. The final instrumentation
uses the actual style-selector API, not a DOM syntax preflight with different
component-budget semantics. Unknown selector matches remain explicitly unknown;
no browser guard is dropped. Full details, counts, hashes and limitations:
`INTERNET-CHECKBOX-REPLAY-SEPTEMBER-13.md`.

## Overall status

This checkpoint changes test evidence, not production code. The reused audited
runtime remains 20,398 passed / zero failed / two unchanged skips, 396 selected
files / 395 strict roots / 758 manifest entries. No new native-suite pass is
claimed, and 362 manifest entries remain unselected.

Real pointer/form/navigation coverage, repeatable performance and safe access-block
handling remain unfinished. No spoofing or automated challenge solving occurs.
Wikipedia/Python rendering and interaction limits, hardware/benchmark/Astra
research freshness, verified Reddit/Poe opinions, and separate credential,
passkey-device, SafeJS, socket and TTY gates remain open. Pre-existing work is
preserved; no push. Overall browser goal: **ACTIVE**.
