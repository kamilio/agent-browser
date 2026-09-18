# Filtered Zoom navigation reaches a different script failure

September 18, 2026. This is a separately labeled filtered experiment, not a
successful unfiltered Zoom run or proof that the blocked resource is optional.
The two earlier unfiltered full-document timeout reports remain unchanged.

## Result

Native core33 (`2468bc8`) and the qualified experimental ClrIn4 SafeJS package
run with exactly one explicit blocked origin, `https://file-paa.zoom.us`.
No default filter, source/CSP rewrite, response substitution, raised deadline,
credentials, interaction, meeting admission or media access is used.

The tiny zero-network actual-SDK rehearsal passes in 0.816 seconds. The blocked
resource is not delivered or evaluated; both allowed synthetic scripts execute.
The fresh live attempt exits with failure in 13.437 seconds, without timeout or
cleanup signals. Loading continues after the expected blocked fetch; ten scripts
execute. Evaluation eleven fails with `script-error` in 115.829 milliseconds.
The new source is 15,722 bytes, SHA256
`02f01a8ee7005d232675e4868311effe221225601fba81934fb54333ea9b5a2f`.
The runner does not capture the guest exception name/message, so it does not
prove an exact exception or establish independence from the blocked resource.

Static inspection identifies a concrete missing native API: this source patches
XMLHttpRequest, performs a synchronous request, then reads its response during
CSRF setup. The next implementation target is legitimate native XHR support,
not bypassing that setup or fabricating a token. A separate tiny public-SDK
probe proves that setup-time `context.nestedOperation` registration can suspend
the guest while Node timers progress, then return a primitive before the next
guest statement. That proof alone does not validate XHR or Zoom compatibility.

## Scope and evidence

The document returns HTTP200, 158,521 bytes, after one redirect. Thirteen actual
HTTPS responses transfer 132,566 encoded and 641,893 decoded bytes. The loader
reports 47 discovered, 10 executed, 35 skipped, 2 failed and 4 external scripts;
one failure is the explicit policy denial. A stylesheet separately hits a
resource limit. Parsed DOM counts and complete readyState do not prove a usable
join application. Whether the blocked source is necessary remains unknown.

Session, transport, all thirteen wire handles, document and SDK owners close.
SDK retained values/current data, native pending work, cookies and storage are
zero; child/group are absent and private HOME/TMP are empty. Parent independently
verifies 66 artifact pins and 7,065 input pins. Evidence remains at
`/tmp/agent-browser-full-zoom-filtered-september18-iGrDmb/HANDOFF.md`;
the suspension proof is at
`/tmp/agent-browser-sync-host-call-F3Ip4s/HANDOFF.md`.

Native XHR implementation, actual integration, usable UI, admission, incoming
audio, permitted recording, transcription and verified delivery remain open.
