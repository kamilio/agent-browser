import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import {
	type ResearchReaderReport,
	researchReaderProfile,
	setResearchReaderInfo,
} from "./research-reader-info.js";
import type { DocumentLoaderContext } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

export {
	type ResearchReaderReport,
	researchReaderInfo,
	researchReaderProfile,
} from "./research-reader-info.js";

export const researchReaderLimits = Object.freeze({
	maxSourceCodeUnits: 2_000_000,
	maxTextCodeUnits: 1_000_000,
	maxOutputCodeUnits: 2_000_000,
	maxTokens: 100_000,
	maxDepth: 128,
});

export type ResearchReaderLimits = {
	[Name in keyof typeof researchReaderLimits]: number;
};

const voidTags = new Set(
	"area base br col embed frame hr img input keygen link meta param source track wbr".split(
		" ",
	),
);
const omittedTags = new Set(
	"svg math script style template iframe object embed canvas noembed noframes frameset frame link meta input textarea audio video source track".split(
		" ",
	),
);
const rawTags = new Set(
	"script style xmp iframe noembed noframes title textarea".split(" "),
);
const preservedTags = new Set(
	"html head body title base a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup dd del div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p pre q rp rt ruby s samp section small span strong sub sup table tbody td tfoot th thead time tr u ul var wbr".split(
		" ",
	),
);
const blockReplacements = new Set(
	"form details summary dialog fieldset legend center search".split(" "),
);

function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function sanitizeResearchHtml(
	source: string,
	options: Partial<ResearchReaderLimits> = {},
	signal?: AbortSignal,
) {
	const limits = { ...researchReaderLimits, ...options };
	for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
		if (
			!Number.isSafeInteger(limits[name]) ||
			limits[name] < 1 ||
			limits[name] > researchReaderLimits[name]
		)
			throw new AgentBrowserError("invalid-input", "Invalid reader limit");
	}
	const check = (condition: boolean) => {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Reader aborted");
		if (condition)
			throw new AgentBrowserError("resource-limit", "Reader budget exceeded");
	};
	check(source.length > limits.maxSourceCodeUnits);
	const omittedSubtrees: Record<string, number> = Object.create(null);
	const report: ResearchReaderReport = {
		profile: researchReaderProfile,
		partial: true,
		scripting: false,
		styling: false,
		hiddenContentSemantics: false,
		sourceCodeUnits: source.length,
		textCodeUnits: 0,
		outputCodeUnits: 0,
		tokens: 0,
		omittedTokens: 0,
		omittedSubtrees,
		ignoredAttributes: 0,
		unwrappedElements: 0,
		tokenizerIssues: 0,
	};
	const tokenizer = new HtmlTokenizer(source, (issue) => {
		report.tokenizerIssues++;
		if (
			issue.startsWith("unterminated-") ||
			issue === "eof-before-tag-name" ||
			issue === "bogus-declaration"
		)
			throw new AgentBrowserError("unsupported", "Malformed reader input");
	});
	const output: string[] = [];
	const skipped: string[] = [];
	const open: string[] = [];
	const emit = (value: string) => {
		report.outputCodeUnits += value.length;
		check(report.outputCodeUnits > limits.maxOutputCodeUnits);
		output.push(value);
	};
	const text = (value: string, omit: boolean) => {
		report.textCodeUnits += value.length;
		check(report.textCodeUnits > limits.maxTextCodeUnits);
		if (!omit) emit(escapeHtml(value));
	};
	for (let token = tokenizer.next(); token; token = tokenizer.next()) {
		check(++report.tokens > limits.maxTokens);
		const omitting = skipped.length > 0;
		if (omitting) report.omittedTokens++;
		if (token.kind === "text") {
			text(token.data, omitting);
			continue;
		}
		if (token.kind === "comment" || token.kind === "doctype") {
			if (!omitting) report.omittedTokens++;
			continue;
		}
		const { name } = token;
		if (omitting) {
			if (token.kind === "end") {
				if (skipped[skipped.length - 1] !== name)
					throw new AgentBrowserError(
						"unsupported",
						"Malformed omitted reader subtree",
					);
				skipped.pop();
			} else if (!token.selfClosing && !voidTags.has(name)) {
				skipped.push(name);
				check(skipped.length > limits.maxDepth);
				if (rawTags.has(name)) text(tokenizer.raw(name) ?? "", true);
			}
			continue;
		}
		if (omittedTags.has(name)) {
			report.omittedTokens++;
			if (token.kind === "start") {
				omittedSubtrees[name] = (omittedSubtrees[name] ?? 0) + 1;
				const foreignEmpty =
					token.selfClosing && ["svg", "math"].includes(name);
				if (!voidTags.has(name) && !foreignEmpty) {
					skipped.push(name);
					if (rawTags.has(name)) text(tokenizer.raw(name) ?? "", true);
				}
			}
			continue;
		}
		const outputName = blockReplacements.has(name)
			? "div"
			: name === "xmp"
				? "pre"
				: preservedTags.has(name)
					? name
					: undefined;
		if (token.kind === "end") {
			const index = open.lastIndexOf(name);
			if (index >= 0) open.length = index;
			if (outputName) emit(`</${outputName}>`);
			continue;
		}
		if (!voidTags.has(name)) {
			if ((name === "p" || name === "li") && open.at(-1) === "p") open.pop();
			if (name === "li" && open.at(-1) === "li") open.pop();
			open.push(name);
			check(open.length > limits.maxDepth);
		}
		if (!outputName) report.unwrappedElements++;
		let attributes = "";
		for (const [attribute, value] of Object.entries(token.attributes)) {
			let keep =
				(outputName === "a" && ["href", "title"].includes(attribute)) ||
				(outputName === "base" && attribute === "href") ||
				(outputName === "img" && attribute === "alt") ||
				(outputName === "ol" && attribute === "start");
			if (keep && attribute === "href") {
				try {
					parseNetworkUrl(new URL(value, "https://reader.invalid/").href);
				} catch {
					keep = false;
				}
			}
			if (keep) attributes += ` ${attribute}="${escapeHtml(value)}"`;
			else report.ignoredAttributes++;
		}
		if (outputName) emit(`<${outputName}${attributes}>`);
		if (rawTags.has(name))
			text(tokenizer.raw(name, name === "title") ?? "", false);
		else if (name === "plaintext") text(tokenizer.remainder(), false);
	}
	check(false);
	if (skipped.length)
		throw new AgentBrowserError(
			"unsupported",
			"Unclosed omitted reader subtree",
		);
	return {
		html: output.join(""),
		report: Object.freeze({
			...report,
			omittedSubtrees: Object.freeze(omittedSubtrees),
		}),
	};
}

