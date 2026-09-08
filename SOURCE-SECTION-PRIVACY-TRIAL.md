# Native registration-privacy section trial

September 8, 2026. The browser's native capture codec and identity-bound section
API retrieve one bounded section from the previously captured WebAuthn source.
This is actual native prose evidence, not just a heading label, DOM rendering,
full-source interpretation or an implemented privacy/consent policy.

## Native result

- Source endpoint: `https://www.w3.org/TR/webauthn-3/`; original source10 request
  remains its separately recorded September8 HTTP200 retrieval. This trial makes
  zero new requests and does not rewrite the historical capture-readiness flag.
- Exact source10 receipt:3709925bytes,
  `9d21767edd90f957fbf6a57e4d71cc11c0d9070ecd0a009cebae64383c4619ea`.
  Only the separately authorized wrapper parses it, validates/decodes its capture
  with the actual native `long-v1` codec, then invokes native section extraction.
- Validated body:2739242bytes; decoded source2717929UTF16 units; byte/text-UTF8
  SHA256 `157030c980d44a3ce4b1ec5bcfaa16790c7dfefac20709af6ed2b11c7120970b`.
- Selection187: “14.5.1. Registration Ceremony Privacy,” exact heading anchors
  `[1428806,1428888)` and `[1429043,1429048)`. Body range
  `[1429048,1432608)`; following heading188 fully validated through1432840.
- Native execution06:51:05.271–06:51:05.829Z,558.223212ms. Original120s deadline;
  native section timeout lowered to119863ms. No limit increase, fallback or retry.
- Native result:5text blocks/1407retainedUTF16 units,62703tokens/62716operations,
  4661787shared work units including64585projection work units,0issues,280yields,
  depth5. Twelve style-discard steps/elements,27041discarded units; one legacy raw
  call. These are this bounded walk's counters, not source10's whole-source totals.
- Native export4836bytes, SHA256
  `0f4f3c33f76ab692dae524e6e84609196cff14a936c1d222d7457ce29f7fc9d9`.
  `partial:true`, `contentSuccess:null`, `extracted-unverified`, no truncation.

## What this section supports

The retrieved discussion warns against letting a relying party distinguish an
absent authenticator from an available authenticator containing an excluded
credential before the user consents. An early failure can disclose credential
availability through timing, particularly for a platform authenticator. The
discussion distinguishes the case where the user has already consented to create
a credential before a distinguishable error is returned. This supports treating
pre-consent exclusion errors as a privacy boundary, not merely a transport error.

It does not by itself specify the full create algorithm, exact permission/lifetime
timer behavior, the meaning or propagation of a provider consent flag, attestation
transformation, authenticator selection, or every cancellation branch. Existing
host approval callbacks and CTAP deadlines are not automatically evidence for
page-level WebAuthn consent or indistinguishable failure behavior. Those gates
remain separate; no provider, device or page runtime was activated here.

## Isolation and independent integrity

The fixed existing `unshare --user --map-root-user --net --fork` launch places the
native child in a distinct network namespace before source access. Recorded
parent/active IDs: `net:[4026531840]` / `net:[4026532855]`. This maps the caller to
namespace root, not host root, and is not full filesystem/process/IPC isolation.
No socket, DNS, website request, TTY, SafeJS, vault or authenticator action occurs.

The supervisor records actual native/helper/aggregate0statuses, completed status
availability, empty success streams, matching input and frozen-engine checks.
Child output retention is4096bytes per stream; child125+5s and whole155+10s bounds
are separate from the native120s deadline. Exclusive publication is not atomic.
Two static supervisor findings were corrected before the source run: retain group
KILL escalation after immediate-child close, and propagate intermediate status/
timestamp publication errors into aggregate failure. Historical reviews remain.

A separately authorized zero-GET verifier runs06:52:16.651–06:52:16.894Z and admits
the section:18actual input files plus one declared historical receipt entry,
1748exact-set compiled files and57RUN artifacts. It never reopens or decodes the
old receipt and never re-executes native parsing. INTEGRITY SHA256:
`7882404aee4348b2d18b731f1899f52dbca14f5443d7caae9e64e77c8f9a04fa`.
Only after that admission was the new native section read for this investigation.
Integrity is not source authenticity, freshness or complete standards conformance.

## Controls and preserved failure

Twenty-three finite synthetic controls pass in the second separately authorized
cohort,06:49:07.907–06:49:09.446Z. All1765input pins match before/after, no cases are
unrun/unrecorded, no historical reads occur and the sole deliberate network API
attempt is intercepted without forwarding. Positive calls use the actual native
codec/section; four direct-codec negatives and pure verifier controls have their
explicitly narrower coverage. They do not execute verifier-main or supervisor
failure-path integration. Five Node and three separate Bash syntax checks pass.

The first cohort remains22pass/1failed expectation,06:47:06.573–06:47:08.119Z.
Its failing case successfully extracted native prose, then compared a native
null-prototype omission map against an ordinary object using strict equality.
Only the expected map prototype changed; the old runner and all failed evidence
are preserved. Static ordinal and EOF/entry-limit fixture corrections also remain
documented. The syntax approval timed out once and its identical allowed retry
succeeded; both native cohort, source and verifier approvals succeed first attempt.

Evidence resides in
`node_modules/.cache/native-validation/native-section-trial-01/`, including exact
source/run ledgers, controls, syntax checks, bounded new section and integrity.
Independent evidence review finds no actionable discrepancy. All405regular-file
entries in the final inventory pass the hash audit; two intentional synthetic
symlinks are separately inventoried without following them. FINAL SHA256:
`618d86a2346295a28cecc354bc3592a3657b603f5f478eeb94f1e995a0c74f6a`.
The lane is frozen: do not edit or rerun it. Final auditing does not retroactively
add later verification/review artifacts to the original57-entry RUN ledger.
The frozen engine is `native-source-sections-verified`, commit
`58e9aa1bd4a54f48ea53a1227f30fa30b1de23c2`; no Chromium/Firefox/remote browser,
new runtime dependency, engine rebuild or host-HTML fallback is used.

Static committed-code review identifies a concrete software-provider gap: a
matching exclusion rejects before the trusted creation approval callback. Two
existing tests encode that order, including the restored-checkpoint path. The
bounded next fix removes only that early membership check and retains the existing
post-approval/liveness check before key generation and persistence. It needs no
guessed delay or additional source inference, and does not imply full page consent.
The assessment is `privacy-review/ASSESSMENT.md` in the trial evidence directory,
SHA256 `45dc7a4d043019c74b389ca9675dbe2085744fd1ca5aa32dbe628cf42c6a6c39`.

Broader algorithm-specific privacy work still needs a separately scoped native
section proposal. Original source10 flags, denied parent-RP expansion, real vault/
device/page/consent gates and blocked research endpoints remain unchanged.
