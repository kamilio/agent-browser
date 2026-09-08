# Native credential-creation section trial

September 8, 2026. A separately authorized native capture-codec and section API
operation extracts the WebAuthn credential-creation method from the existing
source10 receipt, without a new request. This is bounded lexical source evidence,
not rendered DOM, complete browser conformance, provider activation or consent.

## Exact result

- Original endpoint: `https://www.w3.org/TR/webauthn-3/`. Its source10 retrieval
  remains historical; this operation does not change its replay-readiness flag.
- Declared receipt: 3709925 bytes, SHA256
  `9d21767edd90f957fbf6a57e4d71cc11c0d9070ecd0a009cebae64383c4619ea`.
  The authorized wrapper alone reads it and invokes the actual native `long-v1`
  capture codec, then the identity-bound native section API.
- Validated body: 2739242 bytes / 2717929 UTF16 units, byte/text-UTF8 SHA256
  `157030c980d44a3ce4b1ec5bcfaa16790c7dfefac20709af6ed2b11c7120970b`.
- Target heading35, level4: “5.1.3. Create a New Credential.” Exact heading
  anchors `[302660,302734)` / `[303132,303137)`, body `[303137,393328)`.
  Deeper heading36 is retained; next level4 heading37 validates through393564.
- Actual native execution07:35:27.591–07:35:27.955Z,363.524043ms. The original
  120000ms ceiling is lowered to119863ms after admission, never increased.
- Output: 226blocks /20841retainedUTF16 units,40636bytes, SHA256
  `90ba6629fe5699c6c3868c2155f3a899d1045ec81725fe550e0701d73f27faa4`.
  It retains `partial:true`, `contentSuccess:null`, `extracted-unverified` and
  no text truncation. This is not a full-source semantic success flag.
- Walk counters:17725tokens,17738operations,2547539work units including101620
  projection units,0issues,98yields,depth4,37heading starts. Twelve style-discard
  steps/elements consume27041units; one legacy raw call. Body omission maps are
  empty. These bounded-walk totals are not whole-source10 totals.

## Controls and independent admission

The adaptation changes only the lane/selection/identity constants. The core is
byte-identical to trial01; repaired supervisor cleanup/status handling and the
correct null-prototype map assertion are retained. Trial01's failed control
history is not relabeled as a fresh result.

Fresh syntax checks run07:32:55.708772304–07:32:56.280941033Z: five Node files
and three separate Bash checks pass, with12input pins unchanged. The first
approval review times out; one identical retry approves execution. No failed
syntax execution occurred. Fresh controls run07:33:32.361–07:33:34.071Z:
23/23pass,1765before/after pins identical, no unrun/unrecorded cases, no historical
receipt reads and no forwarded network operations. One intentional network API
attempt is intercepted. Controls receive their own first-try approval.

The source operation receives separate fresh approval and runs in a distinct
network namespace: parent `net:[4026531840]`, active `net:[4026532857]`.
The namespace child completes with actual exit0, empty untruncated streams and
no socket, DNS, live GET, SafeJS, TTY, vault or authenticator operation. The
supervisor records matching source/engine inputs and actual child/helper/aggregate
statuses. Namespace isolation is not complete filesystem/process/IPC isolation.
Child125+5s and whole155+10s bounds remain; publication is exclusive, not atomic.

A separately approved zero-GET verifier runs07:36:50.673–07:36:50.915Z, exit0:
18actual inputs plus1declared old receipt,1748compiled files and51RUN artifacts
admitted. It does not reopen the old receipt or rerun the native codec/parser.
`integrityPassed:true` and `sectionEvidenceAvailable:true` establish this artifact
association, not source authenticity/currentness or implementation correctness.
INTEGRITY SHA256:
`0924630d2fcf4323b68c081686fcafb21547eaeaef48f8615c048ecb6141a7fd`.

## Interpretation boundary

The normalized source blocks are not numbered algorithm steps. Ordinary
container/list hierarchy and link destinations are not retained; covering ranges
are not character maps, and no DOM visibility or repair is inferred. The deeper
Create Request Exceptions section explicitly labels itself nonnormative.

The creation method distinguishes an authenticator's excluded-credential error
after user consent from other errors that do not imply consent. This corroborates
the narrower software approval-ordering fix in `PASSKEY-EXCLUSION-APPROVAL.md`;
it does not make the broker's existing generic error redaction equivalent to the
complete page algorithm. None-attestation handling also has a conditional
self-attestation branch, so blindly rewriting every object is not established
as the only behavior by this section.

The retained method starts a lifetime timer and processes authenticator responses
while it remains live, with expiry and cancellation paths. That supports a
lifetime-governed process, not an arbitrary sleep on every failure. The exact
identifier `userConsented` is absent: this source does not establish that our
provider boolean proves human consent. The none branch's retained otherwise
instruction does not add an AAGUID-zeroing step; unread references cannot supply
one by inference.

Static evidence review independently checks18actual input hashes and all51RUN
hashes, finding no actionable discrepancy. Its compiled-tree check is limited to
inventory identity and recorded verifier results. A separate source/code assessment
supports a narrow next seam: a signal-bound, one-use trusted exclusion error,
recognized only by the active create ceremony after liveness checks. This is an
implementation inference, not yet a validated change or human-consent proof.
Review SHA256:
`1ea24314b284b6d20a8f105464e3c1f11e6262e558c55e68c310352b50ace8bb`.
Assessment SHA256:
`98818a36d92f750ec45760d8360592df9892c1fabc420d3c8857ad1c94da89e7`.

Source evidence: `node_modules/.cache/native-validation/native-section-trial-02/`.
All253frozen regular-file artifacts pass final audit, as do all1748compiled engine
files in a separate read-only rehash. One synthetic symlink fixture is recorded
without following it. Final ledger SHA256:
`bcc0b298fe6cd123643f7dbdce48de8173bf195024f4019331b8a37e5ec14df9`.
Audit: `/tmp/native-section-create-trial-final-audit.log`.
The original source10 receipt and frozen engine remain unchanged. Full page
privacy/lifetime behavior, attestation projection, provider consent guarantees,
real vault/device/SafeJS acceptance and previously denied gates remain separate.
