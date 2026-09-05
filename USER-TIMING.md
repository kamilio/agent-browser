# Bounded page User Timing

The existing shared `performance`, `window.performance` and `self.performance`
object gains native `mark`, `measure`, `getEntries`, `getEntriesByType`,
`getEntriesByName`, `clearMarks` and `clearMeasures` methods. This is a page-owned
timeline connected to the existing monotonic `PageClock`, not host process-wide
performance state or an alternative page runtime. Existing `now`, readonly
`timeOrigin` and performance `toJSON` behavior remain unchanged.

## Admitted behavior

- `mark(name, options?)` stores a named timestamp and returns an entry capability.
  Omitted `startTime` uses the page clock; explicit finite nonnegative values,
  including future timestamps, are preserved. Mark duration is zero.
- `measure(name, startMark?, endMark?)` supports legacy named marks. Without a
  start it uses zero; without an end it uses the current page clock. The options
  form accepts `start`, `end`, `duration` and `detail`. Start/end may be mark names
  or finite nonnegative numeric timestamps; duration must be a finite nonnegative
  number. A recognized nonempty options dictionary needs start or end, rejects
  a third end-mark argument, and rejects start+end+duration together.
- End is resolved before start. Start+duration derives end; end+duration derives
  start. Derived negative starts and negative measured durations are permitted;
  nonfinite arithmetic is rejected. Named lookup uses the latest **inserted**
  active matching mark, not the largest timestamp or the last sorted query item.
- Returned entries have readonly `name`, `entryType`, `startTime`, `duration`
  and `detail` properties plus `toJSON`. Queries return fresh arrays of the same
  entry capabilities, sorted by start time with insertion-order ties. Name/type
  filters are exact and case-sensitive. Only `mark` and `measure` are present;
  unknown types return an empty array.
- Clearing by name removes all matching entries of that type; an omitted or
  undefined name clears that type. Previously returned entries remain readable
  but cleared marks no longer resolve by name. Page close revokes every entry,
  including cleared ones, and releases the owner's retained timeline contents.

Missing required name/type arguments and invalid numeric/options combinations
throw fixed TypeErrors. Unknown named marks and mark creation using one of the
21 legacy `PerformanceTiming` attribute names throw safe SyntaxErrors. Legacy
navigation timestamp references are explicitly unsupported: the browser must not
invent navigation timings from this later page-runtime clock origin.

## Explicit partial profile

Names support bounded primitive DOMString conversion. Object/function coercion
is unsupported and symbols reject. Options support plain/null-prototype own-data
dictionaries; undefined members act as absent, and unknown members are ignored
without reading their values. Accessor and inherited/custom-prototype/array
dictionary behavior is not full Web IDL conversion. Numeric timestamps/durations
require numbers rather than coercing strings or arbitrary objects.

`detail` uses a **finite-JSON snapshot profile**, not general structured clone.
It is copied at publication and returned as a fresh snapshot on each detail or
`toJSON` read. It supports finite numbers, strings, booleans, null, dense ordinary
arrays and plain/null-prototype enumerable own-data objects. It rejects cycles,
undefined members, symbols, functions, accessors, sparse/expanded arrays, special
objects and nonfinite numbers rather than silently omitting them. JSON projection
does not preserve shared-object identity, prototypes or negative-zero identity.
These snapshots are not same-identity mutable guest detail objects.

No `PerformanceMark`/`PerformanceMeasure` constructor or prototype hierarchy,
`PerformanceObserver`, resource/navigation entries, observer queueing, EventTarget
surface or complete User Timing/Performance Timeline conformance is claimed.
The capability report lists the methods, entry types, detail profile and limits
while explicitly excluding observers and resource/navigation timing.

## Ownership and bounds

Default limits in `src/page-user-timing.ts`:

| Bound | Default |
| --- | ---: |
| Active buffered entries | 256 |
| Cumulative published entries | 1,024 |
| Name UTF-16 code units | 1,024 |
| Encoded detail JSON bytes | 8,192 |
| Cumulative retention accounting units | 262,144 |
| Query, clear and creation attempts | 8,192 |

Detail validation also caps depth at 16 and visited nodes at 1,024. The reused
bounded JSON serializer has conservative accounting, so a value below the final
encoded-byte ceiling is not guaranteed admission. Retention uses fixed entry
overhead plus name/detail string accounting; these are logical resource limits,
not a measurement or hard guarantee of total process heap usage.

Clearing does not restore cumulative creation/retention capacity: guest code may
still hold old capabilities. Closing is always available and does not consume an
operation. Publication reserves capacity before invoking the host-object factory;
nested publication cannot bypass quotas. Failed publication rolls back its own
reservation, invalid/duplicate capabilities are rejected, and close is rechecked
before commit. Raw custom factory/clock errors are sanitized; entry reads share
the guard without consuming timeline-operation budget. Metrics expose counts,
limits and lifecycle only, never names or detail content. Custom host objects
and proxies are not an adversarial-code sandbox.

