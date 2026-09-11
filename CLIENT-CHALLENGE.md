# Bounded client JavaScript challenge recognition

Status: the captured PyPI client challenge is now recognized offline. PyPI search
remains blocked; this is detection and a handoff recommendation, not challenge
solving, bypass, successful search or general anti-bot effectiveness.

## Observed gap

PYPI-NATIVE-FLOW.md preserves a separate September 11, 2026 live native search
attempt at 09:09:42.985–09:09:44.595 UTC. Homepage loading, actual form discovery,
constant fill, GET submission and destination loading completed, but the resulting
45-node HTTP200 document was titled `Client Challenge` and required JavaScript.
The old classifier returned null even with actual primary HTML response headers
and native title/text. The probe failed its result check and made no live retry.

Its immutable receipt ledger, including the report and captured bodies, is checked
again by main. The agent's 29-check offline verification and the original local
prelaunch-only correction remain documented at their original paths. None of those
historical failures or measurements is changed by the recognition fix.

## Conservative recognition

The classifier now reports an unspecified-provider **possible** challenge only
when the bounded normalized title is exactly `Client Challenge` and bounded native
text contains both the observed JavaScript-disabled and enable-JavaScript-to-proceed
phrases. The ordinary HTML content-type/status admission still applies. Title/text
limits, header validation, accessor avoidance and partial-word truncation guards
are unchanged. No vendor is inferred from the path or hostname.

Generic documentation titles, single phrases, lookalike words, out-of-bound markers,
non-content responses and non-HTML headers do not trigger this new case. The
existing diagnostic action is `stop-and-request-user-handoff`; no automatic solver,
script execution, retry, fingerprint spoofing or network policy change is added.

## Isolated validation

`node_modules/.cache/native-validation/native-client-challenge-september11-round01/`
records 09:17:40.708–09:19:16.800 UTC:

- 6431 passing tests, zero failures and one documented, previously reproduced
  baseline assertion exclusion across 109 explicitly selected native files.
- All 139 challenge-classifier cases pass, including 16 new recognition and
  false-positive/boundary cases. Production compilation, 108-root strict checking
  and two-file formatting pass, with the existing snapshot.test.ts strict exception.
- 1006 source/fixture files remain stable; 1788 compiled files are pinned in
  `native-client-challenge-compiled-september11`, ledger SHA-256
  `508b83a69d3a8e75ec1446e34087176b432a2afc63f9eab5ac24eef4753a68dc`.

`native-client-challenge-baseline-september11/` preserves unchanged HEAD 8daff90
production source with the new tests: the 16-case new describe has 12 passes and
four failures; 123 older cases are not selected in this focused baseline command.
The four failures are the missing positive recognitions. These exclusions are
distinct from the one baseline assertion excluded in the broader native run.

## Same-body native replay

`node_modules/.cache/native-validation/native-pypi-client-challenge-replay-september11/`
records 09:20:37.376–09:20:37.511 UTC. One native BrowserSession navigation loads
the captured 3038-byte challenge HTML and 5747-byte stylesheet with no network.
The document query is reconstructed from the retained observed form; its stylesheet
URL comes from native DOM discovery, with retained origin/path/order validated.
This is not unredacted original wire-query evidence.

Using native title/text and the actual captured primary headers, recognition now
returns `challenge`, `unspecified`, `possible`, `html-challenge-markers`, and
`stop-and-request-user-handoff`. The same original receipt still records null.
Both captures retain their original hashes. All documents, query engines and the
fixture transport close; network guards have no attempts, uncaptured resource
denials are zero, private directories stay empty and source/build/parent pins
remain unchanged. Receipt SHA-256:
`9dcf7f97fb4b805616ffa768a1d7763465ed85f91f64f0c41b7edff3563c72df`.

The replay uses seccomp and JavaScript network/process guards, a 30-second child
deadline, 6-MiB output/file caps, no credentials, scripts, TTY/PTY or SafeJS. There
is no fresh PyPI attempt after the observed challenge. Automatic caller handoff,
successful access, general classifier coverage, rendering, research and broader
fingerprinting/challenge effectiveness remain separate outstanding gates.
