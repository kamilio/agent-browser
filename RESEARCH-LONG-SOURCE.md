# Native long-source admission checkpoint

On September 6, 2026, a separately authorized native-browser-only request uses
the explicit long-profile CLI from `872a6aa4e2fd92c95722bd5988750361a77675d7`
against `https://www.w3.org/TR/webauthn-3/`. It is a new pinned operation, not a
rewrite or automatic retry of the earlier default-budget source lane.

## Actual result

The native operation runs at `21:03:44.931–21:03:45.351 UTC`: one real request,
zero redirects, HTTP200, HTML/Brotli, 323,736 encoded and 2,739,242 decoded bytes
recorded by the transport. The larger response/capture profile gets past the
earlier response-size guard, but **native parsing fails at document.nodes:
50,001 observed against a 50,000 limit**. Outcome remains failure, partial=true
and contentSuccess=false. There are no headings or extracted source text.
Transport closes with active0; native and supervisor exit1; stderr is empty.

The failing counter is not the eventual document-node total, a heap measurement
or evidence that an arbitrary larger tree limit would suffice. The existing
long-v1 node ceiling and all defaults remain unchanged. No raw HTML is inspected
as a source-text fallback, and no second source request follows this failure.

The original receipt is 3,654,540 bytes, SHA256
`f8ddc55d4e01b8072b7a6a6485ca6e1f0a7df5869de20fcbb1fe9c06345b47fd`.
It includes effective-limit provenance and recorded body-capture metadata; it
does not become a successful discovery receipt merely because HTTP succeeded.

## Evidence handling

Evidence lives in
`node_modules/.cache/native-validation/webauthn-level3-long-source/`.
Its `REPORT.md` retains exact source/supervisor/verification times, original exit
states, hashes, review findings and frozen input identities. The earlier default
source failure and no-match draft query keep their original paths and results.

Five separately authorized finite local supervisor controls pass: ordinary0,
ordinary7, timeout124 with unavailable native completion, a preflight collision
that prevents invocation, and a post-preflight ledger collision that correctly
records final1 despite pre-finalization0. The controls substitute only the lane
and timed child command, not the actual preflight/finalization code. They execute
no browser/network operation and do not establish atomic or durable publication.

Two status-path findings are fixed before the source request. The supervisor
remains outside the timed native process group, checks output-name collisions,
records unavailable completion honestly and writes final status after the run
ledger. The final status is separately pinned, not circularly included in that
ledger. Missing/partial artifacts never count as success.

Four verifier preflight findings are also fixed: independent required artifact
coverage, exact owned-snapshot digest binding, three explicitly supplied hash
authorities and bounded compiled-inventory traversal. The separate zero-GET
verification at `21:04:56.613–21:04:57.013 UTC` validates1,732 compiled files and
40 run artifacts. It records integrityPassed=true, issues=[], but remains
**evidence-only/native-failure, not capture-ready**, and exits1. Body identity
and outline integrity are null; the failed capture is not decoded or replayed.

The committed CLI's 239 new native cases pass. Its broader validation still has
three unchanged selector runtime failures and thirteen baseline selector type
errors; the nine-file strict pass is not a ten-file strict pass. Neither this
source request nor the local controls changes those historical measurements.

## Next gate

A bounded native parsing/discovery design needs review before another source
admission. Do not silently raise the named profile, reinterpret this failure as
success, use its capture as automatic replay authority or substitute another
client. Source-specific privacy wording and the archived attestation-none
ambiguity remain unresolved. Real passkey device/consent/provider/page integration,
cryptographic trust, blocked research topics, fingerprint/challenge compatibility,
all existing stopped/denied gates and the full multi-day browser goal remain open.
