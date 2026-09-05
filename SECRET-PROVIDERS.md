# Explicit host secret providers

The native CLI host can opt in to a trusted JSON configuration using
`AGENT_BROWSER_SECRET_CONFIG`. It must name a canonical absolute file path;
there is no default discovery. Only the host factory loads it: server startup
and local help/capabilities without a running server. Client commands using an
existing server do not load it. Startup, help, and capabilities instantiate
providers but never resolve credentials.

## Trusted configuration

Create the configuration outside the repository, owned by the host user, with
mode `0600` in a `0700` directory. Use protected, owned parent directories. The
loader rejects symlinks, hard-linked files, group/other file permissions, unsafe
directory ownership/write permissions, and changes detected during access. It
uses the shared Unix private-file checks, no-follow/nonblocking open, descriptor
identity checks, bounded reads, and post-read file/directory revalidation.

Example `/home/operator/.config/agent-browser/secret-providers.json`:

```json
{
  "providers": {
    "local": { "type": "env", "path": "/home/operator/.config/agent-browser/app.env" },
    "vault": { "type": "pass", "executable": "/usr/bin/pass", "timeoutMs": 10000 }
  },
  "bindings": {
    "LOGIN_PASSWORD": {
      "provider": "local",
      "key": "LOGIN_PASSWORD",
      "origins": ["https://example.com"]
    },
    "VAULT_PASSWORD": {
      "provider": "vault",
      "key": "web/example.com/login",
      "origins": ["https://example.com"]
    }
  }
}
```

This file contains references, not password values. Unknown fields (including
`value`, `password`, and `runner`), duplicate keys (including escaped spellings),
prototype-pollution keys, malformed JSON/UTF-8, and invalid shapes fail closed.
`nodeSecretConfigLimits` bounds the file to 65,536 bytes, nesting to eight
containers, and providers/bindings to 1,024 each. The broker validates names,
keys, provider references, and origin lists. Origins must be literal canonical
HTTPS origins: no HTTP, wildcards, credentials, path, trailing slash, query, or
fragment. Subdomains and different ports require their own explicit origins.
Failures never print configuration content, file paths, or underlying errors.

The `env` provider reads only its explicit private file when requested, not the
process environment. `.env` files are **plaintext at rest**; protect them with
`0600` permissions and `0700` parent directories, including backups. There is no
shell evaluation, variable interpolation, or loading into global `process.env`.
The `pass` provider uses an absolute executable (default `/usr/bin/pass`), reads
only the first output line, and uses no shell or clipboard. Password-store
extensions are disabled; JSON cannot supply a runner. Its timeout defaults to
10,000 ms and must be an integer from 1 to 30,000 ms. Executable selection is a
trusted host decision, not authorization for arbitrary agent execution.

The default `pass` runner now requires POSIX-style process groups; it fails closed
on Windows before spawning. It starts the selected executable in a new group and
session without a shell, retaining piped output and its event-loop reference.
Cancellation, timeout, output overflow or pipe/child errors request `SIGKILL` for
that captured child group, then destroy the output streams. Invalid group IDs or
a failed group signal fall back to the owned child handle. Repeated/late errors
cannot repeatedly signal a retired runner, and cleanup errors remain generic.
Trusted custom runners retain their existing interface and responsibilities.

This is best-effort cancellation, not process-tree containment. Descendants can
leave their group, unrelated `gpg-agent` instances are not owned by the runner,
and signal delivery does not prove termination. No cleanup signal is sent on a
normal close, and no general normal-exit descendant-cleanup guarantee is made.
See `PASS-RUNNER-CANCELLATION.md` for scoped native tests and a separately
authorized, real-OS **synthetic executable** probe. Neither authorizes nor
establishes actual `pass`, vault, GPG, pinentry, Windows or credential acceptance.

## Native CLI usage

These are illustrative commands, not a record of live validation. With a built
CLI and the private configuration already prepared, start the native server
without SafeJS runtime environment settings:

```sh
AGENT_BROWSER_SECRET_CONFIG=/home/operator/.config/agent-browser/secret-providers.json node dist/src/cli.js serve
```

