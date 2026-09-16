# Native contract reconciliation — September 16, 2026

## Result and scope

**45,875 tests pass, zero fail, across 934 available committed manifest files.**
The 956-entry manifest still references 22 files absent from the committed
checkout. This is a green available-file run, not full-manifest acceptance.
Build, strict types for the 27 touched tests, formatting and lint also pass.

Baseline commit: 279113a7d93d3e34326f35f3501b9eb2ca45236e. Exactly 27 test files change among 1,542 pinned
source/script/config inputs. All 2,320 compiled production artifacts are
byte-identical to that baseline. This work repairs stale test contracts rather
than claiming new browser capabilities or weakening existing production guards.

## Contracts covered

- Inert reader classes versus narrow source-metadata allowlists; challenge stops
  with preserved captures; bounded selector recovery and table-row replay.
- Supported sticky/Grid/overflow/border geometry, literal offsets/sizes and
  mutation/cache checks. Actual block-in-inline/alignment error paths, mouse
  recovery and no-substitute PNG/PDF failures remain tested.
- Exact computed-style/global/capability inventories, virtual screen identity,
  cursor keywords, bounded nested wheel scrolling and capability revocation.
- Optional code-context output fitting: full entries, empty truncated envelope,
  mandatory-only result and failure below the mandatory minimum. Rustdoc code,
  source classes/ranges and omitted-node accounting remain exact.

Independent static review covers all 27 pinned changes and finds no blocking
issues. It is not an SDK, rendering, device, credential or website gate.

## Preserved execution history

| Run | Passed | Failed | Files | Interpretation |
| --- | ---: | ---: | ---: | --- |
| baseline | 1,365 | 152 | 41 | Incorrect temporary-directory ancestry adds private-file failures. |
| core01 | 1,455 | 62 | 41 | Identical source with protected HOME/TMP; 62 stale contract failures. |
| release01 | 1,525 | 0 | 41 | Initial 26-file correction. |
| full02 | 45,873 | 2 | 934 | Two older Rustdoc optional-metadata budget expectations remain. |
| focused03 | 40 | 0 | 1 | Corrected Rustdoc boundary expectations. |
| full03 | 45,875 | 0 | 934 | Final 27-file candidate; 591.021 seconds. |

Initial archive preparation exceeds a buffer and terminates its child; that
attempt is retained separately. A later formatting failure and focused runs are
also retained in JSON. Completed native/quality children and groups are absent;
no execution timeout or cleanup signal occurs in those runs. HOME/TMP are empty.
The native JS-level network guard is not kernel-enforced or an actual SDK gate.

## Missing manifest files

- src/borders.test.ts
- src/css-flex.test.ts
- src/css-flow.test.ts
- src/css-math.test.ts
- src/css-variables.test.ts
- src/flex-column-wrap.test.ts
- src/flex-column.test.ts
- src/flex-document.test.ts
- src/flex-nested.test.ts
- src/font-relative-box.test.ts
- src/inline-block.test.ts
- src/inline-borders.test.ts
- src/inline-flex.test.ts
- src/page-base64.test.ts
- src/portable-boundary.test.ts
- src/reference-images.test.ts
- src/reference-renderer.test.ts
- src/relative-positioning.test.ts
- src/response-archive.test.ts
- src/select-keyboard.test.ts
- src/select-typeahead.test.ts
- src/stacking-order.test.ts

The source-only admission audit follows 421 modules and 2,491 dependency edges,
including 22 pre-existing untracked tests and five additional untracked helpers.
It records no unresolved/nonliteral edges or parse diagnostics. This does not
execute those files, prove compatibility or authorize importing/committing them.

## Preservation and remaining work

All 42 previously dirty tracked files and 697 pre-existing untracked files are
preserved. Owned changes within three already-dirty tests are reversible and
tested/staged as canonical blobs; unrelated offsets, base64 and passkey edits
remain working-only. The manifest itself is unchanged by this work.

Separate fresh Node.js documentation browsing still fails extraction despite a
complete HTTP200 response; its doctype/table issue is under diagnosis, not fixed
by these tests. SafeJS callback admission, dynamic sites, access/CAPTCHA handling,
rendering, real credentials/passkeys/devices/TTY and research gaps remain open.
No push and no overall-goal completion are claimed.

Evidence: node_modules/.cache/native-validation/native-backlog-september16.
Sealed 152 artifacts (41107963 bytes); inventory SHA-256
bed6092cea69dbd898276e4d19499ab424d6a989268268489a7dd072a0199391. Historical failed attempts are not rewritten.
