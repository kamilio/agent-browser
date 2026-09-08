# Consent-qualified software passkey exclusion

The software authenticator's existing post-approval excluded-credential failure
now reaches the active create broker as a fixed `InvalidStateError`, rather than
being flattened into an ordinary provider `UnknownError`. Exclusion still happens
only after host approval and liveness checking, before key generation or storage.
The change does not activate a provider or change RP/origin, attestation or get.

## Internal identity boundary

`src/passkey-exclusion-error.ts` owns a private WeakMap from newly created Error
objects to the original provider-request AbortSignal. Its factory preserves the
software provider's fixed name/message and records no public consent marker,
credential, RP, callback text, cause or signal field. Its consume helper requires
both exact error and signal identity, deletes a successful match and reads no
arbitrary error properties or prototypes. Wrong-signal checks do not consume it.

The only production factory call is the provider's matching `checkExcluded`
branch, using snapshotted `input.signal`, not its separate inner approval signal.
The broker checks liveness first and recognizes this identity only for create,
against its own ceremony controller signal. It creates a new fixed broker error:
`InvalidStateError` / `Passkey broker is unavailable`. Provider text/cause/stack is
not forwarded by that mapping. The existing generic message is retained unchanged.

Copies, name/property/prototype lookalikes, proxy wrappers, consumed identities
and errors from another ceremony do not acquire the new brand. Get cannot use
this promotion. Ordinary non-private failures reaching the mapping remain fixed
UnknownError. The helper is internal; no package barrel or page API is added.

This is a trusted-provider assertion, not proof of human consent or a sandbox
against trusted host code. That code already receives the ceremony signal and
can return consent-bearing results. The existing broker first tests its private
error with `instanceof`; hostile/revoked Proxy prototype traps and a captured
private-error prototype remain outside this new helper's protection. This patch
does not claim broker-wide trap-free error handling or fix generic-error timing.

## Source rationale and limits

`SOURCE-SECTION-CREATE-TRIAL.md` records the separately retrieved native creation
method. Its distinguished exclusion branch requires consent, unlike ordinary
authenticator errors. The signal-bound one-use mapping is a local implementation
inference from that distinction, not a complete WebAuthn privacy state machine.

The older ordering report, `PASSKEY-EXCLUSION-APPROVAL.md`, retains its original
187-case result and then-current UnknownError limitation. It is not rewritten as
if this later mapping had already existed. Full lifetime/availability processing,
conditional attestation transformation, human/page consent, other-provider
guarantees and real device/vault/SafeJS acceptance remain separate gates.

## Actual isolated validation — September 8, 2026

Validation uses committed90f7c042 source plus these exact five candidate files,
not the mixed working tree. The committed package is retained; only the new test
is added to the explicit native manifest,518 to519. The two pre-existing pending
manifest entries and unrelated/denied parent-RP edits are excluded.

| Stage | Actual UTC interval | Result |
| --- | --- | --- |
| Candidate formatting | 08:03:29.844247620–08:03:30.024453841 | exit0; originals and exact formatted results retained |
| Setup01 | 08:04:13.380964470–08:04:20.353579303 | build0/types0/lint1; new-test import ordering only |
| Setup02 | 08:05:34.064043564–08:05:41.177951397 | build0/types0/lint0 after only swapping two import lines |
| Native02 launcher | 08:07:26.937330303–08:07:28.458007969 | preflight exit1; tests unavailable/not invoked |
| Native03 | 08:09:52.722674592–08:09:56.702813487 | 227pass,0fail,0pending in five files |

Native02's expected ledger used C ordering while the wrapper inherited
en_US.UTF-8. All2724unordered path/hash pairs were identical and post-check passed;
the ordered comparison correctly refused execution. A new03runner pins C sorting
and uses fresh outputs against the unchanged compiled02snapshot. No old artifact
or runner is overwritten, and no native test failure is concealed as a retry.
Each formatter/setup/native action receives separate fresh approval.

The passing cohort is40new identity/broker-contract cases,20software exclusion-
approval cases,49authenticator cases,41persistence cases and77broker cases. All187
previous assertion names remain. Only the matching actual-broker case changes its
two name/message expectations; the other19 cases and three older test files stay
unchanged. Existing software tests use actual crypto and owned synthetic storage.
New contract tests disclose synthetic providers, stubbed digest and fake timers;
they are not device, cryptographic, storage or elapsed-time privacy validation.

Static review first catches final-status publication ordering and overbroad
redaction wording, then three swallowed assertions inside synthetic provider
callbacks. All are corrected before execution; original findings remain. The
assertions now run outside error redaction. Final static review finds no remaining
issue in that bounded correction. Formatting changes only layout; the sole actual
lint failure and launcher refusal remain independently recorded.

Native JSON:71148bytes, SHA256
`4487b290ed691c9ef4cca85a0e0bd59d6d5451a8bb61bc54e29bfe66b624858a`.
All2724pre/post input pins match; ledger SHA256
`3f177db623adb2c2bc734176effa29e2f57f1d3b689f53aae8929dd4418a2069`.
Test/input/aggregate/outer statuses are0. Native stderr and both outer streams
are empty; native stdout is155bytes identifying the report path. This is a five-
file native cohort, not a full suite or live acceptance run.

Evidence: `node_modules/.cache/native-validation/native-passkey-consented-exclusion/`.
Integration review finds no actionable discrepancy and independently rehashes all
2724inputs. All212frozen regular-file artifacts pass final audit; final ledger:
`0e830d8d82057355d335e1823cd772754601e4554757a2490d942808753aceca`.
Review SHA256: `c5ce55ede0048dd634fb736843873f4deb76e83ae3c8c6067664f4cf6701929b`.
Audit: `/tmp/native-passkey-consented-exclusion-final-audit.log`.
No real password/.env/pass store, authenticator device, network/socket/TTY,
SafeJS/SDK probe or new dependency is used. Pre-existing working edits remain
preserved and are not execution-validated by this isolated pass. The original
browser improvement goal and outstanding gates remain in `TASKS.md`.
