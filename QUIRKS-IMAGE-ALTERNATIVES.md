# Native image alternatives across document modes

## Behavior

Eligible broken HTML images now retain alternatives in no-quirks,limited-quirks
and quirks documents. No/limited-quirks use the existing non-replaced text
profile. Quirks images also use text when computed width and height are both
auto;otherwise they use a dedicated replaced alternative with independent
intrinsic dimensions and no image aspect ratio. Existing CSS sizing,min/max,
percentages,box sizing,borders,padding and layout owners remain responsible.

Eligibility still requires nonempty alt/src,complete broken owner,currentSrc,
zero natural dimensions and no decoded image. Existing srcset,crossorigin,
referrerpolicy,picture,namespace and source/owner restrictions remain. Pending
and loaded resources do not masquerade as broken alternatives. Mixed-content
and other image policy decisions are unchanged;no resource is fetched or
marked decoded merely to paint its alternative.

The replaced native visual policy is a single line of text,ASCII whitespace
collapsed and trimmed,at native bitmap font size/weight/current color. It
clips to the content rectangle and viewport,without wrapping,centering,an
invented icon or stretching glyphs. Intrinsic width counts Unicode code points
using native fixed advance;intrinsic height is font size,with a positive1x1
minimum for zero-size/empty normalized text. This is an explicit native
fallback profile,not foreign-browser fallback-widget/font/grapheme parity.
Non-replaced alternatives keep existing normal text-layout semantics.

## Geometry,painting and ownership

The original Libpng80x15 badge preserves its full quirks doctype,image source,
alt and dimensions in the canonical regression. Its replaced rectangle is
80x15 and its whole hit region belongs to the image;activation discovers its
real ancestor link. Snapshot focus changes legitimately on activation. DOM
children/source and image state remain unchanged;natural size and decoded
bytes remain zero. Unit default-action activation is not a live navigation.

Alternative glyph cells paint directly through the existing native raster
rectangle operation. Fractional content dimensions and origins are clipped,
not rescaled through a ceil-sized bitmap. A bounded16x16 viewport of a5000x5000
alternative does not allocate a content-sized scratch image. Existing font,
layout,raster and work bounds remain;work is charged before measurement,
allocation or drawing. No dependency or capacity is added. The standalone
raster helper retains transparent bounded output for its explicit target.

Normal backgrounds,borders,visibility,outlines,paint order,hit testing and
mutation invalidation remain owned by existing browser subsystems. The
paintedImages metric counts replaced-image drawing,including alternatives;
it does NOT prove a successful decoded resource. Other unsupported HTML,
table,font,display,vertical-alignment and layout guards are not suppressed.

## Verification and retained failures

225new cases:154helper,70document-layout,1canonical. Final focused check:
759passed/0failed across17suites. The canonical baseline against old12817
fails at native width resolution;the final baseline02 fixture is byte-identical
to the passing candidate. Older baseline and candidate artifacts stay intact.

Original baseline was reformatted before implementation. Fixed01 exposed four
previous blanket mode refusals,four real fractional-paint defects,two faulty
unchanged-focus assumptions and one misplaced align-content guard expectation
(697passed/11failed). The corrected canonical explicitly checks pre-activation
stability and post-activation ancestor focus;source,geometry,paint,action and
security expectations remain. Baseline02 rechecks that corrected oracle on
the old runtime. Fixed02 had757passes/2incorrect limited-quirks text-height
expectations;fixed03/04 pass759. Broad round00 built production but stopped at
three invalid-input test casts;explicit unknown casts preserve those runtime
tests. Independent follow-up static review found no remaining issues.

Final gate UTC:2026-09-12T10:35:50.485Z–2026-09-12T10:38:30.544Z.
Build,strict selected-test compilation,formatter and native gate pass:
**13042passed,0failed,2unchanged exclusions**. Selection:250
suites,249 strict roots,644 manifest
entries. 1144 source files,1960 compiled files,
1134 unchanged tracked inputs. Tests use immutable clean
snapshots with socket/socketpair denied,empty HOME/TMP,no stdin/TTY. Existing
uncommitted work is preserved separately from owned code and test changes.

Gate:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01
Work:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/quirks-image-work-september12/

- Source ledger:d6def5f5dc5b444fd5f1ef05c02e95ad961c83d0124bfb0316ff466b989d3815
- Compiled ledger:a6a08e4c041dd8f7adadf214dd7c385e43d0ccc14078a39856d9c2c862d9ecf7
- Native result:015c7595e213c330ad27cc72a5bd94c2fd71dddae725b3182f3417b2c13169dc
- Supervisor summary:099cb355f90441e23499a2e86cc593b41a3e8ed4b13efb6ab1f730857c8c1378
- Audit:437e0fe7e9a184338211ece3fb3b330b110389a9753c497bebfa312999a6d9c6
- Receipt ledger:2a895e3b6fefb9b38148faac3fe14c32279109b38f97a1e6e1e7cae330d437c1

These native results do not establish a working Libpng FAQ flow,new website
visit,provider/passkey/device/TTY/realSafeJS acceptance or CAPTCHA handling.
Captured whole-page replays remain separately labeled. The full browser goal,
remaining site/layout blockers,research and performance gates stay in TASKS.md.
