import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
	xlinkNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import {
	createHtmlAttributes,
	htmlAttributeEntries,
	setHtmlAttribute,
} from "./html-attributes.js";
import type { HtmlParserNode } from "./html-formatting.js";
import type { HtmlToken } from "./html-tokenizer.js";

const breakout = new Set(
	"b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var".split(
		" ",
	),
);
const svgNames = new Map(
	[
		"altGlyph",
		"altGlyphDef",
		"altGlyphItem",
		"animateColor",
		"animateMotion",
		"animateTransform",
		"clipPath",
		"feBlend",
		"feColorMatrix",
		"feComponentTransfer",
		"feComposite",
		"feConvolveMatrix",
		"feDiffuseLighting",
		"feDisplacementMap",
		"feDistantLight",
		"feDropShadow",
		"feFlood",
		"feFuncA",
		"feFuncB",
		"feFuncG",
		"feFuncR",
		"feGaussianBlur",
		"feImage",
		"feMerge",
		"feMergeNode",
		"feMorphology",
		"feOffset",
		"fePointLight",
		"feSpecularLighting",
		"feSpotLight",
		"feTile",
		"feTurbulence",
		"foreignObject",
		"glyphRef",
		"linearGradient",
		"radialGradient",
		"textPath",
	].map((name) => [name.toLowerCase(), name]),
);
const svgAttributes = new Map(
	[
		"attributeName",
		"attributeType",
		"baseFrequency",
		"baseProfile",
		"calcMode",
		"clipPathUnits",
		"diffuseConstant",
		"edgeMode",
		"filterUnits",
		"glyphRef",
		"gradientTransform",
		"gradientUnits",
		"kernelMatrix",
		"kernelUnitLength",
		"keyPoints",
		"keySplines",
		"keyTimes",
		"lengthAdjust",
		"limitingConeAngle",
		"markerHeight",
		"markerUnits",
		"markerWidth",
		"maskContentUnits",
		"maskUnits",
		"numOctaves",
		"pathLength",
		"patternContentUnits",
		"patternTransform",
		"patternUnits",
		"pointsAtX",
		"pointsAtY",
		"pointsAtZ",
		"preserveAlpha",
		"preserveAspectRatio",
		"primitiveUnits",
		"refX",
		"refY",
		"repeatCount",
		"repeatDur",
		"requiredExtensions",
		"requiredFeatures",
		"specularConstant",
		"specularExponent",
		"spreadMethod",
		"startOffset",
		"stdDeviation",
		"stitchTiles",
		"surfaceScale",
		"systemLanguage",
		"tableValues",
		"targetX",
		"targetY",
		"textLength",
		"viewBox",
		"viewTarget",
		"xChannelSelector",
		"yChannelSelector",
		"zoomAndPan",
	].map((name) => [name.toLowerCase(), name]),
);

export interface HtmlForeignContext {
	tagName: string;
	namespaceURI?: string;
	attributes?: Readonly<Record<string, string>>;
}

export function foreignName(name: string, namespaceURI: string): string {
	return namespaceURI === svgNamespace ? (svgNames.get(name) ?? name) : name;
}

export function foreignAttributes(
	attributes: Record<string, string>,
	namespaceURI: string,
	issue?: (code: string) => void,
): Record<string, string> {
	if (Object.hasOwn(attributes, "xmlns") && attributes.xmlns !== namespaceURI)
		issue?.("foreign-namespace-mismatch");
	if (
		Object.hasOwn(attributes, "xmlns:xlink") &&
		attributes["xmlns:xlink"] !== xlinkNamespace
	)
		issue?.("foreign-namespace-mismatch");
	const adjusted = createHtmlAttributes();
	for (const [name, value] of htmlAttributeEntries(attributes)) {
		const adjustedName =
			namespaceURI === svgNamespace
				? (svgAttributes.get(name) ?? name)
				: namespaceURI === mathmlNamespace && name === "definitionurl"
					? "definitionURL"
					: name;
		setHtmlAttribute(adjusted, adjustedName, value);
	}
	return adjusted;
}

