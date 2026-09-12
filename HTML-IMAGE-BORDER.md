# HTML embedded-image border hints

Native HTML img, object and input type=image elements recognize the legacy
border presentation attribute. Positive parsed integer values supply solid
pixel-width borders on all four sides. Zero, negative and invalid values add
no declarations; they do not erase author borders. Author stylesheet, inline
and important declarations retain normal precedence. Border color uses the
existing currentColor behavior. Type matching is case-insensitive without
whitespace trimming; non-HTML namespaces and unrelated elements are excluded.

Parsing follows the native bounded HTML integer profile: leading ASCII
whitespace, optional sign and digits, with trailing text ignored. The existing
image-attribute ceiling of4096 code units applies. Unsafe/nonfinite integer
magnitudes reject with resource-limit, not silent rounding or clamping.
Existing layout coordinate limits still apply to computed geometry. No
network, dependency or capacity expansion is part of this implementation.

## Rendering and retained boundaries

Loaded-image geometry, content/border-box sizing, native raster borders,
hit testing and mutations use existing box owners. Standards-mode broken
image alternatives no longer fail solely because their border=0 attribute
was misclassified as an unsupported presentation hint. The exact canonical
fixture preserves the public SourceForge badge URL and all image attributes,
but uses an HTML5 doctype to isolate this independent border failure.

The HTTP badge remains blocked as mixed content before any fetch:zero image
requests/resources/decoded bytes. It is not decoded or falsely marked loaded.
The original Libpng quirks document is NOT repaired or revalidated by this
fixture. Its dimensioned broken-image fallback, unrelated HTML/table/vertical-
alignment/display guards and full click flow remain open. Object/image-input
border style recognition does not imply their embedded rendering is supported.
Dashed/dotted borders remain explicitly unsupported; none/hidden/solid retain
their existing profile. No CAPTCHA/challenge bypass, credential access,
provider/passkey/device/TTY/realSafeJS acceptance or browser-engine parity.

## Verification

Canonical source was frozen before production edits:baseline0passed/1failed
at native width resolution. The identical fixture passes after the repair.
Focused final check:475passed/0failed across13 suites, including167 new cases
(136 parser/cascade,30 rendering,1 canonical). Fixed00 retained459passes and14
failed new fixtures that incorrectly assumed dashed/dotted support; those
fixtures now use supported styles, with explicit negative checks added.
Static review also caught and corrected side-name literal typing before the
first build. Original failures and immutable snapshots are preserved.

Final gate UTC:2026-09-12T09:48:10.449Z–2026-09-12T09:50:47.980Z.
Build, strict selected-test compilation, formatter and native gate pass:
**12817 passed,0 failed,2 unchanged exclusions**. Selection:247
suites,246 strict roots,641 explicit
manifest entries. Source inventory:1140; compiled:1956;
unchanged tracked inputs:1133. Kernel socket and
socketpair creation are denied during checks; empty HOME/TMP, no stdin/TTY.
Only owned clean projections are committed; unrelated working edits remain.

Gate:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-image-border-september12-round01
Work:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/image-border-work-september12/

- Source ledger:6c658bcfdfd3cd9ab3f6bd8fe5911649d29532a07efdfda430c54116b6099845
- Compiled ledger:fcc6bc59398e54dc999f160937f39df145930289a1850e45544e5ece8d74658d
- Native result:a7fc55031e9d4211c5fbe1b4c6e9230cd7b65633efa5c366e17b59ad28047da1
- Supervisor summary:572c088aa5429c49b8fb02038003824c6e622b326d0495e161fe9679555261cd
- Audit:ab640777daf1ea635e8a6c0a85dca8ec26d33590e8c7c2c41232ec332de742f4
- Receipt ledger:81a49faa15ec10e0284e775c95292cb20e4b53435bbc7eae729bd9fa0d825c0e

These native results establish the selected isolated scope only, not a new
website visit or successful Libpng navigation. The overall objective and
remaining acceptance gates stay tracked in TASKS.md.
