# Effective Go native content check — September 13, 2026

## Outcome

**The single authorized GET and both independent offline content loads passed.**
There were no failed native attempts, retries, redirects or fallback loads.
This is **content reader coverage only**, not successful full Go navigation,
layout, scripting or resource behavior. The earlier failure in
`GO-STYLESHEET-DOCUMENTATION-FLOW.md` remains historical and unresolved by this run;
its policy-denial-stop coverage limitation is not removed. Python CSS diagnosis
belongs to the parent and was not duplicated.

At `2026-09-13T15:31:11.823Z`, the pinned native NodeNetworkTransport started its
only actual GET, exactly `https://go.dev/doc/effective_go`. The response was
received at `2026-09-13T15:31:11.935Z`: **200**, `text/html; charset=utf-8`, gzip,
**51,485 encoded bytes / 142,913 decoded bytes**. No challenge/login diagnostic,
HTTP 429 or Retry-After was observed. Native challenge classification is a
bounded heuristic, not proof that every possible access barrier is recognizable.

Immutable decoded capture SHA256:
`31b3beeb4fea135b85070f0362a1373b5e67981b8d6adc4afbb7291e06cdac5f`.
Both loads use these identical bytes. Encoded length is a native transport
measurement; encoded bytes were not retained or independently hashed. Header
metadata is allowlisted, not an unfiltered wire/TLS capture.

## Independent Observations

| Measurement | long-v1 / default raw policy reader | Native full-DOM comparison |
| --- | ---: | ---: |
| Load completed | yes | yes |
| Nodes | 4,259 | 4,328 |
| Headings | 60 | 60 |
| Links with href | 123 | 123 |
| pre elements | 153 | 153 |
| code elements, including those inside pre | 589 | 589 |
| Native selector calls | 3 | 3 |
| Aggregate query work | 92,983 | 95,830 |
| Auxiliary walk work | 2,564 | 2,564 |
| Complete labels / code units | 24 / 718 | 24 / 718 |
| Measured load path, ms | 52.506852 | 45.045816 |
| Aggregate native query time, ms | 13.085534 | 16.408644 |

The reader ran `2026-09-13T15:31:16.145Z–15:31:16.283Z`; full DOM ran
`2026-09-13T15:31:21.066Z–15:31:21.198Z`. Load timing starts immediately before
the native loader/parser and includes its subsequent information lookup/checks;
module imports are excluded. Full-DOM UTF-8 decoding/round-trip checking occurs
before its timer, whereas reader decoding is internal to its timed loader.
Query timing includes native selection and its metrics lookup, not all label
walking. These unequal load paths and one sequential observation are **not a
performance benchmark or evidence that either mode is generally faster**.

The three native selectors were `h1,h2,h3,h4,h5,h6`, `pre,code`, and `a[href]`.
All counts came from native DOM APIs, not source parsing. Each mode sampled the
first eight heading, eight pre/code and eight link candidates, without expanding
the sample. All 24 complete labels agree between modes after ignoring native
references; none were skipped. The headings start with Effective Go,
Introduction, Examples, Formatting, Commentary, Names, Package names and Getters.
Some link labels contain whitespace or icon text: these are complete DOM text
labels, not visible/accessibility-name or rendered-content claims.

Native reader diagnostics remain partial: scripts/styles are off and hidden
content semantics are ignored; omitted subtrees are **8 link, 11 script, 9 meta,
1 iframe**, with **297 ignored attributes, 4 unwrapped elements, 0 tokenizer
issues**. Default raw policy was left unspecified; no alternate policy was tried.
The independent full-DOM parser is also partial and retains its diagnostics:
**11 script-not-executed, 1 iframe-not-loaded, 3 misnested-body-end,
3 unmatched-end-tag**. These were not suppressed or rewritten as full HTML
support. Full DOM was explicitly allowed regardless of the reader result, not
used as fallback success. No style/resource/script callbacks were installed.

## Exact Provenance

Only `node_modules/.cache/native-validation/native-generated-clear-september13-round00/snapshot01/dist`
was used for browser modules. Audited base:
`ea00b5b71952efeae0f7467e3c3280b9dc7471bb`, plus the audit's exact owned source
changes in `src/formatting-tree.ts`, `src/generated-content-formatting.test.ts`,
`src/generated-content-positioning.test.ts`, and `src/generated-content-clear.test.ts`.
This is the audited snapshot, not a claim that the root working tree or bare
base commit is identical to that runtime.

