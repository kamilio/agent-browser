# Explicit guest-reference arguments

September 2, 2026. The local SafeJS candidate adds a small public capability for
extensions that must preserve guest values across deferred host callbacks. It is
filed upstream as `poe-platform/poe-code#542`, verified open. This is not a finished
composable extension lifecycle, which remains the separate #540 request.

## Reproduced boundary

An actual page timer received a copied object through the ordinary host bridge.
Returning that copy to its callback produced `[false, 1]` for identity and mutation
checks that should produce `[true, 2]`. DOM capabilities already had an identity
path, but ordinary guest objects did not. Browser-side copies or private imports
would preserve the wrong semantics, so the fix lives in the SafeJS boundary.

## Public API

- `retainGuestArguments(operation, from)` declares that argument positions from
  the given index onward cross into this native operation as opaque references.
  It returns the original operation. Leading arguments keep ordinary conversion.
  `from` must be an integer from zero through 65,536.
- References are frozen, null-prototype native handles, with no exposed guest or
  interpreter fields. The native extension may retain them and pass them back as
  callback arguments or results. The owning realm restores the original values.
- `releaseGuestReference(value)` revokes one handle and returns whether it was
  live. It is idempotent and returns false for unrelated values. Independent
  handles for the same guest value can be released independently.

Both APIs are exported from the normal and lightweight public entrypoints. Live
host methods preserve the declaration. Default host argument conversion remains
unchanged; ordinary bindings do not gain access to raw interpreter objects.

The browser marks only timeout/interval arguments after handler and delay as
retained. Its scheduler releases them after cancellation/completion, retaining
them while already-started async callbacks are pending. The public core is
required explicitly at actor startup; older candidates fail rather than silently
falling back to identity-breaking copies.

## Lifetime and safety

- Handles belong to one persistent realm. Cross-realm or released restoration
  fails. Realm close clears the registry, including values still held by native
  code. Forging an empty object does not create a reference.
- Captured values participate in the realm's retained-data roots, and the count
  of live handles is bounded by the realm's collection/array limit.
- A synchronous host-operation failure releases newly captured handles, including
  when guest code catches the converted error. An asynchronous native operation
  must manage ownership/release on its eventual result; native extensions remain
  trusted and can retain values until explicitly releasing or closing the realm.
- Ordinary `run`/replay modes reject the declaration rather than silently copying.
  Handles cannot be restored through replay, proof or host error-data conversion.
- This does not add module loading, network/filesystem access, native evaluation
  or an escape from interpreter budgets. Native object overhead is not an RSS cap.

## Tests and artifact

Eleven focused tests cover identity/mutation, cycles, closures, primitives, host
methods, cross-realm/stale references, data/count budgets, release and native
exceptions. The actual browser process additionally verifies live DOM arguments.
`reports/safejs-guest-references-focused-2026-09-02.json` records 66 passing tests
across references, realm, callbacks and host objects. Strict checks of the changed
source/tests and the public core test pass with the existing Bun type declarations.
The isolated package emits with those existing types; no tooling was installed.

The full package run with its native Vitest configuration passes 7,957 tests, with
30 known fixture/type failures, six skips and 54 failed files. The comparison in
`reports/safejs-guest-reference-regression-comparison-2026-09-02.json` verifies the
failed assertions and file set are unchanged from the preceding candidate.
Intermediate runs with the browser repository's test config have different scope
and aliases, and must not be used as full upstream acceptance.

The combined `contributions/safejs-browser-capabilities.patch` includes this change
against the pinned v13.0.10 commit. `SAFEJS-EXTENSIONS.md` records its current hash
and applicability check. No installed SDK, dependency manifest, PR, commit, push
or publication was changed for this SDK work. The browser manifest only adds a
probe command, not a dependency.
