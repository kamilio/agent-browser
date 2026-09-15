# Same-origin HTTPS redirect policy — September 15, 2026

## Implemented result

`--https-redirect-policy same-origin-upgrade-v1` lets the native research browser
follow a same-origin HTTPS canonical destination when a server instead advertises
its HTTP counterpart. The Node transport exposes the same explicit option.
The default remains downgrade rejection. This is not HSTS, an identity change,
certificate bypass, an insecure fallback or an access-barrier retry.

Only current HTTPS GET/HEAD redirects qualify, and changing only the destination
protocol must produce exactly the current origin. Effective URL/origin, address,
DNS and TLS checks still apply. Other hosts, incompatible ports, credential URLs,
unsafe current methods and unsupported schemes do not gain permission. Initial
HTTP URLs and manual/error modes keep their existing behavior. All prior caps,
pacing, cookie rules, cancellation and cleanup remain in force.

Each upgraded response hop records frozen original/effective target provenance;
research summaries redact queries and strip userinfo/fragments. Enabled metrics
count upgrade decisions, including ones followed by a later request failure.
Unconfigured reports and metrics retain their prior shape. See
`HTTPS-REDIRECTS.md` for the API and policy boundary.

## Native regression

Parent runtime `c019e250a48e29099f63d5bdba8167a0b11ccc74`, plus the six owned
source/test overlays pinned in the adjacent JSON. Clean archive builds use the
explicit native test manifest and network guards; no actual SDK or socket server.

| Selected run | Test files | Passed | Failed |
| --- | ---: | ---: | ---: |
| Baseline | 9 | 863 | 0 |
| Old production with final tests | 11 | 873 | 64 |
| Candidate | 11 | 937 | 0 |

All **74 new tests pass**:61 transport and13 CLI/execution. Ten new control cases
also pass on old production;64 detect missing behavior. Final candidate build,
types, format, lint and native checks all exit zero. The old-production type
check fails because the new API/helper is absent. This is not a full-manifest
test pass or a claim that unrelated repository failures are fixed.

Coverage includes all five redirect statuses, GET/HEAD, default denial, exact
option validation before effects, manual/error modes, initial HTTP handling,
current-hop origin and method semantics, ports/allowlists, credentials and
unsupported schemes, query/fragment handling, DNS rebinding/private-address
denials before exchange, explicit private-origin exceptions, redirect caps,
abort/close, HTTPS failure and access denial without fallback/retry. Fixed mocked
authorization constants verify same-origin HTTPS retention and no restoration
after a cross-origin hop; no real credentials are accessed. Mocked TLS failures
test propagation, not adversarial certificate acceptance.

CLI tests cover native/reader modes, batch pacing, received metrics, sanitized
provenance, default shapes, failure cleanup and fixture receipt/replay
compatibility. Initial validation failures are retained: eight CLI fixture
failures arose from constructor mocks that lost real prototypes. Returning actual
instances corrects the fixture without changing production or weakening assertions.
Formatting iterations are retained in `INITIAL-VALIDATION.md`; final
`red03`/`release03` archives contain identical final test bytes.

## Fresh native acceptance

At **20:56 UTC on September 15, 2026**, the newly built candidate navigates twice
with explicit HTTPS redirect policy, reader mode, body capture, UTF-8 fallback,
raw-text separation and source-hidden-inline filtering. Exact public URLs,
timestamps, bodies and receipt hashes are recorded in the JSON/local lane.

| Target | Observed response chain | HTTPS GETs | Upgrades | Markdown bytes |
| --- | --- | ---: | ---: | ---: |
| Original arXiv search action | HTTPS308 → effective HTTPS200 | 2 | 1 | 54,864 |
| Python general index | HTTPS200 | 1 | 0 | 3,069 |

arXiv advertises an HTTP Location whose trailing-slash path/query are retained
while its protocol is upgraded to HTTPS. Observer evidence shows both actual
requests use HTTPS, and the native receipt reports the original/effective
destinations with query values redacted. Python reports a zero upgrade counter
and no per-hop upgrade summary. Both complete captures are
`extracted-unverified`, with `contentSuccess: null`.

The arXiv253,361-byte body and54,864-byte Markdown output are byte-for-byte equal
to the earlier manually selected HTTPS response in the separate search-task run.
This equality was checked, not assumed from equal lengths. The prior original-URL
failure still records `https-downgrade` and is unchanged. Default denial is also
covered by new native fixtures; no additional default live request was made.

Source inspection samples result titles, snippets and abstract links; the Python
control contains alphabetical index links. This is not verification of result
relevance, research claims, complete papers or an interactive search UI. The new
policy removes the manual destination-selection step, not the HTTP redirect hop.
No network-latency or overall browser-speed benchmark improvement is claimed.

## Capture compatibility and safety

Two additional offline native CLI replays use exact fresh receipt/body pins.
arXiv's unique result-list selector yields51,104 bytes with sampled result links;
Python's body selector reproduces the full3,069-byte output exactly. Neither
replay makes actual or mocked HTTP requests, runs page scripts, or revalidates a
historical redirect decision. The arXiv selection is not a whole-page equality
claim; receipt URL metadata deliberately redacts query values.

**Two live navigations, three HTTPS GETs, one followed/upgraded redirect, two
complete captures, zero plaintext HTTP requests and zero retries.** All four
live/replay children and process groups terminate. All three observed live
requests and sockets close. A live observer denies plaintext HTTP entry points,
alternate fetch and credential headers; its final denied-operation lists are
empty. The ordinary native TLS verification path is unchanged.

Empty HOME/TMP, restricted environment,192MiB heaps,45-second live deadlines and
unchanged default budgets apply. Offline replay additionally uses kernel
socket/io_uring denial and JS guards with30-second deadlines. Source and compiled
pins match the final validated candidate; dirty root output is not used.

## Evidence and limits

Local evidence lane:
`node_modules/.cache/native-validation/https-redirect-upgrade-september15/`.
`AUDIT.json` pins the baseline/red/candidate manifests, execution records,
transport observations, receipts, source comparisons and offline guards. Captured
bodies stay local instead of being copied into Git.

The original100-page matrix, historical arXiv denial, other site access barriers
and measurements remain unchanged. SafeJS callback admission, JavaScript-only
search, broader interactions, passkey/device validation and performance goals
remain open. No SDK/dependency update, runtime activation, full-suite acceptance,
push or overall-goal completion is claimed.
