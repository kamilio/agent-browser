# Emergency wrapping and soft-hyphen minimum widths

September 14, 2026 increment based on `fcaacd8`. This repairs the shared
intrinsic-sizing failure recorded in `WORD-BREAK.md`, rather than changing
expected results or hiding the two failing characterizations.

## Correction

Previously the minimum-content pass finished an entire discretionary prefix
before it considered emergency opportunities. With `ab\u00adcd` and 6px glyph
advance, it reported an 18px minimum even though used layout could fit all four
letters on separate 6px lines. This affected both `overflow-wrap:anywhere` and
the independently inherited `word-break:break-word` compatibility mode.

The shared `flushWord` path now partitions minimum-content words at their valid
emergency boundaries before processing discretionary hyphens inside each
unsplittable piece. Terminal invisible markers add no invented hyphen glyph;
manual opportunities inside emergency-disabled islands remain available.
The existing complete-source grapheme/transformed-unit boundaries, inline
open/close ownership, final trailing gap and work/token/line caps remain shared.
Production changes only `src/text-layout.ts`, without a new dependency.

At a fixed available width the used-layout hyphen-priority algorithm does not
change, and maximum-content traversal remains unchanged. Real shrink-to-fit
consumers can now choose a narrower width and intentionally reflow. Native tests
verify 6px instead of 18px inline blocks, explicit fixed-line raster references,
same-point hit ownership changes, style reset and retained snapshots.
`overflow-wrap:break-word` still excludes emergency opportunities from its
minimum and retains the 18px control value.

## Verification

The three new explicit suites contain 40 cases: 28 core/policy/work-budget,
nine mixed-boundary/Unicode/whitespace and three native integration cases.
The identical final tests on old production yield nine passes and 31 failures.
The final 17-file focused selection passes 530 cases, with production build,
strict selected types and scoped formatting passing. The exact original
37-case characterization source also reruns unchanged: all 37 pass, repairing
its two earlier failures while preserving the other 35 cases.

The final **488-file selected native profile passes 23,975 cases, zero failures
and two unchanged exclusions**, plus production build, 487-root strict types
and scoped formatting. All 23,937 prior case occurrences retain their identities
and statuses; 40 passing cases are added without migrations. The clean manifest
contains 840 files; this profile does not claim that every manifest entry ran.
All unowned source files match base Git bytes. Inventories cover 2,955 source
and 2,200 compiled files.

The full profile runs **16:34:46.831–16:41:13.526 UTC**, September 14; native
execution is 16:35:06.597–16:41:13.281. Final audit passes at 16:42:06.252 UTC.
Evidence is under `/dev/shm/agent-browser-hyphen-emergency-september14/`, final
gate `release00/`, with durable persistence planned under
`node_modules/.cache/native-validation/hyphen-emergency-september14/`.
The native result SHA-256 is
`a1c409fbbaaded75bb4933e1c8353ba079fa02958449510f1f3019a46e084727`;
the original-characterization rerun SHA-256 is
`0ea7101526547093c408bdbfad4d68b2e0ad05df6ff8bbdae555983c772fff49`.
`AUDIT.json` binds source, compiled, review and work-comparison hashes.

Native-only checks do not stand in for live website, browser-reference, SafeJS,
real socket/TTY, credentials, provider, passkey-device or challenge acceptance.

## Work and limits

The homogeneous repeated-SHY work-growth regression passes. A separately
audited pair measures the same native intrinsic fixture before and after:

| Repeated `ab` + SHY groups | Visible glyphs | Old minimum-pass work | New work | Reduction |
| ---: | ---: | ---: | ---: | ---: |
| 128 | 257 | 53,784 | 10,145 | 81.14% |
| 256 | 513 | 205,848 | 20,257 | 90.16% |

Doubling the input changes measured work by 3.8273× before versus 1.9967× after.
Both minima change from 18px to 6px; maximum widths and all maximum-pass metrics
remain identical. The instrumentation and assertions are identical across the
pair. These are charged native work units for these fixtures, not elapsed-time,
process-memory, host-ICU cost or general website-speed measurements.

The first console-instrumented pair executes its tests but yields no counters
because the JSON reporter suppresses the messages. Those records are retained
without a quantitative claim. The final pair writes exclusive 0600 JSON
artifacts into the isolated runner directories; the old failing assertions
remain intact. `WORK-COMPARISON.json` records the verified inputs and hashes.

An independently reviewed protected manual island case confirms that its valid
18px minimum and charged-work rejection survive this change. That older
manual-only path can still be quadratic; the homogeneous measurements do not
establish near-linear behavior for every mixed-policy word.

The emergency boundary helper is preserved, not replaced with full language or
font shaping. Arbitrarily placed explicit soft hyphens are not newly validated
against grapheme boundaries by the manual-break algorithm; that existing limit
is not misrepresented as a new Unicode conformance guarantee. The recursive
partition layer reuses disjoint strictly smaller slices; bounded native work
is not a hard host-ICU execution-time guarantee.

Fresh primary-source lookup returned no readable content in this increment.
The implementation is supported by executed native counterexamples, existing
policy contracts, mixed-policy regressions and independent source review, not
an invented new standards retrieval. Broader website/research/performance gates
remain open. Historical reports and captures retain their original measurements.

## Retained site coverage

A separate static inventory, rehashed by the parent, checks 44 documented public
response bodies across Wikipedia, MDN, Python, RFC, man7 and HN: 12 HTML and
32 CSS files, 2,936,617 bytes, 39 unique byte identities. None contains the
specified literal or entity soft-hyphen forms. This is a bounded negative
source result, not a website run or evidence that current live pages lack them.
`RETAINED-SITE-CANDIDATES.md` and `SITE-CANDIDATES-VERIFIED.json` retain paths,
capture dates, hashes, duplicate accounting and adjacent wrapping declarations.

The retained MDN querySelector page has real sidebar `overflow-wrap:anywhere`
source but no soft hyphens. Its last observed load stops on an uncaptured SVG;
it needs a separately scoped resource-complete check, not a stripped stylesheet
or injected character masquerading as original-site coverage. Python's retained
homepage-to-Tutorial flow is another adjacent varied-site regression candidate.
Neither is newly executed by this increment. No push; the browser goal stays
active, with broader varied-site, research, provider/passkey and challenge work
still outstanding.
