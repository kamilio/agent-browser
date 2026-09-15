import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	type ResearchMimeInterpretation,
	type ResearchReaderMimePolicy,
	markdownHtmlDocumentPrefix,
	researchMimePrefixLimits,
	validateResearchReaderMimePolicy,
} from "./research-mime-policy.js";
import {
	type ResearchReaderReport,
	researchReaderInfo,
	researchReaderProfile,
	setResearchReaderInfo,
} from "./research-reader-info.js";

it.each(["\r\n".repeat(2048), " \r\n".repeat(1365), "\t\r\n".repeat(1365)])(
	"declines long blank-line prefixes with bounded linear admission",
	(prefix) => {
		expect(markdownHtmlDocumentPrefix(`${prefix}not HTML`)).toBeUndefined();
	},
);

it("recognizes a document after many CRLF blank lines without ambiguous repetition", () => {
	const prefix = `${"\r\n".repeat(1000)}<!doctype html><html><head>`;
	expect(markdownHtmlDocumentPrefix(`${prefix}<title>Test</title>`)).toBe(
		prefix.length,
	);
});

const policy: ResearchReaderMimePolicy = "markdown-html-document-v1";
const documentPrefix = "<!doctype html><html><head>";
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

describe("explicit reader MIME policy", () => {
	it("accepts only the supported policy or an omitted policy", () => {
		expect(validateResearchReaderMimePolicy(undefined)).toBeUndefined();
		expect(validateResearchReaderMimePolicy(policy)).toBe(policy);
	});

	it.each(
		[
			null,
			false,
			true,
			0,
			1,
			"",
			"text/html",
			"MARKDOWN-HTML-DOCUMENT-V1",
			{},
			[],
			[policy],
		].map((value) => ({ value })),
	)("rejects invalid policy $value", ({ value }) => {
		expect(() => validateResearchReaderMimePolicy(value)).toThrow(
			AgentBrowserError,
		);
		expect(() => validateResearchReaderMimePolicy(value)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	});

	it("publishes immutable prefix bounds", () => {
		expect(researchMimePrefixLimits).toEqual({
			maxCodeUnits: 4096,
			maxTokens: 64,
		});
		expect(Object.isFrozen(researchMimePrefixLimits)).toBe(true);
		expect(() =>
			Object.assign(researchMimePrefixLimits, { maxTokens: 100 }),
		).toThrow(TypeError);
	});
});

describe("bounded HTML document prefix recognition", () => {
	it.each([
		documentPrefix,
		"<!DOCTYPE HTML><HTML><BODY>",
		"<!DoCtYpE hTmL ><HtMl lang=en><HeAd data-ok>",
		"<!doctype\nhtml\t><html\nlang='en'\t><body >",
		'<!doctype html><html title="quoted > delimiter" lang="en"><head id=top>',
		"<!doctype html><html data-value='> < &amp;'><body inert>",
		'<!doctype html><html data-empty="" title = "hello"><head data-empty=\'\'>',
		"<!doctype html><html data-path=/docs/><body>",
		"<!doctype html><!-- note -->\n<html> \t<!-- next -->\r\n<head>",
		"\uFEFF\n \t\r\n   <!doctype html>\n<html>\n<body>",
		"  <!doctype html><html><head>",
		"<!doctype html><!-- 😀 UTF16 --><html><body>",
	])("returns the exact UTF16 end of %j", (prefix) => {
		expect(markdownHtmlDocumentPrefix(prefix)).toBe(prefix.length);
		expect(markdownHtmlDocumentPrefix(`${prefix}<title>Title</title>`)).toBe(
			prefix.length,
		);
	});

	it.each([
		"",
		"# Heading",
		"Ordinary prose",
		"<html><head>",
		"<head>",
		"<p>Fragment</p>",
		`Introduction\n${documentPrefix}`,
		`# Heading\n${documentPrefix}`,
		`---\ntitle: Document\n---\n${documentPrefix}`,
		`\`\`\`html\n${documentPrefix}\n\`\`\``,
		`~~~html\n${documentPrefix}\n~~~`,
		`    ${documentPrefix}`,
		`\t${documentPrefix}`,
		`   \t${documentPrefix}`,
		`\n    ${documentPrefix}`,
		`\uFEFF\n\t${documentPrefix}`,
		`\uFEFF\uFEFF${documentPrefix}`,
		`\n\uFEFF${documentPrefix}`,
		`\u00a0${documentPrefix}`,
		`<!-- leading comment -->${documentPrefix}`,
		`<?xml version="1.0"?>${documentPrefix}`,
		"<!doctype svg><svg><head>",
		"<!doctype html><svg><head>",
		"<!doctype html><math><body>",
		"<!doctype html><html:html><head>",
		"<!doctype html><html><title>Title</title>",
		"<!doctype html><html><div>",
		"<!doctype html><html></html><body>",
		"<!doctype html><html><html><body>",
		"<!doctype html><html/><head>",
		"<!doctype html><html><head/>",
		"<!doctype html><html><body />",
		"<!doctype html>prose<html><head>",
		"<!doctype html><html>```<head>",
		"<!doctype html>&#32;<html><head>",
		"<!doctype html><html>&Tab;<head>",
		"<!doctype html><!doctype html><html><head>",
		'<!doctype html PUBLIC ""><html><head>',
		'<!doctype html SYSTEM "about:legacy-compat"><html><head>',
		'<!doctype html PUBLIC "-//W3C//DTD HTML 4.01//EN"><html><head>',
		"<!doctypehtml><html><head>",
		"<!doctype><html><head>",
		"<!doctype html bogus><html><head>",
		"<!doctype html/><html><head>",
		"<!doctype html><!-- broken<html><head>",
		"<!doctype html><!--><!-- recovered --><html><head>",
		"<!doctype html><!-- nested <!-- comment --><html><head>",
		"<!doctype html><?processing?><html><head>",
		"<!doctype html><![CDATA[ ]]><html><head>",
		"<!doctype html><html\0><head>",
	])("does not infer an HTML document from %j", (source) => {
		expect(markdownHtmlDocumentPrefix(source)).toBeUndefined();
	});

	it.each([
		'title="unterminated',
		"title='unterminated",
		"title=",
		'title="ok"lang=en',
		"title='ok'lang=en",
		"title=bad'value",
		'title=bad"value',
		"title=bad`value",
		"title=bad=value",
		"title=bad<value",
		"=value",
		"bad'name=value",
		'bad"name=value',
		"bad<name=value",
		"bad\0name=value",
		"title='bad\0value'",
		"title=bad\0value",
		"lang=en LANG=fr",
		"/ lang=en",
	])(
		"rejects malformed attributes %j in either required start tag",
		(attributes) => {
			expect(
				markdownHtmlDocumentPrefix(`<!doctype html><html ${attributes}><head>`),
			).toBeUndefined();
			expect(
				markdownHtmlDocumentPrefix(`<!doctype html><html><body ${attributes}>`),
			).toBeUndefined();
		},
	);

	it("rejects every truncated stage of a required prefix", () => {
		const prefix =
			'<!doctype html><html lang="en"><head title="quoted > value">';
		for (let end = 0; end < prefix.length; end++)
			expect(markdownHtmlDocumentPrefix(prefix.slice(0, end))).toBeUndefined();
	});

	it("accepts a complete prefix at the code-unit limit but not beyond it", () => {
		const padding = " ".repeat(
			researchMimePrefixLimits.maxCodeUnits - documentPrefix.length,
		);
		const prefix = `<!doctype html>${padding}<html><head>`;
		expect(markdownHtmlDocumentPrefix(prefix)).toBe(4096);
		expect(markdownHtmlDocumentPrefix(`${prefix}unexamined body`)).toBe(4096);
		expect(markdownHtmlDocumentPrefix(`\n${prefix}`)).toBeUndefined();
		expect(markdownHtmlDocumentPrefix(`\uFEFF${prefix}`)).toBeUndefined();
		expect(
			markdownHtmlDocumentPrefix(
				`\uFEFF<!doctype html>${padding.slice(1)}<html><head>`,
			),
		).toBe(4096);
		expect(
			markdownHtmlDocumentPrefix(`${"\n".repeat(4096)}${documentPrefix}`),
		).toBeUndefined();
	});

	it("rejects a tag or comment cut off by the prefix window", () => {
		const padding = "x".repeat(4096);
		expect(
			markdownHtmlDocumentPrefix(
				`<!doctype html><html title="${padding}"><head>`,
			),
		).toBeUndefined();
		expect(
			markdownHtmlDocumentPrefix(
				`<!doctype html><!--${padding}--><html><head>`,
			),
		).toBeUndefined();
	});

	it("bounds all consumed tokens including whitespace and comments", () => {
		const comments = "<!--bounded-->".repeat(
			researchMimePrefixLimits.maxTokens - 3,
		);
		const prefix = `<!doctype html>${comments}<html><body>`;
		const next = vi.spyOn(HtmlTokenizer.prototype, "next");
		expect(markdownHtmlDocumentPrefix(prefix)).toBe(prefix.length);
		expect(next).toHaveBeenCalledTimes(64);
		next.mockClear();
		expect(markdownHtmlDocumentPrefix(`\n${prefix}`)).toBeUndefined();
		expect(next).toHaveBeenCalledTimes(64);
		next.mockClear();
		expect(
			markdownHtmlDocumentPrefix(
				`<!doctype html><!--extra-->${comments}<html><body>`,
			),
		).toBeUndefined();
		expect(next).toHaveBeenCalledTimes(64);
	});

	it("stops at head/body without interpreting or validating the body", () => {
		const next = vi.spyOn(HtmlTokenizer.prototype, "next");
		const body = "<script>never execute</script><malformed\0".repeat(20_000);
		expect(markdownHtmlDocumentPrefix(`${documentPrefix}${body}`)).toBe(
			documentPrefix.length,
		);
		expect(next).toHaveBeenCalledTimes(3);
	});

	it("leaves raw unfenced complete HTML examples explicitly ambiguous", () => {
		const example = `${documentPrefix}<title>Code example</title></head><body>Example</body></html>`;
		expect(markdownHtmlDocumentPrefix(example)).toBe(documentPrefix.length);
	});
});

function readerReport(): ResearchReaderReport {
	return {
		profile: researchReaderProfile,
		partial: true,
		scripting: false,
		styling: false,
		hiddenContentSemantics: false,
		sourceCodeUnits: documentPrefix.length,
		textCodeUnits: 0,
		outputCodeUnits: 0,
		tokens: 3,
		omittedTokens: 0,
		omittedSubtrees: {},
		ignoredAttributes: 0,
		unwrappedElements: 0,
		tokenizerIssues: 0,
	};
}

describe("immutable reader MIME interpretation metadata", () => {
	it("snapshots and freezes supplied interpretation without freezing its owner", () => {
		const tree = new DocumentTree("https://mime.fixture.invalid/");
		trees.push(tree);
		const interpretation = {
			policy,
			declaredMime: "text/markdown",
			effectiveMime: "text/html",
			basis: "html5-doctype-root-prefix",
			prefixCodeUnits: documentPrefix.length,
		} satisfies ResearchMimeInterpretation;
		const report = {
			...readerReport(),
			mimePolicy: policy,
			mimeInterpretation: interpretation,
		};
		setResearchReaderInfo(tree, report);
		const published = researchReaderInfo(tree);
		expect(published?.mimePolicy).toBe(policy);
		expect(published?.mimeInterpretation).toEqual(interpretation);
		expect(published?.mimeInterpretation).not.toBe(interpretation);
		expect(Object.isFrozen(published)).toBe(true);
		expect(Object.isFrozen(published?.mimeInterpretation)).toBe(true);
		expect(Object.isFrozen(interpretation)).toBe(false);
		interpretation.prefixCodeUnits = 0;
		expect(published?.mimeInterpretation?.prefixCodeUnits).toBe(
			documentPrefix.length,
		);
		expect(() =>
			Object.assign(published?.mimeInterpretation ?? {}, {
				prefixCodeUnits: 1,
			}),
		).toThrow(TypeError);
		tree.close();
		expect(researchReaderInfo(tree)).toBeUndefined();
		expect(published?.mimeInterpretation?.prefixCodeUnits).toBe(
			documentPrefix.length,
		);
	});

	it("does not synthesize MIME fields for ordinary reports or retain replaced fields", () => {
		const tree = new DocumentTree("https://mime.fixture.invalid/");
		trees.push(tree);
		setResearchReaderInfo(tree, readerReport());
		expect(researchReaderInfo(tree)).not.toHaveProperty("mimePolicy");
		expect(researchReaderInfo(tree)).not.toHaveProperty("mimeInterpretation");
		setResearchReaderInfo(tree, {
			...readerReport(),
			mimePolicy: policy,
			mimeInterpretation: {
				policy,
				declaredMime: "text/markdown",
				effectiveMime: "text/html",
				basis: "html5-doctype-root-prefix",
				prefixCodeUnits: documentPrefix.length,
			},
		});
		setResearchReaderInfo(tree, readerReport());
		expect(researchReaderInfo(tree)).not.toHaveProperty("mimePolicy");
		expect(researchReaderInfo(tree)).not.toHaveProperty("mimeInterpretation");
	});
});
