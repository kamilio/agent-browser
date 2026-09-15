# Saved-page visibility and noscript challenges — September 15, 2026

## Scope and finding

**Seventeen existing public captures, zero new website requests.** Compare the
default reader and its two existing explicit source-visibility policies. These
are controlled in-memory response experiments, not new live website validation.
Original receipts, decoded bodies and historical outcomes remain unchanged.

GOV.UK's cookie banner is itself marked hidden, not just the contradictory
accepted/rejected paragraphs. Both policies correctly omit its buttons too while
retaining driving-services content. No cookie-consent action occurred. The first
probe's button-retention assertion was incorrect; its failing run is preserved.

A corrected probe found that the saved Library of Congress primary-header
projection does not include the live `cf-mitigated` header. Its original receipt
still records the confirmed Cloudflare challenge and ordinary replay stays
denied. When only projected headers/body are supplied to a development transport,
the old classifier misses the title `Just a moment...` paired with `Enable
JavaScript and cookies to continue`. It returns an HTTP failure, not a challenge.
That diagnostic-triggering run is also retained.

## Implemented fix

Add that exact bounded marker pair to native HTML challenge detection. Without
independent provider evidence, it reports **possible / unspecified**, not confirmed
Cloudflare. Existing header precedence, status/MIME gates, title/text bounds,
normalization, word boundaries and property-access safety remain. Generic
JavaScript app notices and differently titled articles do not trigger it.

Default and source-filtered workflows now stop that projected response as a
semantic barrier. Unfiltered diagnostics retain hidden challenge markers. The
original failure remains a failure: no header fabrication, retry, page script,
identity rotation, CAPTCHA solver or bypass. See `NOSCRIPT-CHALLENGE.md`.

## Validation

- Clean base: `73ba0e62444c26ccc45564be9dd3fedd915dee0b`.
- Candidate: base plus one production file, two new test files and canonical
  native-test registration, excluding unrelated dirty working-tree changes.
- Baseline **1095/1095**, 12 explicit native files; candidate **1218/1218**, 14 files.
- **123 new cases**: 85 classifier and 38 workflow/hidden-banner cases. All
  baseline outcomes match with duplicate-name occurrences preserved.
- Build, strict selected-root types, format, lint and native runner exit zero.
- Independent read-only production review reports no concrete findings.
- Fake responses/native fixtures only: no network, SDK, credentials or devices.
  This is not a full native release or rendered/interactive acceptance.

Final guarded baseline and candidate probes each complete 51 in-memory
navigations, one per capture/policy. The actual GOV.UK offline CLI also matches
the derived inline-filtered API result. **All 48 non-LOC page/policy outputs and
reader reports match baseline exactly.** LOC changes from a 42-byte HTTP-failure
extraction to a stopped semantic barrier, in all three policy modes. It is not
reclassified as successful content.

Five offline child processes total, including two earlier partial diagnostic
runs: all exited and their process groups closed; source/compiled/input pins
verified; no denied-I/O attempts. Empty HOME/environment allowlist, 192 MiB heap,
45-second child limits, kernel and JavaScript I/O guards. Final source pins use
clean baseline/candidate archives; the first two probes used a prior pinned build
whose 1443 committed source/script/package/config inputs matched the clean base.

## Saved-source content comparison

Markdown byte counts below are the candidate's current extraction, **not edits
to earlier live measurements**. Both failure rows remain failures.

| Saved source | Default | Source attributes | Attributes + inline display |
| --- | ---: | ---: | ---: |
| PayPal | 11784 | 11547 | 11547 |
| Office | 52523 | 41839 | 26082 |
| Microsoft | 17999 | 17963 | 17942 |
| MDN | 50328 | 50328 | 50328 |
| SQLite | 41581 | 41581 | 41581 |
| Python | 72719 | 72719 | 72719 |
| Hugging Face | 9863 | 9863 | 9863 |
| Cloudflare documentation | 8753 | 8753 | 8753 |
| Chrome documentation 404 | 6282 | 1346 | 1346 |
| NASA | 48247 | 12594 | 12590 |
| web.dev | 34250 | 31808 | 31808 |
| Gutenberg | 6488 | 6485 | 6485 |
| Rust | 4957 | 4957 | 4957 |
| PyTorch Markdown documentation | 18681 | 18681 | 18681 |
| GOV.UK | 9837 | 6700 | 6700 |
| Library of Congress challenge | 0 | 0 | 0 |
| ESA | 18667 | 18667 | 18667 |

The GOV.UK services heading survives while cookie/menu/feedback source UI drops.
NASA's heading count falls from 94 to 31, largely from hidden navigation; this is
not proof that every useful hidden panel should be discarded. web.dev's primary
heading loses collection UI but keeps the article title. Office's inline-hidden
configuration drops; unresolved Microsoft price placeholders remain. Literal
Markdown and several unaffected HTML controls retain identical text.

## Limits and next steps

Visibility defaults remain unchanged. Explicit filtering is useful when hidden
source UI is unwanted, but is not computed CSS visibility, actionability, consent
state, fully rendered content or a privacy boundary. Both policies add unfiltered
diagnostic work and can remove intentionally hidden source content. This run
does not establish performance improvement, reduced blocking or a new site
success rate. No additional response/extraction budgets or dependencies were added.

Use these measured policies in appropriate content investigations while keeping
barrier provenance. Continue native compatibility/performance work; JS shells,
SafeJS activation, credentials/providers/passkeys/devices/TTY acceptance, complete
large-document handling and the requested topic research remain open.

Machine summary: `reports/content-visibility-evaluation-2026-09-15.json`.
Private scopes, receipts, pins, test results, review and preservation audit:
`node_modules/.cache/native-validation/content-visibility-evaluation-september15/`.
