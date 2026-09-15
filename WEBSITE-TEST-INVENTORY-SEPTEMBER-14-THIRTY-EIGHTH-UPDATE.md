# Website inventory: September 14 scope, thirty-eighth update

This scope begins before UTC midnight and continues with validation and fresh
acceptance receipts dated September15,2026. Original September14-named directories
and earlier measurements are retained. Five native navigations make **five HTTP
requests to three URLs on two hosts**, with zero redirects or mocks. Automatic
bounded redirects were explicitly permitted, unlike the previous ambiguous scope;
none occurred. No restricted target is retried or bypassed.

| Requested/final URL | Recorded UTC observation | Native result |
| --- | --- | --- |
| `https://docs.ollama.com/llms.txt` | September14,23:58:17 | HTTP200;4,632 decoded bytes;4,640 bytes of fenced source. Useful documentation index, including the explicit hardware Markdown link. |
| `https://docs.ollama.com/gpu.md` | September14,23:58:45 | HTTP200 `text/markdown`;12,570 decoded bytes; unsupported loader, no extraction. |
| `https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv` | September14,23:58:28 | HTTP200 `text/csv`;321 decoded bytes; unsupported loader, no extraction. |
| `https://docs.ollama.com/gpu.md` | September15,00:09:15 | Fresh post-fix HTTP200;12,580 bytes of fenced source; hardware-support sections and complete source retained. |
| `https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv` | September15,00:09:15 | Fresh post-fix HTTP200;329 bytes of fenced source retaining the complete321-byte file. |

The CSV review independently checks twelve monthly data rows and36 numeric values
under1958–1960 headers. That is offline inspection of this simple captured fixture,
not native CSV parsing or a general CSV-record association guarantee. Ollama's
GPU statements are obtained as publisher documentation, not independently verified
hardware/driver claims or purchase advice. No linked installer, driver, image,
script or other documentation page is fetched. Source instructions are treated
as data, not followed.

## Fix and comparisons

`LITERAL-TEXT-FORMATS.md` documents the two precise MIME additions. Native and
reader loaders reuse inert text storage, existing decoding/limits and literal
line discovery. Full Markdown fences source; HTML/scripts and CSV formulas stay
literal. CLI capability lists reflect support. No new runtime, execution feature,
wildcard text admission or increase in network/source/output limits.

Eight socket-denied loader calls compare the two saved responses through native
and reader loaders before/after the patch. All four baseline loads reject MIME;
all four patched loads preserve exact source and support bounded extraction and
line discovery. These replays make **zero HTTP requests**. The fresh post-fix
responses also have the same body hashes as their originals; receipt timestamps
and statuses remain separate and the original failures are never rewritten.

Decoded body SHA-256:

- Ollama index: `5d61a38291a72833805e3c0514a38682f531ba24d5c2ef50fd8ccc949d356291`.
- Hardware Markdown, before and after: `dc6569345668d8dac4a2ab36e338600782650704e5cd1d2908cfc9d1e61a942a`.
- Academic CSV, before and after: `f6a5fc622a83ef040fe708b7305fb6f34b8725a62e19da03a9bc8ff8592d8054`.

All three successful native results retain `extracted-unverified`, null
`contentSuccess` and partial representations. The two original failed reads retain
false content success. Independent semantic checks supplement those fields.

## Validation and boundaries

All1,429 cases across20 explicit native-manifest files pass, including53 Markdown
and11 CSV cases. Production build,20 strict test roots and eight-file formatting/
lint pass. The first run's six obsolete Markdown-refusal assertions are preserved
in `native-initial.log`; positive literal-source assertions replace them without
skipping tests or weakening unrelated URL/access checks. Initial/final source
ledgers are separate. No full native-release result is claimed.

Pre-fix navigation uses the prior candidate anchored to
`13ec6343ed1b4a2fd03b88ffd777d2fc9c7ef553`; post-fix requests use the pinned new
literal-markdown overlay on that commit. Each has2,208 compiled-file hashes.
All browser processes terminate without timeout, transport active counts return
to zero and private HOME/TMP remain empty. There are no page-script/SafeJS,
credential, other-browser, service-listener, device or real TTY/PTY operations.
Configured timeout and termination paths were not exercised; the supervisor may
use two successive five-second termination/reap waits after its work deadline,
so these observations do not prove a strict50-second overall bound.

Evidence begins at `/dev/shm/agent-browser-literal-markdown-september14/`, with
sibling scopes `ollama-doc-index`, `ollama-hardware-markdown`, `academic-csv`,
`ollama-hardware-markdown-fixed` and `academic-csv-fixed`, each using the original
`agent-browser-` prefix and `-september14` suffix. Durable copies retain scope
names without the prefix under `node_modules/.cache/native-validation/`.
See `LIVE-VERIFICATION.json`, replay outputs, `PARENT-VERIFICATION.json`, original
CSV review, native logs and source/compiled ledgers. Original dirty work is
preserved; no push. Broad research/site coverage, rendering, restricted sites,
performance measurements and separate runtime/device/service gates remain open.
