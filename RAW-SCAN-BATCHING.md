# Bounded reader raw-scan batching

The `separate-omitted-raw-v1` reader path now batches work accounting for ordinary
characters while discarding script/style/raw payloads. This is a CPU optimization
of inert source reading, not page execution, network acceleration or an access
workaround. No new dependency, CLI flag or increased resource limit is required.

## Internal contract

`HtmlTokenizer.discardRaw(name, debit, batch?)` accepts an optional host callback
`batch(codeUnits, scriptData)`. `HtmlRawDiscardSession.step` accepts the same
callback as its fifth argument. Without it, including explicit `undefined`,
the existing per-charge callback sequence is unchanged.

The optimized path scans at most 1,024 ordinary UTF-16 code units per batch inside
the existing prepaid windows. It stops before `<`, and also before `>` in escaped
or double-escaped script states. Structural characters, script transitions,
closing-tag detection, dash carry, retained lookahead and EOF handling use the
existing state machine. The callback receives a count and state flag, never raw
source text. Direct internal users remain responsible for correct accounting.

The reader aggregates the original `[1, 4]` work charges per ordinary script-data
unit, or `[1]` otherwise. It preserves successful aggregate work totals. When a
batch cannot fit, it charges complete affordable cycles and the exact next
legacy charge that crosses the cap. First-over-limit diagnostics and committed
tokenizer progress therefore retain their existing values. Window prepayment,
structural checks and the 32,000,000-unit omitted-work cap do not change.

## Cancellation and limitations

Every batch invokes the existing abort/resource check. The opt-in path may inspect
up to 1,024 ordinary code units before that check, rather than invoke an observer
per character. It does not preserve side effects or call counts of a custom
`AbortSignal.aborted` getter. This is bounded cooperative cancellation, not hard
wall-clock preemption. The unbatched callback API remains available unchanged.

Reader output, omission counters and source provenance retain their existing
shape. XMP content that the reader already retains as preformatted text is not
newly discarded. Malformed/unterminated reader input remains refused.

## Evidence

The protected candidate passes 870 selected native tests, including 111 new
cases. A baseline/candidate comparison matches all recorded content identities,
reader counters, classifications and failures across 96 historical complete
captures and four fresh feed/article captures. These are offline regressions,
not a new 100-site crawl or a usefulness reclassification.

In a repeated, unprofiled local benchmark, saved Best Buy workloads improve by
34–42% and Bankrate by 22–25% in median in-process retrieval time. Wikipedia is
mixed: one mode is 3.3% slower and the others change by about 0.5–1.1%. No broad
browser, live-network or cold-start speedup is claimed. Exact methodology and
all nine workloads are in `reports/retrieval-performance-2026-09-17.md`.