Native `PageClock` close registration revokes both cached and independently
constructed timelines. Closing releases entries before invoking an unsubscribe;
unsubscribe errors are sanitized, and a failing clock callback does not prevent
other owners from closing. Invalid registrations reject, synchronous closure
releases its returned registration, and subsequent closes are idempotent.
Custom clocks without the optional close hook require explicit timeline closure;
an inaccessible external registration cannot be forcibly reclaimed.

## Primary-source research

All three specification reads used the prior compiled native research browser,
`--reader --capture-body`, and separate exact authorizations. Each returned HTTP
200, partial extracted-unverified text and a closed transport. September 5, 2026
response receipt times are distinct from specification publication/update dates.
Evidence root is `node_modules/.cache/native-validation/page-user-timing/`.

| Primary source | Receipt UTC | Decoded bytes | Receipt under evidence root |
| --- | --- | ---: | --- |
| `https://w3c.github.io/user-timing/` | 10:41:02.540Z | 198,553 | `research/01-user-timing.stdout.jsonl` |
| `https://w3c.github.io/performance-timeline/` | 10:41:45.488Z | 257,236 | `research/02-performance-timeline.stdout.jsonl` |
| `https://www.w3.org/TR/navigation-timing/` | 10:44:32.412Z | 61,403 | `research/03-navigation-timing.stdout.jsonl` |

The corresponding extraction files retain the mark/measure algorithms, timeline
filtering rules and all 21 legacy reserved names. Captures preserve unsanitized
transport-decoded source, not a full rendered page or independent source truth.
No alternate browser, dependency, benchmark or live credential was involved.

## Validation evidence

Implementation review identified a raw custom-clock error path in saved entry
getters/toJSON. The shared guard now covers it without charging reads as timeline
operations. The original review remains in `evidence/REVIEW.md`; native regression
and actual-runtime acceptance are separate:

- **177 new native cases pass.** The final six-file clean snapshot matrix has
  **341 passed, two failed, zero skipped**: `evidence/isolated-timing-02-tests.json`.
  The other files are performance clock, animation frames, idle callbacks, page
  bindings and command host. This is not a full-manifest or working-tree run.
- The two existing page-binding cleanup fixtures assume the first constructed
  object is performance, while navigator precedes it. Exactly the same failures
  occur on unchanged `e79f0a4`: 12 passed/two failed in the isolated baseline
  binding suite. `evidence/baseline-bindings-01-tests.json` preserves the proof.
  No unrelated fixture was fixed or silently dropped from the final matrix.
- Clean build/project and strict new-test types pass; the two timing modules,
  new test and manual probe pass four-file Biome. Initial readonly mapped-type,
  fixture formatting/import/const diagnostics remain in their original logs.
- The first actual synthetic probe passed 85 checks at **10:56:49.230Z–
  10:56:49.484Z** on September 5. Later close-registration hardening added eleven
  native cases. The earlier source and compiled probe are preserved separately
  under `page-user-timing-runtime-01/`, with its four checkpoint hashes verified;
  the old receipt and original command paths remain unchanged.
- The final separately authorized probe passes **85 checks** at **11:01:41.275Z–
  11:01:41.546Z**: `evidence/actual-original-sdk-02.jsonl`. It uses the unchanged
  original `@poe-code/safe-js` **0.0.1**, legacy `./core` export. Its directory's
  `13.0.10` label is not the package version. All 680 package/source/dist file
  hashes in the before/after SDK ledger match. No candidate SDK patch is selected.
- Actual guest checks cover shared global/Window identity, persistent marks,
  native DOM mutation, measure forms, stable query identity/order, detail copies,
  readonly entry fields/JSON, invalid inputs, clear behavior and closure. There
  are seven successful evaluations plus one rejected closed-owner attempt,
  7,908 cumulative source code units, 12 published entries and 57 operations.
  Active entries fall from one to zero and retained units from 1,942 to zero;
  page, document, interactions and all tracked runtimes close. Both receipts
  have empty stderr and exit zero. These are assertions, not a speed benchmark.

The manual probe requires an explicit runtime root, adapter and
`--authorize-synthetic-user-timing-runtime`; invoking it still needs its own
authorization. It installs no shim, creates no network transport, submits no
credentials and does not repeat denied browser-identity or HTTP-wire probes.
The native manifest snapshot contains 452 entries versus 454 in the working tree;
the two pending parent-RP entries and protected source changes remain excluded.
General Web IDL/structured clone, constructors, observers, real-site application
compatibility and the other browser acceptance gates remain open.

The same continuation follows one ordinary BFCL V4 article link for the user's
benchmark research. `research/bfcl-v4/REPORT.md` records one separately authorized
native capture and distinguishes answer-scoring diagnostics from demonstrated
browser interaction, credential safety or production-agent reliability. Its
July 2025 article labels do not establish a latest-version claim in September
2026. Historical reports and the denied Reddit/announcement/identity/auth gates
remain unchanged. The overall browser goal remains active.
