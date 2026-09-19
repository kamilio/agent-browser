# Agent browser development

- This is the standalone TypeScript browser repository, not an automations package.
- Keep the native engine independent of Chromium, Firefox and remote browsers.
- SafeJS is the only approved page-runtime dependency. Do not add other runtime
  dependencies. Reuse the existing compiler, test runner and formatter.
- Research before asking; test before claiming success. Keep limitations explicit.
- All prompts belong in Markdown files.
- Make focused atomic commits for completed new changes. Do not push unless asked.
- Preserve pre-existing uncommitted work; do not bundle it into unrelated commits.
- Use the explicit native test list in `native-tests.json`. Live website, socket,
  real TTY/PTY and SafeJS probes require their own authorization; a native test
  pass is not evidence for those acceptance gates.
- Keep validation artifacts ephemeral. Reuse working builds and remove temporary
  logs, reports and redundant snapshots after validation; do not accumulate them.
- Do not create run diaries, research inventories or standalone findings documents
  unless explicitly requested. Keep current status concise in `TASKS.md`.
- Keep the overall browser goal and outstanding gates in `TASKS.md`.
