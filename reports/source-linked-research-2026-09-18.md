# Source-linked research and native parser recovery — September 18, 2026

## Three fresh native requests

Each URL was a literal link in the previously captured Hacker News front page.
Each received exactly one anonymous native HTTPS GET after a zero-network proof.
The transport used the existing honest browser identity and public-address/TLS
policies. There were no redirects, retries, credentials, subresources, website
scripts, alternate browsers or challenge-solving attempts.

| Target | Captured UTC on September 18 | HTTP | Decoded bytes | Original outcome |
| --- | --- | ---: | ---: | --- |
| OpenAI Astra article | 04:05:11.454 | 403 | 9,783 | Semantic barrier; no content |
| PrismML Bonsai article | 04:05:11.495 | 200 | 53,507 | 13,908 Markdown bytes, extracted-unverified |
| Hacker News Astra discussion | 04:15:02.383 | 200 | 605,306 | Resource limit in loader; no Markdown |

Request/session/document/process cleanup checks pass for all three. That does
not turn the two failed content outcomes into successes. The Bonsai page is a
publisher announcement, not independent validation or a hardware recommendation.
The OpenAI article was not read through its barrier. Hacker News discussion is
not evidence of Twitter chatter. Original research, including Reddit/Poe,
hardware comparisons and benchmark evaluation, remains incomplete.

The initial discussion proof failed because its checker compared an exact query
against intentionally redacted report URLs. A new lane derives the expected
report URL offline from the pinned native reporting function; exact query checks
remain at both transport and wire layers. The original failure is preserved.
Only the corrected proof authorizes the discussion's single live request.

## Native parser fix

Unmodified offline replay identifies the loader failure precisely: formatting
work reaches 1,600,001 visits against a 1,600,000 cap. Observational counters
attribute 1,359,805 visits (84.99%) to repeated marker membership stack scans.
Sanitization succeeds; this is not a transport/body-size or challenge failure.

`HtmlFormatting.sync()` now lazily scans the open-element stack backward and
remembers examined object identities only for that invocation. Later markers
reuse that membership. Each examined node and active entry is still charged;
near-top single-marker scans stay cheap, empty lists allocate nothing, and the
first missing marker truncates exactly as before. No budget, cancellation,
formatting reconstruction or adoption-agency rule is relaxed.

Final native result: **729 passed / 0 failed across 12 files**, including **13
new cases**. Baseline production with the new tests produces **728 pass / 1 fail**
in the multiple-marker work-count regression. Build, types, format and lint pass.
An initial candidate is native-green but fails one test-helper formatting check;
its original evidence remains intact. This is not a full-suite or SafeJS pass.

## Captured discussion content recovery

The qualified candidate loads the unchanged 605,306-byte response in **1,246,627
formatting visits**, below the unchanged cap. The raw source comparison parses
in 1,312,249 visits. Neither number is a wall-clock speedup comparison with a
complete baseline run—the baseline never completed under that budget.

Whole-page plain, compact and focused-compact Markdown still exceed the separate
**256,000-byte output cap**. Those failures are retained. A bounded offline loop
using the existing element-reference extraction API retrieves every comment body
separately, rather than raising the cap or calling a truncated page complete:

- **414 comment bodies**, totaling **107,455 Markdown bytes**; largest piece **1,411 bytes**.
- Every body exactly matches Markdown extracted from its corresponding raw-source native DOM.
- All **414 author associations**, **347 parent links** and **25 body links** match the captured source.
- `COMMENT-INDEX.json` associates each numbered Markdown file with its source comment ID, author and links.
- Source/receipt pins remain unchanged; documents and processes close, private HOME/TMP are empty, and both JavaScript and kernel guards report no network attempts.

This is a native source comparison, not an independent browser-conformance oracle
or factual endorsement of comments. The original live loader failure is not
rewritten. No post-fix website GET was made. Automatic whole-page pagination is
not added to the CLI: callers still need bounded selection when output is large.
The first paged harness incorrectly passed node IDs instead of element references;
its failure is preserved separately from the corrected successful run.

## Evidence and remaining work

The JSON companion records exact URLs, source pins, timings, original private
paths and archived copies. Durable copies are under:

- `node_modules/.cache/native-validation/source-linked-research-september18/captures/`
- `node_modules/.cache/native-validation/formatting-marker-membership-september18/captures/paged-v2/`

The second directory contains the comment index and all 414 Markdown files.
Native checks and both failed/successful offline runs remain in the formatting
phase. Existing historical reports and measurements are not changed.

The separate PCM capture component is committed as `76cdfd4`. It does not join
Zoom or receive real audio. Native client admission, media transport/decoding,
real-SDK gaps, notetaker storage/transcription/delivery, credential/passkey and
broader website/access gates remain open. No push, dependency addition, default
SDK switch, credential/device access or meeting participation occurs here.
