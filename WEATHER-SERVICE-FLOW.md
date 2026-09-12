# Native Weather-Service Flow — September 12, 2026

## Outcome

**Stopped partial result; destination-flow acceptance failed.** One authorized
native session received eight HTTP 200 responses from `https://www.weather.gov`:
one homepage and seven original-loader stylesheets. At the first exposed
resource-policy observation, before homepage commit, the native image owner
reported **12 `policy-denied` images** and the stylesheet issue counter reported
**one `css-import-policy-denied`**. The harness stopped immediately after that
observation, aborted navigation, and closed the session. It did not retry.

Supervisor UTC: **2026-09-12T14:32:15.255Z–14:32:17.731Z**, elapsed
**2.475499 seconds**. Policy observation: **14:32:17.454Z**; first-failure
record: **14:32:17.455Z**. The child exited **1**, with an intact failure report,
not a timeout or truncated success. First failure is
`initial-navigation:resource-policy-observation`, `policy-denied`; the navigation
caller subsequently receives `aborted` / `Navigation aborted`.

There were **zero committed documents, inspected anchor occurrences, clicks,
destination navigations, image requests, redirects, mocked responses or script
requests**. No click identity, destination URL/history, geometry, hit-test, paint,
or post-failure formatting result is claimed. Receiving the homepage body is not
a committed homepage or successful About/Safety flow.

These are exposed **native resource-policy denials**, not proved server denial.
All eight responses were HTTP 200; no Retry-After or classified barrier was
observed in the recorded response checks. All 12 exposed denied image URLs are
same-origin. The exact underlying native denial rule and the denied CSS import's
URL were not recorded by this observation; neither is inferred. Denials may
precede this first loader-return observation: this is **not instantaneous denial
interception**. No further request or user action followed the recorded stop.

## Committed Runtime And Proof

Release: `e02ebaf4365c5e7a534cc08f4849795d58e391d8`, independently supplied by
Main. Runtime is exclusively
`node_modules/.cache/native-validation/native-request-start-pacing-september12-round00/snapshot01/dist`,
using pinned **Node 22.22.0**. No dirty working-tree runtime was imported.

The release gate is **13588 passed / zero failed / two unchanged exclusions**,
with **261 selected suites, 260 strict roots, 653 manifest entries, 1155 source
files, 1968 compiled files, and 1150 unchanged tracked inputs**. This run checks
that committed gate's receipts; it does not rerun or relabel the native gate as
new live acceptance.

Exactly **five committed snapshot inputs / eight Git objects per capture**:
commit, root tree, `src` tree, the four owned pacing source/test blobs, and the
unchanged native manifest blob. Read-only Git captured actual bytes outside
kernel isolation before and after the live child; each second-capture object
matches the first. Offline checks link blobs through tree objects to the commit
and compare their bytes with the release snapshot. This is **not NASA's old
13-input / 16-object proof**. Main's fresh actual-Git-object and sealed-report
verification remains a separate required step before committing.

Pinned inventories and receipts:

- Source inventory: `1887feeb9be9acb9563312b955659e798d089147aeaf2332f03f09322d06399c`.
- Compiled inventory: `de27e109c06fd2e008d89b955985db40abd31266f7bae217062b9419e6d33336`.
- Native results: `94eb83585b8fdf898d4ccbdc296109bf090c9405d40484cc9782b9276a068a50`.
- Release receipts: `e29aecdeecb4ab689d4ad1bd90edd1239323cce05b1488019c75fbec30fb62dd`.
- Commit verification: `dae90128e95f238ebd1ab3d7dd546266af6e2c81d69585aa9176dd88641eea1a`.

Release receipts, exact source/compiled inventories, copied contract/release,
and preserved historical ledgers are checked before and after. NASA and the
eight inherited Netlib/Go ledgers remain unchanged; old lanes are never replayed
or edited. NASA's missing pre-second-wire assertion detail remains missing and
is not retrospectively diagnosed from this fresh pacing observation.

## Contact And Byte Accounting

The only authorized, admitted, attempted, TLS-connected and replying origin is
`https://www.weather.gov`. There are **eight native adapter entries, eight
transport requests, eight wire request constructions, eight authenticated TLS
connections and eight HTTP replies**. There are no rejected adapter entries.
The two recorded public TLS peer IPs are peers for this single hostname, not
two additional website origins. No broader-origin contact is authorized or
claimed. Unrecorded document or CSS-link discovery is not a host-attempt count.

| Native response path | Role | Encoded bytes | Decoded body bytes |
| --- | --- | ---: | ---: |
| `/` | Document | 28,426 | 122,277 |
| `/css/weatherstyle.css` | Stylesheet | 4,610 | 21,205 |
| `/css/template.css` | Stylesheet | 2,686 | 9,462 |
| `/css/myfcst.css` | Stylesheet | 1,260 | 3,937 |
| `/css/ForecastSearch.css` | Stylesheet | 251 | 381 |
| `/css/pointforecast.css` | Stylesheet | 2,705 | 10,504 |
| `/css/jqueryui10_3_1custom/jquery-ui-1.10.3.custom.min.css` | Stylesheet | 5,314 | 27,013 |
| `/bundles/templating/css/wwamap/wwamap.css` | Stylesheet | 1,667 | 6,372 |
| **Total** | **8 responses** | **46,919** | **201,151** |

