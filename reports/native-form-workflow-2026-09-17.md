# Native public form submission — September 17, 2026

## Result

The native browser fills a public search field with `printf`, presses Enter,
follows two ordinary HTTP redirects, and retrieves the Debian trixie/coreutils
manual. The final response is HTTP200 and contains substantive manual content.
This is an actual native form submission, not a separately constructed result
fetch. The entry document is restored from a fresh earlier capture; it is not
fetched again during submission.

**The content driver passes, but the original aggregate execution remains
failed:** its collector incorrectly requires `response-end` on the two redirect
responses. The transport intentionally destroys unconsumed redirect bodies.
Separate saved-artifact review verifies request/response/socket closure without
rewriting that failure or claiming those bodies were consumed. No retry occurs.

## Real requests and content

All observations below are September17,2026 UTC, using the isolated qualified
native runtime matching commit`335946fc471770b5350ca021396cea8dd53a2b75`.

| Observation | Result |
| --- | --- |
| Entry capture,16:37:45.453 | `https://manpages.debian.org/`, HTTP200,14,552 decoded bytes |
| Native form action | `form[action="/jump"] input[name="q"]`, fill`printf`, press`Enter` |
| Request1 | `https://manpages.debian.org/jump?q=printf`, HTTP302 |
| Request2 | `https://dyn.manpages.debian.org/jump?q=printf`, HTTP307 |
| Request3, completed17:05:08.109 | `https://manpages.debian.org/trixie/coreutils/printf.1.en.html`, HTTP200 |
| Final decoded HTML | 26,110 bytes; SHA256`04c72ac3c436e729cd79a019843f5356c718229f87f4eb0be05c4c87ac771e39` |
| Extracted Markdown | 8,629 bytes; SHA256`ce814022260b0e179b3d9e7770b1d3c02d9c9061716314f8f5fd43ca355ec078` |

The three-request submission and the earlier one-request entry capture are
distinct. One restored in-memory entry delivery is not a fourth submission GET.
Native counters include that delivery: four logical requests, one mocked,
three real, two redirects. The live child/group terminate normally in0.825s;
this is one observed workflow duration, not a performance comparison.

Artifact checks preserve all **11 complete source paragraphs**, in order and
exactly once, plus the complete qualified `%b` and `%q` definitions. Independent
review confirms NAME, both SYNOPSIS forms, DESCRIPTION/FORMAT introductions,
conversion/variable-width text and the shell-version caveat. Content is more
than titles or navigation. It remains source content, not independent validation
of every manual assertion or linked destination.

The native extractor reports `partial:true`: emphasis and definition-list
presentation are flattened, selected tables use explicit structure markers,
and search controls/collapsed navigation are not reproduced. Scripts and
external styles/images are disabled. This does not prove visual fidelity,
JavaScript execution, native-reader mode, authentication or arbitrary forms.

## Controls and preserved findings

- All1,626 qualified source pins match the committed baseline; all2,408 compiled
  pins match their manifest. Dirty-root code is not executed. There is no new
  production-code change or new full native-suite run in this checkpoint.
- The initial captured-form proof and both redirect-driver versions use kernel
  and JavaScript network denial. The final synthetic proof passes with zero
  wire requests and27 pure URL/response-policy assertions. Synthetic redirects
  are not live successes or evidence of live socket semantics.
- Independent pre-live review catches two harness gaps: duplicate challenge
  header handling and accepting a jump endpoint as a terminal manual. Version2
  fixes both and preserves version1's proof unchanged before any query GET.
- Live calls use only native HTTPS GETs with certificate verification, no
  credentials/cookies/request bodies, bounded source-declared destinations,
  at most three requests and no retries. No SDK, device, TTY, alternate browser,
  proxy identity or challenge solver is used. No challenge is encountered.
- Every real request has finish/request-close/response-close/socket-close
  evidence. Both redirects are deliberately destroyed without response-end;
  the final response has `complete:true` at response-end. All sockets close
  without error; two native documents close, transport active count is zero,
  cookies are zero, and child/group are recorded absent.
- The original aggregate `EXECUTION.json` stays `passed:false`. A separate
  artifact-only verifier accepts this specific redirect-discard lifecycle and
  rejects16 mutated incomplete/incorrect event histories. This is not a rerun
  or a blanket relaxation of response-completion checks.
- Preserve the first captured-form check's null/undefined classifier mismatch,
  the first artifact verifier's Markdown-link normalization failure, and the
  second verifier's post-save console-variable failure. The third verifier
  exits zero; content requirements and original captures remain unchanged.

## Next work

Future live collectors must distinguish deliberately destroyed redirects from
consumed final responses. Expand native interaction coverage to different
public forms and content types, while working on actual SafeJS integration and
scripted-site acceptance. This single successful manual workflow does not
establish general crawler-block/CAPTCHA avoidance, dynamic websites, credentials
or device-backed passkeys. The historical100-page result stays33 useful/67 other.

Evidence and seals are indexed in the adjacent JSON report. The private lanes
are `native-form-workflow-september17`, `native-form-entry-live-september17`,
`native-form-submit-live-september17` and
`native-form-submit-live-v2-september17` under
`node_modules/.cache/native-validation/`. Original worktree changes are retained;
no push is performed. The broader browser goal remains active.
