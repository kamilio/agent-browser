import type { DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { htmlEncoding } from "./html-encoding.js";
import { isHtmlSpecial } from "./html-formatting.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type HtmlDiscardRawName,
	HtmlTokenizer,
	htmlRawDiscardWindowCodeUnits,
} from "./html-tokenizer.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
	validateResearchDocumentProfile,
} from "./research-admission.js";
import {
	type ResearchReaderRawPolicy,
	type ResearchReaderReport,
	researchReaderProfile,
	setResearchReaderInfo,
	validateResearchReaderRawPolicy,
} from "./research-reader-info.js";
import {
	type ResourceLimitKind,
	resourceLimitError,
} from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";
import { isTableSourceAttribute } from "./table-source.js";
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

export const researchReaderRawLimits = Object.freeze({
	maxWorkUnits: 32_000_000,
	maxWindowCodeUnits: htmlRawDiscardWindowCodeUnits,
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
	"html head body title base a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup dd del dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p pre q rp rt ruby s samp section small span strong sub sup table tbody td tfoot th thead time tr u ul var wbr".split(
		" ",
	),
);
const blockReplacements = new Set(
	"form details summary dialog fieldset legend center search".split(" "),
);
const reconstructableFormatting = new Set(
	"a b big code em font i nobr s small strike strong tt u".split(" "),
);
const tableCells = new Set(["td", "th"]);
const tableSections = new Set(["tbody", "thead", "tfoot"]);
const listContainers = new Set(["ul", "ol", "menu"]);

function discardableRaw(name: string): name is HtmlDiscardRawName {
	return (
		name === "script" ||
		name === "style" ||
		name === "xmp" ||
		name === "iframe" ||
		name === "noembed" ||
		name === "noframes"
	);
}

function closeImpliedTableEnds(open: string[], name: string) {
	if (open.at(-1) === "colgroup" && open.at(-2) === "table") open.pop();
	if (!tableCells.has(name) && name !== "tr" && !tableSections.has(name))
		return;
	let index = open.length;
	while (
		index > 0 &&
		!tableCells.has(open[index - 1]) &&
		open[index - 1] !== "tr" &&
		!tableSections.has(open[index - 1]) &&
		!["table", "caption", "colgroup"].includes(open[index - 1])
	)
		index--;
	const cell = tableCells.has(open[index - 1]) ? --index : undefined;
	const row = open[index - 1] === "tr" ? --index : undefined;
	const section = tableSections.has(open[index - 1]) ? --index : undefined;
	if (open[index - 1] !== "table") return;
	if (tableCells.has(name)) {
		if (cell !== undefined) open.length = cell;
	} else if (name === "tr") {
		open.length = row ?? cell ?? open.length;
	} else {
		open.length = section ?? row ?? cell ?? open.length;
	}
}

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
	profile?: ResearchDocumentProfileId,
	rawPolicy?: ResearchReaderRawPolicy,
) {
	const selectedRawPolicy = validateResearchReaderRawPolicy(rawPolicy);
	const readerLimits =
		validateResearchDocumentProfile(profile) === "long-v1"
			? researchLongDocumentAdmission.reader
			: researchReaderLimits;
	const limits = { ...readerLimits, ...options };
	for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
		if (
			!Number.isSafeInteger(limits[name]) ||
			limits[name] < 1 ||
			limits[name] > readerLimits[name]
		)
			throw new AgentBrowserError("invalid-input", "Invalid reader limit");
	}
	const check = (kind?: ResourceLimitKind, limit = 0, observed = 0) => {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Reader aborted");
		if (kind !== undefined && observed > limit)
			throw resourceLimitError(kind, limit, observed, "Reader budget exceeded");
	};
	check("reader.source", limits.maxSourceCodeUnits, source.length);
	const omittedSubtrees: Record<string, number> = Object.create(null);
	const omittedRaw = selectedRawPolicy
		? {
				codeUnits: 0,
				workUnits: 0,
				steps: 0,
				elements: 0,
				...researchReaderRawLimits,
			}
		: undefined;
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
		...(selectedRawPolicy ? { rawTextPolicy: selectedRawPolicy } : {}),
	};
	let tokenStart = 0;
	const tokenizer = new HtmlTokenizer(source, (issue) => {
		report.tokenizerIssues++;
		const emptyProcessingMarker =
			issue === "bogus-declaration" &&
			tokenizer.position === tokenStart + 3 &&
			source.startsWith("<?>", tokenStart);
		if (
			issue.startsWith("unterminated-") ||
			issue === "eof-before-tag-name" ||
			issue === "cdata-in-html-content" ||
			(issue === "bogus-declaration" && !emptyProcessingMarker)
		)
			throw new AgentBrowserError("unsupported", "Malformed reader input");
	});
	const nextToken = () => {
		tokenStart = tokenizer.position;
		return tokenizer.next();
	};
	const output: string[] = [];
	const skipped: string[] = [];
	const open: string[] = [];
	const emit = (value: string) => {
		report.outputCodeUnits += value.length;
		check("reader.output", limits.maxOutputCodeUnits, report.outputCodeUnits);
		output.push(value);
	};
	const text = (value: string, omit: boolean) => {
		report.textCodeUnits += value.length;
		check("reader.text", limits.maxTextCodeUnits, report.textCodeUnits);
		if (!omit) emit(escapeHtml(value));
	};
	const omitRaw = (name: string) => {
		if (omittedRaw && discardableRaw(name)) {
			const discarded = tokenizer.discardRaw(name, (units) => {
				omittedRaw.workUnits += units;
				check(
					"reader.omitted-work",
					omittedRaw.maxWorkUnits,
					omittedRaw.workUnits,
				);
			});
			omittedRaw.codeUnits += discarded.discardedCodeUnits;
			omittedRaw.steps += discarded.steps;
			omittedRaw.elements++;
		} else text(tokenizer.raw(name) ?? "", true);
	};
	for (let token = nextToken(); token; token = nextToken()) {
		check("reader.tokens", limits.maxTokens, ++report.tokens);
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
			if (
				skipped.at(-1) === "li" &&
				listContainers.has(skipped.at(-2) ?? "") &&
				((token.kind === "start" && name === "li") ||
					(token.kind === "end" && name === skipped.at(-2))) &&
				!skipped.some((ancestor) => ancestor === "svg" || ancestor === "math")
			)
				skipped.pop();
			if (token.kind === "end") {
				if (skipped[skipped.length - 1] !== name)
					throw new AgentBrowserError(
						"unsupported",
						"Malformed omitted reader subtree",
					);
				skipped.pop();
			} else if (!token.selfClosing && !voidTags.has(name)) {
				skipped.push(name);
				check("reader.depth", limits.maxDepth, skipped.length);
				if (rawTags.has(name)) omitRaw(name);
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
					if (rawTags.has(name)) omitRaw(name);
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
			closeImpliedTableEnds(open, name);
			if (name === "dt" || name === "dd") {
				for (let index = open.length - 1; index >= 0; index--) {
					const current = open[index];
					if (current === "dt" || current === "dd") {
						open.length = index;
						break;
					}
					if (
						reconstructableFormatting.has(current) ||
						(isHtmlSpecial(current) &&
							!["address", "div", "p"].includes(current))
					)
						break;
				}
				if (open.at(-1) === "p") open.pop();
			}
			if ((name === "p" || name === "li") && open.at(-1) === "p") open.pop();
			if (name === "li" && open.at(-1) === "li") open.pop();
			open.push(name);
			check("reader.depth", limits.maxDepth, open.length);
		}
		if (!outputName) report.unwrappedElements++;
		let attributes = "";
		for (const [attribute, value] of Object.entries(token.attributes)) {
			let keep =
				attribute === "id" ||
				(outputName === "a" && ["href", "title", "name"].includes(attribute)) ||
				(outputName === "base" && attribute === "href") ||
				(outputName === "img" && attribute === "alt") ||
				(outputName === "ol" && attribute === "start") ||
				(outputName !== undefined &&
					isTableSourceAttribute(outputName, attribute));
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
		else if (attributes) emit(`<span${attributes}></span>`);
		if (rawTags.has(name))
			text(tokenizer.raw(name, name === "title") ?? "", false);
		else if (name === "plaintext") text(tokenizer.remainder(), false);
	}
	check();
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
			...(omittedRaw ? { omittedRaw: Object.freeze({ ...omittedRaw }) } : {}),
		}),
	};
}