In another terminal, obtain target references before requesting a secret:

```sh
node dist/src/cli.js -s=login open https://example.com/login
node dist/src/cli.js -s=login snapshot
node dist/src/cli.js -s=login fill-secret e4 secret:LOGIN_PASSWORD
node dist/src/cli.js -s=login click e5
node dist/src/cli.js -s=login close
```

`e4` and `e5` are illustrative password-input and submit-button references;
use the actual references returned by the pre-secret snapshot. The reference
`secret:VAULT_PASSWORD` selects the other binding. Neither page content nor
agent commands can configure a provider, executable, file path, or origin.
`fill-secret` accepts password inputs only and checks the selected page's exact
HTTPS origin before resolution.

The command host seals the **entire session before attempted resolution**.
Once sealed, success or failure does not restore inspection: allowed subsequent
actions return static acknowledgements, and agent inspection, snapshots,
screenshots, tracing, state export, and post-login inspection are unavailable
until the session is closed. Closing ends that session; it does not unlock its
authenticated page for inspection. Plan the login actions before resolution.
An authorized site can see a password supplied to it. This is output isolation,
not protection against a malicious trusted site, and JavaScript strings cannot
be securely zeroized even when temporary byte buffers are cleared.

## API and acceptance boundary

Trusted Node embedders import the portable broker from the package root and
the host-only providers from the explicit Node subpath:

```ts
import { SecretBroker } from "agent-browser";
import {
  EnvFileSecretProvider,
  PassSecretProvider,
} from "agent-browser/node-secrets";

const secrets = new SecretBroker({
  providers: {
    local: new EnvFileSecretProvider({
      path: "/home/operator/.config/agent-browser/app.env",
    }),
    vault: new PassSecretProvider({
      executable: "/usr/bin/pass",
      timeoutMs: 10000,
    }),
  },
  bindings: {
    LOGIN_PASSWORD: {
      provider: "local",
      key: "LOGIN_PASSWORD",
      origins: ["https://example.com"],
    },
    VAULT_PASSWORD: {
      provider: "vault",
      key: "web/example.com/login",
      origins: ["https://example.com"],
    },
  },
});
```

Pass this `secrets` object to the trusted `BrowserCommandHost` constructor's
`secrets` option alongside its existing `createSession` implementation. These
constructors do not read credential files or execute `pass`; resolution happens
only when requested. Use the command host for the session-sealing policy:
constructing a broker alone does not impose command-output isolation on a
custom embedding. Keep both the broker and providers outside the page runtime.
The package root also exports `SecretBinding`, `SecretBrokerOptions`,
`SecretProvider`, and `secretProviderLimits`; `agent-browser/node-secrets`
exports the provider option/runner types and `nodeSecretProviderLimits`.

`src/node-secret-config.ts` exports `loadSecretConfig(filename, options?)`,
`LoadSecretConfigOptions`, and `nodeSecretConfigLimits` for internal host wiring;
the loader is not exported by `agent-browser/node-secrets`. An undefined filename
returns `undefined` without I/O; otherwise it returns a configured `SecretBroker`.
The native host passes it as `BrowserCommandHost`'s `secrets` option. The loader
does not read the environment itself. `options.processRuntime: true` rejects
any supplied filename with an explicit `unsupported` error before file access.
Configuring both `AGENT_BROWSER_SAFEJS_ROOT` and secret configuration therefore
fails closed, rather than ignoring the configuration or transmitting passwords
over the process protocol.

This is API/native CLI wiring with synthetic configuration validation only.
Real vault access, real credential files, platform keyrings, live websites,
service/socket/TTY operation, and SafeJS execution have not been accepted by
these tests. Supervised process secret support is a future gate. Passkeys are
separate broker work and are not implemented by this configuration module.

## Integrated synthetic evidence

### Protected-file end-to-end followup

