# Hacker News: current captured native diagnostic

**The captured document loads; link geometry remains unsupported.** This is
one September 14, 2026 observation of unchanged September 11 HTML/CSS bytes,
not a live visit, successful link flow or rendered-site acceptance.

## Native observation

- Runtime commit: `39b55d996feb7af5320e3a1d575821743477b475`.
- Repository HEAD at execution: `cc2466ce6ce6fa4707c0cede7adef65cab4f09bf`,
  whose changes after the runtime commit are documentation only.
- Native interval: **14:04:46.426–14:04:46.659 UTC**, September 14, 2026.
- One BrowserSession navigation through the original native loader, one
  formatting inspection, cached diagnostics read, `.morelink` query and geometry
  attempt. Zero clicks, forms, raster operations, scripts or live requests.
- Page: `https://news.ycombinator.com/`, native title “Hacker News”, 1,303 nodes,
  revision 1,306, viewport 1,280×900. Revision stays unchanged during inspection.
- Native query finds anchor **e1261**, `href="?p=2"`, with a formatting node.
  Its geometry call returns `unsupported`; no destination is requested.

The two original responses replay through NodeNetworkTransport memory routes,
retaining exact status, ordered header entries and decoded body bytes. HTML is
34,946 bytes and CSS 7,418 bytes: **42,364 decoded bytes, two mocked requests,
zero encoded replay bytes and zero wire requests**. There is no response
substitution, omitted stylesheet, resource-policy relaxation or live fallback.
The image owner records two elements and two settled deliveries, with zero
received/decoded image bytes. This run does not establish their image pixels.

## Measured blockers

The exact-input comparison is the September 12, 19:18:42.322–19:18:42.468 UTC
observation in HN-CELL-SPACING-REPLAY.md, runtime `4306022`. It is a comparison
across the intervening implementation work, not an opacity-only attribution.

| Formatting issue category | September 12 | Current observation |
| --- | ---: | ---: |
| Unsupported/invalid CSS value | 11 | 2 |
| Unsupported CSS property | 2 | 1 |
| Unsupported media query | 1 | 1 |
| HTML presentation hint | 64 | 64 |
| Deferred table display marker | 4 | 4 |
| Unsupported image element | 2 | 2 |
| Unsupported overflow layout | 61 | 61 |
| Total overlapping occurrences | 145 | 135 |

The current bounded native style diagnostics identify:

- `word-break:break-word` on `.title a`, matching 61 elements.
- Layered `background` and `background-image` on `.votearrow`, each matching
  30 elements, combining `url("triangle.svg")` and a transparent linear gradient.

There are 18 diagnostic samples, zero omitted occurrences and no truncated
fields; the diagnostic API remains explicitly **non-exhaustive**. Reading its
cache changes no style metrics. These are issue occurrences, not unique defects.
The table display markers require native coordination and are not independently
classified here as unsupported table layout. The geometry error actually lists
one property, two values, 64 HTML-hint, two element and 61 overflow occurrences.

Both observations retain 1,390 formatting boxes, 1,295 visited DOM nodes,
3,927 text code units and six deferred subtrees. Formatting work changes from
12,054 to 13,666; the current style-work counter is 108,956. These are not a
performance benchmark and establish no speed or memory improvement.

## Verification and preservation

The completed opacity release01 gate is verified, not rerun: 23,757 passes,
zero failures and two unchanged exclusions. All 2,925 source and 2,200 compiled
files are rehashed before and after the captured check. The committed-runtime
audit and adoption receipt are pinned; root dirty source is not imported.
The original 23-entry Hacker News capture ledger also revalidates unchanged.

Kernel network denial, JavaScript network/process/worker/addon guards, a
sanitized environment, private HOME/TMP, pipe-only IO, a 30-second deadline,
five-second termination grace and bounded output remain. There are no guard
attempts, timeout, output truncation, stream, integrity or cleanup errors.
The child process group is absent after exit; its supervisor interval is
14:04:46.372–14:04:46.671 UTC, exit zero. That exit means diagnostic completion,
not successful geometry. Session, queue, transport, document, image and query
owners close, with zero retained document nodes and no pending work. Cleanup
settles in one sample; its 0.233 ms sample is not a shutdown benchmark.

A metadata-only first preparation used the wrong native gate result filename,
`RESULT.json` instead of `native.stdout`, and stopped with ENOENT before any
release seal, run lock or browser load. PREPARATION-NOTE.md preserves this
harness correction. The unchanged expected result hash then validates the
correct path. Exactly one native execution occurs, with no browser retry.

- Original lane: `/dev/shm/agent-browser-hn-current-september14/`.
- Historical capture:
  `node_modules/.cache/native-validation/native-hn-link-flow-september11/`.
- Result SHA-256:
  `19aaca2d89031777d676406bbfd82372dd5a3502eb8978a20a5e796f3462f00f`.
- The prepared verifier passes and seals 24 evidence entries after closing all
  output files. Its verdict explicitly retains `geometrySupported:false` and
  `liveValidation:false`.

The independent parent metadata/hash audit passes all 24 original entries and
checks the native outcomes, exact applicable diagnostic samples and closed-owner
counts without rerunning the browser. Its final seal covers 26 entries, SHA-256
`ffa2d2781b63af726a344e62dfefa6b764b5004dcfa057ed50d410485fdb080e`.
At 14:10:23.727 UTC, all 27 then-existing files, totaling 78,398 bytes, were
copied byte-for-byte to
`node_modules/.cache/native-validation/hn-current-september14/`.
PERSISTENCE.json records the verified copy, not another execution.

This result prioritizes actual word-breaking, layered-background, presentation
hint and table-overflow behavior, not suppression of the native guards. Fresh
live-site access, challenge handling, rendering, credentials/passkeys, devices,
SafeJS and the original research topics remain separate open work.