function mathTextPoint(node: HtmlForeignContext): boolean {
	return (
		elementNamespace(node) === mathmlNamespace &&
		["mi", "mo", "mn", "ms", "mtext"].includes(node.tagName)
	);
}

function htmlPoint(node: HtmlForeignContext): boolean {
	if (elementNamespace(node) === svgNamespace)
		return ["foreignObject", "desc", "title"].includes(node.tagName);
	return (
		elementNamespace(node) === mathmlNamespace &&
		node.tagName === "annotation-xml" &&
		["text/html", "application/xhtml+xml"].includes(
			(node.attributes?.encoding ?? "").replace(/[A-Z]/g, (letter) =>
				letter.toLowerCase(),
			),
		)
	);
}

export class HtmlForeign {
	private work = 0;

	constructor(
		private readonly options: {
			stack(): HtmlParserNode[];
			context?: HtmlForeignContext;
			insert(
				name: string,
				attributes: Record<string, string>,
				namespaceURI: string,
			): HtmlParserNode;
			text(data: string): void;
			issue(code: string): void;
			check(): void;
			maxWork: number;
		},
	) {}

	current(): HtmlForeignContext {
		const stack = this.options.stack();
		return stack.length === 1 && this.options.context
			? this.options.context
			: stack[stack.length - 1].tree.elementInfo(stack[stack.length - 1].id);
	}

	process(token: HtmlToken): boolean {
		const node = this.current();
		const namespaceURI = elementNamespace(node);
		if (namespaceURI === htmlNamespace) return false;
		if (
			(token.kind === "text" || token.kind === "start") &&
			(htmlPoint(node) ||
				(mathTextPoint(node) &&
					(token.kind === "text" ||
						!["mglyph", "malignmark"].includes(token.name))))
		)
			return false;
		if (
			token.kind === "start" &&
			token.name === "svg" &&
			namespaceURI === mathmlNamespace &&
			node.tagName === "annotation-xml"
		)
			return false;
		this.visit();
		if (token.kind === "text") {
			this.options.text(token.data);
			return true;
		}
		if (token.kind === "doctype") {
			this.options.issue("doctype-in-foreign-content");
			return true;
		}
		if (token.kind === "comment") return false;
		const stack = this.options.stack();
		if (
			(token.kind === "start" &&
				(breakout.has(token.name) ||
					(token.name === "font" &&
						["color", "face", "size"].some((name) =>
							Object.hasOwn(token.attributes, name),
						)))) ||
			(token.kind === "end" && ["br", "p"].includes(token.name))
		) {
			this.options.issue("html-breakout-from-foreign-content");
			while (stack.length > 1) {
				this.visit();
				const current = this.current();
				if (
					elementNamespace(current) === htmlNamespace ||
					mathTextPoint(current) ||
					htmlPoint(current)
				)
					break;
				stack.pop();
			}
			return false;
		}
		if (token.kind === "start") {
			const name = foreignName(token.name, namespaceURI);
			const entry = this.options.insert(
				name,
				foreignAttributes(token.attributes, namespaceURI, this.options.issue),
				namespaceURI,
			);
			if (!token.selfClosing) stack.push(entry);
			if (name === "script") this.options.issue("foreign-script-not-executed");
			return true;
		}
		if (
			node.tagName.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) !==
			token.name
		)
			this.options.issue("mismatched-foreign-end-tag");
		for (let index = stack.length - 1; index > 0; index--) {
			this.visit();
			const candidate = stack[index].tree.elementInfo(stack[index].id);
			if (elementNamespace(candidate) === htmlNamespace) return false;
			if (
				candidate.tagName.replace(/[A-Z]/g, (letter) =>
					letter.toLowerCase(),
				) === token.name
			) {
				stack.length = index;
				return true;
			}
		}
		return this.options.context !== undefined;
	}

	private visit() {
		this.options.check();
		if (++this.work > this.options.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML foreign content work limit exceeded",
			);
	}
}
