# Private state over real local transport

`scripts/check-state-transport.ts` is a separately authorized acceptance probe,
not a native unit test and not part of `native-tests.json`.

After building with the existing compiler, request explicit permission before
running this command:

```sh
timeout --signal=TERM --kill-after=5s 120s node dist/scripts/check-state-transport.js --allow-loopback-processes
```

The flag acknowledges scope; it does not replace authorization. Without it the
script exits before creating files, processes or sockets. Redirect its JSON output
to a new report path without overwriting existing evidence.

## Scope

- Own mode-0700 temporary directory and discovery/state subdirectories only.
- Actual foreground `serve` processes and separate Node CLI processes connected
  over the production authenticated loopback HTTP command server.
- Child environment contains only the isolated runtime-directory setting. No
  inherited SDK configuration, Node injection options or existing user service.
- Synthetic HttpOnly cookie and Unicode local storage larger than the single
  response-frame limit; no navigation and no website requests.
- Private-file round trip, no-clobber and explicit overwrite, atomic invalid
  import, named-session isolation and stale transfer rejection after recreation.
- Wrong bearer-token rejection, discovery-file cleanup, credential rotation and
  restore after service restart.

Children have bounded output, heap and lifetime; the outer timeout bounds the
whole command. Cleanup waits for owned children and removes only the probe's
temporary directory. The JSON report retains check results, command names, byte
counts and elapsed times, never state contents, bearer tokens or raw child output.
An assertion failure is reported by stage without dumping credential-bearing data.

## Evidence boundary

The report identifies its source as the working tree. It is not evidence for an
isolated committed snapshot, real session-actor processes, guest JavaScript,
released SafeJS, public websites, website authentication reuse, TTY/PTY,
portability or power-loss durability. Those acceptance gates remain open.

September 3, 2026: the harness builds, passes its source formatting/lint check,
and refuses execution without its explicit flag. The socket/process run was not
authorized, so no live report exists and none of its behavioral checks are claimed
as passing. Obtain new explicit authorization before running this probe.
The new source also typechecks against an isolated HEAD snapshot, excluding the
pre-existing unfinished feature work. The native suite was not rerun for this
script/documentation-only change; previous native totals remain historical.
