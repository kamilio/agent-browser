# Native passkey broker and page capability

This is a bounded WebAuthn implementation layer with an explicit trusted
authenticator port, not a built-in operating-system authenticator. It has no
default key provider, automatic user approval, private-key export, synchronized
credential store or claim of full WebAuthn conformance.

September 5, 2026 integrated checkpoint: **195 new cases pass**. Ten named
suites yield **293 isolated passes** and **298 working passes plus one
independently reproduced pre-existing onload failure**. Types/builds in both
trees, strict new-test types, scoped Biome and touched binding formatting pass.
The explicit native manifest contains 422 entries; the full manifest was not run.

## Host configuration

Broker-generated create/get provider contexts also include `clientDataJSON`: a
detached copy of the exact UTF-8 bytes hashed into `clientDataHash`. Providers may
mutate or retain their copy without changing the response. The JSON preserves the
canonical origin, including nondefault ports, but not page paths, queries or
fragments; `rpId` remains host-only. The field is optional in the host interface
for compatibility with existing direct hash-only provider callers. This enables
future bridges requiring unhashed client data; it does not implement Windows
Hello, hardware access or guest-runtime byte support.

`PasskeyBroker` accepts a trusted `PasskeyAuthenticator`. It builds challenge-bound
client data and mediates creation/assertion requests. `PagePasskeys` owns a broker
for one native document and exposes public credential host capabilities.

The existing `PageScripts` options extend `PageBindingOptions`. A trusted embedder
can configure the native page API as follows; `authenticator` is a separately
implemented trusted provider, not a page-supplied object:

```ts
const scripts = new PageScripts(page, runtimeFactory, {
  passkeys: {
    authenticator,
    context: {
      topLevel: true,
      isCurrent: () => session.page(tabId).document === page.document,
    },
  },
});
```

This illustrative configuration is not a record of an actual SafeJS run.
`topLevel` and `isCurrent` are mandatory trusted context, not agent arguments.
The page adapter derives the origin from the actual document URL. A `base` element
or page dictionary cannot substitute a relying-party origin.

Only explicitly configured pages receive `navigator.credentials.create()` and
`navigator.credentials.get()` through both native global and Window bindings.
An unconfigured page does not pretend to have a usable authenticator. This
minimal navigator capability does not implement browser identity, hardware
discovery or `PublicKeyCredential` platform-availability methods.

## Explicit ephemeral authenticator

`agent-browser/node-passkeys` exports `NodePasskeyAuthenticator` and its approval
and option types. It implements genuine Node-crypto P-256/ES256 registration and
assertion signing, with private KeyObjects behind JavaScript private fields.
It is an opt-in software port, never a default platform or hardware authenticator.

```ts
const authenticator = new NodePasskeyAuthenticator({
  approve: requestTrustedHumanApproval,
  maxCredentials: 64,
});
```

`requestTrustedHumanApproval` is a trusted embedding application's function,
not supplied by this repository, a website or an agent command. It must present
the actual RP ID and operation and obtain approval, returning `{ approved: true }`
only after that approval. RP/user display names are untrusted labels. An absent
callback, refusal or failure denies the operation. Account selection among
multiple matches requires the approved public credential ID; it is not guessed.
The callback receives cancellation and must cooperate with it.

Keys live only in this object's bounded memory. `close()` clears the registry
and cancels pending work; it does not establish deterministic native-key erasure.
This constructor has no disk persistence, backup, key export or synchronized
account recovery. The separate persistent factory below requires explicit setup.
`residentKey: true` means discoverable within this live object, not durable storage.
User verification is always false; required UV/platform requests fail rather
than pretending a biometric/PIN ceremony occurred. The cross-platform port does
not claim USB, NFC, BLE or hybrid-device support.

Registration emits none-attestation CBOR with a public EC2/P-256 COSE key, zero
AAGUID and real RP-bound authenticator data. Assertions sign the authenticator
data plus client-data hash and increment a non-wrapping counter. Default limits
are 64 credentials and 4,294,967,295 successful assertions per credential; callers
may lower those limits. Independently parsed CBOR/COSE and real signature checks
are covered by synthetic tests, not a production relying-party acceptance run.

## Explicit persistent authenticator

`NodePasskeyAuthenticator.open(options)` returns a promise for a host-owned
authenticator backed by the encrypted checkpoint file. Its exported
`NodePasskeyPersistentAuthenticatorOptions` adds required `path` and `key` fields
to the constructor options. There is no automatic discovery, agent configuration,
default approval or fallback to ephemeral state.

```ts
const authenticator = await NodePasskeyAuthenticator.open({
  path: protectedCheckpointPath,
  key: hostOwnedEncryptionKey,
  approve: requestTrustedHumanApproval,
  maxCredentials: 64,
});
try {
  await useTrustedPasskeyProvider(authenticator);
} finally {
  await authenticator.close();
}
```

