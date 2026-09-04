# Native cookie commands

September 4, 2026. The parallel cookie service is integrated into the real
BrowserCommandHost queue and CLI path. No second cookie jar or page-controlled
filesystem/network path is introduced.

## Commands and ownership

- `cookie-list [--domain=hostname]` returns unexpired session cookies, optionally
  filtered by exact canonical hostname. It does not include subdomains implicitly.
- `cookie-get name` returns every matching name across host/path identities;
  absence is an explicit not-found error rather than an arbitrary first match.
- `cookie-set name value` uses the active HTTP(S) page and existing jar policy.
  Supported flags are path, expires, httpOnly, secure and sameSite. Expiry input
  is whole Unix seconds, with -1 meaning session expiry; exported expiry remains
  milliseconds or null. Matching host/path/name is replaced, not merged.
- `cookie-delete name` removes all exact-name identities within that session
  and returns their count. List/get/delete work after its final tab closes; an
  existing named session is still required. Cookie commands do not silently
  create sessions. The existing cookie-clear command is unchanged.

Set defaults to the active URL's directory, not a fabricated root path. Cookie
prefix, Secure, HttpOnly, SameSite, expiry, size and capacity policies remain in
the existing jar. Explicit Domain setting remains unsupported because this jar
is host-only; the command does not weaken that policy or pretend to implement
domain-cookie/PSL semantics. Reads are detached and ordered by host/path/name.
Deletion preserves surviving attributes and relative request-header order.

List/get results intentionally include sensitive values. Mutation results and
service errors do not echo names or values; native trace output is tested not to
retain the synthetic cookie secret. Shared CLI parsing precedes this service:
dash-prefixed values belong after `--`, and unknown-option diagnostics do not
have a blanket secret-redaction guarantee.

## Integration evidence

The worker delivered 31 service/transport tests and an actual CLI-entry fixture.
Parent integration replaces the fixture's service bypass with production command
dispatch, adds tabless-session cases and reads the exported native trace to check
secret omission. CLI module loading and stdout/stderr are real; the command
connection and transport are in-memory fixtures, not a socket acceptance run.

Focused tests pass 264 / eight working files and 262 / eight isolated files.
The difference is preexisting pending command-host tests, not excluded cases.
Typecheck, build, strict checking of new tests and scoped three-file Biome pass.
The first added tabless fixture incorrectly omitted initial session creation;
it was corrected to open then close its tab, without weakening session policy.
An initial isolated archive missed the dispatch delta; the real CLI test caught
that unsupported-command result. The snapshot was corrected before final checks.

Native transport fixtures exercise the existing request-header path with only
resolver/wire exchange injected: HTTPS, HttpOnly document filtering, path
boundaries, subdomain isolation, credential omission and post-delete headers.
The integrated CLI fixture also proves cross-session isolation and subsequent
navigation header effects. No DNS, live site, socket, TTY/PTY or SafeJS probe ran.

Authorized final full native runs pass 9,765 / 279 isolated files. The working
tree reports 10,910 passes and the unchanged pending Window-onload assertion
failure / 301 files at src/page-bindings.test.ts:161. That test file still matches
its preexisting backup; its unrelated semantics were not changed or excluded.
Raw logs are under `node_modules/.cache/native-validation/cookie-integration-*`;
the isolated tree is `cookie-integrated.6vjddA` under that same cache directory.
The worker handoff retains its original standalone evidence and narrower scope.

## Remaining acceptance gates

This is a partial native cookie command surface, not full Playwright CLI parity,
domain-cookie support, browser-login validation or released guest-runtime proof.
Historical evidence and unrelated pending changes remain separate. TASKS.md and
the seven-day/five-hour plans retain the full browser outcome and open gates.
