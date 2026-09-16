# Code-source qualifications without rewriting examples

Native extraction can attach optional `sourceCodeContexts` metadata to a result
containing actual HTML `pre` blocks. Markdown fences and their code text remain
unchanged. The metadata records delivered source qualifications, not language
inference, compiler results, visual styling, or permission to execute examples.

Each entry identifies an extracted pre block by `ref` and records:

- Exact retained `class` attributes on HTML `pre` and `code` nodes, with their
  text ranges. Labels such as `language-rust`, `edition2024`, `does_not_compile`,
  `should_panic`, `noplayground`, and `programlisting` remain opaque source text.
- Ranges of HTML `span` nodes carrying the ASCII-delimited `boring` class token.
  Their text is not hidden or removed. The marker alone does not establish that
  a rendered browser hides those lines.
- Ranges of source `strong`, `b`, `em`, and `i` tags within the code block. This
  retains source emphasis associations without inserting Markdown inside code.

The envelope explicitly reports `partial: true`, `rendered: false`, and
`verified: false`. In particular, a `should_panic` class is not evidence that an
example panics in intended use; source comments may further qualify such labels.
HTML comments are not recovered by this feature.

## Offsets and scope

`scope` is `selected-extracted-pre-text`; `offsetUnit` is `utf-16-code-unit`.
Each half-open `[start, end)` range refers to the cleaned text used by the native
pre emitter, including retained line feeds and tabs. `textCodeUnits` measures
that text. Offsets are not raw HTML bytes, source-file line numbers, Markdown
fence offsets, or rendered coordinates. A terminal LF added solely to close a
Markdown fence is not part of the measured pre text. Existing parser initial-LF
handling and visible control-character representation precede these offsets.

Collection uses the selected extracted tree and respects its existing admission
and visibility behavior. It does not read excluded source to restore hidden
content. Native and reader visibility semantics remain distinct; notably this
feature does not fix pre-existing reader inert-attribute retention differences.
True text sinks do not promote nested pre nodes into standalone code contexts.
Reconstructed GitHub div-based source blocks retain their separate provenance
and are not relabeled as original HTML pre source.

Ancestor-wrapper language classes, CSS-derived hiding, arbitrary syntax-highlighter
classes, implicit languages, and source comments are not inferred. The supported
markers are deliberately explicit and limited.

## Bounded, optional metadata

Collection limits are128 blocks,50000 visited extracted nodes,1000000 inspected
pre-text UTF16 units,1024 units per class attribute,65536 retained class units
overall,64 class-attribute records and256 ranges per block, and2048 records total.
Skipped qualification records mark truncation. An incompletely scanned block is
not emitted with misleading offsets or length; completed earlier entries remain.

Fitting occurs after ordinary content and existing source/access metadata, using
the remaining serialized UTF8 budget. Only whole entries are retained; an omitted
suffix marks `truncated`. If even the envelope cannot fit, the field is absent.
Absent metadata therefore does not prove that the source contains no qualifiers.
Adding this field does not force successful content into output-limit fallback.
Text-prefix fallback omits contexts rather than describing code it did not emit.

Native DOM, structured content nodes, source references, reader accounting,
discovery results, and code text are not mutated. No dependency, script execution,
network access, global quota increase, or challenge bypass is introduced.

See `reports/code-source-context-2026-09-16.md` for validation and limitations.
