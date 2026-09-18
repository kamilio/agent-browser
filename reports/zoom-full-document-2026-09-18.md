# Native Zoom full-document load — September 18, 2026

## Outcome: client execution remains incomplete

One fresh native navigation reached the actual Zoom join document with its
response CSP intact. Ten scripts executed successfully in document order. The
eleventh script exceeded the explicit 120-second runtime limit, closing the
runtime and halting subsequent script execution. No meeting was joined.

This is a real website/native/SafeJS result, not the earlier selected-dependency
replay or synthetic route control. It does not establish usable join controls,
admission, incoming audio, recording, transcription or delivery.

## Observations

- Final document: HTTP 200, 158,521 decoded bytes, one navigation redirect.
- Transport: 13 actual requests and 13 completed exchanges; 2,127,224 decoded
  bytes and 370,015 encoded bytes. No mock responses or forbidden-network attempts.
- Loader: 47 script elements discovered, 10 executed, 1 failed, 36 skipped;
  three external sources requested and 1,614,390 script-source bytes accounted.
- The first inline script contains 107,111 code units and completes in
  10,902.365 ms. Nine following evaluations also succeed.
- Evaluation 11 is a 1,497,429-code-unit external source from `file-paa.zoom.us`.
  It throws the native `timeout` error after 121,737.279 ms. Its source SHA-256 is
  `4eada9ccde7e7f8140a0db8977c3253e998093456f6f8a5ebaf049f344d8ef1a`.
- Final SDK counters: 1,885,240 steps, peak call depth 28 and peak data 1,879,712.
  These are whole-page counters, not isolated measurements of the failed source.
- Native DOM contains 481 nodes, one form, four buttons and 29 inputs. These
  counts are not proof of functional prejoin interaction. The loader reports
  both `complete: true` and `halted: true`: parsing finished, client execution did not.
- Supervisor exits 1 after 135.558 seconds because script execution failed;
  the outer supervisor itself does not time out or send termination signals.

## Configuration and boundaries

The run reuses qualified core31 native source/build from commit `637e29c` and
the unchanged private BqM3JX SafeJS package. It uses actual `BrowserSession`,
`NodeNetworkTransport`, parser, `ScriptLoader` and `PageScripts`, with fresh empty
native cookies/storage. The runtime selects classic Scripts, after-prefix
callbacks, bounded DOM expandos and immutable per-document string policy.

Explicit limits: application-v1's 120 seconds per script; 300-second navigation;
360-second outer supervision; 768 MiB heap; 64 network requests; 32 external
scripts; 48 MiB decoded network data. The existing large-source loading profile
allows 8 MiB cumulative script source. No interpreter data, step or source limit
is increased after observing this failure. This direct session run does not
exercise the CLI or owned-process command protocol.

No Chromium, Firefox, remote browser, source replacement, selected-script
substitution, removed CSP, CAPTCHA bypass, credentials, external cookies, form
submission, meeting join action, audio device or notetaker daemon is involved.
Private response bodies and allowlisted response headers remain in mode-0600
artifacts; cookie header contents and private queries/nonces are not exported here.

## Cleanup and preserved failures

All 13 network exchanges close. Session, network and queue owners close with
zero pending work. The single SDK realm finishes with zero retained values and
zero current data. The child and process group are absent; pinned inputs match.

Four zero-network import/configuration rehearsals fail before navigation. The
fifth succeeds after reusing the already qualified self-contained Bq package;
both real script evaluations pass and all owners close. Those failures remain
preserved. There is exactly one actual live navigation, with no live retry.

Evidence root:
`/tmp/agent-browser-full-zoom-native-september18-jKqVwS`.
The bounded sanitized execution records are `live/REPORT.json`,
`live/EXECUTION.json` and `live/TRACE.jsonl`. Earlier Zoom reports keep their
original paths and measurements. The next work is a qualified runtime
performance improvement followed by an explicitly recorded meaningful replay,
not a claim that an HTTP 200 or parsed form completes the Zoom goal.
