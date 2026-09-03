import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { type TextStyle, initialTextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type DocumentBlockWidths,
	type FormattingLimits,
	type FormattingNode,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { resolveInlineEdges } from "./inline-box.js";

export interface TextLayoutLimits {
	maxTokens: number;
	maxLines: number;
	maxFragments: number;
	maxWork: number;
}
export const textLayoutLimits: Readonly<TextLayoutLimits> = Object.freeze({
	maxTokens: 250_000,
	maxLines: 50_000,
	maxFragments: 250_000,
	maxWork: 2_000_000,
});
export interface TextLayoutOptions extends Partial<TextLayoutLimits> {
	formatting?: Partial<FormattingLimits>;
}
export interface TextGlyph {
	formattingId: number;
	ref: string;
	offset: number;
	codeUnits: number;
	character: string;
	kind: "glyph" | "tab";
	supported: boolean;
	visible: boolean;
	fontSize: number;
	line: number;
	x: number;
	y: number;
	advance: number;
}
export interface TextLine {
	index: number;
	top: number;
	height: number;
	baseline: number;
	width: number;
	overflow: number;
	forcedBreak: boolean;
	glyphStart: number;
	glyphEnd: number;
	fragmentStart: number;
	fragmentEnd: number;
}
export interface TextInlineFragment {
	formattingId: number;
	ref: string;
	line: number | null;
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface TextContext {
	id: number;
	ref?: string;
	contentX: number;
	contentWidth: number;
	textHeight: number;
	lines: readonly Readonly<TextLine>[];
	glyphs: readonly Readonly<TextGlyph>[];
	fragments: readonly Readonly<TextInlineFragment>[];
}
export interface DocumentTextLayout {
	stage: "block-relative-text-lines";
	partial: true;
	horizontal: DocumentBlockWidths;
	contexts: readonly Readonly<TextContext>[];
	metrics: Readonly<{
		tokens: number;
		lines: number;
		glyphs: number;
		fragments: number;
		unsupportedGlyphs: number;
		work: number;
	}>;
}
interface FontExtent {
	fontSize: number;
	advance: number;
	ascent: number;
	above: number;
	below: number;
}
interface Token extends FontExtent {
	formattingId: number;
	ref: string;
	offset: number;
	codeUnits: number;
	character: string;
	kind: "glyph" | "tab" | "strut" | "open" | "close" | "image";
	margin?: number;
	padding?: number;
	contributes?: boolean;
	visible: boolean;
	collapsible: boolean;
	breakable: boolean;
}

function extent(style: TextStyle): FontExtent {
	const fontSize = Number.parseFloat(style["font-size"]);
	layoutNumber(fontSize);
	if (fontSize > bitmapFont.maxFontSize)
		throw new AgentBrowserError(
			"resource-limit",
			"Text font size limit exceeded",
		);
	const lineHeight = layoutNumber(
		style["line-height"] === "normal"
			? fontSize * 1.25
			: style["line-height"].endsWith("px")
				? Number.parseFloat(style["line-height"])
				: Number(style["line-height"]) * fontSize,
	);
	const scale = fontSize / bitmapFont.unitsPerEm;
	const ascent = bitmapFont.ascent * scale;
	return {
		fontSize,
		advance: bitmapFont.advance * scale,
		ascent,
		above: ascent + (lineHeight - fontSize) / 2,
		below: bitmapFont.descent * scale + (lineHeight - fontSize) / 2,
	};
}

export function layoutDocumentText(
	tree: DocumentTree,
	options: TextLayoutOptions = {},
): Readonly<DocumentTextLayout> {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError("invalid-input", "Invalid text layout options");
	for (const [key, value] of Object.entries(options)) {
		if (key === "formatting") continue;
		if (
			!Object.hasOwn(textLayoutLimits, key) ||
			!Number.isSafeInteger(value) ||
			(value as number) < 1 ||
			(value as number) > textLayoutLimits[key as keyof TextLayoutLimits]
		)
			throw new AgentBrowserError("invalid-input", "Invalid text layout limit");
	}
	const limits = { ...textLayoutLimits, ...options };
	const horizontal = resolveDocumentBlockWidths(tree, options.formatting);
	const images = new Map(horizontal.images.map((image) => [image.id, image]));
	const contexts: Readonly<TextContext>[] = [];
	const metrics = {
		tokens: 0,
		lines: 0,
		glyphs: 0,
		fragments: 0,
		unsupportedGlyphs: 0,
		work: 0,
	};
	const charge = (units = 1) => {
		metrics.work += units;
		if (metrics.work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Text layout work limit exceeded",
			);
	};
	const countToken = () => {
		charge();
		if (++metrics.tokens > limits.maxTokens)
			throw new AgentBrowserError(
				"resource-limit",
				"Text layout token limit exceeded",
			);
	};
	for (const block of horizontal.widths) {
		charge();
		const container = horizontal.formatting.nodes[block.id];
		if (container.contentMode !== "inline") continue;
		const style = container.typography ?? initialTextStyle;
		const strut = extent(style);
		const lines: Readonly<TextLine>[] = [];
		const glyphs: Readonly<TextGlyph>[] = [];
		const fragments: Readonly<TextInlineFragment>[] = [];
		let textHeight = 0;
		let lineWidth = 0;
		let lineContent = 0;
		let entries: { token: Token; offset: number; advance: number }[] = [];
		let segments: { tokens: Token[]; closing: Token[]; gap?: Token }[] = [];
		let word: Token[] = [];
		let closing: Token[] = [];
		let gap: Token | undefined;
		let collapsing = false;
		let skipLf = false;
		const advance = (token: Token, cursor: number) =>
			token.kind === "tab" && token.advance > 0
				? (Math.floor(cursor / (token.advance * 8)) + 1) * token.advance * 8 -
					cursor
				: token.advance;
		const append = (token: Token) => {
			charge();
			const used = advance(token, lineWidth);
			entries.push({ token, offset: lineWidth, advance: used });
			lineWidth = layoutNumber(lineWidth + used, true);
		};
		const contributes = (token: Token) =>
			token.kind === "glyph" ||
			token.kind === "tab" ||
			token.contributes === true;
		const finish = (forced?: FontExtent) => {
			entries = [];
			lineWidth = 0;
			let content = false;
			for (const [index, segment] of segments.entries()) {
				charge();
				for (const token of segment.tokens) {
					append(token);
					content ||= contributes(token);
				}
				if (index < segments.length - 1 && segment.gap && content)
					append(segment.gap);
				for (const token of segment.closing) {
					append(token);
					content ||= contributes(token);
				}
			}
			let lastContent = entries.length - 1;
			while (
				lastContent >= 0 &&
				(entries[lastContent].token.collapsible ||
					entries[lastContent].token.kind === "strut" ||
					entries[lastContent].token.kind === "close" ||
					(entries[lastContent].token.kind === "open" &&
						!entries[lastContent].token.contributes))
			) {
				lastContent--;
				charge();
			}
			entries = entries.filter(({ token }, index) => {
				charge();
				return !token.collapsible || index <= lastContent;
			});
			lineWidth = 0;
			let hasContent = false;
			for (const entry of entries) {
				charge();
				entry.offset = lineWidth;
				entry.advance = advance(entry.token, lineWidth);
				lineWidth = layoutNumber(lineWidth + entry.advance, true);
				hasContent ||= contributes(entry.token);
			}
			const collapsed = !hasContent && !forced;
			if (!collapsed && ++metrics.lines > limits.maxLines)
				throw new AgentBrowserError(
					"resource-limit",
					"Text layout line limit exceeded",
				);
			let above = Math.max(strut.above, forced?.above ?? strut.above);
			let below = Math.max(strut.below, forced?.below ?? strut.below);
			for (const { token } of entries) {
				charge();
				above = Math.max(above, token.above);
				below = Math.max(below, token.below);
			}
			const height = layoutNumber(above + below);
			const baseline = layoutNumber(textHeight + above, true);
			const alignment = style["text-align"];
			const offset =
				alignment === "center"
					? (block.contentWidth - lineWidth) / 2
					: ["right", "end"].includes(alignment)
						? block.contentWidth - lineWidth
						: 0;
			const glyphStart = glyphs.length;
			const fragmentStart = fragments.length;
			const ranges = new Map<number, { left: number; right: number }>();
			for (const { token, offset: tokenOffset, advance: used } of entries) {
				charge();
				const start = tokenOffset;
				let current: number | null = token.formattingId;
				while (current !== null) {
					charge();
					const node: Readonly<FormattingNode> =
						horizontal.formatting.nodes[current];
					if (
						node.kind === "inline" ||
						node.kind === "break" ||
						node.kind === "replaced"
					) {
						const own = current === token.formattingId;
						const replaced =
							own && token.kind === "image" ? images.get(current) : undefined;
						const left =
							start +
							(replaced?.marginLeft ??
								(own && token.kind === "open" ? (token.margin ?? 0) : 0));
						const right =
							start +
							(replaced
								? replaced.marginLeft + replaced.borderBoxWidth
								: own && token.kind === "close"
									? (token.padding ?? 0)
									: used);
						const range = ranges.get(current);
						if (range) {
							range.right = right;
						} else ranges.set(current, { left, right });
					} else if (node.kind !== "text") break;
					current = node.parent;
				}
				if (token.kind !== "glyph" && token.kind !== "tab") continue;
				const supported =
					token.kind === "tab" || bitmapGlyph(token.character).supported;
				if (!supported) metrics.unsupportedGlyphs++;
				glyphs.push(
					Object.freeze({
						formattingId: token.formattingId,
						ref: token.ref,
						offset: token.offset,
						codeUnits: token.codeUnits,
						character: token.character,
						kind: token.kind,
						supported,
						visible: token.visible,
						fontSize: token.fontSize,
						line: lines.length,
						x: layoutNumber(block.contentX + offset + tokenOffset, true),
						y: layoutNumber(baseline - token.ascent, true),
						advance: used,
					}),
				);
			}
			for (const [id, range] of ranges) {
				charge();
				if (++metrics.fragments > limits.maxFragments)
					throw new AgentBrowserError(
						"resource-limit",
						"Text layout fragment limit exceeded",
					);
				const node = horizontal.formatting.nodes[id];
				const replaced = images.get(id);
				const font = extent(node.typography ?? style);
				const paddingTop = resolveLayoutLength(
					node.box?.["padding-top"] ?? "0px",
					block.contentWidth,
				);
				const paddingBottom = resolveLayoutLength(
					node.box?.["padding-bottom"] ?? "0px",
					block.contentWidth,
				);
				const x = layoutNumber(block.contentX + offset + range.left, true);
				const y = layoutNumber(
					baseline -
						(replaced
							? replaced.borderBoxHeight + replaced.marginBottom
							: font.ascent + paddingTop),
					true,
				);
				const width = layoutNumber(Math.max(0, range.right - range.left));
				const fragmentHeight = layoutNumber(
					replaced?.borderBoxHeight ??
						font.fontSize + paddingTop + paddingBottom,
				);
				layoutNumber(x + width, true);
				layoutNumber(y + fragmentHeight, true);
				fragments.push(
					Object.freeze({
						formattingId: id,
						ref: node.ref ?? "",
						line: collapsed ? null : lines.length,
						x,
						y,
						width,
						height: fragmentHeight,
					}),
				);
			}
			if (collapsed) {
				entries = [];
				segments = [];
				lineWidth = 0;
				lineContent = 0;
				return;
			}
			lines.push(
				Object.freeze({
					index: lines.length,
					top: textHeight,
					height,
					baseline,
					width: Math.max(0, lineWidth),
					overflow: Math.max(0, lineWidth - block.contentWidth),
					forcedBreak: !!forced,
					glyphStart,
					glyphEnd: glyphs.length,
					fragmentStart,
					fragmentEnd: fragments.length,
				}),
			);
			metrics.glyphs += glyphs.length - glyphStart;
			textHeight = layoutNumber(textHeight + height);
			entries = [];
			segments = [];
			lineWidth = 0;
			lineContent = 0;
		};
		const flushWord = () => {
			if (!word.length && !closing.length) {
				gap = undefined;
				return;
			}
			if (!lineContent) {
				let leading = true;
				word = word.filter((token) => {
					charge();
					if (token.kind === "image") leading = false;
					if (token.kind !== "glyph" && token.kind !== "tab") return true;
					if (leading && token.collapsible) return false;
					leading = false;
					return true;
				});
			}
			const previous = segments.at(-1);
			let predicted =
				lineWidth + (previous?.gap && lineContent ? previous.gap.advance : 0);
			for (const token of [...word, ...closing]) {
				charge();
				predicted = layoutNumber(predicted + advance(token, predicted), true);
			}
			if (previous?.gap && lineContent && predicted > block.contentWidth) {
				finish();
				predicted = 0;
				for (const token of [...word, ...closing]) {
					charge();
					predicted = layoutNumber(predicted + advance(token, predicted), true);
				}
			}
			segments.push({ tokens: word, closing, gap });
			for (const token of [...word, ...closing]) {
				charge();
				if (contributes(token)) lineContent++;
			}
			lineWidth = predicted;
			word = [];
			closing = [];
			gap = undefined;
		};
		const emit = (token: Token) => {
			countToken();
			if (token.breakable) {
				gap = token;
			} else if (gap && token.kind === "close") closing.push(token);
			else {
				if (gap) flushWord();
				word.push(token);
			}
		};
		const hardBreak = (font: FontExtent, node: FormattingNode) => {
			countToken();
			collapsing = false;
			flushWord();
			gap = undefined;
			const previous = segments.at(-1);
			if (previous) previous.gap = undefined;
			segments.push({
				closing: [],
				tokens: [
					{
						...font,
						advance: 0,
						formattingId: node.id,
						ref: node.ref ?? "",
						offset: 0,
						codeUnits: 0,
						character: "",
						kind: "strut",
						visible: false,
						collapsible: false,
						breakable: false,
					},
				],
			});
			finish(font);
		};
		const pending: {
			id: number;
			above: number;
			below: number;
			closing?: boolean;
		}[] = container.children
			.map((id) => ({ id, above: strut.above, below: strut.below }))
			.reverse();
		while (pending.length) {
			charge();
			const frame = pending.pop();
			if (!frame) break;
			const node: FormattingNode = horizontal.formatting.nodes[frame.id];
			const typography = node.typography ?? style;
			const own = extent(typography);
			const font = {
				...own,
				above: Math.max(own.above, frame.above),
				below: Math.max(own.below, frame.below),
			};
			if (node.kind === "inline") {
				const edges = resolveInlineEdges(block.contentWidth, node.box);
				const side = frame.closing ? "right" : "left";
				const sliced = frame.closing
					? (node.fragmentIndex ?? 0) < (node.fragmentCount ?? 1) - 1
					: (node.fragmentIndex ?? 0) > 0;
				const margin = sliced ? 0 : edges[`margin-${side}`];
				const padding = sliced ? 0 : edges[`padding-${side}`];
				emit({
					...font,
					advance: layoutNumber(margin + padding, true),
					margin,
					padding,
					contributes: Object.values(edges).some((value) => value !== 0),
					formattingId: node.id,
					ref: node.ref ?? "",
					offset: 0,
					codeUnits: 0,
					character: "",
					kind: frame.closing ? "close" : "open",
					visible: false,
					collapsible: false,
					breakable: false,
				});
				if (frame.closing) continue;
				pending.push({
					id: node.id,
					above: font.above,
					below: font.below,
					closing: true,
				});
				for (let index = node.children.length - 1; index >= 0; index--)
					pending.push({
						id: node.children[index],
						above: font.above,
						below: font.below,
					});
				continue;
			}
			if (node.kind === "replaced") {
				const replaced = images.get(node.id);
				if (!replaced)
					throw new AgentBrowserError(
						"unsupported",
						"Missing replaced image size",
					);
				const wrap =
					typography["white-space"] === "normal" ||
					typography["white-space"] === "pre-line";
				const opportunity: Token = {
					...font,
					advance: 0,
					formattingId: node.parent ?? container.id,
					ref: "",
					offset: 0,
					codeUnits: 0,
					character: "",
					kind: "strut",
					visible: false,
					collapsible: true,
					breakable: true,
				};
				if (wrap && !gap) emit(opportunity);
				emit({
					...font,
					advance: layoutNumber(
						replaced.marginLeft +
							replaced.borderBoxWidth +
							replaced.marginRight,
						true,
					),
					above: Math.max(
						frame.above,
						replaced.marginTop +
							replaced.borderBoxHeight +
							replaced.marginBottom,
					),
					below: Math.max(0, frame.below),
					formattingId: node.id,
					ref: node.ref ?? "",
					offset: 0,
					codeUnits: 0,
					character: "",
					kind: "image",
					contributes: true,
					visible: node.visible,
					collapsible: false,
					breakable: false,
				});
				if (wrap) emit(opportunity);
				collapsing = false;
				skipLf = false;
				continue;
			}
			if (node.kind === "break") {
				skipLf = false;
				hardBreak(font, node);
				continue;
			}
			if (node.kind !== "text" || !node.ref)
				throw new AgentBrowserError(
					"unsupported",
					"Unsupported text formatting content",
				);
			const source = node.text ?? "";
			for (let offset = 0; offset < source.length; ) {
				let character = String.fromCodePoint(
					source.codePointAt(offset) as number,
				);
				let codeUnits = character.length;
				charge(codeUnits);
				if (skipLf && character === "\n") {
					skipLf = false;
					offset += codeUnits;
					continue;
				}
				skipLf = character === "\r";
				if (character === "\r" && source[offset + 1] === "\n") {
					codeUnits++;
					skipLf = false;
					charge();
				}
				if (character === "\r" || character === "\f") character = "\n";
				const mode = typography["white-space"];
				if (character === "\n" && (mode === "pre" || mode === "pre-line"))
					hardBreak(font, node);
				else {
					const collapsible = mode !== "pre" && /^[\t\n ]$/.test(character);
					const token: Token = {
						...font,
						formattingId: node.id,
						ref: node.ref,
						offset,
						codeUnits,
						character: collapsible ? " " : character,
						kind: character === "\t" && mode === "pre" ? "tab" : "glyph",
						visible: node.visible,
						collapsible,
						breakable: collapsible && mode !== "nowrap",
					};
					if (collapsible) {
						if (!collapsing) emit(token);
						collapsing = true;
					} else {
						collapsing = false;
						emit(token);
					}
				}
				offset += codeUnits;
			}
		}
		flushWord();
		finish();
		contexts.push(
			Object.freeze({
				id: block.id,
				...(block.ref ? { ref: block.ref } : {}),
				contentX: block.contentX,
				contentWidth: block.contentWidth,
				textHeight,
				lines: Object.freeze(lines),
				glyphs: Object.freeze(glyphs),
				fragments: Object.freeze(fragments),
			}),
		);
	}
	return Object.freeze({
		stage: "block-relative-text-lines" as const,
		partial: true as const,
		horizontal,
		contexts: Object.freeze(contexts),
		metrics: Object.freeze(metrics),
	});
}
