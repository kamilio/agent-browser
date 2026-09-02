# Local guest function-object candidate and next blockers

A local candidate against v13.0.10 (`7fbbd81fd99c46928bcf314ad89410b946d203cc`)
now separates guest function own-property tables from frozen interpreter closures.
It supports ordinary constructor prototypes, inherited data/method lookup,
prototype replacement, bound construction, guest instanceof and enumeration.
It does not traverse native prototypes or make native capability callables writable.

The implementation includes retained-data/work accounting and a 256-link chain
limit. Live host grants cannot become constructor prototypes. Modified function
or custom prototype state is explicitly rejected by snapshot/replay rather than
silently lost; full snapshot support is still needed. Intrinsic prototype graphs,
inherited accessors and complete exotic coercion remain unfinished.

Validation on September 2, 2026:

- 21 new function-object tests and one new restored-constructor regression pass.
- Native-config SDK run: 7979 passes, 30 failed assertions, six skips, 54 failed
  files. Failed assertion/file identities match the preceding 7957-pass candidate
  exactly. This is not a green upstream gate.
- Browser regression suite: 1075 passes. Real owned-process automatic HTML script
  loading and native clicks exercise constructor inheritance. Final probes pass
  29 script checks, 17 timer checks and 22 executable CLI/paired API checks.
- Unmodified Books and Quotes scripts advance past the function-property blocker,
  but still fail automatic compatibility: Books needs Object prototype inspection
  (#544), Quotes needs Date.now (#543). Both new issues include reproductions.

The implementation is retained as a local source patch, not a published release,
PR or installed SDK modification. No dependencies were added. This does not
complete the composable extension lifecycle requested in #540.
