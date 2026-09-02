# Sandbox-owned Date candidate

September 2, 2026, approximately 03:30 UTC. This extends the isolated v13.0.10
SafeJS candidate for the already-filed #543 request. It is not an upstream release,
completed extension lifecycle or complete JavaScript/browser compatibility claim.
No dependency, installed SDK, native browser or production safety limit changes.

Subsequent checkpoint: `SAFEJS-COOPERATION.md` fixes host-timer starvation and
separates script shutdown from native document interactions. The two public
navigations now return readable HTML with explicit script timeouts, rather than
the heartbeat failures measured below. A regression also fixes Date intrinsic
ownership cleanup after failed realm initialization and budget reuse. The Date
and compatibility measurements below remain the earlier checkpoint's evidence.

## Value and capability boundary

Date instances are guest objects with private numeric timestamp slots in a
WeakMap and realm-owned guest prototypes. No native Date instance, constructor
or prototype enters the guest object graph. Guest fields, methods, identity,
prototype traversal and mutation use SafeJS's existing object mechanisms.

Calendar calculations use captured host Date primitives on temporary native
values after guest arguments have been converted to primitives. This is an
intrinsic adapter, like the existing Math intrinsic, not a new dependency or a
native JavaScript evaluator. Calendar arithmetic and timezone databases have not
been rebuilt in TypeScript. Local-time results and non-ISO parsing consequently
follow the host runtime; only Node 22.22.0 in this environment is validated here.

Supported behavior includes:

- Date.now, Date() and zero/one/multiple-argument construction; copying an existing
  date creates an independent timestamp slot rather than calling its overrides.
- Date.parse, Date.UTC, TimeClip, invalid values, numeric and string conversion,
  Date-specific binary/compound addition hints and guest conversion hooks.
- Local/UTC calendar getters and setters, getTime/valueOf, getTimezoneOffset,
  getYear/setYear, ISO/UTC/date/time/string formatting and the toGMTString alias.
- Date branding and instanceof; non-enumerable inherited methods, retained
  mutable fields, JSON/toJSON conversion and realm-isolated prototype mutation.

Date parsing charges string length and character work before invoking the host
parser. Returned strings use the normal string budget. Guest conversion hooks
run through interpreter calls. Prototype/constructor mutations register retained
roots even when no Date instance is otherwise reachable; realm/run cleanup
releases that registration. Ordinary memory checks and external supervision stay
enabled. A Date receiver cannot be forged with fields or an ordinary prototype.

## Clock ownership and replay

`RealmOptions.now?: () => number` supplies a synchronous, explicit epoch clock.
Absent that option, the realm uses the host clock. Values must be finite and
within TimeClip bounds; the intrinsic truncates fractional milliseconds.

`RunClock.now?: () => number` extends the existing run-clock owner. Current-time
reads are lazily routed through the run's existing host-call journal under the
internal `<Date>` module identity. Completed reads replay their recorded numeric
result without calling the provider again. A checkpoint regression observes the
original 100 before suspension and one fresh provider read after resumption.
Clock snapshot ownership remains with the configured caller; the intrinsic does
not create an unrelated replay cursor. Unused clocks are not invoked.

Live Date values/prototypes and changed Date intrinsic state are **not yet
snapshot/replay data**. Deep-copy, structuredClone and snapshot/replay encoders
reject rather than silently replacing a timestamp with `{}`. Convert explicitly
to epoch numbers or ISO strings at those boundaries. The standard, unchanged
Date global is reconstructed like other default builtins; legacy regex checkpoint
fixtures verify the additive binding while preserving hashes and graph identity.

Locale/Intl formatting methods explicitly reject. Symbol.toPrimitive support,
fully general object coercion, Date snapshot records, cross-runtime timezone
reproducibility and broader adversarial intrinsic review remain open.

## Verification and website results

Twenty-two new Date tests cover clocks, checkpoint replay, calendars, invalid
values, branding, conversion, setters, mutation, JSON, copying restrictions,
budget enforcement and realm isolation. The focused Date/random/JSON run passes
71 tests. Strict public-core and new-test compilation passes. The browser suite
passes 1126 cases across 65 files, and Biome checks 152 source/script files.
The verified native-config SDK run has 8089 passes, 30 failed assertions, six
skips and 54 failed files, with exactly the preceding failure identities. This
is not a green SDK release gate. The Date/regex-boundary run passes 56 tests.

The owned-process automatic-script fixture adds Date clock/type/calendar/JSON
checks and a native click which mutates a retained date and updates semantic
text. Forty local checks pass. **Neither public navigation passes:** Books and
Quotes hit the unchanged two-second heartbeat at 2010 and 2011 ms respectively.
This is not forty successful website checks or dynamic-site acceptance.

Separate externally bounded diagnostic processes, not production actors, advance
past Date without source rewriting:

- Books' unchanged jQuery source reaches `P.replace(3,8)` at offset 35950 after
  3301 ms, exposing unsupported non-string replacement coercion.
- Quotes' unchanged jQuery source reaches Object.defineProperty at offset 30470
  after 8531 ms, exposing the missing descriptor/accessor operation.

The longer Quotes execution is newly reachable work, not a performance fix.
Efficient accounting, effective host scheduling and the unchanged watchdog remain
critical. Controlled timer/CLI public-document probes pass 17/22 checks, but are
not execution of those sites' unmodified scripts. Owned probe actors/services close.

Reports: `safejs-date-focused-2026-09-02.json`,
`safejs-date-boundaries-2026-09-02.json`, `unit-node-2026-09-02-date.json`,
`date-process-sites-2026-09-02.json`, `site-script-errors-date-2026-09-02.json`,
`date-timers-2026-09-02.json` and `date-cli-2026-09-02.json` in `reports/`.
`safejs-date-final-verified-2026-09-02.json` and
`safejs-date-verified-baseline-comparison-2026-09-02.json` record the final SDK
result and exact comparison. An intermediate completed suite had one additional
failure because its legacy binding expectation omitted the new Date intrinsic;
only that additive expectation changed, not its hash/graph assertions.
Earlier diagnostic/fixture reports are preserved separately. Full-suite status
and exact comparison are recorded in the reports index, not inferred from the
focused tests. The first obsolete full-suite run encountered a now-fixed snapshot
regression and remains separately tracked; its termination request was denied,
so no claim of its cleanup is made.

Reference: ECMAScript Date Objects, sections 21.4.2–21.4.4, checked September 2,
2026: https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-objects
