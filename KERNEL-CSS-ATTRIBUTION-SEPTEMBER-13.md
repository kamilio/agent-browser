# Kernel.org original CSS attribution — September 13, 2026

**Exact native attribution, zero new HTTP; no full-resource website acceptance.**
One offline native load reuses the captured homepage and both original stylesheets.
The earlier ten-request live failure remains unchanged, including its missing logo.
No image callback, image decoding, geometry, action, raster or page script is used.

## Reconciled diagnostics

| Native diagnostic | Raw occurrences | Applicable occurrences |
| --- | ---: | ---: |
| Unimplemented property |42|17|
| Invalid/unimplemented value |15|4|
| At-rule |2|2|
| Selector |2|2|
| Total |**61**|**25**|

The57raw property/value occurrences cover21distinct properties;21applicable
occurrences cover15properties. Twenty applicable occurrences have actual native
matches; one is conservatively applicable because its selector failed. There are
zero reconciliation mismatches. These are source diagnostic occurrences, not
per-element totals or winning-declaration analysis.

The distinction matters: nine raw-only occurrences belong to unmatched rules and
27more to media-impossible rules. Counting every raw diagnostic as a rendered-page
blocker would overstate what this native formatting inspection actually encounters.

## Concrete implementation targets

- **Rounded corners:** eight raw/five applicable occurrences. Three
  `border-radius: 0.5em` declarations apply to `#latest`, `#featured, #content`,
  and `#extras > div`; two bottom-corner longhands apply to `#banner`.
- **Background image pipeline:** all four applicable value failures belong to
  `#tux-gear`, native refe32: image URL, centered positioning, no-repeat and contain
  sizing. The original background image was not fetched or decoded here.
- **Other applicable properties:** box-shadow4, transition2, opacity1,
  text-shadow1, filter1 and two vendor text-size-adjust declarations. The
  `-webkit-appearance` occurrence is conservatively applicable after selector
  failure, not a fabricated native match.

Both unsupported selector records remain explicit: the WebKit search-control
pseudo-elements and Mozilla focus-inner pseudo-elements in `normalize.css`.
Neither is asserted to match an element. Their stale `lastWork` values53are
excluded from measured query work; each failed query is instead conservatively
charged its entire100000-unit allowance.

This observation uses the earlier cursor runtime. Shared rounded geometry/raster
primitives do not yet admit these CSS declarations or establish any site pass.

## Bounded native workload

The single child runs **22:33:59.191–22:33:59.407UTC** and exits0. Native load:
857nodes/revision859, title `The Linux Kernel Archives`; one external root at e15,
two sheets and one import,21228decoded UTF-16 source units. Exactly two stylesheet
callbacks supply the original response2 and response7 bytes, without rewriting.

The scanner visits151rule/group blocks and produces145style-rule records;
383colon-bearing declarations agree with the style owner. A separate per-fragment
parser budget counts147because media wrappers are scanned rather than reparsed.
These are different measured quantities, not inconsistent page-rule totals.

Attribution makes95native queries:93successful, two failed;50media-impossible
rules skip querying. Successful measured work is15751. Total charged attribution
work is532436of2000000, including200000reserved failed-query units and127377native
import work. There are38diagnostic output records and114matching references,
without truncation. This accounting is not elapsed CPU work or a speedup.

One formatting inspection obtains applicability counts. Images are registered but
their owner records zero requests/bytes/decode work. Unfetched-asset deferrals must
not be treated as unsupported PNG/SVG evidence or a completed original-asset flow.

## Integrity, isolation and evidence

The audited cursor runtime remains21,262passed/0failed/2unchangedskips; no native
suite is rerun for this attribution. The original live46entryseal,20gate receipts,
1311source/2132compiled files and frameworks verify before/after. Kernel seccomp
and JS offline guards are installed, but no real socket probe tests them. No
filesystem sandbox or separate SafeJS/device/TTY acceptance is claimed.

Documents, queries and image owners close; private HOME/TMP remain empty and are
removed. Process group1006634is absent; no timeout/watchdog/output overflow,
guard/process attempts or cleanup errors occur. Single0.21s/94268KiB resource
accounting is not a benchmark or live acceptance result.

All paths below are under `node_modules/.cache/native-validation/`:

- `native-kernel-css-attribution-september13/EVIDENCE.sha256`:33entries, digest
  `becf2d1dc326e32f1080ba83151ff473423bc0bb5b69e65b16abe000f49468a9`.
- Its distinct `SEAL.json` digest is
  `6a16349470dc269777207aa0cd96b8342b9fe1771841b256787f80e16bea4e6b`.
- `rounded-foundation-work-september13/KERNEL-ATTRIBUTION-VERIFICATION.json`:
  independent parent check at22:38:17.418UTC,6ledgers/3590entries verified.

Raw captured bodies are not searched with external parsers or text tools. The
original fixtures remain at their original paths; this is not a fresh live capture.
Next: integrate real radius/style/curved-border/hit behavior, then original-asset
and pointer flows under their own scope. The overall browser goal remains active.
