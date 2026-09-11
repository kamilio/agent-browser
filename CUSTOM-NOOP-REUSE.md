# Reusing proven no-op custom declarations

September 11, 2026: each `DocumentStyles` refresh now remembers one custom-property
declaration sequence that resolved to its unchanged parent map. A later element
can reuse that result only with the **same parent map identity and exactly the
same winning declaration object sequence**. Otherwise normal resolution runs.

This avoids repeatedly parsing, substituting and comparing identical wildcard
theme declarations. It addresses the charged cascade-work failure observed after
map sharing in `MDN-CUSTOM-MAP-SHARING-REPLAY.md`; it does not skip work accounting
or raise limits. Every declaration identity comparison is charged. The normal
winner collection, ordinary-property substitution and subsequent cascade stages
remain unchanged.

There is only one refresh-local recipe, not an unbounded cache or a retained set
of computed result maps. It references declarations and a parent map already
owned by the active cascade. Only results identical to the parent qualify; the
declaration list is bounded by the existing per-element custom-property limit.
Rebuilds start without a recipe, and completion/failure does not retain it on the
style owner. Different parent values, different winning declarations and mutations
cannot reuse a stale result.

## Validation

A fixture with 201 descendants repeating an unchanged 2500-code-unit alias now
resolves within 150000 cascade-work units. The unchanged implementation plus the
new tests in
`node_modules/.cache/native-validation/native-custom-noop-reuse-baseline-september11/`
passes 74 cases and fails that one work-bound regression with
`CSS cascade work limit exceeded`. A second case checks different parents,
different declarations and mutation/rebuild behavior. All 75 core-variable cases
pass with the change, including earlier identity and genuine retention limits.

The clean `e0a9ab6` snapshot in
`node_modules/.cache/native-validation/native-custom-noop-reuse-september11-round01/`
overlays only this `src/styles.ts` hunk and `src/css-variables-core.test.ts`.
Pre-existing unrelated styles import/property ordering edits are excluded.
Build, strict checking, formatting and 112 explicit native files pass from
10:06:01.422 to 10:07:38.847 UTC: **6689 passed, zero failed, one existing
baseline assertion excluded**. All 1006 source files remain stable; the native
manifest stays at 549 entries.

Strict checking covers 111 roots with the existing snapshot typing exception;
that file still runs at runtime. The excluded focus-provisioning-pressure
assertion remains an acknowledged baseline failure. Native tests deny networking
and do not prove live sites, visual rendering, credentials, SafeJS or TTY/PTY
acceptance. Captured MDN replay remains a separate verification step.