September 5, 2026: 18 additional cases exercise actual filesystem permissions,
symlinks and hardlinks using only newly created private synthetic `/tmp` fixtures.
The real configuration loader and `.env` provider feed the native command host,
form submission and output-confinement boundary; the transport is entirely
in-memory and cannot access a website. Both click and Enter submission deliver
the synthetic password to the test relying party without returning the password
or provider/configuration paths to the agent.

These checks cover restrictive readable modes, rejected group/world-readable
files, an unsafe direct parent, no early resolution, explicit file rotation and
permission revocation after configuration loads. A failed fill still seals the
session. No ownership or file metadata is mocked in this suite; only its own
fresh fixtures are cleaned. They are not the user's files or a real vault.

Six explicitly named credential suites produce **324 passes in each of the
working and clean integration trees**, with project types/builds, strict new-test
types and scoped Biome passing. The native manifest has 429 entries; no full
manifest or real `pass`, process-runtime, socket, TTY or live-login gate ran.
Evidence remains under
`node_modules/.cache/native-validation/secret-file-flow-final-*`; the initial
18-case run is retained as `secret-file-flow-initial-tests.json` / `.log`.
The original mocked-file measurements below remain historical evidence.

### Original integration

September 5, 2026: all **293 new cases** pass: 55 broker, 78 node-provider,
120 configuration, 38 adversarial command, and two native form-submission cases.
The form tests prove that the synthetic relying party receives the resolved
password while agent command results omit it; they are not live login tests.

The first adversarial candidate retained two failures: focus/beforeinput handlers
could retype a password input before value commitment. Native `fillPasswordAsync`
now rechecks the password-only invariant after focus and immediately before
commit. The same failing regressions pass without weakening their assertions.
Original results remain in
`node_modules/.cache/native-validation/browser-research/secret-review/`.

Fourteen named manifest suites produce **509 isolated passes** and **510 working
passes plus one pre-existing failure**. The latter is the existing
`advertises bounded node relations without claiming full Node or namespace support`
assertion in `src/command-host.test.ts`: pending positioning support exposes
relative/absolute/fixed capabilities while that test expects relative-only.
The same assertion was reproduced after restoring the pre-credential production
files in `node_modules/.cache/native-validation/secret-command-working-before.55ae2n`.
Neither the unrelated implementation nor its expectation was changed.

Project no-emit/build checks pass in both trees; strict new-test typing, scoped
Biome and touched-production formatting checks pass. The manifest has 416 entries;
the full manifest was not run. Matrix outputs are retained under
`node_modules/.cache/native-validation/secret-command-verified-*`, and the
pre-change regression JSON is `secret-command-preexisting-capability.json` in
that directory. An intermediate validation helper rejected the known failure
because Vitest JSON omits the formatted assertion diff; the actual matrix still
contains that failure rather than presenting a false all-green result.

## Confidential-action regression review — September 5, 2026

Thirteen additional synthetic cases exercise allowed-action listener failures,
secret-derived link navigation/reload, aggregate lists, throwing/rejecting
provider thenables, pending URL changes and close/reopen session aliases with
queued commands. The named security file now passes **51 cases**; no production
confidentiality bypass was observed, and no production code or seal policy changed.
Rejected cross-origin URL rewrites are not claimed as actual cross-origin
delivery tests. The full review records that distinction and remaining timing,
host-trust, runtime and interleaving limitations.

Five named credential suites pass **306 cases in each working/isolated tree**.
Both project types/builds and strict changed-test types pass. Format/import checks
pass. The full scoped lint reports one intentional `noThenProperty` finding:
the test must construct a hostile thenable. All other lint rules pass with that
single rule explicitly skipped for this one-file review command; no global lint
configuration or inline suppression was added. The unsuppressed failure remains
in the evidence rather than being represented as a complete lint pass.

Evidence: `node_modules/.cache/native-validation/secret-action-review/REVIEW.md`,
its immutable baseline and final 51-case results, and parent
`node_modules/.cache/native-validation/secret-action-final-*` /
`secret-action-fixture-*` logs. Initial fixture-assumption failures remain
documented. The 422-entry native manifest is unchanged; no full manifest, real
provider, actual SafeJS or live credential login was exercised by this review.
