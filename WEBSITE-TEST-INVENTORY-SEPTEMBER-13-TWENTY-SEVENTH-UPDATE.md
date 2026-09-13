# Website test inventory — September 13, twenty-seventh update

**Effective Go content coverage passes; Python's remaining CSS errors are now
attributed to exact declarations and nested-rule syntax. The actual Python
Tutorial click still fails.** This work does not change production code, rerun
native unit tests or claim full website behavior. It continues the twenty-sixth
inventory without rewriting any earlier failure or measurement.

## New native Effective Go coverage

One actual GET of `https://go.dev/doc/effective_go`, received at
`2026-09-13T15:31:11.935Z`: HTTP 200 HTML, 142,913 decoded / 51,485 encoded
bytes. No redirects, retries, subresources or credential access. Decoded SHA-256:
`31b3beeb4fea135b85070f0362a1373b5e67981b8d6adc4afbb7291e06cdac5f`.

One native long-v1/default-raw-policy reader and one separately authorized,
independent full-DOM comparison load use identical bytes. Both complete with
matching semantic counts and all 24 sampled labels equal after ignoring refs.
The full-DOM result is not fallback success masking a reader failure.

| Native observation | Reader | Full DOM |
| --- | ---: | ---: |
| Nodes | 4,259 | 4,328 |
| Headings | 60 | 60 |
| Links | 123 | 123 |
| Pre elements | 153 | 153 |
| Code elements, including nested in pre | 589 | 589 |
| Native queries / query work | 3 / 92,983 | 3 / 95,830 |
| Sampled complete labels / text units | 24 / 718 | 24 / 718 |
| Observed load-path milliseconds | 52.506852 | 45.045816 |
| Observed query milliseconds | 13.085534 | 16.408644 |

These single sequential timings have different decoding boundaries; they are
**not a speed comparison or reproducible performance benchmark**. The reader
omits scripts/styles and other subtrees under its declared profile. Full DOM
retains 11 script-not-executed, one iframe-not-loaded, three misnested-body-end
and three unmatched-end-tag diagnostics. None is suppressed. No styles,
resources, scripts, actions, layout or raster are exercised.

All three native phases close their owners, remove empty private HOME/TMP,
verify complete source/compiled pins and end with absent process groups, zero
exit codes and empty stderr. Header/content challenge checks are bounded
heuristics, not proof of recognizing every access restriction. The earlier Go
homepage navigation failure and policy-denial-stop limitation remain unchanged
in `GO-STYLESHEET-DOCUMENTATION-FLOW.md`.

Report: `GO-EFFECTIVE-NATIVE-CHECK-SEPTEMBER-13.md`. Lane:
`native-go-effective-september13/` under `node_modules/.cache/native-validation/`.
Parent rechecks all 71 sealed payload digests; ledger SHA-256:
`4f87fdccf39965e814935210e3179b538941b9fdd550e13665060afc98366f70`.

## Python's exact remaining CSS blockers

No new Python HTTP occurs. Three separately preserved native diagnostic attempts
reuse the exact eight mixed-date captures from the earlier complete-asset
replay. Every actual Tutorial click still fails. The final attempt applies
existing native decoder/import/scanner/declaration/rule/media/selector APIs,
without raw-source grep, stylesheet changes or filtering errors out of layout.

The resulting native attribution matches **all nine property and three value
errors** in the loaded native document's applicable-style metrics:

| Cause | Native diagnostic count |
| --- | ---: |
| Hyphens auto plus three vendor-prefixed variants | 4 unsupported properties |
| Cursor pointer | 1 unsupported property |
| Three matching border-radius declarations | 3 unsupported properties |
| Text-underline-offset auto | 1 unsupported property |
| Text-align justify | 1 invalid/unsupported value |
| Text-decoration underline 1px | 1 invalid/unsupported value |
| Nested pre rules inside div.body parsed as one declaration | 1 invalid/unsupported value |

These are per-rule diagnostic counts, not affected-element counts. The
hyphenation/justification rule matches 32 elements; decoration matches 96 links.
The same rejected nested statement parses natively as three standalone `.good
pre`, `.bad pre` and `.maybe pre` rules with valid border shorthand components.
No expanded selector is installed into the actual page. This identifies a
nesting compatibility gap, not a completed nesting fix.

Native computed styles and formatting identify exactly two middle-aligned
inline replaced images, `e283` and `e759`. A third middle-aligned span, `e732`,
is block-level and is not a third inline-alignment error. Sticky sidebar and
overflow-wrapper problems remain independent.

