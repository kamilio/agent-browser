# Unicode 16.0.0 normative casing source capture

## Outcome and scope

The single authorized native-browser capture completed on September 12, 2026,
16:40:09.570–16:40:10.344 UTC. Exactly two bodyless GETs returned HTTP 200,
without redirects, retries, origin expansion, restrictions or challenges.
Native request and native text decoding succeeded; bounded plaintext extraction
selected 177 rows. This captures the fixed Unicode **16.0.0** data, not latest
Unicode, a new document revision, DOM/layout behavior or source conformance.

Private lane:
`node_modules/.cache/native-validation/native-unicode-casing-source-september12`.
Only this new lane and this report are owned. No production source, tests,
manifest, TASKS, historical capture/report, credentials or Git state were changed.
The earlier failed CSS source capture is untouched and was not rerun.

## Captured sources

| Source | Encoded bytes | Decoded body bytes | Lines/records | Selected rows |
| --- | ---: | ---: | ---: | ---: |
| SpecialCasing.txt | 4,264 | 16,809 | 281 lines / 119 mappings | 119 |
| UnicodeData.txt | 318,161 | 2,175,362 | 40,116 lines / records | 58 |

The exact permitted GET targets were:

```text
https://www.unicode.org/Public/16.0.0/ucd/SpecialCasing.txt
https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt
```

`response-1.body` contains the exact native-decoded SpecialCasing response bytes:

```text
8d5de354eef79f2395a54c9c7dcebbaf3d30fc962d0f85611ea97aa973a0c451
```

`response-2.body` contains the complete exact native-decoded UnicodeData bytes:

```text
ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f
```

These are byte hashes before native `decodeResponseText` converts UTF-8 into
JavaScript text. Native HTTP content decoding removed gzip; the exact gzip body
bytes are separately retained as `wire-1.body` and `wire-2.body`. Both response
metadata files and RESULT.json preserve sizes, hashes, request/response times
and headers. No HTML or CSS parser was used.

`selected-rows.json` is 35,671 bytes, with SHA-256:

```text
07f1acbc9195a31803c664d9e30f65268071a8c9303239ac19ebf469a27b7dd9
```

It contains every SpecialCasing mapping's codepoint, lower, title, upper and
condition fields, retaining exact semicolon-delimited substrings, including
surrounding whitespace, hex strings and original condition spelling. It also
contains UnicodeData rows whose simple titlecase field is nonempty and differs
from simple uppercase, including cases with an empty uppercase field. Every row
has its original one-based source line. No normalization or production table
generation is performed. Selected rows and provenance were made read-only at
capture completion and their stable location was sent to Main before sealing.

The complete UnicodeData bytes also retain the canonical combining class field
for Main's separately bounded offline generation. The subsequent parent request
does not add a GET, change selected rows, extract additional CCC output, or expand
any budget in this lane.

## Version and license provenance

`PROVENANCE.json` retains verbatim comment lines separately from selected rows.
SpecialCasing's header names version 16.0.0 and records May 10, 2024, 22:49:00 GMT.
Its copyright, trademark and terms-of-use reference are preserved; linked license,
documentation and other URLs were not fetched. UnicodeData has no embedded
comment/version/license header in these bytes: its version attribution is the
fixed 16.0.0 request path, not an invented header or a current/latest claim.

Both HTTP Last-Modified headers are August 25, 2024, 23:05:31 GMT. Response Date
headers are September 12, 2026, 16:40:09 and 16:40:10 GMT, respectively. Both are
`text/plain; charset=utf-8`, gzip encoded, with `cf-cache-status: DYNAMIC` and no
Age, Retry-After or cf-mitigated header. Server cache labels do not establish a
new document revision. Full response headers remain private lane evidence.

## Runtime, release and process receipts

The runtime is pinned Node v22.22.0, ICU77.1, Unicode16.0, binary SHA-256:

```text
1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31
```

Only repository native modules from immutable
`native-text-indent-september12-round01/snapshot01/dist/src` service the requests,
from commit `0adb8759343ef83a2cca755903d13f33ee51447b`. Twelve actual read-only Git
objects were captured before and after outside kernel denial: commit, root tree,
src tree and nine source/manifest blobs. Object IDs, tree bindings and all nine
input byte strings match the immutable snapshot in both phases.

