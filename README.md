# Agent browser

An in-progress lightweight, agent-first browser implemented in TypeScript.
This is a new engine, not the Chromium-backed `browser-terminal` alternative.
It must become meaningfully better than curl: semantic document snapshots,
stable element references, stateful navigation, forms and isolated page scripts.

Agents use a structured API. A Browsh-inspired terminal/web view will make the
same session observable to humans. Kitesurf is an architectural reference, not
a service dependency. Cloudflare deployment is optional, not a requirement.

The requested final scope includes Kitesurf feature coverage, a comparable
playground and a Playwright-CLI-like superset. `COMPATIBILITY.md` tracks these
individually. A basic text fetcher or a parser that accepts familiar command
names is not completion of that scope.

## Current status

Foundation work only. The package is not yet a functioning browser and has no
website JavaScript runtime or real-site compatibility claim. No new dependencies
have been added. `TASKS.md` contains the 72-hour milestones, security boundaries,
dependency approval request, real-site test plan and completion gates.

Implemented foundations have 159 passing tests on Node: Playwright-style
argument parsing, a bounded document tree, stable references, snapshots/diffs,
terminal-safe text, and guarded HTTP transport. Build, typecheck and lint pass.
The portable core and fail-closed host guard have 130 passing checks on Bun.

The Node transport has DNS/address pinning, TLS hostname verification before
HTTP transmission, private-network policy, redirect handling, cancellation and
compressed-body quotas. Four real HTTPS sites pass transport-only probes; see
`reports/README.md`. This is not evidence of functioning website JavaScript or
browser actions. Bun networking is disabled after a local negative TLS test
exposed unsafe verification ordering; `NETWORK.md` documents the evidence.

Snapshots have byte/entry/depth/string budgets and targeted credential redaction.
Their role/label/visibility rules remain a subset, not a standards-complete
accessibility tree. Browser commands and the playground do not execute yet.

## Development

From the repository root, using the existing development tools:

```bash
bun run --cwd packages/browser-agent test
bun run --cwd packages/browser-agent typecheck
node_modules/.bin/biome check packages/browser-agent/src packages/browser-agent/scripts
bun run --cwd packages/browser-agent build
bun run --cwd packages/browser-agent check:network-sites
```

The last command makes four opt-in public GET requests and runs on Node. Build
first; package exports point to compiled ESM/declarations in `dist/src`.
No dependency install or root-workspace package linking has been performed.
