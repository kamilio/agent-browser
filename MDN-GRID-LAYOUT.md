# MDN Grid layout replay — frozen round02

## Outcome and scope

**Primary blocker: `Positioned Grid boxes require Grid-area coordination`.**
The bounded replay completed, but the native click failed before geometry completed;
the shared geometry cache recorded **0 completed builds**.
One offline candidate navigation loaded all 19 original responses. Native link
queries, one explicit formatting diagnostic, and one unchanged native click ran;
there was no retry, second navigation, destination request, or wire traffic.
Child exit zero means the diagnostic procedure and cleanup completed, **not**
that MDN rendered or the click succeeded.

Only the immutable
`node_modules/.cache/native-validation/native-grid-layout-september11-round02/snapshot01`
was imported. Its actual gate was independently verified: **8,095 passes,
0 failures, 1 existing exclusion**, 131 selected files / 130 strict roots,
554 manifest entries, 1,017 source files and 1,812 compiled files. Build, strict,
formatter and native commands all exited zero with stable inputs. The gate ran
September 11, 2026, 13:44:24.605–13:46:09.275 UTC. The strict omission remains
`src/snapshot.test.ts`; the excluded test remains “exposes the separate total
host-object ceiling without claiming full-pool runtime capacity.”

Failed round01 and working source were not replayed. **No later source-review
fixes are included or validated**, including the separately investigated nested
percentage-row/overflow-alignment edge cases. The parent's completion note and
its hash are preserved in this lane; this is not a latest-source acceptance claim.

## Exact click boundary

Native `main a[href]` discovery found 49 links, including two matching
`/en-US/docs/Web/API/Document/querySelectorAll`. The first observed match was
`e1673`, text `querySelectorAll()`, empty target. The other was `e2010`.
Selection followed native DOM query order, not a hardcoded historical reference.

The single unchanged `BrowserSession.click`, using its original signal-only
options and default bounded actions, threw:

> AgentBrowserError (unsupported): Positioned Grid boxes require Grid-area coordination

The recorded stack reaches `DocumentScrollIntoView.plan` → shared
`DocumentGeometry` → `layoutDocument` → `layoutPageDocument`.
The frozen guard at
`node_modules/.cache/native-validation/native-grid-layout-september11-round02/snapshot01/src/flex-document.ts:39`
rejects an absolute/fixed Grid container or an absolute/fixed immediate Grid
child before further page-width/layout coordination. This is the observed first
barrier, not an inferred failure at the later issue-free width guard. The probe
did not separately isolate the triggering positioned node.

Shared geometry metrics remained revision `-1`, completed builds **0**, rectangles
**0**, used styles **0**, work **0**. A layout attempt occurred and threw; these
zeros do not mean no computation was attempted. No completed page-layout metrics
or link rectangle were available. The uncaptured-destination denial branch was
not reached; no destination content was requested or fetched.

## Formatting and CSS observations

One explicit diagnostic formatting build returned **1,753 formatting boxes—not
used geometry**—from 1,743 visited
DOM nodes, 11,446 text code units and **23,907 work**. It exposed **10 Grid shells /
47 Grid-item-marked nodes**, plus **44 Flex shells / 65 Flex-item-marked nodes**.
These are formatting structures, not resolved Grid tracks or successful item
reflow on MDN. Click-internal formatting remained the unmodified production path;
“one diagnostic build” does not assert only one internal build overall.

Of 108 deferred subtrees, 54 are coordinated `contentMode: grid/flex` shells and
**54 are non-coordinated deferred nodes**. The first **20**, in formatting order,
are preserved in `formatting-diagnostic.json` and `RESULT.json`. The sample starts
with list-item deferrals `e76`, `e82`, then element deferral `e102`; it also
contains unsupported element nodes whose display is Flex and five Grid-item
list-item deferrals `e1549`, `e1554`, `e1559`, `e1564`, `e1569`.
Only legitimate content-mode shells were excluded from that sample. No node,
CSS declaration, formatting issue or width guard was removed or changed.

Aggregate non-CSS formatting issues: `display-layout-not-supported` **95**;
`positioned-layout-requires-coordination` **2**;
`position-layout-not-supported` **4**; `element-layout-not-supported` **13**;
`overflow-layout-not-supported` **18**;
`html-presentation-hint-not-supported` **1**. Shell counts must not be mistaken
for unsupported nodes requiring removal. Other formatting/CSS barriers remain;
bypassing the first positioned-Grid guard would not establish renderability.

At the original **1,280 × 720** viewport, 18 sheets yielded 591 rules,
1,446 declarations, 84,329 CSS code units and **2,894,159 / 5,000,000 cascade
work**, with one cascade build. CSS issue counts remain: unsupported property
**261**, at-rule **14**, invalid/unsupported value **25**, selector **29**, media
query **24**. No stylesheet/image admission limit was reported. Document revision
remained `2750` through observation and the failed click.

All five style selectors matched once. Body `e72` retained `display: grid`,
columns `minmax(0px, 1fr)` and rows `min-content min-content 1fr min-content`.
Nested Grid `e1436` retained named tracks with computed 240px sidebar minima,
32px gaps and 768px content maximum, plus both named-area rows. Header/body
placements remained `header`/`body`; `main#content` remained `contents`.
Full `DocumentStyles.get/grid` values are retained in `RESULT.json`; they are
computed CSS, not used geometry.

## Isolation and evidence

The private evidence root is
`node_modules/.cache/native-validation/native-mdn-grid-layout-september11/`.
`RESULT.json`, `formatting-diagnostic.json`, `EXECUTION.json`, `INTEGRITY.json`,
`VERIFICATION.json` and `RECEIPTS.sha256` preserve observations and checks.
Preparation evidence remains unchanged, including `REPORT-PREPARED.md`.

- Original URL/status/header/body fidelity verified for all 19 ordered responses
  (270,288 decoded bytes). Native transport correctly records **19 requests / 19
  mocked requests**, with **0 encoded bytes, redirects or wire requests**. Original
  compression headers accompany captured transport-decoded bodies, not new wire
  bodies. The final check re-verifies 45 original, 41 compound-pair and 23 prior
  Grid CSS receipt entries.
- Original viewport, document/stylesheet/transport/cascade/query limits retained;
  no credentials, scripts, SafeJS, live requests, sockets, TTY, alternative browser,
  synthetic activation, injected boxes or extra geometry probe. Seccomp and
  JavaScript guards recorded no attempts. The 30-second + 5-second policy and
  6 MiB caps held; child duration was **414 ms**, with empty stderr and no timeout.
- Session/transport/document/geometry closed, with zero pending loads, storage
  events, active transport work, retained document nodes or cleanup errors.
  Native method descriptors were never overridden and remained identical.
  Post-event-loop settlement took **0.3013 ms** within its 100 ms window; private
  home/tmp were empty and removed, and the child process group disappeared.
- All source and compiled inputs matched before/after and final file-only checks.
  Source inventory SHA-256:
  `cb04441b79515cb1f263ebeb75195ccacd31a250b58ab86c306aaac45482a202`;
  compiled inventory SHA-256:
  `a926d37a23adbfb588a771e7feed49d49c04629af20c82394fdf6960758a1c66`.

Only this report and its assigned new lane were written. No production source,
tests, manifests, prior reports/evidence, `TASKS.md`, or commits were changed.
