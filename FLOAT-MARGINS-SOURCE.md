# Native margin-collapse source receipt — September 12, 2026 UTC

## Scope and accepted sections

This sidecar establishes captured CSS 2.2 margin-collapse and box-edge
requirements for future float integration. It does not implement a complete
collapse algorithm, validate DOM/text/height coordination, or claim a live
float fix. Only this report and the new private lane are owned.

Primary source: `https://www.w3.org/TR/CSS22/box.html`. One native HTTP 200
capture supplied native heading discovery and **two** offline sections:

| Artifact | Selected heading; native discovery reference | Selected nodes |
| --- | --- | ---: |
| `section-1.jsonl` | §8.3 Margin properties, including §8.3.1 Collapsing margins; `e395` | 476 |
| `section-2.jsonl` | §8.1 Box dimensions; `e189` | 142 |

Optional §8.6 bidi inline box handling was discovered but **not extracted**:
it is unnecessary for the vertical collapse and edge definitions requested
here. No third extraction, raw HTML search, trimming, or limit increase occurred.

Lane: `node_modules/.cache/native-validation/native-float-margins-source-september12/`.
`AUTHORIZATION.md`/`PROMPT.md` preserve the prompt; `SELECTIONS.json` preserves
native selectors; `OFFLINE-INPUT.json` pins the intact receipt/body and records
the skipped optional section. Semantic references below identify nodes within
the accepted JSON. Rules are directly extracted unless marked **inference**
or explicitly attributed to earlier sealed evidence.

## Margin values and box edges

Section 1 (`e420`–`e709`) describes margin lengths, percentages, and auto.
All four margin percentages, **including top and bottom**, resolve against
the containing block's **width**. If that width depends on the element,
resulting layout is undefined in CSS 2.2. Negative margins are allowed, subject
to possible implementation-specific limits. Auto behavior is delegated to the
width/margin sizing rules; auto is not given a universal collapse-time value.
Individual margins start at zero and are not inherited. Vertical margins have
no effect on non-replaced inline elements. The shorthand maps one/two/three/four
values to all sides, vertical/horizontal, top/horizontal/bottom, or top/right/
bottom/left respectively.

Section 2 establishes nested **content, padding, border, and margin edges**:

- Content edges define the content box.
- Padding edges enclose padding; zero padding coincides with the content edge.
- Border edges enclose borders; zero border coincides with the padding edge.
- **Margin edge and outer edge mean the same edge**. Zero margin coincides
  with the border edge; the four margin edges define the margin box.
- Margins are transparent, not painted backgrounds.

**Inference:** earlier float-placement references to outer top/bottom/left/right
are references to these margin edges, not interchangeable border or content
coordinates. With permitted negative margins, an implementation must not
silently assume every outer edge lies beyond its border edge or clamp all
margin-box dimensions nonnegative. This statement does not supply an entire
signed-geometry or placement algorithm.

## Adjoining-margin criteria

Section 1, §8.3.1 (`e730`–`e795`), says adjoining **vertical** margins collapse
subject to the exceptions below. **Horizontal margins never collapse.** Two
margins are adjoining if and only if all these conditions hold:

1. Both belong to **in-flow block-level boxes participating in the same BFC**.
2. No line box, clearance, padding, or border separates them. Certain
   zero-height line boxes from the referenced §9.4.2 are ignored for this test;
   not every zero-height box is thereby ignorable.
3. Their edges form an eligible vertically adjacent pair:
   - A box's top and its first in-flow child's top.
   - A box's bottom and its next in-flow following sibling's top.
   - The last in-flow child's bottom and its parent's bottom, when the parent
     has **auto computed height**.
   - One box's own top/bottom when it establishes no new BFC, has **zero
     computed min-height**, **zero or auto computed height**, and no in-flow
     children.

A collapsed margin adjoins another margin when **any component** adjoins it.
Consequently, a collapse group may span more than siblings or direct ancestor/
descendant pairs. Do not reduce the definition to adjacent DOM siblings alone.

## Combining positive and negative margins

Section 1 (`e854`) combines a group using the largest positive margin minus
the largest absolute negative margin. With no positive member, subtract that
negative magnitude from zero. With only nonnegative margins, use the maximum.

**Equivalent arithmetic inference:** for the complete contributor set, this is
`max(0, all margins) + min(0, all margins)`. For example, `{12, 8, -5, -3}`
collapses to 7, and `{-4, -9}` to -9. Neither summing every positive nor summing
every negative is correct.

