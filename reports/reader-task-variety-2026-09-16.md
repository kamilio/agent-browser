# Cooking, dictionary and product reader workflows

## Results

Three new source-linked native workflows return substantive destination content.
Every emitted Markdown line is reviewed; this is content-availability evidence,
not fact-checking, full rendering, scripted functionality or account access.

| Source/task | Exact destination | HTTP | Markdown bytes | Reviewed result |
| --- | --- | --- | ---: | --- |
| Tasting Table cooking advice | https://www.tastingtable.com/1784400/cooking-stovetop-rice-avoid-thin-bottomed-pot/ | 200 → 200 | 3898 | Article heading, byline and substantive cooking explanations |
| Cambridge dictionary | https://dictionary.cambridge.org/dictionary/english/enormous | 200 → 200 | 18964 | Definitions, examples, synonyms and translations |
| Ulta product | https://www.ulta.com/p/weightless-no-crunch-shape-set-hair-spray-pimprod2061247 | 200 → 200 | 4604 | Product description, benefits, directions and ingredient text |

Each source is its corresponding host root. Targets are literal links from
previous complete native homepage captures, then separately proved through the
actual compact exact-target CLI with saved source and synthetic destinations.
The three offline proofs make six mocked GETs under kernel-denied network;
they do not establish destination availability. The live run then makes exactly
six native HTTPS GETs, without redirects or automatic retries.

Live starts are September 16, 2026 at 10:59:14.296261, 10:59:16.559700 and
10:59:19.029325 UTC. Supervised job times are 2.26, 2.47 and 2.57 seconds,
including source and destination requests, pacing and supervision overhead.
These are individual observations, not a controlled performance comparison or
isolated browser/network phase timings. No RSS measurement is claimed.

The native command selects each exact retained link and dispatches mousedown,
mouseup and click. Tasting Table has three target candidates, two eligible;
Cambridge and Ulta each have one. All documents, observed requests/sockets and
child groups close normally. HOME/TMP stay empty. No credentials, page scripts,
SafeJS, alternate browser/client, identity changes, form/cart/account actions or
challenge solving occurs.

## Content limits and planning corrections

The cooking page is advice, not a recipe. Cambridge retains ancillary vocabulary,
corpus examples, translations and blog material; some inline labels concatenate
and selector options are not paired neatly with translation panels. Ulta retains
image/carousel instructions and empty review/question sections. Its marketing,
price, inventory and shipping statements remain unverified; no transaction or
variant selection is attempted. Every automatic result remains
`extracted-unverified`, `contentSuccess:null`, with partial reader provenance.

The initial source choices were Serious Eats, Merriam-Webster and Ulta. Checking
the first two saved bodies yields no retained anchors: both are already-recorded
HTTP403 challenge responses. Choosing them before checking those verdicts was
a planning error, not a new website failure or a challenge bypass. No new request
is sent to either host. The two replacements are explicitly selected before
live admission; they are not silent fallbacks after a failed live attempt.

The original cached scope also incorrectly says 2 MB per response. The actual
unchanged command permits 4,000,000 decoded bytes per response and 8,000,000 total.
All six observed responses are below 2,000,000 individually, but that smaller
bound was not enforced. The correction preserves the original plan and receipt
hashes rather than rewriting them. Other command and supervisor bounds remain
unchanged, including 256 KB extraction, 512 KB JSONL and a 60-second deadline.

## RTINGS: embedded data, not a visibility fix

A separate static audit extends the earlier JMGO N1S 4K review diagnosis. The
237561-byte saved public body contains a unique Vue component's entity-encoded
JSON attribute. Its decoded attribute is 18308 bytes. The native tokenizer and
strict JSON parser independently confirm the same attribute hash as the static
review, with an introduction, sixteen pros/cons blurbs and nine substantive
usage/performance descriptions. These fields are not normal visible text nodes.

All nine individual rating scores are null and all nine unblurred flags are false.
The source also contains explicit paywall/access configuration. One default-score
string and three categorical test values do not establish complete numerical
test results or permission to unblur restricted fields. Conditional early-access
copy is not proof of current early-access status; the captured public metadata
marks the review published. No referenced scripts, APIs or protected resources
are fetched, and no source statements are independently fact-checked.

The previous 3640-byte navigation-shell extraction remains valid for that reader
output. This audit does not turn hidden application data into rendered content,
override access flags or weaken visibility filtering. It changes the next
diagnostic question from merely missing static text to a bounded source-data
schema and restriction-policy decision. Any future collector must preserve
provenance, distinguish delivered descriptions from missing scores, and establish
which fields may be exposed before promoting them into reader output.

The first independent native confirmation fails only while resolving historical
evidence paths against the wrong directory. Its failed receipt is preserved.
A new helper resolves those paths against the historical lane and passes,
checking twelve historical hashes. Its case-sensitive filter omits the uppercase
scope filename; report assembly initially assumed thirteen and fails that
assertion before emitting a report. Final assembly independently verifies all
thirteen agent-listed historical hashes against the original evidence map.
Both native runs are offline and close normally; no parser or SDK fix is claimed.

## Runtime and evidence

Runtime source/script/config inputs match all1518 committed inputs at
`a2f55086ede8d21a66d4f417628933c75737677e`. The already-built compact feature
candidate supplies identical production artifacts; no source changes, fresh
build or new unit-test run occur. Its prior gate is1006pass/0 in13 explicit
native-manifest files, with build/types/scoped format/lint passing. This is not
a full940-file native run, SDK acceptance, device/TTY or credential/passkey gate.

Evidence, individual reviews, source selection, failed/successful diagnostics,
process lifecycle and corrections are retained in
`node_modules/.cache/native-validation/reader-task-variety-september16/`.
The adjacent JSON pins these artifacts and exact response/output hashes.
Original100-entry outcomes remain unchanged. No push occurs; the overall browser
goal, dynamic-runtime work, rendering and access-handoff requirements remain open.
