# Large-document reader whitespace checkpoint

September 15, 2026. **Negative design checkpoint: no production change.**
The top-100 homepage sweep is complete as attempts, not full website support;
its original results remain in `reports/top100-websites-2026-09-15.md`.
This follow-up investigates a large W3 document from the broader content corpus.

## Development evidence, not a new source admission

The September 6 WebAuthn Level 3 long-profile request remains a failure at
`document.nodes`: 50,001 observed against 50,000. The later default-profile
request remains a response-size failure. Neither result is rewritten.

For this local diagnostic only, independently verify the historical receipt's
previously published SHA256, then decode its captured public HTML. Verify the
body against both recorded body hashes and the recorded 2,739,242-byte length.
This is not ordinary failed-capture replay, successful source discovery,
research evidence about WebAuthn, or authorization for another website request.
There are no new HTTP requests, credentials, page scripts or challenge bypasses.

Receipt SHA256:
`f8ddc55d4e01b8072b7a6a6485ca6e1f0a7df5869de20fcbb1fe9c06345b47fd`.
Body SHA256:
`157030c980d44a3ce4b1ec5bcfaa16790c7dfefac20709af6ed2b11c7120970b`.

Use the sealed block-link release02 native build, whose runtime TypeScript
matches `67ee44d8fe80069a1a2244c8d06e273041b5c1b7`. The development harness uses
the existing native reader, tokenizer, parser and heading discovery. It does
not substitute another browser or promote the historical failure through the
normal replay admission gate.

## Measurements and rejected optimization

The unchanged reader reports 2,717,929 source UTF-16 code units, 1,562,735 text
units, 1,542,627 emitted units and 85,082 original reader tokens. A separate
experimental pass over the sanitized HTML visits 73,540 tokens and finds 8,129
ASCII-whitespace-only text tokens. These second-pass counts do not replace the
reader's source accounting.

| Development variant | Removed chunks | Removed UTF-16 units | Native parsing |
| --- | ---: | ---: | --- |
| Unchanged reader | 0 | 0 | Fails at 50,001 / 50,000 nodes |
| Neighboring block tokens, excluding literal ancestors | 5,472 | 34,266 | 49,170 nodes; 230 heading entries |
| Also exclude inline/unknown ancestors | 5,472 | 34,266 | 49,170 nodes; 230 heading entries |
| Restrict structural ancestry and stop removing after a stack mismatch | 10 | 44 | Still fails at 50,001 / 50,000 nodes |

All variants retain the same 50,000-node and other parser limits. A successful
experimental parse and heading count do **not** establish semantic equivalence,
correct extracted content, safe replay, or a production recovery mechanism.

Independent static review rejects generic neighboring-block-token removal:
flat link labels and literal text can lose separators; heading/table contexts
need protection; sanitizer ancestry does not model all parser reconstruction.
The inline/unknown ancestor guard covers some of those examples but is not a
complete safety proof. Source-character references, omitted content and
synthetic emissions also need explicit policy treatment.

The strict experiment stops eligibility at sanitized token 337: a `dl` end tag
while `dd` remains on the experimental stack. That can be an ordinary optional
HTML end, not evidence that the website is malformed. This simple conservative
matcher removes too little to solve the failure. No parser-aware broader rule
is approved or implemented at this checkpoint.

## Verification and next step

Six finite offline diagnostic children complete: three exploratory runs and
three reproductions with the final pinned harness. All exit 0 with no guarded
I/O attempts. The final three independently record unchanged compiled/harness
pins, empty stderr, reaped children and absent process groups. Kernel socket and
io_uring denial is installed without probing a socket. An exit 0 means the
expected experimental observations reproduced, not that the failed source or
the proposed optimization passed acceptance.

No production files, native test manifest, limits or defaults change. No fresh
build or native suite pass is claimed for this documentation-only checkpoint.
Local artifacts, static review and machine-readable observations are under
`node_modules/.cache/native-validation/reader-whitespace-september15/`.

Further work needs a reviewed, bounded parser-aware approach with synthetic
word/heading/link/literal equivalence tests and explicit policy provenance.
Do not raise the node limit, silently drop uncertain content, automatically
retry the website, or treat this failed source as ordinary replay authority.
The overall browser goal and remaining release/runtime/credential/passkey,
service and TTY acceptance gates remain open.
