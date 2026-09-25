# Agent browser development

- This is a standalone browser repository migrating from TypeScript to Rust,
  not an automations package. Preserve TypeScript as the behavior reference.
- Keep the native engine independent of Chromium, Firefox and remote browsers.
- The target page runtime is QuickJS embedded in Rust through rquickjs
  (QuickJS-NG). SafeJS remains a reference for existing tests and bug reports.
  Keep dependencies focused; use Cargo, rustfmt and Clippy for Rust, and the
  existing compiler, test runner and formatter for TypeScript.
- Research before asking; test before claiming success. Keep limitations explicit.
- All prompts belong in Markdown files.
- Make focused atomic commits for completed new changes. Do not push unless asked.
- Preserve pre-existing uncommitted work; do not bundle it into unrelated commits.
- Use the explicit TypeScript native test list in `native-tests.json` and
  `cargo test --workspace --locked` for Rust. Live website, socket, real TTY/PTY
  and SafeJS probes require their own authorization; an offline test pass is not
  evidence for those acceptance gates.
- Keep validation artifacts ephemeral. Reuse working builds and remove temporary
  logs, reports and redundant snapshots after validation; do not accumulate them.
- Do not create run diaries, research inventories or standalone findings documents
  unless explicitly requested. Keep current status concise in `TASKS.md`.
- Keep the overall browser goal and outstanding gates in `TASKS.md`.
