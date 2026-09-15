# Paced server cooldowns — September 15, 2026

## Change

Native transport with positive `minRequestIntervalMs` now records bounded
`Retry-After` advice at real HTTP 429/503 header arrival, before body consumption.
Future same-origin exchanges wait until the later of the configured interval or
the server deadline. Zero/stale/shorter advice never shortens an existing delay.
The original response is not retried; in-flight exchanges cannot be recalled.
The existing parser bounds accepted advice to 24 hours. Other statuses, disabled
pacing, fully routed responses and cache hits keep their previous behavior.

FIFO, abort/close, request deadlines and bounded origin/pending state remain.
If a late response cannot recreate a reclaimed origin within the capacity limit,
response handling fails with resource-limit rather than silently losing advice.
No dependencies, page-runtime activation, cross-process pacing or challenge
automation were added. See `REQUEST-PACING.md` for the detailed contract.

## Isolated validation

- Base: `5c5605d0fc1f68cd036175714875069b1d72a69d`, clean Git archive.
- Candidate: that base plus the four owned production/test TypeScript files and
  canonical native-test registration; not the unrelated dirty working tree.
- Baseline: **1042 passing cases**, 16 explicit native files.
- Candidate: **1125 passing cases**, 18 explicit native files; **83 new cases**.
- All baseline case outcomes match, preserving duplicate-name occurrences.
- Build, strict selected-root types, format, lint and native runner exit zero.
- Scheduler tests use fake clocks; transport tests mock HTTPS through the actual
  header/exchange path. No actual network, SDK, credentials, devices or TTY.
- Independent scoped review found no concrete actionable defects. This is not
  a full native release, security certification or runtime acceptance claim.

## Separate public native checks

The pinned candidate performed one attempt per URL, sequential child processes,
with 1000 ms per-origin pacing, 20-second navigation and 45-second child limits,
2 MB response / 256 KB extraction caps and five redirects maximum. Empty home,
environment allowlist, no page scripts, supplied credentials, cookies, solver,
identity rotation or bypass. Existing semantic barriers stop extraction.

| Public target | HTTP | Outcome | Markdown bytes | GETs |
| --- | ---: | --- | ---: | ---: |
| `https://www.gov.uk/browse/driving` | 200 | extracted-unverified | 9837 | 1 |
| `https://www.loc.gov/collections/` | 403 | challenge; stopped | 0 | 1 |
| `https://www.esa.int/Science_Exploration/Space_Science` | 200 | extracted-unverified | 18667 | 1 |

**Three navigations, three GETs, zero retries.** All three captured bodies and
child/transport cleanup verified; source and compiled pins remained unchanged.
The live binary is the base plus the owned cooldown patch, not unmodified HEAD.
No 429/503 occurred: these checks do **not** prove real-server cooldown behavior,
improved compatibility, throughput or lower blocking rates.

GOV.UK exposes the driving-services heading and links, but default extraction
also includes both accepted/rejected cookie-confirmation messages. Source
inspection locates these in hidden paragraphs: no cookie choice was made.
ESA exposes Space Science headings and story/video links, with repeated UI
labels; no article was followed and no media played. Nonempty output is not
rendered or interactive correctness. Library of Congress remains a failed
Cloudflare challenge response, not successful content retrieval.

## Remaining work and evidence

Next, compare explicit source-visibility filtering against the immutable GOV.UK
capture. Do not rewrite the original receipt or treat a replay as another live
request. JS shells, output/node limits, hidden UI, table associations, runtime
activation, provider/passkey/device/TTY acceptance and topic research remain open.

The earlier **100/100** homepage sweep is documented in
`reports/top100-websites-2026-09-15.md`: 197 requests, 65 nonempty-unverified,
13 empty, 7 semantic barriers, 3 HTTP failures and 12 other failures. Its corpus
is Similarweb's published May 2026 list, not a verified September ranking. Those
historical results are unchanged and are not added to this run's three requests.

Machine-readable summary: `reports/retry-after-cooldown-2026-09-15.json`.
Private receipts, scopes, source/compiled pins, native results and preservation
audits: `node_modules/.cache/native-validation/retry-after-cooldown-september15/`.
