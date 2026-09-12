# Selenium post-empty-image native flow

## Measured outcome

Outcome: **passed-bounded-native-reference-navigation**. Native reference-navigation acceptance: **true**.
This report derives only from this lane's actual authorized live output; it is
not a report of a candidate gate, historical body replay or a future run.
Main's explicit released commit is `5164b28a6480c2748a18534ac7799ad0e215bfd1`. Supervisor interval:
`2026-09-12T18:37:02.509Z` through `2026-09-12T18:37:03.723Z`. The canonical claims below include the actual
failure, if any; no assumption about success or the former layout guard is made.

The narrow flow permits one initial simpleTest.html navigation and at most one
freshly observed available e137 resultPage.html native anchor click. A destination
request alone is not acceptance: native document identity, committed navigation,
history progression, nonempty title/body and instrumented cleanup must also pass.
No retry, fallback, substituted navigation, fake click or post-stop page analysis.

## Evidence and boundaries

Release inventories contain 1181 source and 1992 compiled
files, with 13 snapshot inputs, 16 local Git objects in each
before/after capture, and 20 gate receipts. Git retrieval is local,
read-only and outside the syscall seal. Main's independent recapture and verifier
are separate acceptance steps, not claimed complete by this report.

Canonical observations: `live/stdout.json`, `live/EXECUTION.json`, `progress.jsonl`,
`rejected-checks.jsonl`, fresh wire/header and decoded response body files.
The read-only verifier checks byte hashes, counts, monotonic timing, original
loader provenance, policies, identity/history, owner cleanup and this JSON block.
Report generation alone is not verification. Truncated, setup-only, inconsistent
or missing evidence fails closed; a failed verifier is not a successful seal.

Retained bounds: exact origin https://www.selenium.dev; AgentBrowser/0.1; native
DNS/public-address/TLS checks; empty cookies, omitted credentials, no credential
headers; 32 bodyless GETs, 1 concurrent, 250ms spacing; 2MiB per response, 8MiB
totals for encoded/decoded bytes; 45seconds plus 5seconds grace; 6MiB artifact and
combined output, 16MiB lane, 64MiB free. Offline operations deny socket/socketpair;
live egress uses the guarded native transport, not full kernel network isolation.
No SafeJS, providers, credentials, authentication, devices, real TTY/PTY, remote
browser, Chromium, Firefox, socket self-probes or protected source payload access.

Historical Selenium14922 failure evidence retains its original paths, bytes and
measurements. No new unique-host, whole-site, performance, geometry/paint, form,
provider or challenge acceptance follows from this bounded navigation observation.

## Canonical measured claims

```json
{
  "outcome": "passed-bounded-native-reference-navigation",
  "acceptancePassed": true,
  "commit": "5164b28a6480c2748a18534ac7799ad0e215bfd1",
  "nativePassed": 15421,
  "nativeFailed": 0,
  "nativeExcluded": 2,
  "initialUrl": "https://www.selenium.dev/selenium/web/simpleTest.html",
  "selectedUrl": "https://www.selenium.dev/selenium/web/resultPage.html",
  "selectedReference": "e137",
  "anchorsInspected": 8,
  "clickCalls": 1,
  "committedDocuments": 2,
  "destinationRequested": true,
  "failure": null,
  "requests": 3,
  "encodedBytes": 1674,
  "decodedBytes": 3630,
  "intervalsMs": [
    260.917778,
    253.854151
  ],
  "elapsedSeconds": 1.2119366806000471,
  "stdoutBytes": 92669,
  "stderrBytes": 0,
  "policyObservations": 5,
  "cleanupPassed": true,
  "capsPassed": true,
  "newUniqueHostClaimed": false
}
```