function htmlEncoding(bytes: Uint8Array) {
	const tokenizer = new HtmlTokenizer(
		String.fromCharCode(...bytes.subarray(0, 1024)),
		() => {},
	);
	try {
		for (let token = tokenizer.next(); token; token = tokenizer.next()) {
			if (token.kind !== "start") continue;
			if (rawTags.has(token.name)) tokenizer.raw(token.name);
			if (token.name !== "meta") continue;
			const label =
				token.attributes.charset ??
				(token.attributes["http-equiv"]?.toLowerCase() === "content-type"
					? /charset\s*=\s*["']?([^\s;"']+)/i.exec(
							token.attributes.content ?? "",
						)?.[1]
					: undefined);
			if (!label) continue;
			const encoding = new TextDecoder(label).encoding;
			return encoding.startsWith("utf-16") ? "utf-8" : encoding;
		}
	} catch {}
	return "windows-1252";
}

export function loadResearchDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
): DocumentTree {
	if (context.signal.aborted)
		throw new AgentBrowserError("aborted", "Reader aborted");
	const maxSourceCodeUnits = Math.min(
		context.limits.maxTextCodeUnits,
		researchReaderLimits.maxSourceCodeUnits,
	);
	if (response.body.byteLength > maxSourceCodeUnits * 4 + 3)
		throw new AgentBrowserError(
			"resource-limit",
			"Encoded reader limit exceeded",
		);
	const types = response.headers["content-type"];
	if (types?.length !== 1)
		throw new AgentBrowserError("unsupported", "Reader requires Content-Type");
	const html = types[0].split(";", 1)[0].trim().toLowerCase() === "text/html";
	const decoded = decodeResponseText(
		response,
		html ? htmlEncoding(response.body) : "utf-8",
	);
	if (
		decoded.text.length > maxSourceCodeUnits ||
		(!html && decoded.text.length > researchReaderLimits.maxTextCodeUnits)
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Decoded reader limit exceeded",
		);
	const sanitized = sanitizeResearchHtml(
		html ? decoded.text : "",
		{
			maxSourceCodeUnits,
			maxTextCodeUnits: Math.min(
				context.limits.maxTextCodeUnits,
				researchReaderLimits.maxTextCodeUnits,
			),
			maxOutputCodeUnits: maxSourceCodeUnits,
			maxTokens: Math.min(
				context.limits.maxNodes * 8,
				researchReaderLimits.maxTokens,
			),
			maxDepth: Math.min(
				context.limits.maxDepth,
				researchReaderLimits.maxDepth,
			),
		},
		context.signal,
	);
	const inertContext = {
		limits: context.limits,
		signal: context.signal,
		initializeDocument: context.initializeDocument,
	};
	const tree = html
		? parseHtmlDocument(
				sanitized.html,
				parseNetworkUrl(response.url).href,
				inertContext,
			)
		: loadTextDocument(response, { ...inertContext, tabId: context.tabId });
	const report = Object.freeze({
		...sanitized.report,
		encoding: decoded.encoding,
		...(!html
			? {
					sourceCodeUnits: decoded.text.length,
					textCodeUnits: decoded.text.length,
				}
			: {}),
	});
	setResearchReaderInfo(tree, report);
	const info = htmlParseInfo(tree);
	if (info) setHtmlParseInfo(tree, { ...info, encoding: decoded.encoding });
	return tree;
}
