# Native source-preserving case transformation

## Supported behavior

The native inline formatter supports inherited `text-transform: none`,
`uppercase`, `lowercase` and `capitalize`. Mapping happens before intrinsic
measurement and wrapping, across in-flow inline text rather than independently
at every element. Atomic content and forced breaks delimit mapping contexts;
out-of-flow content does not introduce a spurious word boundary. No source DOM
text is rewritten, no alternate renderer is used, and no dependency is added.

Upper/lower mapping includes Unicode expansions and conditional casing:
Greek final sigma and Turkish, Azeri and Lithuanian special contexts. Capitalize
uses an explicit English `Intl.Segmenter` word/grapheme policy and Unicode
titlecase mappings for eligible initial lowercase typographic units, not a
promise of every language's title conventions. The default path avoids mapping
allocation when no transform is active. No measured speedup is claimed.

Language metadata resolves bounded DOM ancestry, including `display:contents`,
with namespace-aware `xml:lang` precedence over `lang`. Empty or invalid values
stop ancestor inheritance and select language-independent casing. HTTP
Content-Language fallback is not implemented. Font-relative metrics, width
calculation, hit positions, source ranges, selection and painting share the
existing native layout pipeline.

Expanded visual glyphs retain their original source reference, offset and UTF-16
span. Range and editable overlays consolidate source geometry rather than
inventing character offsets. Selection backgrounds paint once per source span,
without erasing earlier glyphs in an expansion. Conditional deletions retain a
zero-advance source glyph; raw text and copy/range string contents stay unchanged.

## Unicode data and explicit limits

UNICODE-CASING-SOURCE.md records the separate native-browser capture of fixed
Unicode **16.0.0**, matching the measured Node22.22.0 ICU77.1/Unicode16 runtime.
It is not a latest-version claim. The generated table contains161 title mappings,
16 conditional mappings and323 canonical-combining-class ranges covering934
nonzero-class codepoints. Original source headers, licensing references, full
responses and their hashes remain in the source capture; no additional license
page was fetched. Native String casing supplies ordinary full upper/lower maps.

Generated source uses ASCII Unicode escapes. The existing local formatter was
observed removing literal combining marks from generated data; sealed evidence
retains60 input marks versus0 output marks. The escaped representation avoids
that loss.179 integrity cases compare title/conditional outputs to independently
extracted hexadecimal fields and check the combining-class inventory. This is
an observed local-tool issue, not a claim about all formatter versions.

The planner bounds inputs to50000 entries,500000 source UTF-16 units and1500000
output units, charging work and retaining existing tighter native token, line,
fragment, range and raster limits. None of these limits is raised for a website.
Full-width/full-size-kana syntax is retained by the CSS parser but its rendering
still rejects explicitly. Existing bidi, complex shaping and original
combining-mark Range guards remain. This is not complete CSS Text/Unicode
typography, vertical-writing or browser conformance.

CSS parsing uses bounded ASCII keyword normalization and CSS whitespace around
declaration values, including top-level `!important` handling. Lookalike Unicode
letters and non-CSS whitespace are not silently accepted as transform keywords.
This focused declaration-path correction does not claim a tokenizer-wide or
every-CSSOM-entry-point normalization rewrite.

## Coverage and retained failures

There are491 new cases:93 CSS cases,41 mapping cases,179 data-integrity cases,
71 source-range/selection/caret cases,64 layout cases,40 resource cases and3
canonical geometry cases. The existing text-property enumeration changes its
expected count from8 to9 without adding a case. Another399 existing cases across
12 range/editable/overflow-wrap suites are newly selected, not newly authored.
The three canonical geometry fixtures retain their original baseline bytes.

Private development evidence remains under
`node_modules/.cache/native-validation/text-transform-work-september12/`.
The original14032 baseline fails all3 canonical cases at the unsupported-profile
guard. Initial CSS testing preserves2 genuine keyword-normalization failures.
A broader CSS-worker check has1836pass/4fail; the same four stale property-count
expectations fail against untouched14032 and were outside both the prior and
current full selection. They are not silently fixed or counted as passing.

