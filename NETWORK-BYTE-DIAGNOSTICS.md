# Bounded network byte diagnostics

The existing native stream-consumption byte guards now attach immutable numeric
diagnostics through the shared `resourceLimitDiagnostic` WeakMap mechanism.
No network, reader, capture, output, time or document limit is increased.

| Kind | Limit | Observed |
| --- | --- | --- |
| `network.response-encoded` | Effective response byte cap | Encoded bytes in this consumed response |
| `network.response-decoded` | Effective response byte cap | Decoded bytes in this consumed response |
| `network.session-encoded` | Session `maxTotalBytes` | Session encoded-byte counter |
| `network.session-decoded` | Session `maxTotalBytes` | Session decoded-byte counter |

All four use unit `bytes`. Each observation includes the entire offending chunk;
it can exceed the limit by more than one byte. It is not a retained-body size,
the complete remote document length, or a promise that a body can be replayed.
Encoded and decoded session counters remain independently limited, not summed.

The order remains counter update, accounting debit, session check, accounting
failure check, then response check. A throwing debit retains precedence; a false
debit remains an untagged `Fetch response body limit exceeded` error unless the
session check wins first. Messages and `resource-limit` categories are unchanged.
Unsupported encoding, abort, invalid compression, closed admission, routed/mock
responses and other existing guards are not retagged by this change.

Only errors created by the shared diagnostic helper carry trusted metadata.
Copied/inherited properties, getters, wrappers and revoked proxies cannot forge
it. The existing research report serializer can now retain these four numeric
fields without publishing exception messages, body bytes, URLs or headers from
an error. No new output field containing credentials or content is added.

## Focused validation

The dependency snapshot is pinned to committed
`3a20123fbaf7bd847f58e3b535b494261b461534`, excluding unrelated working changes.
September 6, 2026 evidence is retained in
`node_modules/.cache/native-validation/network-byte-diagnostics/`.

- Unchanged baseline: **13 passed, 18 failed**, one 31-case file, exit 1,
  `19:14:30.834395488–19:14:34.179810034 UTC`. Fourteen failures are specifically
  absent diagnostic metadata; four are absent metadata on otherwise correctly
  classified synthetic research failures. No fixture/import/runner timeout is
  counted as a regression. Baseline and candidate use identical test bytes.
- Candidate: **148 passed, 0 failed or pending**, four explicit native files,
  exit 0, `19:15:26.717799017–19:15:30.069995140 UTC`: new diagnostics 31,
  resource-limit 34, research failure limits 6, response accounting 77.
- Build, strict types and Biome pass for baseline-02 and fixed-01. Baseline-01
  retains build/strict success and two test-only lint failures, corrected before
  any native invocation. Three formatter passes total; no snapshot was rewritten.

Tests exercise the actual private stream consumer through a narrow structural
test seam, actual Readable/Transform/Writable/pipeline, gzip/deflate/Brotli, split
chunks, exact boundaries, multi-operation session accounting and real accounting
writers. Fixture buffers remain unchanged. Four synthetic research adapters
propagate actual consumer failures; they do not perform or prove HTTP exchange,
DNS, TLS, redirects or policy admission. No production testing API was added.
No socket-backed transport suite, full manifest, live website, SafeJS runtime,
TTY, device, password vault or real account was exercised.

Runtime SHA-256 identities:
`src/node-transport.ts`: `befc1ad50270c5b909148538e9bbe2535ce2b972f4857b8868f70644bf686ee5`;
`src/resource-limit.ts`: `ff846b5f8a4af68ea114d883cb5dde7a2a18415538ba7b13adf42f05daaae2ef`.
New test identity:
`82786c4bc9bb08680c10a9789ffcc2bf69da5b18730d2a55f061d3950af67cfb`.

## Preserved source failures and open gates

The frozen native browser's published Level3 attempt at
`https://www.w3.org/TR/webauthn-3/` failed at the network resource limit on
September 6, 2026, `18:44:35.253–18:44:35.361 UTC`. Its counters were one request,
323,792 encoded and 2,015,232 decoded bytes; no body, final response URL/status
or source privacy wording was established. The frozen CLI used a 2,000,000-byte
response cap. Attribution to its decoded guard is a code-backed diagnosis, not
a numeric diagnostic retroactively present in that receipt. This implementation
does not rebuild that engine, retry that GET or change the historical failure.

A separately authorized zero-GET draft comparison at
`19:12:50.061–19:12:50.073 UTC` found no native text-line matches for the literal
`attestation conveyance preference` in an already captured mutable Bikeshed
development source. It failed the nonempty-discovery gate, performed no section
selection, and does not establish absence of privacy rules or published wording.
Both failed lanes retain their original identities and reports. The earlier
archived Level1 field-location ambiguity and published privacy gate remain open.

Larger-document admission requires an independently reviewed finite capability,
not an automatic raised-limit retry. Successful native HTTP receipt validation,
passkey privacy/cryptographic/consent/provider/device/page acceptance, all prior
stopped/denied gates and the full browser goal remain outstanding in `TASKS.md`.