Encoded payloads, decoded native bodies and credential-redacted headers are
retained separately with hashes. These are HTTP payload/body measurements, not
TCP/TLS packet sizes. The offline verifier checks bounded content decoding and
byte equality without parsing HTML/CSS or importing the native page runtime.

All seven recorded per-origin request-start intervals satisfy 250 ms:
**260.548, 252.482, 252.054, 251.926, 251.499, 251.766, 252.089 ms**
(rounded; exact doubles retained). The minimum is **251.498573 ms**. Each wire
admission recorded zero active preceding exchanges. This demonstrates the
instrumented native request-start boundaries in this run, not exact packet or
remote-arrival spacing, a speedup, or a diagnosis of NASA's older failure.

Controlled static assertion labels and available monotonic boundaries are
installed before native transport can wrap harness errors. The sealed
`rejected-checks.jsonl` is empty: **zero harness assertion failures occurred**.
The native policy-denial stop is preserved separately in progress, result and
policy-observation records; it is not mislabeled as a pacing assertion.

## Limits, Isolation And Cleanup

The predeclared caps remain: **32 bodyless GETs, concurrency 1, 250 ms minimum
origin spacing, 2 MiB encoded/decoded per response, 8 MiB encoded/decoded totals,
45 seconds plus 5-second kill grace, 6 MiB per output file and combined
stdout/stderr, 16 MiB allocated/logical lane, 64 MiB minimum free space**.
Existing native DOM/CSS/image limits and partial profiles are unchanged. The
retained image owner reports the partial `png-resource-owner` profile; no image
transport or decode succeeded or was attempted. No full visual support is claimed.

Live child stdout is **88,836 bytes**, stderr zero; no output truncation, cap
increase, supervisor termination reason or signal occurred. Live storage
receipts record **5,623,808 allocated bytes before** and **6,103,040 after** the
child, with over 2.57 GB free at both samples. The after measurement precedes
supervisor output serialization; final seal storage is measured separately.

Original BrowserSession, loadBrowserDocument, CSS/image callbacks and
NodeNetworkTransport are retained, including resource role/provenance,
public-DNS/address checks, TLS validation and `AgentBrowser/0.1` identity.
Callback metadata reports native requested credentials `include`; every
forwarded request explicitly uses **omit**, with an empty fresh jar and wire
credential-header rejection. The jar accepted zero cookies and closed empty.
Scripts, SafeJS, providers, devices, credentials, alternate engines/clients,
form actions, location/search entry, downloads and challenge bypass stayed off.

Explicit private empty 0700 HOME/TMPDIR, stdin DEVNULL, no TTY/PTY and core
limit zero apply. Live seccomp denies listening, ptrace, process-vm and io_uring;
origin admission is a native/harness boundary, **not a kernel origin firewall**.
Offline checks additionally deny socket/socketpair and network syscalls. No
socket self-probe, protected payload, network replay or page parser is used by
the offline verifier. Historical helper files were copied only into this lane.

Immediate close observed one pending load. A bounded **50.397871 ms** settlement
sample then observed **zero pending loads**, zero active transport/queued
requests, and closed queue/transport. The one instrumented document, event,
image and control owner each passed recorded cleanup checks; nodes, text,
listeners, image resources/waiters and held controls were released. This covers
the sampled owners, not uninstrumented capabilities. The child process group
was absent after exit and private HOME/TMPDIR stayed empty.

## Sealed Evidence And Parent Handoff

Private lane:
`node_modules/.cache/native-validation/native-weather-service-flow-september12`.
Direct evidence includes `live/stdout.json`, `live/INVOCATION.json`,
`live/EXECUTION.json`, `progress.jsonl`, `rejected-checks.jsonl`, eight encoded
wire bodies/headers and eight decoded response bodies/metadata. Before/after Git
commands and bytes, original task/release, preparation/preflight records and
all setup/check outputs are retained. The live exit-1 record is never rewritten.

`CHECKS.json`, `RESULT.json`, `ORIGIN-ACCOUNTING.json`, `ASSERTION-BOUNDARY.json`,
`POLICY-OBSERVATIONS.json`, `REPORT-CLAIMS.json`, `ARTIFACTS.json`, `SEAL.json`
and `FINAL-RECEIPTS.sha256` bind this report and all lane files. Report and
artifacts are sealed read-only. Integrity verification is separate from failed
flow acceptance; Main independently verifies the report and actual Git objects
before any commit.

Read-only verification from repository root, without redirecting output into
the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-weather-service-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

Only this report and the new private lane are owned. No shared source,
manifest, TASKS, old-lane, commit or push change is part of this work. This
partial observation establishes neither full weather-site support nor broader
research/provider/device/credential/passkey/TTY/real-SafeJS/challenge acceptance.