Main fixed10 preserves572pass/3fail from formatter-corrupted Lithuanian data.
fixed11 passes575 after escaping; fixed12 passes754 including integrity tests;
fixed13 passes1191 after integrating layout, limits and broader range coverage.
Worker reports preserve setup failures, the initial layout fixtures' retained
combining-source Range guard and corrected resource-fixture expectations.

## Independent geometry review

The initial round00 broad candidate passed14911/0/2 on September12,2026,
17:09:22.762–17:12:34.662UTC. Independent review still found two defects: valid
zero-font transformed text disabled ranges for neighboring visible text, and
exact floating-point adjacency rejected legitimate fractional-font expansions.
That passing candidate and its review remain unchanged historical evidence.

Six added native cases produce1192pass/5fail before the corrections in fixed14;
the sixth is a successful fractional control. Zero-font metrics now accept zero
advance, while negative/nonfinite metrics and inconsistent zero-font advance
still reject. Source adjacency allows only finite, scale-bounded roundoff of
four machine epsilons. Real subpixel gaps, overlaps, interrupted identities,
mixed lines and other ambiguous source geometry still reject.

Five additional helper cases cover zero-font expansions, both roundoff
directions and real one-millionth-pixel gaps/overlaps. fixed15 passes1201 and
retains one fractional0.1px editable-selection failure after Range succeeds.
The same bounded comparison now handles transformed-glyph rectangle containment;
unmarked glyph containment retains its previous behavior. All11 review cases
and their original failing snapshots remain in the evidence directory.

fixed16 passes1201 and preserves one control-oracle failure: transformed0.1px
selection is correctly ready then clipped by integer raster bounds, while its
literal unmarked control remains unsupported at the old containment check.
fixed17 explicitly asserts both outcomes rather than regressing transformed
behavior or changing unmarked containment; all1202 selected cases pass. The
original fractional range comparison, raw text and caret assertions remain.

Independent follow-up confirms both original findings resolved within its scope:
11 original Range cases succeed, three fractional transformed fixtures match
literal-control Range geometry, and12 transformed source-boundary caret checks
pass. The tiny literal selection/internal-caret limits are independently confirmed
on native14032 and left unchanged. A selection containing only zero-font text
remains zero-advance, and its zero-height caret remains unsupported like the
control; neighboring visible selection/carets work. The follow-up's intentionally
nonzero diagnostic logs and its separate successful verdict remain distinct.

Native tests do not establish live HTTP, navigation,
site compatibility, challenge handling, provider/passkey/device or SafeJS gates.
The prior Selenium CSS reports remain observations of their original releases,
not retrospectively changed results.

## Final isolated validation

Immutable lane:
`node_modules/.cache/native-validation/native-text-transform-september12-round01`.
Build, strict TypeScript, existing formatter and explicit native selection pass
on September12,2026,17:21:44.328–17:24:56.781UTC:

- **14922 passed, zero failed, two unchanged exclusions**.
- 290 selected suites,289 strict roots and668 clean-manifest entries.
- 1176 source files and1992 compiled files;1155 other tracked inputs match HEAD.
- 20 owned source/test inputs plus the clean manifest are independently audited.
- Pre-existing CSS-parser10/10 changes remain outside the clean projection.
- No socket/socketpair, SafeJS, provider, device or TTY acceptance probe occurs.

The two unchanged exclusions are the focus-provisioning total-host-object-ceiling
case and the media-fallback unsupported-display case. They are not passes.
Complete inventories, stable inputs, selected counts, exclusion names, command
times and all receipts are retained in AUDIT.json and RECEIPTS.sha256.

```text
source inventory SHA256
aa918afbcb610944045f6ffbcb7247c7f56e5250cc37d9927aeac35659ac4d08
compiled inventory SHA256
2f3a25e8ca090e4c83a1232cf60726a5779bbff760d1856a8649913c0da04895
native result SHA256
dcb7cd3b6d01a76e456445a7dd9c9f45e489c27b73e21dac2cbef1bb6a719dd5
```

This result is separate from the initial14911 gate and the retained14032 release.
Commit-to-snapshot binding is recorded in the new lane's
COMMIT-VERIFICATION.json after the atomic feature commit; no push is implied.
