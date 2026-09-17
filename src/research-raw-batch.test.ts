import { afterEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	loadResearchDocument,
	researchReaderRawLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const policy = "separate-omitted-raw-v1";
const discard = HtmlTokenizer.prototype.discardRaw;

afterEach(() => vi.restoreAllMocks());

function sourceResult(source: string, batched: boolean, budget?: number) {
	const observations: Array<{
		position: number;
		work: number;
		issues: number;
	}> = [];
	const spy = vi
		.spyOn(HtmlTokenizer.prototype, "discardRaw")
		.mockImplementation(function (this: HtmlTokenizer, name, debit, batch) {
			try {
				if (budget !== undefined)
					debit(researchReaderRawLimits.maxWorkUnits - budget);
				return discard.call(this, name, debit, batched ? batch : undefined);
			} finally {
				observations.push({
					position: this.position,
					work: this.workUnits,
					issues: this.issueCount,
				});
			}
		});
	try {
		return {
			result: sanitizeResearchHtml(source, {}, undefined, undefined, policy),
			observations,
		};
	} catch (error) {
		const diagnostic = resourceLimitDiagnostic(error);
		if (diagnostic !== undefined) return { diagnostic, observations };
		if (error instanceof AgentBrowserError && error.code === "unsupported")
			return {
				failure: { code: error.code, message: error.message },
				observations,
			};
		throw error;
	} finally {
		spy.mockRestore();
	}
}

it.each(["script", "style", "xmp", "iframe", "noembed", "noframes"])(
	"keeps exact reader output and raw accounting for %s",
	(name) => {
		const body = `${"ordinary 😀 text ".repeat(6000)}<not-an-ending>tail`;
		const source = `<${name}>${body}</${name}><p>Retained &amp; complete.</p>`;
		const reference = sourceResult(source, false);
		const batched = sourceResult(source, true);
		if (name === "xmp") {
			expect(reference.result?.html).toContain("<pre>ordinary");
			expect(
				reference.result?.html.endsWith("<p>Retained &amp; complete.</p>"),
			).toBe(true);
		} else
			expect(reference.result?.html).toBe("<p>Retained &amp; complete.</p>");
		expect(batched).toEqual(reference);
	},
);

it.each([
	"<!--escaped-->ordinary</script>tail",
	"<!--<script>double</script>escaped-->ordinary</script>tail",
	`${"a".repeat(1012)}<!--<script>double</script>-->tail</script>after`,
	`${"a".repeat(5098)}<!--<script>double</script>-->tail</script>after`,
	`${"a".repeat(65530)}<!--<script>double</script>-->tail</script>after`,
	"unterminated plain raw text",
])("keeps script transition and EOF accounting for %j", (body) => {
	const reference = sourceResult(`<script>${body}`, false);
	if (body === "unterminated plain raw text")
		expect(reference.failure).toEqual({
			code: "unsupported",
			message: "Malformed reader input",
		});
	else expect(reference.result).toBeDefined();
	expect(sourceResult(`<script>${body}`, true)).toEqual(reference);
});

it.each([
	0, 1023, 1024, 1025, 1026, 1027, 1028, 2038, 2040, 6136, 6137, 6138, 6139,
	6140, 6141, 11000, 14000,
])(
	"preserves the first-over-limit diagnostic and progress at remaining budget %i",
	(budget) => {
		for (const name of ["script", "style"] as const) {
			const source = `<${name}>${"a".repeat(16000)}</${name}><p>Retained</p>`;
			const reference = sourceResult(source, false, budget);
			expect(reference.diagnostic).toMatchObject({
				kind: "reader.omitted-work",
				limit: researchReaderRawLimits.maxWorkUnits,
			});
			expect(sourceResult(source, true, budget)).toEqual(reference);
		}
	},
);

it("checks cancellation in a batch before initializing the document", () => {
	const controller = new AbortController();
	const initializeDocument = vi.fn();
	let batches = 0;
	const spy = vi
		.spyOn(HtmlTokenizer.prototype, "discardRaw")
		.mockImplementation(function (this: HtmlTokenizer, name, debit, batch) {
			expect(batch).toBeTypeOf("function");
			return discard.call(this, name, debit, (units, scriptData) => {
				batches++;
				controller.abort();
				batch?.(units, scriptData);
			});
		});
	const source = `<script>${"a".repeat(2000)}</script><p>Retained</p>`;
	const body = new TextEncoder().encode(source);
	expect(() =>
		loadResearchDocument(
			{
				url: "https://raw-batch.fixture.invalid/",
				status: 200,
				headers: { "content-type": ["text/html; charset=utf-8"] },
				body,
				encodedBytes: body.byteLength,
				redirects: [],
				elapsedMs: 0,
			},
			{
				tabId: "raw-batch",
				signal: controller.signal,
				limits: {
					maxNodes: 50000,
					maxDepth: 128,
					maxTextCodeUnits: 2000000,
					maxChanges: 1024,
				},
				initializeDocument,
			},
			undefined,
			policy,
		),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(batches).toBe(1);
	expect(initializeDocument).not.toHaveBeenCalled();
	expect(body).toEqual(new TextEncoder().encode(source));
	spy.mockRestore();
	expect(
		sanitizeResearchHtml(source, {}, undefined, undefined, policy).html,
	).toBe("<p>Retained</p>");
});