| Pin | SHA256 |
| --- | --- |
| 1,290 source/input inventory | `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619` |
| 2,124 compiled inventory | `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9` |
| Runtime audit / BOUND-AUDIT.json | `0e46c68a62e3e82d8cc98f99158ae2cc990ca056a7343b44565531d9784104df` |
| Runtime receipt manifest | `2967a19b1e84bf4a34f453ce7167613b55ced23a7887fef277bbb294f8657768` |
| Framework/input binding | `edb19c8f8576e63a71f3c9d1bbc76290102c5b2e25b07a6cc9e3f7162bddd294` |
| Node22.22.0 executable | `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31` |

Pinned Node is `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`.
The pre-existing runtime audit reports **19,803 passed / 0 failed / 2 unchanged
skips**, **384 selected / 383 strict roots / 749 manifest entries**. It records
`allExecutedTestsPassed=true`, `selectedRunSuccessful=true`, but
`allSelectedTestsPassed=false` because of the skips. No native test suite was
rerun, and those unit results are not live acceptance evidence.

The seven harness/guard files were adapted from
`node_modules/.cache/native-validation/native-python-tutorial-september13/`.
`FRAMEWORK-BINDING.json` binds their original hashes, new authored hashes, parent
SITE-WORKER instructions, root instructions, prior Go report and runtime audit
receipts. Its inherited Python **runtime audit** had one failure and older pins;
none of its old observations were relabeled as this run. Complete source and
compiled inventories, Node, audit, receipt payloads and bound framework inputs
were checked before/after each of the three actual probes, plus preflight and
final read-only evidence verification.

## Bounds And Cleanup

Exactly one native GET, zero redirects/retries/subresources/other URLs,
`redirect:error`, fresh empty CookieJar, credentials omit and no wire cookie/auth
headers. Capacity one; 25-second transport timeout; 3MiB encoded, decoded,
per-body and aggregate caps. Pacing is configured at 250ms; a single request
does not exercise an inter-request interval. Both cookie jar and transport closed,
with zero retained cookies or active requests.

Per load: at most 50,000 nodes, depth128, 3,000,000 text units, 1,024 changes,
four native queries, 2,000,000 aggregate query work, 100,000 auxiliary walk work,
24 labels / 16,000 label units / 2,000 per label. All observed values stayed
within bounds. Revisions stayed unchanged during queries; each document closed
to zero nodes and each query owner closed with zero indexed nodes.

All actual probes used private fresh empty HOME/TMP, sanitized child environment,
Node22.22.0, pipe stdio, 30s supervisor +5s kill grace, and 10MiB file/combined
stream caps. All three exited zero with empty stderr, no signals, truncation or
guard attempts. Both offline children recorded `NoNewPrivs=1`, `Seccomp=2` and
paired JS/kernel network/process guards. Live outbound admission is native
policy plus JS instrumentation, **not a kernel origin firewall**. Native runtime
internal threads remain permitted. All private directories were verified empty
then removed; all three process groups were verified absent.

No actions, geometry, raster, actual socket/TTY/PTY probes, source-heading-source-10
payloads, credentials/profiles/devices or SafeJS were accessed. No root code,
tests, TASKS, global inventory, historical evidence or commits were changed.

## Files And Seal

**72 files written: 70 new lane files, this report, and the parent handoff.**
The lane is `node_modules/.cache/native-validation/native-go-effective-september13/`.
Its `ARTIFACTS.json` explicitly enumerates every written path; `DIGESTS.sha256`
seals 71 payload paths, including this report and
`node_modules/.cache/native-validation/python-css-diagnostics-work-september13/SITE-RESULT.md`.
The digest manifest excludes itself to avoid self-reference. `CHECKS.json`
retains actual verification time, observations, preserved diagnostics and cleanup.
Lane files are made read-only after seal verification; no native probe is rerun.

Parent read-only verification from repository root:

```sh
/home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  node_modules/.cache/native-validation/native-go-effective-september13/verify.mjs verify
```

**No blocker for this narrowly authorized content check.** Full Go navigation,
click/layout/script/resource acceptance and the overall browser goal remain open.