The final bounded attribution visits 853 DOM nodes, seven stylesheet roots and
one import, totaling 51,314 CSS units. It makes 29 native selector calls using
12,455 work units. Shared native parser budget: 576 rules / 1,115 declarations,
below 8,192 / 16,384 limits. All nine diagnostic records reconcile exactly;
document revision, fixtures, runtime and execution frameworks stay unchanged.

The first attempt's wrong vertical-alignment accessor failure remains intact.
The second successful attribution used per-call rather than aggregate parser
budgets; it is not aggregate-bound acceptance. The final attempt fixes that
harness enforcement, retains the original failures and records nested-rule
syntax. No production source is changed. Owner cleanup, guards and private
directories pass, but no click or rendering success is inferred.

Report: `PYTHON-CSS-ATTRIBUTION-SEPTEMBER-13.md`. Final lane:
`native-python-css-attribution-september13-round02/`. Its 281-entry whitelist
binds all three attempts, frameworks, upstream provenance and report. Ledger
SHA-256: `862818d643e211d6b91da8a7abe6caa52e4772b147eba18c9e553fe83c43ae70`.

## Native primary-source nesting research

A separate single native GET of `https://www.w3.org/TR/css-nesting-1/` returns
HTTP 200 at `2026-09-13T15:38:42.283Z`, with 213,027 decoded / 39,883 encoded
bytes, no redirects/retries/subresources. Decoded SHA-256:
`b29b0db74b96af295efcd7cd94f34366dd099ebb905dc5529c61409184f6fa9c`.
The native document identifies a **January 22, 2026 Working Draft**. That
publication date is not the September 13 retrieval date, and neither proves
latest-standard status.

One long-v1/default-policy reader succeeds, retaining 12 complete sections and
22,546 text units from 3,444 nodes. One native heading query costs 54,481 work
units; charged traversal/text work is 34,091. There is no second load or fallback.
The captured sections distinguish nested relative selectors, largest-parent-
list specificity analogous to `:is()`, type ordering around `&`, source-ordered
nested declaration runs, and conditional-group nesting context. They also
distinguish ordinary nesting from nested declarations' pseudo-element behavior.

**Coverage is incomplete:** the fixed label selection retains an index section
but misses formal syntax/recovery material. General invalid nested selector-list
recovery and the precise implicit-`&` insertion algorithm remain unverified.
Do not fill those gaps by guessing or claim a complete implementation contract.
The source's exponential-expansion example motivates bounded compact selector
handling; it does not establish a numeric standard complexity limit.

Report: `CSS-NESTING-PRIMARY-SOURCE-SEPTEMBER-13.md`. Exact refs, section hashes,
draft/status dates, normative/example distinctions and limitations are preserved
in `native-css-nesting-source-september13/`. Both phases keep the same audited
runtime, closed owners, empty removed private directories, absent process groups
and no guard attempts. This is source research, not a browser nesting fix or
rendering test.

The parent verifies all 73 **lane-relative** evidence entries. Ledger SHA-256:
`bf474685b02d1286e2076200b4aed945b68fdea643f4fee5d8dffc93a6c3ab66`.
An initial parent digest command used the repository rather than lane as its
path base and failed before checking a payload; the corrected path-base check
passes without modifying evidence or repeating any browser operation.

## Unchanged runtime and open gates

All probes import only the last audited
`native-generated-clear-september13-round00/snapshot01/dist` runtime. Its
19,803 passed / zero failed / two unchanged skipped tests, 384 selected suites,
383 strict roots and 749 committed-manifest entries are **inherited evidence,
not a new test run**. There are still 365 unselected entries.

- Audit base: `ea00b5b71952efeae0f7467e3c3280b9dc7471bb`.
- 1,290-input source inventory: `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619`.
- 2,124-file compiled inventory: `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9`.

Next work must implement and test actual missing behavior—particularly nesting,
CSS decoration/justification, hyphenation, inline alignment and sticky/overflow—
not ignore declarations merely to remove diagnostics. Varied-site interaction,
script/resource coverage and reproducible performance measurement remain open.
Original four-topic research gaps remain as recorded in
`RESEARCH-STATUS-SEPTEMBER-13.md`; this work does not fill the Reddit/Poe gap.
Credentials, passkey devices, SafeJS, sockets and real TTY/PTY retain separate
gates. No fingerprint spoofing, challenge solving or push occurs. Goal ACTIVE.
