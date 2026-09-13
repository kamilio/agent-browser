# Website checks — September 13, 2026

This supplements `WEBSITE-TEST-INVENTORY-SEPTEMBER-12-SEVENTEENTH-UPDATE.md`.
Both contacted hosts were already in that inventory. These checks add new
URL-level evidence, not new hosts or a claim that all86 recorded hosts work.
Earlier reports, failed attempts and source paths remain unchanged.

## Fresh native browsing

| URL | What actually ran | Outcome | Not established |
| --- | --- | --- | --- |
| `https://www.w3.org/TR/css-text-decor-3/` | One native GET, then one sealed native parse/section extraction | HTTP200;179502 decoded bytes;32 extracted containers; source/runtime inventories match | Full-site rendering or CSS conformance; served document is the May5,2022 Level3 draft |
| `https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/` | One native GET, then one sealed native query/extraction | HTTP200;673174 decoded bytes;10 specification excerpts; no challenge diagnostic | Interactive modal/tab visibility, current price, LLM performance or a hardware recommendation |

Both navigations use the native research CLI, not Chromium/Firefox or an external
browser. No redirects, retries, scripts, images, subresources, authentication,
cookie reuse or challenge evasion occurred. Source probes used the previously
audited font-family runtime:17,263 selected native passes, not the later decoration
runtime and not a newly executed test suite. Private HOME/TMP and owner cleanup
checks pass; original captured bodies and provenance are retained.

W3C retrieval:03:04:42UTC; native offline extraction:03:06:24UTC.
NVIDIA retrieval:03:19:40UTC; native offline extraction:03:21:38–03:21:39UTC.
NVIDIA reported281ms navigation time for this single request; that is not a
general browser or network performance benchmark.

## Concrete limitations and next candidates

- NVIDIA's static semantic heading output includes `Starting at $XXX.XX.`.
  That is a placeholder, not a current price. The source reader does not establish
  what CSS or scripts make visible to an interactive user.
- The NVIDIA extraction did not locate memory bandwidth/data rate. It found the
  actual `View Full Specs` link to
  `https://www.nvidia.com/en-us/geforce/graphics-cards/compare/#50-series`.
  That is an **unfollowed candidate**, not another tested page.
- The captured system-power row has an unextracted footnote. Its value must not
  become an unconditional PSU recommendation. Published AI TOPS likewise do not
  establish LLM tokens/second, precision, sparsity or real application performance.
- An official professional-desktop-GPU link was discovered but not contacted.
  Hardware comparison research and the other original research topics remain open.

## SQLite regression, not another live visit

The unchanged retained SQLite HTML/CSS was replayed after the new text-decoration
implementation. Applicable unsupported-property diagnostics drop15→12; raw
diagnostics drop24→18. Six selector issues, eleven float flags and one overflow
flag remain; this is not whole-site acceptance. The replay performs no HTTP,
image decoding, used layout, raster or scripts. Real decoration painting is
covered separately by the native raster/propagation tests.

The first replay had a count assertion error. Its evidence and a subsequent
sealed prose-count mistake are preserved with an explicit erratum, rather than
being silently rewritten. Native decoration code commit:`b870899`; selected
gate17,376passed/0failed/2unchanged exclusions,113new cases.

## Detailed evidence

- W3C: `node_modules/.cache/native-validation/native-text-decoration-source-september13/RESULT.md`
- NVIDIA: `node_modules/.cache/native-validation/native-nvidia-hardware-september13/RESULT.md`
- NVIDIA excerpts: `node_modules/.cache/native-validation/native-nvidia-hardware-september13/EXCERPTS.md`
- SQLite replay: `node_modules/.cache/native-validation/text-decoration-work-september13/sqlite-replay01/RESULT.json`
- Count correction: `node_modules/.cache/native-validation/text-decoration-work-september13/SQLITE-REPLAY-COUNTS.md`
- Implementation and test scope: `TEXT-DECORATION.md`
