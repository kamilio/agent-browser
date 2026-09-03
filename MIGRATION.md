# Standalone repository migration

September 3, 2026. The browser now lives at `/home/kjopek/project/agent-browser`,
outside the automations workspace. Run commands from this repository root.

## History and working files

All six browser commits reachable from the original repository's refs were
extracted. Their browser trees, commit messages, authors, committers and timestamps
were compared with the originals. Moving the package tree to the repository root
changes commit hashes; it does not discard the browser's history.

| Original commit | Standalone commit |
| --- | --- |
| `c5d0a844ded667aa61d85bf5483660cb60ac964e` | `d563d29e7bbcf9b0fb7d2bacf76acaac74ab3aa0` |
| `b31b239c24f48353525d37ff4c77babba31cf011` | `d8c275eb4dfc56081f737cda11182214ebccf329` |
| `00a5dff1524b861c7a5d09f70f31ab1273fa6175` | `1711fe671a5aa909f24f6f553b1121c9118f5c22` |
| `a57b792ed6c869cbf6190899a2a5f8ebe2fd6f8d` | `913336149498e1dfd7cb2968e1cb69a17c89a2d6` |
| `2fd316767c1aabbe2f0374ef39cefd0793955662` | `492fd34ec329d7b72de96bfe661ab9e8a618b481` |
| `e3638c74ba77ddef035fb8ffd454213053840ca0` | `41d8089e310eafe9f6ec2c135590ec1d24b341c7` |

Before standalone edits, all 3,254 working files were compared with the original,
including uncommitted/untracked files and reports. Existing unfinished changes
remain uncommitted; migration commits do not silently absorb that work. There is
no Git remote configured, so this repository cannot accidentally push browser
work to the automations remote. The original repository's history is not rewritten.

## Development

```sh
cd ~/project/agent-browser
npm run build
npm run typecheck
npm test
npm test -- src/playground-capture.test.ts
node dist/src/cli.js --help
```

TypeScript, Vitest, Biome and Bun type definitions use the exact already-installed
versions from the former workspace. Their local dependency closure was copied
offline, without links back to automations, registry downloads, or new runtime
dependencies. Build configuration is local rather than extending a monorepo file.

`native-tests.json` is an explicit list of native fixture tests; the default test
command does not discover live browser/socket/TTY/SafeJS probes. Missing files in
an older checkout are not implicitly replaced with other tests. Broad compatibility
and real-site gates still require their own evidence.

SafeJS loading retains its existing public SDK boundary and optional installed
package-root argument. This migration does not acquire a newer SDK, remove its
known compatibility limitations, or make native fixture tests into runtime proof.

Historical reports and investigation documents may still contain
`packages/browser-agent/` or absolute automations paths. Those identify the
original measurements; for current commands, use this repository root and omit
the old package prefix. Operational README, CLI, playground and terminal commands
are updated separately from historical machine-readable evidence.

## Validation

The relocated working tree passes production build, typechecking and all **5,764
native tests** using the 178-file allowlist. CLI help runs from the new root; 107
development-tool symlinks resolve inside this repository rather than back into
automations. Strict checks of the configuration and five focused test files pass,
as do five-file lint and descriptor-stdin formatting checks.

These measurements include the preserved unfinished feature work. They do not
claim that the migration commit alone implements those features, and do not add
real-site, SafeJS, real-terminal or deployed-playground acceptance.

The migration-only staged tree was also checked independently in a temporary
checkout: build, typecheck and **3,004 tests across 117 existing allowlisted files**
pass without the unrelated unfinished changes. This separately verifies that the
atomic setup commit is usable on its own.

The former package is retained as a recovery copy at
`/tmp/agent-browser-migration.YTlF9s/original-package` after removal from the
automations workspace. Temporary storage is not a permanent backup; the working
repository and its history are at the standalone location above.
