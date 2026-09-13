# Website testing inventory: September 13, fourteenth update

This update separates two fresh native standards-source GETs from an unchanged-
byte TestPages replay. Native tests, source reading and website rendering remain
different acceptance gates. No full website rendering success is claimed.

## Actual TestPages declarations recovered

The previous diagnosis located two unsupported declarations on native `div`
`e2598`: dashed thin green top and bottom borders. Native parsing, used widths
and painting now support those authored borders without deleting declarations,
rewriting the page, substituting solid lines or suppressing diagnostics.
DASHED-BORDERS.md describes the primitive, image/inline integration, pattern
policy and remaining profile limits.

New replay: September 13, 2026, 09:58:27.791–09:58:28.079 UTC, exit zero.
Source remains the original 158,955-byte response from
`https://testpages.eviltester.com/pages/basics/html-tag-table/`, SHA256
`67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.
The replay makes zero HTTP/resource requests and uses audited 18,247.

One load retains 3,153 DOM nodes, revision 3,154. Four selectors inspect table,
caption, cells and the authored inline-style node. The latter now computes both
observed borders as `dashed` and `1px`. The two CSS-value diagnostics disappear.
Table/caption ownership and computed table/caption/cell styles compare equal to
the previous replay; no table feature was removed to achieve this result.

Formatting metrics remain exactly 3,073 visited DOM nodes, 3,894 boxes, 276
outside markers, 9,272 text code units, 230,608 work units and one deferred
table-coordination shell. This run is not a wall-clock speed comparison.

The one geometry request still returns unsupported: the intentionally resource-
free replay lacks the policy-aware stylesheet callback and external stylesheet.
There is no rectangle, raster or action. The actual native session already
provides the callback; TESTPAGES-STYLE-DIAGNOSIS.md explains why this is not proof
that native SRI/CORS support is entirely missing. Capturing/loading the real
observed stylesheet remains a separate follow-up, without weakening policy.

Evidence: `native-testpages-dashed-september13/`; ledger SHA256
`dd758969c37ce754e69680a30e4c5c1540de134709b80019cca1ee3a18b24156`.
Original failed geometry and prior caption-work replays keep their paths,
exit codes and measurements.

## Native dashed-border standards reading

One native GET of `https://www.w3.org/TR/css-backgrounds-3/` returns HTTP 200
without redirects at 09:44:09.714 UTC. Decoded bytes: 544,031; encoded: 79,214.
Body SHA256: `8a291792b2fd351eee443df466626d02b889d890f5d80e315bf80181b408712a`.
Last-Modified is March 11, 2024, not an independently verified publication date
or evidence that this stable URL is the latest specification revision.

The audited-18,149 semantic reader retains 11,627 nodes. Three queries use
486,715 work units; traversal uses 13,754. Three exact blocks total 278 code
units. The actual dashed definition establishes square-ended dashes. Its
accompanying note does not prescribe a numeric dash/gap ratio. The native
three-width dash/three-width gap pattern is therefore documented as UA policy,
not presented as a standard-mandated algorithm or symmetrical-corner guarantee.

The optional slice selectors find nothing on this page and terminate the offline
attempt with exit one. The positive dashed evidence remains usable, but the
offline result is partial, not an unqualified pass. No retry overwrites it.
Evidence: `native-dashed-border-source-september13/`; ledger SHA256
`d1a061aa25f1a65b218348f9e4ccae6aefccce75b5f0e8252fc1b654dbddb7ef`.

## Separate native fragmentation source

One new native GET of `https://www.w3.org/TR/css-break-3/` returns HTTP 200
without redirects at 09:49:43.952 UTC. Decoded bytes: 171,462; encoded: 32,270.
Body SHA256: `4d47d4b2dd36a28e2b0275833b9734b1d5a0b18299a3f278e238bed8e2ecd509`.
Last-Modified is December 3, 2018; no latest/publication-date claim is made.

