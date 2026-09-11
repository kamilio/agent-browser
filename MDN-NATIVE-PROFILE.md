# MDN native CSS failure profile

An independent offline replay on September 11, 2026 reproduces the failed MDN
initial document load recorded in `MDN-NATIVE-FLOW.md`. It uses the same captured
HTML and eight stylesheets, exact URLs/order/hashes, native loader and original
limits. It performs no live retry, credential access, scripts or SafeJS execution.

## Root cause evidence

The 2731-node document contains 1433 elements. CSS selector call 146 fails:

```css
:is(.content-section ul.specifications-list) li:has(details)
```

It attempts 3270736 work units against 3270729 remaining, exhausting the original
5000000 shared query-work budget. The selector occurs at UTF-16 offset 14368 in
captured `response-6.body`, `styles-content-section.1eb240d1720d8ac3.css`.
`DocumentQueries.test` scans the entire element index for each `:has` anchor;
the logical ancestor wrapper does not supply a direct ancestor candidate key.
This is a matching-cost failure, not proof of a network or CAPTCHA block.

There are 131 completed calls using 1661648 reported work units. Fourteen
recoverable unsupported `:before`/`:after` parser failures are excluded from that
sum rather than reusing stale `lastWork`. The fatal call is measured separately.
The profile retains the twenty most expensive completed calls and original stack.

Next optimization: reuse bounded positive candidate indexes for relative selector
branches and restrict leading descendant/child branches to the anchor subtree,
while retaining sibling semantics, fallback matching, and work/memory limits.

## Scope and receipts

Lane: `node_modules/.cache/native-validation/native-mdn-css-diagnostic-september11/`.
One child runs 09:43:35.465–09:43:35.775 UTC; exit zero means the expected diagnosis
was captured, **not that MDN loaded**. It imports the unchanged client-challenge
validation build, whose prior 6431 selected native passes are historical evidence.
The new replay verifies 1006 source files and 1788 compiled files unchanged.

All nine fixture requests account for 252295 decoded bytes and zero wire bytes.
JS network/process guards plus inherited seccomp block actual network execution.
The 30-second child deadline, five-second grace, and 6-MiB file/output caps hold.
An independent verifier passes 57 checks; the receipt ledger seals 22 files.
Stdout SHA-256: `bf058f0e6e84fcba72248353a87940f46d969cb923c2b9afef32df3a42cc6a78`.

Session/transport/query/document cleanup and restored instrumentation are observed;
the child process group is absent and private HOME/TMPDIR are empty. Pending loads
are zero both immediately and at one post-event-loop sample (~0.323 ms later).
This separate replay does not alter or retroactively settle the original live
run's pending-load observation. Link activation, destination navigation, complete
rendering, and fresh live acceptance remain unverified.