**Inference:** a collapsed chain cannot always be represented for subsequent
combination by its net scalar alone. `{10, -5, 7}` gives 5; collapsing 10 and
-5 to 5 and then treating 5 as the sole contributor beside 7 incorrectly gives
7. Component extrema/information must survive combination. This is an
arithmetic consequence, not a complete traversal or layout implementation.

## Parent-child, empty/through boxes, and exceptions

The root element's margins **do not collapse** (`e734`). Subject to the general
adjoining conditions and boundary exclusions:

- In-flow sibling bottom/top margins collapse unless the following sibling
  has clearance (`e827`).
- Parent top and first in-flow block child's top collapse without top border,
  top padding, or child clearance (`e829`).
- An auto-height parent's bottom can collapse with its last in-flow child's
  bottom when there is no bottom border/padding, **unless** the child's bottom
  also collapses with a top margin having clearance, or, when the parent's
  min-height is nonzero, with the parent's own top (`e831`).
- A box's own margins can collapse when min-height is zero, height is zero
  or auto, it has no top/bottom border or padding, contains no line box, and
  all its in-flow children's margins, if present, collapse (`e842`). The
  earlier no-new-BFC condition still applies. Through-collapse can therefore
  extend through eligible child chains, not just childless DOM nodes.

The explicit nonzero-min-height exception (`e741`) is important: if the top
margin of a box with **nonzero computed min-height and auto computed height**
collapses with its last in-flow child's bottom, that child's bottom does **not**
also collapse with the parent's bottom.

When a box's own top/bottom margins adjoin and collapse through it, its top
border position is defined separately (`e856`–`e869`):

- If collapsed with the parent's top margin, its top border edge equals the
  parent's top border edge.
- Otherwise, place its top border edge where it would be if it had a nonzero
  bottom border.
- Its resulting position does not reposition the other members of the
  collapse group; that position is needed for laying out its descendants.

**Inference:** visually empty, used-height-zero, and eligible-for-through-
collapse are not equivalent predicates. These rules explicitly inspect
computed height/min-height, line boxes, boundaries, and collapsed child chains.
The separate height source confirms that used min/max-height substitutions
do not rewrite computed height or its margin-collapsing consequences.

## Clearance and formatting-context boundaries

Clearance separates margins under the adjoining test. A further exception
(`e736`) says that if an element **with clearance** has adjoining own top/bottom
margins, they may collapse with following siblings' adjoining margins, but the
result must **not** collapse with the parent block's bottom margin. Thus
“clearance disables every subsequent collapse” is too broad.

Section 1 directly states (`e809`–`e825`):

- Margins between a float and **any other box** do not collapse, including
  between a float and its own in-flow children.
- Margins of BFC-establishing elements do not collapse with their in-flow
  children's margins.
- Absolutely positioned boxes' margins do not collapse, including with
  in-flow children.
- Inline-block margins do not collapse, including with in-flow children.

**Inference:** establishing a BFC is a boundary between that element and its
contents, not a blanket assertion that an otherwise eligible ordinary block's
external margins can never collapse with sibling margins in the parent BFC.
Keep the box's participation in its parent's context distinct from the context
it establishes for descendants.

The earlier sealed formatting source supplies clearance's separate geometric
definition: spacing above margin-top that can be zero or negative and can alter
collapsing. That does not authorize reducing the **presence of clearance** to
`clearance > 0`; nor does `clear: both` necessarily mean clearance was actually
introduced. Determining clearance is a separate captured sizing/placement step.

## Float between collapsing margins: prior-source linkage

This subsection combines the new §8.3.1 evidence with **previously extracted**
§9.5.1, not a fresh visit or third section. The preserved file is
`native-float-formatting-source-september11/section-1.jsonl` within the cache:

- Node `e2090`: a float between collapsing margins is positioned as if it had
  an otherwise empty anonymous block parent participating in normal flow;
  that parent's position follows the margin-collapsing rules.
- Node `e2139`: references to other elements are restricted to the float's BFC.
- Node `e2137`: if an in-flow negative vertical margin in that BFC raises the
  float above where it would be with those negative margins zero, the float's
  position is **undefined in CSS 2.2**.

**Inference:** the anonymous-parent device determines a hypothetical in-flow
anchor using collapse/through-box positioning; it does not put the float itself
back in normal flow or permit its margins to collapse. A float between in-flow
siblings is not automatically a collapse barrier merely because it appears
between them in source order; apply the actual adjoining criteria and any
clearance/line-box effects.

