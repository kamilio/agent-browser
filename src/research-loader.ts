import { sourceAlternateLink } from "./document-alternates.js";
import { sourceFeedLink } from "./document-feeds.js";
import {
	ariaTableSourceRole,
	isAriaTableSourceAttribute,
} from "./aria-table-source.js";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { descriptionMeta } from "./document-descriptions.js";
import { isDateTimeSourceTag } from "./date-time-source.js";
import { AgentBrowserError } from "./errors.js";
import { htmlEncoding } from "./html-encoding.js";
import { isHtmlScopeBoundary, isHtmlSpecial } from "./html-formatting.js";
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
import { sourceInlineDisplayHidden } from "./research-inline-visibility.js";
import {
	ResearchSourceAccessCollector,
	setResearchSourceAccess,
} from "./research-source-access.js";
import {
	type TargetProductRoute,
	ResearchSourceProductsCollector,
	setResearchSourceProducts,
	targetProductRoute,
} from "./research-source-products.js";
import {
	type YoutubeSearchRoute,
	ResearchSourceVideosCollector,
	setResearchSourceVideos,
	youtubeSearchRoute,
} from "./research-source-videos.js";
import {
	type ResearchReaderMimePolicy,
	markdownHtmlDocumentPrefix,
	validateResearchReaderMimePolicy,
} from "./research-mime-policy.js";
import {
	ResearchSourceDataTableCollector,
	setResearchSourceDataTables,
} from "./research-source-data-tables.js";
import {
	type InfogramChartRoute,
	ResearchSourceChartTableCollector,
	infogramChartRoute,
	setResearchSourceChartTables,
} from "./research-source-chart-tables.js";
import {
	type RtingsReviewRoute,
	ResearchSourceReviewsCollector,
	rtingsReviewRoute,
	setResearchSourceReviews,
} from "./research-source-reviews.js";
import {
	type ResearchReaderFallbackEncoding,
	type ResearchReaderRawPolicy,
	type ResearchReaderReport,
	type ResearchReaderVisibilityPolicy,
	researchReaderHiddenContentSemantics,
	researchReaderProfile,
	setResearchReaderInfo,
	validateResearchReaderFallbackEncoding,
	validateResearchReaderRawPolicy,
	validateResearchReaderVisibilityPolicy,
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
const unwrappedControlBoundaries = new Set(["select", "optgroup", "option"]);
const reconstructableFormatting = new Set(
	"a b big code em font i nobr s small strike strong tt u".split(" "),
);
const tableCells = new Set(["td", "th"]);
const tableSections = new Set(["tbody", "thead", "tfoot"]);
const listContainers = new Set(["ul", "ol", "menu"]);
const paragraphClosers = new Set(
	"address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol p pre search section table ul dd dt".split(
		" ",
	),
);
const sourceHiddenBlockEnds = new Set(
	"address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer header hgroup listing main menu nav ol pre search section summary ul".split(
		" ",
	),
);

function closeSourceHiddenBlockEnd(
	skipped: string[],
	open: string[],
	name: string,
) {
	if (
		!sourceHiddenBlockEnds.has(name) ||
		open.some((ancestor) => ancestor === "svg" || ancestor === "math") ||
		skipped.some((ancestor) => ancestor === "svg" || ancestor === "math")
	)
		return;
	for (let index = skipped.length - 1; index >= 0; index--) {
		const ancestor = skipped[index];
		if (ancestor === name) {
			skipped.length = index + 1;
			return;
		}
		if (
			ancestor === "body" ||
			ancestor === "form" ||
			isHtmlScopeBoundary(ancestor) ||
			reconstructableFormatting.has(ancestor)
		)
			return;
	}
}

function closeSourceHiddenImpliedEnds(
	skipped: string[],
	open: string[],
	name: string,
	start: boolean,
) {
	if (skipped.some((ancestor) => ancestor === "svg" || ancestor === "math"))
		return;
	const parent = () => skipped.at(-2) ?? open.at(-1);
	if (
		skipped.at(-1) === "p" &&
		((start && paragraphClosers.has(name)) || (!start && name === parent()))
	)
		skipped.pop();
	if (
		skipped.at(-1) === "li" &&
		((start && name === "li") ||
			(!start && listContainers.has(name) && name === parent()))
	)
		skipped.pop();
}

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
		.replace(/"/g, "&quot;")
		.replace(/\r/g, "&#13;");
}

export function sanitizeResearchHtml(
	source: string,
	options: Partial<ResearchReaderLimits> = {},
	signal?: AbortSignal,
	profile?: ResearchDocumentProfileId,
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	productRoute?: TargetProductRoute,
	videoRoute?: YoutubeSearchRoute,
	chartRoute?: InfogramChartRoute,
	reviewRoute?: RtingsReviewRoute,
) {
	const selectedRawPolicy = validateResearchReaderRawPolicy(rawPolicy);
	const selectedVisibilityPolicy =
		validateResearchReaderVisibilityPolicy(visibilityPolicy);
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
	const mathAlternatives = { elements: 0, codeUnits: 0 };
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
		...(selectedVisibilityPolicy
			? {
					visibilityPolicy: selectedVisibilityPolicy,
					sourceHiddenSubtrees: 0,
					hiddenContentSemantics: researchReaderHiddenContentSemantics(
						selectedVisibilityPolicy,
					),
				}
			: {}),
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
	const normalizedSource = source.replace(/\r\n?/g, "\n");
	const tokenizer = new HtmlTokenizer(normalizedSource, (issue) => {
		report.tokenizerIssues++;
		const emptyProcessingMarker =
			issue === "bogus-declaration" &&
			tokenizer.position === tokenStart + 3 &&
			normalizedSource.startsWith("<?>", tokenStart);
		const boundedXmlDeclaration =
			issue === "bogus-declaration" &&
			tokenizer.position - tokenStart <= 256 &&
			/^<\?xml[ \t\n]+version[ \t\n]*=[ \t\n]*(["'])1\.[01]\1(?:[ \t\n]+encoding[ \t\n]*=[ \t\n]*(["'])[A-Za-z][A-Za-z0-9._-]*\2)?(?:[ \t\n]+standalone[ \t\n]*=[ \t\n]*(["'])(?:yes|no)\3)?[ \t\n]*\?>$/.test(
				normalizedSource.slice(tokenStart, tokenizer.position),
			);
		if (
			issue.startsWith("unterminated-") ||
			issue === "eof-before-tag-name" ||
			issue === "cdata-in-html-content" ||
			(issue === "bogus-declaration" &&
				!emptyProcessingMarker &&
				!boundedXmlDeclaration)
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
	let sourceHiddenOmission = false;
	let legacyOmittedDepth = 0;
	let sourceTables: ResearchSourceDataTableCollector | undefined;
	let sourceAccess: ResearchSourceAccessCollector | undefined;
	let sourceProducts: ResearchSourceProductsCollector | undefined;
	let sourceVideos: ResearchSourceVideosCollector | undefined;
	let sourceCharts: ResearchSourceChartTableCollector | undefined;
	let sourceReviews: ResearchSourceReviewsCollector | undefined;
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
	const omitRaw = (name: string, entities = false) => {
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
		} else
			text(
				(entities ? tokenizer.raw(name, true) : tokenizer.raw(name)) ?? "",
				true,
			);
	};
	for (let token = nextToken(); token; token = nextToken()) {
		check("reader.tokens", limits.maxTokens, ++report.tokens);
		if (
			sourceHiddenOmission &&
			(token.kind === "start" || token.kind === "end")
		) {
			closeSourceHiddenImpliedEnds(
				skipped,
				open,
				token.name,
				token.kind === "start",
			);
			if (skipped.length < legacyOmittedDepth) legacyOmittedDepth = 0;
			if (!skipped.length) sourceHiddenOmission = false;
		}
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
		if (omitting && sourceHiddenOmission) {
			if (token.kind === "end") {
				if (
					name === "p" &&
					![...open, ...skipped].some(
						(ancestor) =>
							ancestor === "p" || ancestor === "svg" || ancestor === "math",
					)
				)
					continue;
				if (skipped.at(-1) !== name && legacyOmittedDepth === 0)
					closeSourceHiddenBlockEnd(skipped, open, name);
				if (skipped.at(-1) !== name)
					throw new AgentBrowserError(
						"unsupported",
						"Malformed source-hidden reader subtree",
					);
				skipped.pop();
				if (skipped.length < legacyOmittedDepth) legacyOmittedDepth = 0;
				if (!skipped.length) sourceHiddenOmission = false;
			} else {
				if (legacyOmittedDepth === 0) {
					const alternative =
						name === "math" ? token.attributes.alttext : undefined;
					if (alternative?.trim()) text(alternative, true);
					const description =
						name === "meta" &&
						[...open, ...skipped].every(
							(ancestor) => ancestor === "html" || ancestor === "head",
						)
							? descriptionMeta(token.attributes)
							: undefined;
					if (description) text(description.content, true);
				}
				const foreignEmpty =
					token.selfClosing &&
					(["svg", "math"].includes(name) ||
						skipped.some(
							(ancestor) => ancestor === "svg" || ancestor === "math",
						));
				if (!voidTags.has(name) && !foreignEmpty) {
					skipped.push(name);
					if (legacyOmittedDepth === 0 && omittedTags.has(name))
						legacyOmittedDepth = skipped.length;
					check("reader.depth", limits.maxDepth, open.length + skipped.length);
					if (rawTags.has(name))
						omitRaw(name, name === "title" && legacyOmittedDepth === 0);
					else if (name === "plaintext") text(tokenizer.remainder(), true);
				}
			}
			continue;
		}
		if (omitting) {
			if (
				token.kind === "start" &&
				name === "p" &&
				skipped.at(-1) === "p" &&
				!skipped.some((ancestor) => ancestor === "svg" || ancestor === "math")
			)
				skipped.pop();
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
		const sourceHidden =
			selectedVisibilityPolicy !== undefined &&
			token.kind === "start" &&
			(Object.hasOwn(token.attributes, "hidden") ||
				token.attributes["aria-hidden"]?.toLowerCase() === "true" ||
				(selectedVisibilityPolicy === "source-hidden-inline-v1" &&
					sourceInlineDisplayHidden(token.attributes.style)));
		const alternate =
			token.kind === "start" &&
			name === "link" &&
			open.every((ancestor) => ancestor === "html" || ancestor === "head")
				? (sourceAlternateLink(token.attributes) ??
					sourceFeedLink(token.attributes))
				: undefined;
		if (alternate && !sourceHidden) {
			emit(
				`<link rel="alternate" type="${alternate.type}" href="${escapeHtml(alternate.href)}">`,
			);
			report.ignoredAttributes += Object.keys(token.attributes).length - 3;
			continue;
		}
		const description =
			token.kind === "start" &&
			name === "meta" &&
			open.every((ancestor) => ancestor === "html" || ancestor === "head")
				? descriptionMeta(token.attributes)
				: undefined;
		if (description && !sourceHidden) {
			report.textCodeUnits += description.content.length;
			check("reader.text", limits.maxTextCodeUnits, report.textCodeUnits);
			emit(
				`<meta ${description.attribute}="${description.name}" content="${escapeHtml(description.content)}">`,
			);
			report.ignoredAttributes += Object.keys(token.attributes).length - 2;
			continue;
		}
		if (sourceHidden || omittedTags.has(name)) {
			report.omittedTokens++;
			if (token.kind === "start") {
				if (sourceHidden) {
					report.sourceHiddenSubtrees = (report.sourceHiddenSubtrees ?? 0) + 1;
					if (description) text(description.content, true);
				}
				omittedSubtrees[name] = (omittedSubtrees[name] ?? 0) + 1;
				const alternative =
					name === "math" && Object.hasOwn(token.attributes, "alttext")
						? token.attributes.alttext
						: undefined;
				if (alternative?.trim()) {
					if (!sourceHidden) emit("<code>MathML source: ");
					text(alternative, sourceHidden);
					if (!sourceHidden) {
						emit("</code>");
						mathAlternatives.elements++;
						mathAlternatives.codeUnits += alternative.length;
					}
				}
				const foreignEmpty =
					token.selfClosing && ["svg", "math"].includes(name);
				if (sourceHidden && name === "plaintext") {
					check("reader.depth", limits.maxDepth, open.length + 1);
					text(tokenizer.remainder(), true);
				} else if (!voidTags.has(name) && !foreignEmpty) {
					skipped.push(name);
					if (sourceHidden) {
						sourceHiddenOmission = true;
						legacyOmittedDepth = omittedTags.has(name) ? skipped.length : 0;
						check(
							"reader.depth",
							limits.maxDepth,
							open.length + skipped.length,
						);
					}
					if (rawTags.has(name)) {
						const rawStart = tokenizer.position;
						omitRaw(name, sourceHidden && name === "title");
						if (
							name === "script" &&
							!sourceHidden &&
							token.attributes.type?.trim().toLowerCase() ===
								"application/ld+json"
						) {
							sourceAccess ??= new ResearchSourceAccessCollector();
							sourceAccess.add(
								normalizedSource,
								rawStart,
								tokenizer.position,
								tokenStart,
							);
						}
						if (
							productRoute !== undefined &&
							name === "script" &&
							!sourceHidden &&
							!open.includes("noscript") &&
							token.attributes.id === "__NEXT_DATA__" &&
							token.attributes.type?.trim().toLowerCase() ===
								"application/json" &&
							!Object.hasOwn(token.attributes, "src")
						) {
							sourceProducts ??= new ResearchSourceProductsCollector(
								productRoute,
							);
							sourceProducts.add(
								normalizedSource,
								rawStart,
								tokenizer.position,
								tokenStart,
							);
						}
						if (
							videoRoute !== undefined &&
							name === "script" &&
							!sourceHidden &&
							!open.includes("noscript") &&
							!Object.hasOwn(token.attributes, "src") &&
							["", "text/javascript", "application/javascript"].includes(
								token.attributes.type?.trim().toLowerCase() ?? "",
							)
						) {
							sourceVideos ??= new ResearchSourceVideosCollector(videoRoute);
							sourceVideos.add(
								normalizedSource,
								rawStart,
								tokenizer.position,
								tokenStart,
							);
						}
						if (
							chartRoute !== undefined &&
							name === "script" &&
							!sourceHidden &&
							!open.includes("noscript") &&
							!Object.hasOwn(token.attributes, "src") &&
							["", "text/javascript", "application/javascript"].includes(
								token.attributes.type?.trim().toLowerCase() ?? "",
							)
						) {
							sourceCharts ??= new ResearchSourceChartTableCollector(
								chartRoute,
							);
							sourceCharts.add(
								normalizedSource,
								rawStart,
								tokenizer.position,
								tokenStart,
							);
						}
					}
				}
			}
			continue;
		}
		if (
			token.kind === "start" &&
			Object.hasOwn(token.attributes, "data-json")
		) {
			sourceTables ??= new ResearchSourceDataTableCollector();
			sourceTables.add(name, token.attributes, tokenStart);
		}
		if (
			reviewRoute !== undefined &&
			token.kind === "start" &&
			name === "div" &&
			token.attributes["data-vue"] === "ProductVuePage" &&
			!open.includes("noscript")
		) {
			sourceReviews ??= new ResearchSourceReviewsCollector(reviewRoute);
			sourceReviews.add(token.attributes["data-props"], tokenStart);
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
			if (index >= 0) {
				open.length = index;
				if (unwrappedControlBoundaries.has(name)) emit(" ");
			}
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
		if (!outputName) {
			report.unwrappedElements++;
			if (unwrappedControlBoundaries.has(name)) emit(" ");
		}
		const ariaTableRole =
			outputName === name ? ariaTableSourceRole(token.attributes) : undefined;
		const namedRole =
			outputName === name &&
			Object.hasOwn(token.attributes, "role") &&
			token.attributes.role.trim().length > 0;
		let attributes = "";
		for (const [attribute, value] of Object.entries(token.attributes)) {
			let keep =
				attribute === "id" ||
				(outputName === name &&
					(attribute === "class" || attribute === "role")) ||
				(outputName === "a" &&
					(["href", "title", "name"].includes(attribute) ||
						(attribute === "data-nosnippet" && value === ""))) ||
				((outputName === "a" || namedRole) &&
					(attribute === "aria-label" || attribute === "aria-labelledby") &&
					value.length <= 8192) ||
				(outputName === "base" && attribute === "href") ||
				(outputName === "img" && attribute === "alt") ||
				(outputName === "ol" && attribute === "start") ||
				(outputName === name &&
					isDateTimeSourceTag(name) &&
					attribute === "datetime") ||
				(ariaTableRole !== undefined &&
					isAriaTableSourceAttribute(ariaTableRole, attribute)) ||
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
	const sourceDataTables = sourceTables?.finish();
	const access = sourceAccess?.finish();
	const products = sourceProducts?.finish();
	const videos = sourceVideos?.finish();
	const sourceChartTables = sourceCharts?.finish();
	const reviews = sourceReviews?.finish();
	return {
		html: output.join(""),
		...(sourceDataTables ? { sourceDataTables } : {}),
		...(access ? { sourceAccess: access } : {}),
		...(products ? { sourceProducts: products } : {}),
		...(videos ? { sourceVideos: videos } : {}),
		...(sourceChartTables ? { sourceChartTables } : {}),
		...(reviews ? { sourceReviews: reviews } : {}),
		report: Object.freeze({
			...report,
			...(mathAlternatives.elements
				? { mathAlternatives: Object.freeze(mathAlternatives) }
				: {}),
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
	visibilityPolicy: ResearchReaderVisibilityPolicy | undefined = undefined,
	mimePolicy?: ResearchReaderMimePolicy,
	fallbackEncoding?: ResearchReaderFallbackEncoding,
): DocumentTree {
	const selectedFallbackEncoding =
		validateResearchReaderFallbackEncoding(fallbackEncoding);
	const selectedRawPolicy = validateResearchReaderRawPolicy(rawPolicy);
	const selectedVisibilityPolicy =
		validateResearchReaderVisibilityPolicy(visibilityPolicy);
	const selectedProfile = validateResearchDocumentProfile(profile);
	const selectedMimePolicy = validateResearchReaderMimePolicy(mimePolicy);
	if (selectedMimePolicy !== undefined && selectedProfile !== "default")
		throw new AgentBrowserError(
			"invalid-input",
			"Reader MIME interpretation requires the default profile",
		);
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
	const declaredMime = types[0].split(";", 1)[0].trim().toLowerCase();
	const html = declaredMime === "text/html";
	if (selectedProfile === "long-v1" && !html)
		throw new AgentBrowserError(
			"unsupported",
			"Long reader requires text/html",
		);
	const decoded = decodeResponseText(
		response,
		html ? htmlEncoding(response.body, selectedFallbackEncoding) : "utf-8",
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
	const prefixCodeUnits =
		selectedMimePolicy !== undefined && declaredMime === "text/markdown"
			? markdownHtmlDocumentPrefix(decoded.text)
			: undefined;
	const mimeInterpretation =
		prefixCodeUnits === undefined || selectedMimePolicy === undefined
			? undefined
			: Object.freeze({
					policy: selectedMimePolicy,
					declaredMime: "text/markdown" as const,
					effectiveMime: "text/html" as const,
					basis: "html5-doctype-root-prefix" as const,
					prefixCodeUnits,
				});
	const effectiveHtml = html || mimeInterpretation !== undefined;
	const productRoute = effectiveHtml
		? targetProductRoute(response.url)
		: undefined;
	const videoRoute = effectiveHtml
		? youtubeSearchRoute(response.url)
		: undefined;
	const chartRoute = effectiveHtml
		? infogramChartRoute(response.url)
		: undefined;
	const reviewRoute = effectiveHtml
		? rtingsReviewRoute(response.url)
		: undefined;
	const visibilityArguments: [
		ResearchReaderVisibilityPolicy?,
		TargetProductRoute?,
		YoutubeSearchRoute?,
		InfogramChartRoute?,
		RtingsReviewRoute?,
	] =
		reviewRoute !== undefined
			? [
					selectedVisibilityPolicy,
					productRoute,
					videoRoute,
					chartRoute,
					reviewRoute,
				]
			: chartRoute !== undefined
				? [selectedVisibilityPolicy, productRoute, videoRoute, chartRoute]
				: videoRoute !== undefined
					? [selectedVisibilityPolicy, productRoute, videoRoute]
					: productRoute !== undefined
						? [selectedVisibilityPolicy, productRoute]
						: selectedVisibilityPolicy
							? [selectedVisibilityPolicy]
							: [];
	const sanitized = sanitizeResearchHtml(
		effectiveHtml ? decoded.text : "",
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
		...visibilityArguments,
	);
	const inertContext = {
		limits: selectedLimits ?? context.limits,
		signal: context.signal,
		initializeDocument: context.initializeDocument,
	};
	const tree = effectiveHtml
		? parseHtmlDocument(
				sanitized.html,
				parseNetworkUrl(response.url).href,
				inertContext,
			)
		: loadTextDocument(response, { ...inertContext, tabId: context.tabId });
	const report = Object.freeze({
		...sanitized.report,
		encoding: decoded.encoding,
		...(selectedFallbackEncoding === undefined
			? {}
			: { fallbackEncoding: selectedFallbackEncoding }),
		...(mimeInterpretation
			? { mimePolicy: selectedMimePolicy, mimeInterpretation }
			: {}),
		...(!effectiveHtml
			? {
					hiddenContentSemantics: false as const,
					sourceCodeUnits: decoded.text.length,
					textCodeUnits: decoded.text.length,
				}
			: {}),
	});
	setResearchReaderInfo(tree, report);
	if (sanitized.sourceDataTables)
		setResearchSourceDataTables(tree, sanitized.sourceDataTables);
	if (effectiveHtml && sanitized.sourceAccess)
		setResearchSourceAccess(tree, sanitized.sourceAccess);
	if (effectiveHtml && sanitized.sourceProducts)
		setResearchSourceProducts(tree, sanitized.sourceProducts);
	if (effectiveHtml && sanitized.sourceVideos)
		setResearchSourceVideos(tree, sanitized.sourceVideos);
	if (effectiveHtml && sanitized.sourceChartTables)
		setResearchSourceChartTables(tree, sanitized.sourceChartTables);
	if (effectiveHtml && sanitized.sourceReviews)
		setResearchSourceReviews(tree, sanitized.sourceReviews);
	const info = htmlParseInfo(tree);
	if (info) setHtmlParseInfo(tree, { ...info, encoding: decoded.encoding });
	return tree;
}
