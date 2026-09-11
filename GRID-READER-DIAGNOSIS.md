# W3C reader failure — native offline diagnosis

September 11, 2026: one network-denied parser/loader child reproduces the exact
reader failure on the preserved W3C Grid response. It uses the immutable
6786-case compound-availability build, original `long-v1`/raw-policy settings,
and original document/reader budgets. No transport or browser session is created;
no website request, section extraction, page script or SafeJS execution occurs.

## Exact failure and source correlation

`loadResearchDocument` fails inside `sanitizeResearchHtml` with code `unsupported`
and message **`Malformed omitted reader subtree`**. The stack identifies
`dist/src/research-loader.js:181` under
`node_modules/.cache/native-validation/native-compound-availability-september11-round01/snapshot01/`.
The throwing source check requires an omitted subtree's closing name to equal
the last open omitted name. It does not recognize implied list-item endings.

Original public tokenizer methods run unchanged behind observation wrappers.
The bounded final 32 operations belong to tokenizer 2 and end with `</ul>` at
UTF-16 offsets **239606–239611**. They include four `li` starts at 238728,
239027, 239244 and 239475, with no intervening `li` end token. The source has an
omitted `object` starting at **238643**, referencing `images/grid-shorthand.svg`;
its fallback contains that list and its closing `</object>` starts at **239619**.

The original probe emits a source window only for tokenizer 1, so it emits none
here. A separate **file-only correlation** verifies every retained start/end tag
against its original decoded-source offsets, plus source length/encoding and the
surrounding object boundaries. This is not an extra native operation or a guessed
window from another document. The preserved UTF-8 body has 957488 bytes and
949779 decoded code units. The source sequence and throwing stack identify
implicit list-item ends in omitted HTML fallback content as the next fix target;
they do not justify relaxing unrelated malformed or foreign-subtree guards.

## Scope, integrity and cleanup

Evidence lane:
`node_modules/.cache/native-validation/native-grid-reader-diagnostic-september11/`.
Its `PREFLIGHT.json` verifies the completed 6786-pass selected native validation,
1006 source files and 1788 compiled files against their previously pinned ledgers.
The sole supervised child runs **11:42:04.041–11:42:04.175 UTC**, exits zero for
captured diagnosis, and emits 4005 bytes with empty stderr. The original source
and compiled code are not edited. All tokenizer descriptors are restored.

The failure precedes document construction; there are zero partial documents to
close. Recorded network/addon/process/worker guard attempts are zero, inherited
seccomp is active, `NoNewPrivs=1`, and the process group is absent. The unchanged
30+5-second, 6MiB, clean-environment and non-TTY constraints remain in force.

The parent supervisor then fails its empty-directory removal with `ERR_FS_EISDIR`.
`POSTFLIGHT-CORRECTION.md` preserves that harness-only error. The original runner,
native output, invocation and execution receipt stay unchanged; no native child
is retried. `verify-final.mjs` independently verifies all **2805 pinned inputs**,
the native error/guards/restoration, and token/source correlation, then verifies
and removes only the two owned empty private directories using directory removal.
Its successful `VERIFICATION.json` and receipt ledger complete the evidence audit.

This remains a failed reader load, not normative Grid research, live compatibility,
rendering or click acceptance. The original live failure is preserved separately
in `GRID-SPEC-NATIVE-RESEARCH.md`.
