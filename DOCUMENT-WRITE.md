# Parser-integrated document writes

September 1, 2026. The opt-in classic-script engine now supports a bounded
`document.write`/`document.writeln` subset through its actual HTML parser. It does
not append independently parsed fragments to a prebuilt DOM. Default scripting
remains disabled. No dependency or installed SafeJS package was changed.

## Implemented behavior

- The invoking script's closing token is consumed and its element popped before
  execution. Written input enters at that parser insertion point, outside the
  script element and before unread original markup.
- Complete ordinary tokens update the authoritative DOM before the write returns.
  Open elements affect how subsequent original markup is constructed. Incomplete
  tags, quoted attributes, comments and common character references can span
  writes without a temporary boundary being mistaken for end-of-file.
- Blocking external scripts written into the stream are prepared at encounter:
  their URL, base, mode and source metadata are captured before the caller can
  mutate or remove the element. Fetching begins through the normal guarded path.
  Execution waits for the current caller to finish and precedes unread markup.
  Later writes retain insertion order, including writes by the external script.
- Written data blocks stay inert; modules remain unsupported. Async/deferred
  resources keep their existing execution paths and do not acquire a blocking
  parser writer. General DOM appendChild-based script loading is still absent.
- Write arguments use the existing primitive DOM-string conversion. Object
  coercion remains unsupported. Argument lengths are checked before joining;
  writeln adds one newline. The writer is scoped to the active blocking parser
  operation, including its controlled load callback, and revoked on completion,
  failure or document closure.
- Plaintext mode survives input boundaries. An unterminated script at final EOF
  is not executed. Parser failure cannot be hidden by catching the write error
  inside a script and continuing a partially unsupported navigation.

## Limits and explicit gaps

At most 256 write calls are accepted during a parse. Original and written source
share `DocumentLimits.maxTextCodeUnits`; document node/depth/change limits still
apply. Token counts and a bounded input-work counter include retrying incomplete
tokens. This is not an instruction-by-instruction native CPU or total-RSS meter;
the owned-process supervisor remains necessary.

Nested **inline classic-script execution** requires controlled interpreter
reentry that the current experimental public realm API does not provide. The
parser rejects that navigation as unsupported rather than deferring the inline
script and pretending it executed synchronously. The previous committed page is
preserved. The requirement is added to upstream issue #540; disabling SafeJS's
reentry guard globally is not an acceptable substitute.

Post-parse writes and writes from async/deferred script execution are rejected;
document.open/close replacement semantics are not implemented. This differs from
full browser behavior and is exposed by `capabilities.scriptLoading.documentWrite`.
Some incomplete raw-text content is held until its closing token arrives, and
cross-write newline/surrogate preprocessing is not fully conforming. Full HTML
tree construction, streaming HTTP input, dynamic DOM-inserted scripts and precise
task/microtask semantics remain separate open gates.

## Evidence

- `reports/unit-node-2026-09-01-document-write.json`: all 983 tests pass across
  56 browser test files. New cases cover input boundaries, synchronous insertion,
  partial tokens, nested external ordering, prepared-script URL/base/removal,
  lifetime revocation, primitive failure retention, quotas and EOF behavior.
- `reports/document-write-process-sites-2026-09-01.json`: fourteen real owned
  process/HTTP-fixture assertions plus two public-site reporting assertions pass.
  The fixture obtains its scripts from HTTP, calls write/writeln, loads a written
  external script, and verifies parser visibility and insertion order. Manual eval
  only observes state or deliberately checks post-parse refusal.
- `reports/site-script-errors-document-write-2026-09-01.json`: Books to Scrape now
  successfully executes its inline fallback loader and fetches the real written
  jQuery 1.9.1 resource. It reports eight scripts, one successful execution, two
  failures and five skips. The original fetch-policy denial remains, and the
  downloaded library stops at guest function-property/prototype assignment.
- Quotes to Scrape still reaches the same function-object limitation. **Neither
  site passes dynamic-script compatibility.** The next core semantic blocker is
  already filed as `poe-platform/poe-code#541`.
- Strict package compilation and the configured 134-file style check pass. These
  results are not browser-speed, rendering, bot-avoidance or full-site claims.

## Reference and next work

The input-stream and parser-script insertion-point algorithms were reviewed in
`https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-document-write`
and `https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-incdata`.
The gaps above remain explicit rather than claiming full implementation of them.

Review and integrate upstream #540/#541 when implementations exist, then exercise
the unmodified public libraries again. Add nested inline execution only through
a bounded public interpreter API with correct ordering and shared state. Continue
source-error recovery, browser globals, dynamic scripts, rendering and the full
terminal/playground/agent-interface feature ledger; the original goal stays active.
