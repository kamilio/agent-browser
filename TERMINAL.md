# Keyboard terminal browser

The `terminal` frontend attaches to the same named session as CLI agents and the
playground. It projects our engine's live semantic snapshot; it does not launch
Chromium, Firefox, a shell for page content, or a remote browser. No package
dependency is added. The frontend uses Node's terminal streams and readline.

## Run

Build the package using the existing workspace TypeScript tool, then start its
foreground service:

```sh
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
node packages/browser-agent/dist/src/cli.js serve
```

In another terminal:

```sh
node packages/browser-agent/dist/src/cli.js -s=research terminal https://example.com/
```

Omit the URL to attach without navigating an existing session. A new session
without a document shows an error until you open a URL with `g`. The runtime
directory and private connection file follow `CLI.md`; `AGENT_BROWSER_RUNTIME_DIR`
selects the directory. Session selection follows the existing `-s`,
`AGENT_BROWSER_SESSION` and `PLAYWRIGHT_CLI_SESSION` conventions.

Automatic website JavaScript is still opt-in at service startup and requires the
explicit local SafeJS build described in `SCRIPT-LOADING.md`. Terminal mode does
not select an alternate evaluator or bypass the service's network policy.

## Controls

| Key | Effect |
| --- | --- |
| `j` / `k`, down / up | Move through displayed rows, including wrapped text within one entry. |
| Tab / Shift-Tab | Select the next/previous enabled link or control. |
| Page Down / Space, Page Up | Scroll by the visible number of rows. |
| Home / End | First/last displayed row in the retained snapshot. |
| Enter | Follow a link, click a button, toggle a checkbox, select a radio, or edit a field. |
| `e` | Edit a text control or enter a select option's actual value. |
| `g` | Open a URL; bare hostnames use HTTPS. |
| `/`, then Enter | Find literal text in the retained snapshot; an empty prompt repeats the last query. |
| `n` / `N` | Next/previous occurrence, wrapping across the retained snapshot. |
| `b` / `f` | Back/forward in the shared tab's history. |
| `r` / `u` | Reload the document / refresh the observer snapshot. |
| Escape | Cancel a prompt without submitting. |
| Ctrl-U / Backspace | Clear a prompt / remove its last code point. |
| `q` outside prompts / Ctrl-C | Detach; cancel this frontend's pending request, not the session. |

Actions and edits affect the real shared document. Submitting a form uses the
engine's existing form/navigation behavior; this frontend adds no implicit
confirmation or simulated success. Protected field prompts are masked and start
empty. Errors display stable error codes rather than potentially sensitive
exception messages or command arguments.

## Ownership and bounds

- The terminal refreshes every 1.5 seconds when not editing, with at most one
  frontend operation in flight. It requests `snapshot --observe`, so it does not
  consume another agent's diff baseline. This is bounded polling, not streaming
  deltas or an atomic read across independent commands.
- Selection follows an exact reference within the same document. Navigation or
  removal cancels a pending edit when a new snapshot is applied; backend reference
  validation remains authoritative if an agent changes the document mid-prompt.
- Long entries wrap at the display width instead of losing their tails. Paging
  operates on displayed rows and retains the original action reference. Resizing
  and same-document observer updates preserve a character anchor in the selected
  entry. The projection stores one escaped string and row span per entry, not an
  array of every wrapped row; only visible rows are sliced for a frame.
- Search is literal and ASCII-case-insensitive over projected text, including
  public control values and displayed hrefs. Protected values are excluded.
  Non-ASCII queries match their exact escaped code points, not Unicode case folding
  or normalization. Repeated occurrences inside one entry are reachable. Search
  keeps one current match, not an unbounded list of matches, and a miss explicitly
  refers to the retained snapshot rather than the entire remote page.
- Input is capped at 16,384 code units. Bracketed paste is prompt data only; pasted
  Enter does not submit and pasted hotkeys cannot trigger actions. Busy operations
  discard interaction keys except intentional detach; they never queue actions.
- Output is bounded to 240 columns by 80 rows and respects smaller TTY sizes.
  Updates coalesce through one scheduled draw and wait for output backpressure.
  Page-derived characters outside printable ASCII are escaped as `\u{...}`,
  including terminal control characters, bidi controls, combining marks and wide
  glyphs. This intentionally avoids pretending to implement Unicode cell widths.
- The frontend owns its alternate screen, cursor visibility, bracketed-paste mode,
  raw-input setting, refresh timer and pending API cancellation signal. Detach,
  EOF, SIGINT/SIGTERM and handled errors restore terminal input/display state.
  The shared service, session, tab and script realm remain owned by the backend.
- Piped stdin/stdout are rejected. Existing `text`, `snapshot` and JSON commands
  remain available for pipes. Terminal mode rejects unsupported command options.

## Acceptance and limitations

Unit cases cover keyboard mapping, stable references, navigation resets, protected
inputs, control-code escaping, paste boundaries, bounds, TTY cleanup and request
cancellation. `scripts/check-terminal.ts` drives the actual CLI through temporary
util-linux `script` PTYs, with a local HTML form/link fixture and read-only public
navigation. `script` is a Linux test prerequisite, not a package runtime dependency.

This is a semantic text browser, not a CSS layout or pixel renderer. It wraps
entry text at character boundaries, escapes non-ASCII text, and offers no mouse,
inline images, Unicode grapheme/word layout, interactive tab picker, terminal
scrollback export or screen-reader-specific line mode. Full Browsh/Kitesurf and
Playwright-superset scope remains open. Public HTML readability must not be counted
as successful automatic page JavaScript.

September 2, approximately 04:15 UTC: 80 focused tests pass across four files,
including 27 terminal cases. Ten new cases cover lossless row scrolling, paging,
resize/refresh anchors, huge logical row counts, repeated/reverse/wrapped literal
search, protected-value exclusion and stable action refs. Strict package and
changed-test compilation pass; Biome checks 158 files.

`reports/terminal-reading-resources-2026-09-02.json` records three synthetic
in-memory cases totaling about one million name code units each. They exercise
one long entry at 1/80 columns and 1000 smaller entries at 80 columns. Every case
keeps frames within bounds, reveals its tail and finds its marker. The report
separates initial projection, 1000 scroll frames, literal search and CPU timing.
These are local projection measurements, not real TTY, network, JavaScript-engine,
whole-browser speed or peak-memory results. Heap deltas are unforced-GC
observations. `check:terminal-resources` repeats the probe.

The preceding September 2, approximately 04:08 UTC checkpoint: 70 focused tests pass across four files,
including 17 terminal cases; the separate API/server suite passes 19 cases.
Strict package and changed-test compilation pass; Biome checks 157 files.
`reports/terminal-focused-2026-09-02.json` records the focused run.

The actual PTY/public-site probe was denied before execution because the approval
review applied the workspace dry-run rule to its real filesystem, PTY, loopback
and session mutations. It remains unverified, and this gate must not be replaced
by a unit-test-only acceptance claim or rerun through another tool without explicit
permission. The planned probe creates only owned temporary resources, makes public
read-only requests and detaches through the normal frontend lifecycle.

Two development formatter command groups stalled on inherited stdin sockets:
handle 42213 (PIDs 2421086/2421097/2421106) and handle 94387 (PIDs
2453630/2453751). Stopping the first group was explicitly denied; neither group
is claimed stopped. The final formatting pass used regular files for stdin and
completed independently. These are separate from the previously tracked obsolete
Date test process, which also has no new stop authorization.