The undefined negative-margin case is conditional, **not a ban on all negative
margins**. If the native profile restricts such cases or chooses a supported
subset, that is an explicit implementation policy, not the only result mandated
by this specification. No new placement fallback or dependency on another
browser is inferred here.

## Boundaries and outstanding work

This evidence does not by itself settle complete margin traversal, cyclic
layout, clearance resolution, float/line reflow iteration, full BFC construction,
pagination, modern flow-root/grid/flex/overflow rules, or bidi inline splitting.
No numerical “nonzero border” perturbation is prescribed for implementing the
through-box counterfactual. Earlier source-defined ambiguities remain; the
foundation's placement/shared-sizing work is not full DOM/text/height/paint
integration. No renderer test or live-page success is claimed.

## Execution, provenance, and seal

Exact runtime: **11268**, commit `8daf14b35b31a6ce086480861bb9ab60baedcec3`,
audit base `c41a545b2e3dda888c7d49bd5f3162c481a8d32b`. Metadata/pins from
`float-foundation-work-september12/RELEASE.md` are retained in `RELEASE.json`
and `RELEASE-GO.md`. Historical selected gate: 11268 passed, 0 failed, 2 excluded;
195 selected files, 194 strict roots, 591 manifest entries, 1082 source and
1924 compiled ledger entries, 7 owned files plus manifest verified against
commit, 20 receipts. Fixture-safe executable checks cover 378 source and 1512
compiled files; owned inputs are separately verified. No protected fixtures,
dirty-source runtime, builds, or historical gate reruns were used.

The metadata separately notes two legacy grid assertion failures in extended
suites; a selected-gate pass is not an all-repository pass. The failed first
foundation preparation and parent's replay packaging discrepancy remain
parent-owned historical evidence: this task neither edits nor silently repairs
or recertifies them.

Preflight UTC **2026-09-12 00:27:46.047**. Live child UTC
**00:27:51.820–00:27:52.031**: one native navigation, **one bodyless GET**,
HTTP 200, zero redirects/subresources/mocks/retries. Offline child UTC
**00:28:15.461–00:28:15.678**: two native heading sections, zero offline
navigation/wire requests. Both exited 0 without time/output failures and with
absent process groups afterward. Two offline native documents closed with zero
remaining nodes; live transport closed with zero active requests. The explicit
document-owner assertions cover the offline replays, not a separately
instrumented live-document owner census.

Lane and empty control/runtime HOME/TMP directories were **0700 from creation**.
No preparation failure, permission exception, restriction, Retry-After, or cap
failure occurred. Bounds remain 250 ms pacing, 30 s plus 5 s grace, 6 MiB
file/output, 12 MiB lane, 64 MiB free, and original long-v1/native section caps.
The second GET and optional third section remained unused. Socket-denied
seccomp/runtime guards protected offline work; no providers, credentials,
page scripts/SafeJS, TTY/device, OS-font, or alternate-client operations occurred.

Reader outcome is `extracted-unverified`, `partial: true`, with no barrier and
zero tokenizer issues; native heading discovery scanned 2173 nodes untruncated.
This bounded semantic reader omits scripts/styles and is not full rendering.
Original transport-decoded bytes are preserved: **55,745 decoded / 10,558 encoded
bytes** accounted by transport; the compressed wire stream itself is not retained.
Last-Modified is April 8, 2016, response metadata only.

Five prior seals/reports are hash-verified before/after execution and at seal:
height (56 entries), sizing (76), formatting (74), font-source (73), and fresh
OpenBSD final evidence (48). Their source bytes, outcomes, failures, and local
preparation caveats remain unchanged. Only this new lane/report were written;
no production code, shared docs, tests, manifest, old evidence, or commit changed.

| Evidence | SHA-256 |
| --- | --- |
| `response-1.body` (55,745 bytes) | `613d975ea38dd36a6a8157ab623c4236fa26ef947ca7d71e3e430ef5030b6eab` |
| `live.jsonl` (82,181 bytes) | `b27ee87e56f6718beca2d81998d2ec019736d412f3c5ad15cead42be5f1422bb` |
| `section-1.jsonl` (32,759 bytes) | `a351db004cbb7503a2965a38fd357f74109cbc62d03d5025e2531dd2ecdc0100` |
| `section-2.jsonl` (10,842 bytes) | `fac757f8a6576c385294dbe6c9f9e0a1a418e63378f16af197136a0b4068a283` |

`CHECKS.json` records named checks and capacity. `EVIDENCE.sha256` covers this
report and lane files except itself.
