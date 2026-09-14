# Website inventory: September 14 thirty-first update

Nine fresh native-reader requests cover eight hosts. Seven documents yield
checked topic content, one yields only a continuation link, and one returns a
real access challenge. The first eight run on the pinned6009ebe source candidate;
the final visit uses the compact-table candidate in `COMPACT-MARKDOWN-TABLES.md`.
There is no script/style execution, mocked traffic, alternate browser or bypass.

| Exact document URL | Result |
| --- | --- |
| `https://arxiv.org/abs/1706.03762` | HTTP200;10,640 Markdown bytes;83ms. Attention Is All You Need title and Transformer abstract checked. |
| `https://www.sqlite.org/lang_with.html` | HTTP200;37,721 Markdown bytes;245ms. Common-table-expression explanation and SQL examples checked. SVG syntax diagrams remain outside reader semantics. |
| `https://docs.pytorch.org/docs/stable/notes/cuda.html` | HTTP200;101 Markdown bytes;82ms. This is a redirect stub, not useful CUDA documentation. Its visible continuation URL is retained. |
| `https://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do-in-python` | HTTP403;22ms. Classified as a challenge before reader/navigation initialization. No content success or retry. |
| `https://docs.pytorch.org/docs/2.14/notes/cuda.html` | HTTP200;138,949 Markdown bytes;342ms. Actual CUDA semantics, synchronization and memory-management content checked after following the stub's real anchor. |
| `https://www.apple.com/mac-studio/specs/` | HTTP200;23,689 Markdown bytes;208ms. Unified-memory and memory-bandwidth specification text checked. No purchase or hardware recommendation. |
| `https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/` | HTTP200;88,105 Markdown bytes;285ms. Actual memory-configuration and interface-width specification content checked, not just site navigation. |
| `https://lobste.rs/` | HTTP200;20,977 Markdown bytes;213ms. Story titles and comment URLs checked; no login, voting or comment submission. |
| `https://github.com/ggml-org/llama.cpp` | Fresh compact-table CLI: HTTP200;45,087 Markdown bytes;612ms. Useful README text checked; same-response offline default output is54,291 bytes. |

The first four requests run18:08:01–18:08:02UTC; the explicitly discovered
continuation runs18:08:48–18:08:49UTC on September14,2026. Each uses one request
and zero HTTP redirects. The PyTorch continuation is a separate semantic URL
follow, not an automatic JavaScript/meta-refresh redirect or geometry click.
The versioned path is what the site supplied, not a claim about the latest release.
The final hardware/discussion batch runs18:12:14–18:12:15UTC and exits0.
The compact-table visit runs18:28:03–18:28:04UTC and exits0; its verification is
separate from the eight earlier content observations.

The PyTorch stub contains a passive Cloudflare JavaScript-detection injection,
but no observed access barrier. Reader-only retrieval and normal public link
following yield its content without executing that script. This is not evidence
of CAPTCHA solving or generalized challenge bypass. Stack Overflow's403 remains
a distinct, unresolved restriction.

Source bytes, response identities, exact invocations and failed observations are
unchanged. All four supervisors finish without timeout or surviving process groups;
private HOME/TMP remain empty. The four-page batch keeps mixed-result exit2;
the continuation returns exit0. Parent semantic checks stay separate from
original `extracted-unverified` outcomes and do not rewrite `contentSuccess`.

Evidence is retained in `node_modules/.cache/native-validation/content-corpus-september14/`,
`node_modules/.cache/native-validation/cuda-content-september14/`, and
`node_modules/.cache/native-validation/hardware-content-september14/`.
The additional compact CLI capture is in
`node_modules/.cache/native-validation/compact-live-september14/`.
These observations do not close visual, interactive, SafeJS, credential, full
release or research-completeness gates, nor change prior inventory totals.