This uses the same historical audited-18,149 runtime, not the new 18,247 build.
It retains 5,721 nodes. Three selectors match the actual break-decoration,
property and slice-value anchors; query work is 97,418 and traversal 9,420.
Twelve exact native-text blocks total 3,191 code units.

The retained slice definition describes an unbroken decoration divided at actual
breaks rather than inserting borders at those breaks. Another retained paragraph
makes the parent's inline progression determine the broken edge. These statements
do not establish general RTL/bidi/vertical support in the native painter.
The retained composite-box introduction explicitly concerns backgrounds and
border images; do not misquote it as a numeric ordinary-border dash algorithm.

The source extraction still exits one because its complete inline-joining
coverage predicate is unmet. Its paragraph/list-item selection misses other
definition-list bodies. This is a new bounded extraction limitation, not another
missing-ID failure or evidence that the rule is absent. The source and current
simple-LTR rendering tests are distinct; complete fragmentation conformance
remains unclaimed. Further native definition-list inspection is separate.
Evidence: `native-border-slice-source-september13/`; ledger SHA256
`f482e0935a36db32f6abeee306029020ce68561a46d44168124d2b6986c5bc1a`.

## Native validation

New cases: 23 document-level and 32 primitive cases. The existing 43-case border-
core suite is also newly selected. Unchanged production gives 45 pass/21 fail;
all 43 existing cases pass, while 21 new document cases reproduce the feature gap.

First integrated focused run: 751 pass/two failures. One assertion expected an
internal collapsed-border message rather than the public formatting diagnostic;
one old text-layout guard still expected dashed to fail. Corrected focused run:
753 pass/zero failures over 18 suites. The first broad run then finds a stale
CSS.supports expectation: 18,246 pass/one fail/two unchanged exclusions, no final
audit. Updating that expectation to true gives final focused 829/0/0 over 19
suites/19 strict roots. No production capability query is special-cased, and no
new exclusion hides a changed expectation.

Final clean broad run: 09:54:07.960–09:58:19.825 UTC; audit 09:58:19.936.
18,247 pass, zero failures and two unchanged historical exclusions. Scope:
357 selected suites, 356 strict roots, 734 manifest entries, 377 suites unrun.
Build, strict checking, formatting and source stability pass. The audit binds
1,269 source files, 2,100 compiled files and 1,258 unchanged tracked inputs.
The historical snapshot strict-root omission remains explicit.

Audit base: `e6b8d562101da0809b9eea33652db0bd7ebd7793`.
Audit lane: `native-dashed-border-september13-round01/`.
Source ledger: `b948420be62e10ee4195427512cec05b5fd03c0d2663f74f61226a3b257a3ac3`.
Compiled ledger: `a91c5ce58c003c16eef109e5e9170c9bf5ae8af62584afe16d86a6a4018eec5b`.
Native result: `cb4d884a97ab6a5c4c84862b2198f5dcf4f5d2d77d2c1e2f1765d3702329e635`.
Summary: `176aa05e9584bfa3ce87247bfa1bcdb78795f68a06b372104ebb9e60c3d72c65`.
All lane names are under `node_modules/.cache/native-validation/`.

Source and page lanes verify before/after runtime pins, closed native owners,
absent process groups, zero unexpected guard attempts and empty private HOME/TMP
cleanup. They do not run credentials, devices, SafeJS, real TTY or challenge
interaction. Root dist and unrelated uncommitted work remain unchanged; no push.

## Open work

Load the observed real stylesheet through policy checks, then inspect the actual
result rather than calling a resource-free replay a site pass. Continue varied
site coverage and the original hardware/benchmark/Astra/Poe research. Collapsed
dashed-table conflicts, complete fragmentation, other border styles and full
rendering remain open. Password/passkey devices, SafeJS, real TTY and human
challenge handoff remain separate gates. The overall browser goal stays active.
