# Research output lifecycle

The research-browser, research-html-json and research-source-index commands share
an output writer in `scripts/research-stream-output.ts`. This keeps cancellation,
backpressure and late write errors consistent without changing their record
formats, admission limits, network behavior or content extraction policies.

## Library behavior

`writeResearchOutput(output, text, signal, errors)` accepts a Node Writable,
a string or Uint8Array, an optional AbortSignal, and fixed error factories for
closed output and cancellation. It writes the payload once, without converting
binary data to text. Success requires the write callback and, when the write
returns false, the corresponding drain. Ordering of those events is supported.

An unavailable stream, write error, premature close/finish or abort rejects the
operation. An already-aborted operation does not write. Ordinary operation
listeners are removed when the promise settles. The writer does not end or
destroy a caller-owned stream, cancel the caller's underlying I/O, or establish
that a remote peer consumed the bytes.

If cancellation leaves a write outstanding, a narrow error/close guard remains
until the callback or terminal stream event makes cleanup safe. In particular,
a successful late write callback must not remove protection while caller-owned
asynchronous destruction can still deliver an error. A silent outstanding write
can retain this guard; no arbitrary timer guesses that caller-owned I/O finished.

`emitResearchReport(output, report, documentProfile?, signal?)` retains its first
three arguments and exit-report result. Its optional fourth argument now controls
output cancellation. Serialization and size limits remain profile-dependent and
unchanged. The main command passes its existing overall deadline signal into
emission, so a blocked output cannot leave emission waiting past cancellation.

The source CLIs retain their own input admission, timeout mapping, error messages,
owned-buffer clearing, and record construction. Library helpers do not terminate
the process and remain responsible only for their operation-level resources.

## Executable failure behavior

Only executable entrypoints call `exitResearchCliFailure(code, message)`. It
tears down executable-owned stdin/stdout and attempts the fixed sanitized stderr
message. It exits on the diagnostic write callback/error, or after a referenced
100 ms fallback if asynchronous stderr output cannot complete. Messages do not
include source content or arbitrary exception text. Invalid arguments retain
status 64; execution/output failures retain status 1.

This is not a universal hard wall-clock guarantee: timers require a runnable
event loop. The anonymous-pipe checks do not qualify synchronous blocked file
I/O, real TTY/PTY behavior, forced host failure, or delivery of diagnostics when
stderr is unavailable. A timeout can leave a partially written output record;
consumers must check exit status and validate complete records rather than treating
a prefix as a successful result.

## Validation and remaining work

See `reports/research-output-lifecycle-2026-09-17.md` and its JSON companion for
clean native test results, separately retained baseline failures, real anonymous
pipe observations, and saved website-content/output comparisons. Offline response
substitution is not a fresh crawl or ordinary admission of failed receipts.

The browser still needs broader task-level compatibility, dynamic-page/runtime
acceptance, access-restriction handoff, and real credential/passkey/device testing.
This change does not claim CAPTCHA solving, altered browser identity, new runtime
dependencies, full-suite success, or improved live-network throughput.