These application functions and values are illustrative host responsibilities,
not browser commands. The key must contain 32 high-entropy bytes; it is copied
before the factory's first await. The host owns key provisioning, caller-copy
cleanup and recovery. The canonical absolute path must meet the protected Unix
file/ancestor checks in `PASSKEY-STORAGE.md`. Opening locks the checkpoint for
this owner's lifetime; corruption, a wrong key or an existing lock rejects,
never silently starts over. Reopened credentials still require explicit approval
for every ceremony, and user verification remains false.

Registration and assertion counters are saved before their results can publish.
The final cancellation/lifecycle check and in-memory commit follow successful
storage acknowledgment. A save failure or cancellation after a save begins
poisons the authenticator, preventing further ceremonies or counter reuse from
that instance. A rejected operation may nevertheless have changed the file.
`close()` immediately revokes operations and clears the registry, but its promise
must be awaited to finish admitted storage work and release the owned lock.
Filesystem completion is not bounded, and reopening/recovery is a host decision.

This is encrypted local software persistence, not rollback resistance or a
platform authenticator. An old valid same-key backup is accepted and may roll
back counters. Secure key storage/rotation, recovery policy, trusted human UI,
hardware-backed UV, synchronized accounts and production RP/runtime acceptance
remain outstanding. Private KeyObjects and strings are not claimed erasable.

September 5, 2026 persistent-factory validation: **41 new cases pass**, and seven
named passkey suites produce **359 passes in each tree**. Working and clean HEAD
integration types/builds, strict new-test types and scoped Biome pass. The explicit
native manifest has 428 entries and was not run in full. Evidence is retained
under `node_modules/.cache/native-validation/passkey-persistent-final-*`;
worker baselines and intermediate runs remain under `persistent-passkeys/` in
that cache. Tests use real crypto and fresh private synthetic filesystem fixtures,
including save/fsync/publication barriers, close/reopen, cancellation and counter
checks. Injected failures are deliberate tests, not real-vault or runtime evidence.
An independent offline source/test review found no additional concrete defect;
that review did not itself execute tests or establish production security.

## Supported security boundary

- HTTPS canonical origins, top-level context and exact-host RP IDs only. Parent
  domain RP IDs, related-origin authorization and iframe policies are unsupported;
  there is no guessed public-suffix implementation.
- Bounded, synchronously copied challenges, typed-array/DataView offsets, user IDs,
  allow/exclude lists, names, algorithms and timeouts. Client data is generated by
  the broker using the actual origin and ceremony type, not supplied by a page.
- Explicit authenticator consent and user presence are required. Required user
  verification or resident-key capabilities must be supported and reported by the
  provider; the broker never fabricates verification or a platform authenticator.
- One ceremony per broker; cancellation, closure, deadlines and stale documents
  prevent late publication. Native page closure revokes the credentials and
  response capabilities. Sharing a provider does not share a document broker.
- Assertion results are bounded and checked for matching RP hash, user-presence
  and verification flags, allowed credential IDs and required discoverable user
  handles. Cryptographic signature verification remains the relying party's job.
- Provider errors and abort reasons become fixed-message errors with
  DOMException-like names, not leaked provider messages or causes. They are not
  claimed to be DOMException instances.

The trusted provider is responsible for valid registration CBOR, correct
attestation/authenticator data, none-attestation privacy, key custody and genuine
consent/UP/UV. The broker treats registration `attestationObject` as bounded opaque
bytes; it does not independently parse or verify those promises. An injected
synthetic provider is not evidence that a real hardware provider satisfies them.

## Page API and ownership

The outer dictionary requires `publicKey`; optional and required mediation are
supported, but conditional/silent mediation, password/federated/OTP credentials,
unknown members and extensions are not silently emulated. Buffer getters on
returned public capabilities produce copies. Public response fields include
`clientDataJSON` and registration `attestationObject`, or assertion
`authenticatorData`, `signature` and nullable `userHandle`.

`getClientExtensionResults()` is empty for the supported no-extension profile.
There is no fake constructor/brand, JSON byte transport, `toJSON` promise or
unsupported response helper. Provider objects/private keys are not exposed on
the guest capabilities.

Page signals are explicitly opt-in: trusted `context.supportedSignals` identities
are snapshotted into a weak allowlist. Unregistered native signals and guest
proxies are rejected. This is not a guest AbortController implementation or
evidence that actual SafeJS supports this signal/BufferSource bridge.

## Validation and outstanding gates

September 5 detached-client-data checkpoint: 24 new cases plus the existing
broker, page adapter, page binding and Node software-authenticator suites yield
**219 passes across five named files in each tree**. Types/builds in both trees,
strict changed-test types and scoped Biome pass. The manifest has 434 entries;
neither the full manifest nor actual SDK/device probes ran. The old broker's
missing-field regression result (17 failures, seven passes) remains preserved
under `node_modules/.cache/native-validation/passkey-client-data/`.
Integrated logs use the `passkey-client-integrated-final-` prefix in
`node_modules/.cache/native-validation/`; the clean candidate path is recorded
in `/tmp/passkey-client-integrated-path`. Challenge views, port-bearing origins,
provider mutation/transfer, later retention, cancellation and direct hash-only
caller compatibility are covered. These are synthetic host-boundary tests,
not a Windows Hello implementation or an actual guest-runtime result.