function longDocumentLimits(limits: Readonly<DocumentLimits>): DocumentLimits {
	if (limits === null || typeof limits !== "object")
		throw new AgentBrowserError("invalid-input", "Invalid document limit");
	const selected = {
		maxNodes: limits.maxNodes,
		maxDepth: limits.maxDepth,
		maxTextCodeUnits: limits.maxTextCodeUnits,
		maxChanges: limits.maxChanges,
	};
	for (const name of Object.keys(selected) as (keyof DocumentLimits)[]) {
		if (!Number.isSafeInteger(selected[name]) || selected[name] < 1)
			throw new AgentBrowserError("invalid-input", "Invalid document limit");
		selected[name] = Math.min(
			selected[name],
			researchLongDocumentAdmission.document[name],
		);
	}
	return selected;
}

export function loadResearchDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
	profile?: ResearchDocumentProfileId,
	rawPolicy?: ResearchReaderRawPolicy,
): DocumentTree {
	const selectedRawPolicy = validateResearchReaderRawPolicy(rawPolicy);
	const selectedProfile = validateResearchDocumentProfile(profile);
	const readerLimits =
		selectedProfile === "long-v1"
			? researchLongDocumentAdmission.reader
			: researchReaderLimits;
	if (context.signal.aborted)
		throw new AgentBrowserError("aborted", "Reader aborted");
	const selectedLimits =
		selectedProfile === "long-v1"
			? longDocumentLimits(context.limits)
			: undefined;
	const maxSourceCodeUnits = Math.min(
		(selectedLimits ?? context.limits).maxTextCodeUnits,
		readerLimits.maxSourceCodeUnits,
	);
	if (response.body.byteLength > maxSourceCodeUnits * 4 + 3)
		throw resourceLimitError(
			"reader.encoded",
			maxSourceCodeUnits * 4 + 3,
			response.body.byteLength,
			"Encoded reader limit exceeded",
		);
	const types = response.headers["content-type"];
	if (types?.length !== 1)
		throw new AgentBrowserError("unsupported", "Reader requires Content-Type");
	const html = types[0].split(";", 1)[0].trim().toLowerCase() === "text/html";
	if (selectedProfile === "long-v1" && !html)
		throw new AgentBrowserError(
			"unsupported",
			"Long reader requires text/html",
		);
	const decoded = decodeResponseText(
		response,
		html ? htmlEncoding(response.body) : "utf-8",
	);
	if (
		decoded.text.length > maxSourceCodeUnits ||
		(!html && decoded.text.length > readerLimits.maxTextCodeUnits)
	)
		throw resourceLimitError(
			"reader.decoded",
			html
				? maxSourceCodeUnits
				: Math.min(maxSourceCodeUnits, readerLimits.maxTextCodeUnits),
			decoded.text.length,
			"Decoded reader limit exceeded",
		);
	const sanitized = sanitizeResearchHtml(
		html ? decoded.text : "",
		{
			maxSourceCodeUnits,
			maxTextCodeUnits: Math.min(
				(selectedLimits ?? context.limits).maxTextCodeUnits,
				readerLimits.maxTextCodeUnits,
			),
			maxOutputCodeUnits: Math.min(
				(selectedLimits ?? context.limits).maxTextCodeUnits,
				readerLimits.maxOutputCodeUnits,
			),
			maxTokens: Math.min(
				(selectedLimits ?? context.limits).maxNodes * 8,
				readerLimits.maxTokens,
			),
			maxDepth: Math.min(
				(selectedLimits ?? context.limits).maxDepth,
				readerLimits.maxDepth,
			),
		},
		context.signal,
		selectedProfile,
		selectedRawPolicy,
	);
	const inertContext = {
		limits: selectedLimits ?? context.limits,
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
