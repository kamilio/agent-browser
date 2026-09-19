# Browser priorities

## Zoom is the current goal

- Run the supplied Zoom meeting in the native browser with SafeJS, without
  substituting Chromium, Firefox or a remote browser.
- The direct web-client route returns HTTP 200 and exposes the name field and
  Join button. With optional analytics blocked, 17 scripts execute before the
  417,914-byte Vue bundle hits the 120-second execution limit. No functioning
  join handler, admission, incoming audio, recording or transcript is demonstrated.
- Address repeated retained-graph accounting without weakening memory, depth,
  cancellation or credential isolation. Mutable graphs cannot be cached by identity.
- Empty owned module environments and object import metadata now reuse shallow
  scope snapshots; owned-graph accounting is faster, but Zoom still times out.
- Closure captures reuse their fresh root arrays; accounting is 9–13% faster in
  the 400-closure fixture, but the live Vue startup timeout remains unresolved.
- Cold SDK depth-limit tests exhaust the default Node stack. They pass with a
  larger test stack; production stack settings are unchanged and this gate remains open.
- A Promise constructor snapshot test also times out on the unmodified SDK baseline.
- Uncaught guest exceptions close the SafeJS realm; loader-only recovery cannot
  restore execution. Preserve shutdown on budget failures and cancellation.
- Complete legitimate admission, incoming audio, permitted recording, transcription,
  summary and verified delivery using the automations notetaker behavior.

## Remaining browser work

- Complete Kitesurf-level feature coverage, the observable playground/terminal,
  and a Playwright-CLI-like command superset; these are not completion claims.
- Improve extraction reliability, speed, website compatibility and legitimate
  challenge handling. Complete the requested top100 popular/agent-used-site checks.
- Reader extraction now returns MDN Modules, Wikipedia WebRTC and Python asyncio
  content in live native checks; broader site coverage remains unverified.
  Stack Overflow still returns a challenge and requires a legitimate handoff.
- Node.js filesystem docs now load without exceeding the node cap. Whole-page
  output still exceeds 256,000 bytes; explicit text-prefix extraction works.
- X search is identified as JavaScript-required, not research content or CAPTCHA.
  Reddit denies access; GitHub research pages yield text, not completed research.
- Complete browser-only research on local-LLM hardware, benchmarks, Astra chatter
  and Poe opinions; do not represent unfinished research as completed.
- Finish validation of secret placeholders with .env/pass providers and passkeys;
  keep real secrets out of agent context and retain provider extensibility.
- Keep native, SafeJS, live-network, socket and TTY acceptance gates distinct.
  Use the explicit native-tests.json list and test before claiming success.

## Working copies

- Native: /tmp/agent-browser-event-union13-duJvuD/candidate
- SafeJS source: /tmp/agent-browser-sdk-released-tickets-w68sa7j8/candidate
- SafeJS runtime: /tmp/agent-browser-released-ticket-sdk-cybnsyeb/package
- Code contributions remain under contributions/ as patches.

Keep this file short. Historical reports, run logs and redundant snapshots are
removed at the user's request; do not recreate the archive.