The complete 1,165-source and 1,976-compiled inventories were rehashed before
and after. Their original paths are preserved in all four new inventory files.
Source inventory SHA-256:

```text
9e44ff6966c57149f3a368a3c72f3c42bd169f5a254e176eb44426204ad1d94d
```

Compiled inventory SHA-256:

```text
3a992f4d417c01e86ae96fe7f7bc9d83b536e08174a6fb8aec739388f4e1ccb4
```

All 20 historical release receipts and the commit-verification binding match.
The historical gate is 14,032 passed / 0 failed / 2 unchanged exclusions, with
271 selected suites, 270 strict roots and 661 manifest entries. That gate was
not rerun and is not a live-source, full-website or feature acceptance result.
New synthetic parser and cap checks passed under offline socket/socketpair denial.

The live child used one fresh native NodeNetworkTransport and CookieJar,
credentials omitted, original public DNS/address/TLS/origin checks, AgentBrowser/0.1
and no custom resolver, CA, client, engine or proxy. Both observed TLS sessions
were authorized TLSv1.3. The measured HTTPS request-start spacing was 259.984156 ms.
No cookie was accepted, stored or sent. Both transport and jar closed; active
requests reached zero. No page script, SafeJS, provider, device, TTY/PTY or
protected native-source-heading-source-10 payload was used.

The inherited guarded live seccomp model denies server-listening and sensitive
process/kernel operations, but permits the authorized native outbound sockets.
**The live request phase is not kernel-network-isolated.** The separate offline
wrapper denies socket/socketpair and other network syscalls. No alternate-network
or real socket probe is used to claim that offline boundary.

INVOCATION.json pins the unchanged capture, parser, guard, launcher, verifier and
other helper bytes. EXECUTION.json records sanitized environment, private empty
HOME/TMPDIR, DEVNULL stdin, process-group lifecycle and storage/output limits.
The live child exited 0 in 0.824682 seconds; stdout/stderr were 954/0 bytes. There
were no timeout, output truncation, storage events or termination signals, the
process group was absent at exit, and HOME/TMPDIR stayed empty. Before execution,
5,178,310,656 bytes were available. The complete post-capture/post-pin lane was
4,796,416 allocated bytes before final report/seal bookkeeping.

Unchanged caps: one concurrent request; two GETs; zero redirects; 250 ms minimum
request starts; 15 seconds each / 45 seconds overall plus inherited 5-second
termination grace; 3 MiB encoded/decoded per response and 6 MiB totals each;
6 MiB each/combined captured process output; 16 MiB logical/allocated lane;
128 MiB free before execution. Actual transport totals were 322,425 encoded and
2,192,171 decoded bytes. Actual extraction was 40,397 lines, 2,192,169 code units
and 177 rows, within 50,000 lines / 3 MiB code units / 2,048 units per line /
512 rows / 64 KiB selected JSON.

The setup observations are preserved in SETUP.md. No live request or extraction
failure occurred, and no failed attempt was retried or edited out of evidence.
The missing-optional-header bug from the historical helper was not copied.

## Seal and read-only verification

RECEIPTS.sha256 binds the lane artifacts and this report; SEAL.json binds the
ledger, report and outcome. All files become read-only and directories are
non-writable at seal completion. No output is written into the lane afterward.

Run from the repository root, without network, Git, native requests or HTML:

```sh
export TMPDIR=/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/html-cell-padding-work-september12/spec/tmp
python3 -I -B node_modules/.cache/native-validation/native-unicode-casing-source-september12/run.py verify </dev/null
```

The read-only verify.mjs checks the seal/report/evidence ledger, permissions,
invocation pins, complete release inventories, historical gate receipts,
captured Git object bindings, process and response receipts, caps and cleanup.
It independently regenerates the bounded text selection from retained UTF-8
body bytes and compares the exact JSON, counts and preserved provenance. It does
not import the browser runtime or issue requests. The launcher installs offline
socket/socketpair denial, sanitizes the child environment and prints the final
verification result and process receipt to the caller only. That final check
occurs after this report is sealed; its result is not written back into evidence.

Main may independently recapture the pinned commit's actual Git objects in a
separate authorized lane and compare the archived object IDs/bytes. This sealed
lane itself cannot be used as a destination for another capture. General browser,
layout/casing conformance, performance, credentials/passkeys/challenges and all
unrelated acceptance gates remain outside this source-only result.
