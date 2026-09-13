# Website test inventory — September 13, twentieth update

**Verified progress: one fresh table-heavy website and repaired Apple research
selection.** This update follows the nineteenth update's native reader repair;
it does not replace historical measurements or claim the browser is complete.

## Scope and runtime

All new loads use only audited native runtime
`native-reader-colgroup-september13-round00/snapshot01/dist`: 18,931 passing
native cases, zero failures and two unchanged exclusions, 371 selected suites,
370 strict roots and 742 manifest entries. The native suite was not rerun for
these research-only follow-ups. Root `dist` and unrelated dirty work are unchanged.
The source fix is committed as `9aa37b861011dc4cafa849b6b9338f85ea07459f`.

Snapshot source ledger:
`0118f871692b76a20d5150f8fc15e5928dffb98d54fad801d4dab049905223ba`.
Compiled ledger:
`b2a50c6b1f62b880c7c2c00c1d5d34f7f62caa3971703804ae2d8336f9ac756c`.
All artifact directory names below are relative to
`node_modules/.cache/native-validation/`.

## Fresh WHATWG table document

URL: `https://html.spec.whatwg.org/multipage/tables.html`.
Capture: September13,2026 **12:16:17.507UTC**. One actual GET200; no redirect,
retry, subresource request, credential access or challenge diagnostic. This is
the only fresh website request in this update; the Apple body was already saved.

The exact 254,858-byte body loads into the native semantic reader as **10,816
nodes, depth17**. Three queries yield 19 headings, nine tables and zero column
groups; six complete headings /143textunits are retained. Querywork341,956 and
walkwork10,994 stay within their separate ceilings. Reader reports zero tokenizer
issues. Document revision is unchanged and all owners close.

This adds table-heavy reader coverage, not an additional positive omitted-column-
group reproduction. The original retained Selectors before/after gate still
provides that proof. No website geometry, CSS layout or raster test ran here.

Source SHA256:
`fb26736819aaa873821f4e0322a0e3c96b884737541f1956eea1739be058d0c4`.
Evidence: `native-whatwg-tables-september13/RESULT.json`, 50-entry ledger
SHA256 `6a849a998a44fcbe0fa5f18ca2d43c0fea31aa1da17f9262b725d6041356e744`.
Full report: `WHATWG-TABLES-NATIVE-CHECK.md`.

## Retained Apple configuration extraction

URL: `https://www.apple.com/mac-studio/specs/`.
Original capture stays dated September13,2026 **12:01:16.690UTC**; no new GET.
Source SHA256 remains
`30358c53dc69af1d99b3ebd63d686cbe8e8e5362536a9376bc93a3aff28608f4`.

The earlier heading-only query missed labels represented by native non-heading
elements. This follow-up selects complete Chip, Memory and Electrical/Operating
rows through their actual native ancestry, then checks the same rows and source
column structure through the full native DOM. No alternate browser or HTML grep.
The full-DOM load was separately scoped even though the reader succeeded; it is
not misreported as fallback recovery from a native reader failure.

| New offline phase (UTC) | Native nodes | Queries/work | Complete blocks/text |
| --- | ---: | ---: | ---: |
| Reader structure,12:20:11.872–12:20:11.996 | 2426 | 1/41478 | 22/899 |
| Reader associated,12:21:34.551–12:21:34.671 | 2426 | 1/7823 | 4/2675 |
| Full DOM associated,12:22:05.591–12:22:05.726 | 3241 | 2/56841 | 15/5265 |

Totals: **two reader loads, one full-DOM load, zero HTTP**, four queries /
106,142querywork;76,731walkwork;41completeblocks /8,839textunits across the three
separately bounded phases. Each phase stays within24blocks/20,000textunits and
100,000walkwork. Identical complete-text digests bind the Chip, Memory and
Electrical rows across reader and full DOM. Source bytes and build pins remain
unchanged, owners close, private directories are removed and process groups end.

Report: `APPLE-CONFIGURATION-RESEARCH-SEPTEMBER-13.md`.
Evidence: `native-apple-configuration-september13/RESULT.json`, ledger
SHA256 `c466ce9411a826263b85aa89f2bca71b4c5e3066411f79f190677a807226f73f`.
The original title-only report is preserved, not rewritten. New manufacturer
configuration statements remain source claims, not independent verification,
usable GPU-memory measurement, LLM throughput, price/stock evidence or a ranking.
The worker's retained preparation failure is distinguished from native loads;
all three actual native loads complete successfully.

## Remaining work

The specific retained Selectors reader failure and Apple heading-only selection
gap have verified bounded remedies. Overall browser functionality/performance,
varied-site rendering and cross-site compatibility remain open. Original hardware
performance/value ranking, benchmark research, Astra chatter and Poe opinions are
not declared complete. No real credential/passkey device, SafeJS, real TTY,
human challenge handoff or access-control bypass acceptance is established.

Next useful work: improve reusable source-section selection for non-heading
labels, test associations without assuming visual column order, and prioritize
remaining actual-page CSS failures without silently accepting vendor selectors.
Do not replace missing hardware measurements with nominal-memory arithmetic.
