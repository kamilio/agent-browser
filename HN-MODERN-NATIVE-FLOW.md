# Hacker News committed-native15421 navigation flow

## Stop reached before navigation acceptance

The sole attempt stopped at `initial-navigation:resource-policy-observation`
with native `AgentBrowserError`, code `policy-denied`. Before initial document
commit, the original loader exposed two image errors: `e22` for `/y18.svg` and
`e1265` for `/s.gif`, both `policy-denied`. These are observed native labels,
not an offline diagnosis of their underlying cause. No image request was made.

Exactly two original native GETs contacted `news.ycombinator.com`: the homepage
and its discovered `news.css?e1A2H4cHxVYFl1HF3Snj`. Both received HTTP200 over
authenticated TLS. Totals were7652encoded/42510decoded bytes; no other origin
was contacted. The stop prevented document commit, title/body acceptance,
anchor inspection, click and `/newest` request: all committed-document,
anchor-inspection and click counts are zero. The navigation subsequently
reported `aborted`; the retained first failure remains the resource-policy stop.

Instrumented document, event, image and control owners closed; final session
and transport cleanup passed, with no surviving process group. No retry,
fallback, forced availability, style/content removal or post-failure page
analysis followed. `RUN-ONCE.lock` remains consumed. The separate historical HN
capture diagnosis belongs to Main and was not repeated.

A preliminary shell setup failure on full `/tmp` occurred before any release
binding or live launch. It is retained in the new lane's `SETUP-FAILURE.md`;
subsequent execution used the private `/home` TMPDIR. This was not a live retry.

The initial read-only verifier also failed: it compared Node's joined
Cache-Control value with the native transport's separate duplicate-field arrays.
That failure and every capture remain unchanged. The append-only v2 verifier
checks native arrays against the captured ordered raw header pairs instead;
`VERIFICATION-ADDENDUM.md` and `ADAPTATION-V2.json` document and pin this correction.
An evidence-verification pass does not change the failed navigation outcome.

## Measured outcome

Outcome: **stopped-partial-native-flow**. Native reference-navigation acceptance: **false**.
This report derives only from this lane's actual authorized live output; it is
not a report of a candidate gate, historical body replay or a future run.
Main's explicit released commit is `5164b28a6480c2748a18534ac7799ad0e215bfd1`. Supervisor interval:
`2026-09-12T18:52:16.729Z` through `2026-09-12T18:52:17.923Z`. The canonical claims below include the actual
failure, if any; no assumption about success or the former layout guard is made.

The narrow flow permits one initial Hacker News homepage navigation and at most
one freshly observed available header `new` native anchor click to `/newest`.
At most64 header anchors are inspected; exactly one eligible occurrence is required. A destination
request alone is not acceptance: native document identity, committed navigation,
history progression, nonempty title/body and instrumented cleanup must also pass.
No retry, fallback, substituted navigation, fake click or post-stop page analysis.

## Evidence and boundaries

Release inventories contain 1181 source and 1992 compiled
files, with 13 snapshot inputs, 16 local Git objects in each
before/after capture, and 20 gate receipts. Git retrieval is local,
read-only and outside the syscall seal. Main's independent recapture and verifier
are separate acceptance steps, not claimed complete by this report.

Owned lane: `node_modules/.cache/native-validation/native-hn-modern-flow-september12/`.
Read-only entrypoint: `offline-v2.py verify`, pinned Node22.22.0 and private lane HOME/TMPDIR.
Exact authorization is retained byte-for-byte as `RELEASE-MESSAGE.md` from
`website-functional-september12-evening/HN-FLOW-WORKER.md`, not Selenium permission.
Main separately owns the old HN captured-page diagnosis; this worker does not replay it.

Canonical observations: `live/stdout.json`, `live/EXECUTION.json`, `progress.jsonl`,
`rejected-checks.jsonl`, fresh wire/header and decoded response body files.
The read-only verifier checks byte hashes, counts, monotonic timing, original
loader provenance, policies, identity/history, owner cleanup and this JSON block.
Report generation alone is not verification. Truncated, setup-only, inconsistent
or missing evidence fails closed; a failed verifier is not a successful seal.

Retained bounds: exact origin https://news.ycombinator.com; AgentBrowser/0.1; native
DNS/public-address/TLS checks; empty cookies, omitted credentials, no credential
headers; 32 bodyless GETs, 1 concurrent, 250ms spacing; 2MiB per response, 8MiB
totals for encoded/decoded bytes; 45seconds plus 5seconds grace; 6MiB artifact and
combined output, 16MiB lane, 64MiB free. Offline operations deny socket/socketpair;
live egress uses the guarded native transport, not full kernel network isolation.
No SafeJS, providers, credentials, authentication, devices, real TTY/PTY, remote
browser, Chromium, Firefox, socket self-probes or protected source payload access.

Historical HN navigation/formatting failure and Selenium evidence retains its original paths, bytes and
measurements. No new unique-host, whole-site, performance, geometry/paint, form,
provider or challenge acceptance follows from this bounded navigation observation.

## Canonical measured claims

```json
{
  "outcome": "stopped-partial-native-flow",
  "acceptancePassed": false,
  "commit": "5164b28a6480c2748a18534ac7799ad0e215bfd1",
  "nativePassed": 15421,
  "nativeFailed": 0,
  "nativeExcluded": 2,
  "initialUrl": "https://news.ycombinator.com/",
  "selectedUrl": null,
  "selectedReference": null,
  "anchorsInspected": 0,
  "clickCalls": 0,
  "committedDocuments": 0,
  "destinationRequested": false,
  "failure": {
    "stage": "initial-navigation:resource-policy-observation",
    "name": "AgentBrowserError",
    "code": "policy-denied",
    "message": "Exposed nonthrowing resource policy denial observed before further action"
  },
  "requests": 2,
  "encodedBytes": 7652,
  "decodedBytes": 42510,
  "intervalsMs": [
    283.46266099999997
  ],
  "elapsedSeconds": 1.1924571953713894,
  "stdoutBytes": 34293,
  "stderrBytes": 0,
  "policyObservations": 1,
  "cleanupPassed": true,
  "capsPassed": true,
  "newUniqueHostClaimed": false
}
```