`PASSKEY-HARDWARE.md` records native-only primary-source research into a genuine
external-key/provider milestone, including CLI information loss, PIN/TTY and
cancellation risks. No external tooling or device was used or approved as a new
dependency; this research does not make the software provider hardware-backed.

Core and adapter workers report 77 and 59 passing synthetic cases, respectively.
The ephemeral provider adds 49, and parent integration adds ten: 195 total.
The integration includes native global/Window credentials, real ephemeral
signing through the page capability and host-broker serialization hardening.
The provider's tests independently verify signatures; the page integration test
checks the complete creation/assertion path, RP hash, counter and public shape.
These results must not be relabeled as a full browser/runtime or real-account
authenticator pass. Reports remain under
`node_modules/.cache/native-validation/browser-research/` as
`passkey-core-report.md`, `page-passkeys-report.md` and
`ephemeral-passkey-report.md`.

Parent review found that the initial broker's TypeScript-private provider field
was enumerable to host-side JSON serialization. A synthetic marker reproduced
that issue; the reference is now a JavaScript-private field, with a retained
regression. No guest-capability exposure or real key disclosure was observed.

The sole working-tree failure is the unchanged
`clears onload for a non-callable value {}` case in `src/page-bindings.test.ts`.
The same pre-passkey binding and test bytes reproduce three passing controls and
that failure in the retained before-tree. Matrix logs/results are
`node_modules/.cache/native-validation/passkey-page-final-*`; baseline evidence
is `passkey-page-onload-before.json` / `.log` in that directory. No unrelated
onload implementation or expectation was changed.

Still required: actual SafeJS byte/promise/capability checks, a separately
authorized real provider, production key provisioning and recovery,
platform/USB/hybrid/synchronized passkey support, and real relying-party
registration/assertion acceptance. The later explicit persistent factory provides
local encrypted storage only; neither software mode satisfies platform or
synchronized passkey gates.

Design reference consulted by the parent on September 5, 2026:
`https://www.w3.org/TR/webauthn-3/` (Level 3, August 25, 2026 Recommendation).
This documentation research is not native runtime acceptance evidence.

## Actual legacy-runtime gate — September 5, 2026

Separately authorized probes now load the explicit existing local SDK at
`/tmp/agent-browser-safejs-13.0.10/packages/safe-js` using the legacy adapter.
Its manifest identifies `@poe-code/safe-js` version `0.0.1`, not version 13.0.10;
the directory name is not release provenance. This is not a test of a newly
released extension SDK, and no denied package acquisition was retried.

The actual gate **fails**. The first isolated run reaches creation but its guest
evaluation fails. A subsequent prerequisite diagnostic verifies shared global/
Window credentials identity and a Promise constructor, but finds **neither a
Uint8Array nor an ArrayBuffer constructor**. Cleanup succeeds. Registration,
assertion, typed rejection and cancellation acceptance are not demonstrated.
No byte shim, guest-source rewrite, alternate adapter or fake factory substitutes
for the missing runtime capability. Existing synthetic test results still stand,
but do not establish a usable WebAuthn page bridge on this selected SDK.

`scripts/check-passkeys-runtime.ts` preserves a bounded manual gate with explicit
root, adapter and synthetic-authorization flag. It checks prerequisites before
ceremonies, requires real guest byte operations, bounds work and closes owners.
Synthetic approval is confined to this fixture; no production autoapproval hook
or real account/keyring access is added. It is deliberately outside the native
test manifest. After separate authorization, a standalone invocation is:

```bash
timeout --signal=TERM --kill-after=2s 25s node dist/scripts/check-passkeys-runtime.js --runtime-root /absolute/approved/sdk --adapter legacy --authorize-synthetic-passkey-runtime
```

The flag is an accidental-execution guard, not permission. A compatible byte
bridge must still be tested through all later checks and independently against a
relying party. The probe does not independently verify guest-visible signatures.

Evidence remains in
`node_modules/.cache/native-validation/passkey-runtime-probe/`:
`actual-first.stderr` records a cache-only build-path failure **before SDK load**;
`actual-isolated-first.jsonl` records failed creation;
`actual-prerequisites.jsonl` records the constructor diagnostics and cleanup.
The initial worker patch/static logs remain unchanged. The parent adds the
prerequisite checks and timestamp/package metadata to the maintained script;
older JSON records are not rewritten to include fields they never recorded.

Parent validation of the manual-probe addition passes types/builds in both trees
and **297 synthetic tests across seven named manifest-listed files in each**.
The first scoped check found import ordering/formatting only; those are corrected,
with final one-file Biome and project noEmit passing. These regression checks are
separate from the failed actual-runtime gate. Results are retained as
`node_modules/.cache/native-validation/passkey-runtime-verified-*` and
`passkey-runtime-final-working-*`; the manifest remains 422 entries.
