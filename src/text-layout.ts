import { bitmapGlyph } from "./bitmap-font.js";
import { resolveBorders } from "./border-box.js";
import { initialBoxStyle } from "./css-box.js";
import { type TextStyle, initialTextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type DocumentBlockWidths,
	type FormattingImageSize,
	type FormattingLimits,
	type FormattingNode,
	type FormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import {
	type AtomicInlineMetrics,
	atomicInlineBaseline,
	atomicInlineMetrics,
	isAtomicInline,
} from "./inline-atomic.js";
import { resolveInlineEdges } from "./inline-box.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import {
	type TextFontExtent as FontExtent,
	textFontExtent as extent,
} from "./text-font.js";

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
export interface TextBreakSource {
	readonly formattingId: number;
	readonly ref: string;
	readonly offset: number;
	readonly codeUnits: number;
}
export interface TextSourceBreak {
	readonly sources: readonly TextBreakSource[];
	readonly inlineOffset: number;
	readonly fontSize: number;
	readonly ascent: number;
	readonly followingLine?: Readonly<{
		inlineOffset: number;
		baselineOffset: number;
	}>;
}
export interface TextLine {
	sourceBreak?: Readonly<TextSourceBreak>;
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
	atomic?: true;
	marginRight?: number;
	marginBottom?: number;
	borders?: Readonly<ReturnType<typeof resolveBorders>>;
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
interface Token extends FontExtent {
	sourceBreak?: Readonly<TextBreakSource>;
	formattingId: number;
	ref: string;
	offset: number;
	codeUnits: number;
	character: string;
	kind: "glyph" | "tab" | "strut" | "open" | "close" | "image" | "atomic";
	margin?: number;
	padding?: number;
	border?: number;
	contributes?: boolean;
	visible: boolean;
	collapsible: boolean;
	breakable: boolean;
	hangable?: boolean;
}

function checkedLimits(options: TextLayoutOptions) {
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
	return { ...textLayoutLimits, ...options };
}

export function textLayoutWorkLimit(options: TextLayoutOptions = {}) {
	return checkedLimits(options).maxWork;
}

export interface TextFormattingInput {
	formatting: FormattingTree;
	widths: readonly Readonly<{
		id: number;
		ref?: string;
		contentX: number;
		contentWidth: number;
	}>[];
	images: readonly Readonly<FormattingImageSize>[];
	atomics?: readonly Readonly<AtomicInlineMetrics>[];
}

export function layoutDocumentText(
	tree: DocumentTree,
	options: TextLayoutOptions = {},
): Readonly<DocumentTextLayout> {
	const limits = checkedLimits(options);
	const horizontal = resolveDocumentBlockWidths(tree, options.formatting);
	return layoutFormattingText(horizontal, limits);
}

export function layoutFormattingText(
	horizontal: DocumentBlockWidths,
	options: TextLayoutOptions = {},
): Readonly<DocumentTextLayout> {
	const limits = checkedLimits(options);
	const result = layoutTextContexts(horizontal, limits, "used");
	return Object.freeze({
		stage: "block-relative-text-lines",
		partial: true,
		horizontal,
		contexts: result.contexts,
		metrics: result.metrics,
	});
}

export function measureFormattingText(
	input: TextFormattingInput,
	constraint: "min-content" | "max-content",
	options: Partial<TextLayoutLimits> = {},
) {
	if (constraint !== "min-content" && constraint !== "max-content")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid intrinsic text constraint",
		);
	const result = layoutTextContexts(input, checkedLimits(options), constraint);
	return Object.freeze({
		widths: result.measurements,
		metrics: result.metrics,
	});
}

function layoutTextContexts(
	horizontal: TextFormattingInput,
	limits: TextLayoutLimits,
	constraint: "used" | "min-content" | "max-content",
) {
	const images = new Map(horizontal.images.map((image) => [image.id, image]));
	const contexts: Readonly<TextContext>[] = [];
	const measurements: Readonly<{ id: number; width: number }>[] = [];
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
	const atomics = atomicInlineMetrics(
		horizontal.formatting,
		horizontal.atomics ?? [],
		charge,
	);
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
		let measuredWidth = 0;
		let lineWidth = 0;
		let lineContent = 0;
		let entries: { token: Token; offset: number; advance: number }[] = [];
		let segments: { tokens: Token[]; closing: Token[]; gap?: Token[] }[] = [];
		let word: Token[] = [];
		let closing: Token[] = [];
		let gap: Token[] | undefined;
		let collapsing = false;
		let skipLf = false;
		let pendingBreakLine: number | undefined;
		let pendingCrLine: number | undefined;
		const advance = (token: Token, cursor: number) => {
			if (token.kind !== "tab" || token.advance <= 0) return token.advance;
			const stop = token.advance * 8;
			const distance = (Math.floor(cursor / stop) + 1) * stop - cursor;
			return distance < token.advance / 2 ? distance + stop : distance;
		};
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
		const hangingAdvance = (
			items: readonly { token: Token; advance: number }[],
			collapsible = false,
		) => {
			let hanging = 0;
			let blocked = false;
			for (let index = items.length - 1; index >= 0; index--) {
				charge();
				const { token, advance: used } = items[index];
				if (token.collapsible) {
					if (collapsible) hanging += used;
				} else if (token.hangable && !blocked) hanging += used;
				else if (
					token.kind === "close" ||
					token.kind === "open" ||
					token.kind === "strut"
				) {
					blocked ||= !!token.padding || !!token.border;
				} else break;
			}
			return hanging;
		};
		const finish = (forced?: FontExtent, final = false) => {
			entries = [];
			lineWidth = 0;
			let content = false;
			for (const segment of segments) {
				charge();
				for (const token of segment.tokens) {
					append(token);
					content ||= contributes(token);
				}
				for (const token of segment.gap ?? []) {
					if (!token.collapsible || content) append(token);
					content ||= !token.collapsible && contributes(token);
				}
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
			const hanging = hangingAdvance(entries);
			const measured = Math.max(
				0,
				lineWidth -
					(constraint === "max-content"
						? 0
						: constraint === "min-content" || (!forced && !final)
							? hanging
							: Math.min(hanging, Math.max(0, lineWidth - block.contentWidth))),
			);
			if (!collapsed && ++metrics.lines > limits.maxLines)
				throw new AgentBrowserError(
					"resource-limit",
					"Text layout line limit exceeded",
				);
			if (constraint !== "used") {
				measuredWidth = Math.max(measuredWidth, measured);
				entries = [];
				segments = [];
				lineWidth = 0;
				lineContent = 0;
				return;
			}
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
					? (block.contentWidth - measured) / 2
					: ["right", "end"].includes(alignment)
						? block.contentWidth - measured
						: 0;
			if (pendingBreakLine !== undefined && (!collapsed || final)) {
				charge();
				const previous = lines[pendingBreakLine];
				if (previous.sourceBreak)
					lines[pendingBreakLine] = Object.freeze({
						...previous,
						sourceBreak: Object.freeze({
							...previous.sourceBreak,
							followingLine: Object.freeze({
								inlineOffset: offset,
								baselineOffset: baseline - previous.baseline,
							}),
						}),
					});
				pendingBreakLine = undefined;
			}
			let sourceBreak: Readonly<TextSourceBreak> | undefined;
			const glyphStart = glyphs.length;
			const fragmentStart = fragments.length;
			const ranges = new Map<
				number,
				{
					left: number;
					right: number;
					borderLeft: number;
					borderRight: number;
					marginRight: number;
				}
			>();
			for (const { token, offset: tokenOffset, advance: used } of entries) {
				charge();
				if (token.sourceBreak) {
					charge();
					sourceBreak = Object.freeze({
						sources: Object.freeze([token.sourceBreak]),
						inlineOffset: layoutNumber(offset + tokenOffset, true),
						fontSize: token.fontSize,
						ascent: token.ascent,
					});
				}
				const start = tokenOffset;
				let current: number | null = token.formattingId;
				while (current !== null) {
					charge();
					const node: Readonly<FormattingNode> =
						horizontal.formatting.nodes[current];
					if (
						node.kind === "inline" ||
						node.kind === "break" ||
						node.kind === "replaced" ||
						atomics.has(current)
					) {
						const own = current === token.formattingId;
						const replaced =
							own && token.kind === "image"
								? images.get(current)
								: own && token.kind === "atomic"
									? atomics.get(current)
									: undefined;
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
						const borderLeft =
							own && token.kind === "open" ? (token.border ?? 0) : 0;
						const borderRight =
							own && token.kind === "close" ? (token.border ?? 0) : 0;
						const marginRight =
							replaced?.marginRight ??
							(own && token.kind === "close" ? (token.margin ?? 0) : 0);
						if (range) {
							range.right = right;
							range.borderLeft += borderLeft;
							range.borderRight += borderRight;
							if (replaced || (own && token.kind === "close"))
								range.marginRight = marginRight;
						} else
							ranges.set(current, {
								left,
								right,
								borderLeft,
								borderRight,
								marginRight,
							});
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
				const atomic = atomics.get(id);
				const font = extent(node.typography ?? style);
				const borders =
					node.kind === "inline"
						? {
								...resolveBorders(node.box ?? initialBoxStyle),
								borderLeft: range.borderLeft,
								borderRight: range.borderRight,
							}
						: undefined;
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
						(atomic?.block
							? atomicInlineBaseline(atomic.block)
							: replaced
								? replaced.borderBoxHeight + replaced.marginBottom
								: font.ascent + paddingTop + (borders?.borderTop ?? 0)),
					true,
				);
				const width = layoutNumber(Math.max(0, range.right - range.left));
				const fragmentHeight = layoutNumber(
					atomic?.block?.borderBoxHeight ??
						replaced?.borderBoxHeight ??
						font.fontSize +
							paddingTop +
							paddingBottom +
							(borders?.borderTop ?? 0) +
							(borders?.borderBottom ?? 0),
				);
				layoutNumber(x + width, true);
				layoutNumber(y + fragmentHeight, true);
				fragments.push(
					Object.freeze({
						formattingId: id,
						...(atomic ? { atomic: true as const } : {}),
						...(range.marginRight ? { marginRight: range.marginRight } : {}),
						...(replaced?.marginBottom
							? { marginBottom: replaced.marginBottom }
							: atomic?.block?.marginBottom
								? { marginBottom: atomic.block.marginBottom }
								: {}),
						...(borders && Object.values(borders).some((width) => width > 0)
							? { borders: Object.freeze(borders) }
							: {}),
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
					...(sourceBreak ? { sourceBreak } : {}),
					index: lines.length,
					top: textHeight,
					height,
					baseline,
					width: measured,
					overflow: Math.max(0, measured - block.contentWidth),
					forcedBreak: !!forced,
					glyphStart,
					glyphEnd: glyphs.length,
					fragmentStart,
					fragmentEnd: fragments.length,
				}),
			);
			if (sourceBreak) pendingBreakLine = lines.length - 1;
			metrics.glyphs += glyphs.length - glyphStart;
			textHeight = layoutNumber(textHeight + height);
			entries = [];
			segments = [];
			lineWidth = 0;
			lineContent = 0;
		};
		const flushWord = () => {
			if (
				!word.length &&
				!closing.length &&
				!gap?.some((token) => {
					charge();
					return !token.collapsible;
				})
			) {
				gap = undefined;
				return;
			}
			if (!lineContent) {
				let leading = true;
				word = word.filter((token) => {
					charge();
					if (token.kind === "image" || token.kind === "atomic")
						leading = false;
					if (token.kind !== "glyph" && token.kind !== "tab") return true;
					if (leading && token.collapsible) return false;
					leading = false;
					return true;
				});
			}
			const previous = segments.at(-1);
			if (
				!lineContent &&
				!word.some((token) => {
					charge();
					return contributes(token);
				})
			) {
				let content = false;
				gap = gap?.filter((token) => {
					charge();
					content ||= !token.collapsible && contributes(token);
					return !token.collapsible || content;
				});
			}
			const tokens = [...word, ...(gap ?? []), ...closing];
			const predict = (start: number) => {
				let width = start;
				const items = tokens.map((token) => {
					charge();
					const used = advance(token, width);
					width = layoutNumber(width + used, true);
					return { token, advance: used };
				});
				return { width, fit: width - hangingAdvance(items, true) };
			};
			let predicted = predict(lineWidth);
			if (
				previous?.gap &&
				lineContent &&
				(constraint === "min-content" ||
					(constraint === "used" && predicted.fit > block.contentWidth))
			) {
				finish();
				predicted = predict(0);
			}
			segments.push({ tokens: word, closing, gap });
			for (const token of tokens) {
				charge();
				if (!token.collapsible && contributes(token)) lineContent++;
			}
			lineWidth = predicted.width;
			word = [];
			closing = [];
			gap = undefined;
		};
		const emit = (token: Token) => {
			countToken();
			if (token.breakable) {
				gap ??= [];
				for (const boundary of closing) {
					charge();
					gap.push(boundary);
				}
				closing = [];
				gap.push(token);
			} else if (gap && (token.kind === "close" || token.kind === "open"))
				closing.push(token);
			else {
				if (gap) {
					const opening = closing.findIndex((boundary) => {
						charge();
						return boundary.kind === "open";
					});
					const next = opening < 0 ? [] : closing.splice(opening);
					flushWord();
					word = next;
				}
				word.push(token);
			}
		};
		const hardBreak = (
			font: FontExtent,
			node: FormattingNode,
			source?: Readonly<TextBreakSource>,
		) => {
			countToken();
			collapsing = false;
			flushWord();
			gap = undefined;
			segments.push({
				closing: [],
				tokens: [
					{
						...font,
						...(source ? { sourceBreak: source } : {}),
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
			whiteSpace: TextStyle["white-space"];
			closing?: boolean;
		}[] = container.children
			.map((id) => ({
				id,
				above: strut.above,
				below: strut.below,
				whiteSpace: style["white-space"],
			}))
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
				const border = sliced ? 0 : edges[`border-${side}-width`];
				const padding = sliced ? 0 : edges[`padding-${side}`] + border;
				emit({
					...font,
					advance: layoutNumber(margin + padding, true),
					margin,
					padding,
					border,
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
					whiteSpace: typography["white-space"],
					closing: true,
				});
				for (let index = node.children.length - 1; index >= 0; index--)
					pending.push({
						id: node.children[index],
						above: font.above,
						below: font.below,
						whiteSpace: typography["white-space"],
					});
				continue;
			}
			if (isAtomicInline(node)) {
				const atomic = atomics.get(node.id);
				if (!atomic || (constraint === "used" && !atomic.block))
					throw new AgentBrowserError(
						"unsupported",
						"Missing used atomic inline layout metrics",
					);
				if (constraint === "used" && atomic.block?.unsupportedBaseline)
					throw new AgentBrowserError(
						"unsupported",
						"Atomic inline baseline is not supported",
					);
				const wrap =
					frame.whiteSpace === "normal" ||
					frame.whiteSpace === "pre-line" ||
					frame.whiteSpace === "pre-wrap";
				const opportunity: Token = {
					...font,
					above: frame.above,
					below: frame.below,
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
				const baseline = atomic.block ? atomicInlineBaseline(atomic.block) : 0;
				if (wrap && !gap) emit(opportunity);
				emit({
					...font,
					advance: layoutNumber(
						atomic.marginLeft + atomic.borderBoxWidth + atomic.marginRight,
						true,
					),
					above: Math.max(
						frame.above,
						(atomic.block?.marginTop ?? 0) + baseline,
					),
					below: Math.max(
						frame.below,
						(atomic.block?.borderBoxHeight ?? 0) -
							baseline +
							(atomic.block?.marginBottom ?? 0),
					),
					formattingId: node.id,
					ref: node.ref ?? "",
					offset: 0,
					codeUnits: 0,
					character: "",
					kind: "atomic",
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
			if (node.kind === "replaced") {
				const replaced = images.get(node.id);
				if (!replaced)
					throw new AgentBrowserError(
						"unsupported",
						"Missing replaced image size",
					);
				const wrap =
					typography["white-space"] === "normal" ||
					typography["white-space"] === "pre-line" ||
					typography["white-space"] === "pre-wrap";
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
			const textReference = node.ref ?? node.generated?.ref;
			if (node.kind !== "text" || !textReference)
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
					if (pendingCrLine !== undefined && constraint === "used") {
						charge();
						const previous = lines[pendingCrLine];
						if (previous.sourceBreak)
							lines[pendingCrLine] = Object.freeze({
								...previous,
								sourceBreak: Object.freeze({
									...previous.sourceBreak,
									sources: Object.freeze([
										...previous.sourceBreak.sources,
										Object.freeze({
											formattingId: node.id,
											ref: textReference,
											offset,
											codeUnits,
										}),
									]),
								}),
							});
					}
					pendingCrLine = undefined;
					skipLf = false;
					offset += codeUnits;
					continue;
				}
				pendingCrLine = undefined;
				skipLf = character === "\r";
				if (character === "\r" && source[offset + 1] === "\n") {
					codeUnits++;
					skipLf = false;
					charge();
				}
				if (character === "\r" || character === "\f") character = "\n";
				const mode = typography["white-space"];
				const preserved = mode === "pre" || mode === "pre-wrap";
				if (character === "\n" && (preserved || mode === "pre-line")) {
					hardBreak(
						font,
						node,
						Object.freeze({
							formattingId: node.id,
							ref: textReference,
							offset,
							codeUnits,
						}),
					);
					if (skipLf && constraint === "used") pendingCrLine = lines.length - 1;
				} else {
					const whitespace = /^[\t\n ]$/.test(character);
					const collapsible = !preserved && whitespace;
					const token: Token = {
						...font,
						formattingId: node.id,
						ref: textReference,
						offset,
						codeUnits,
						character: collapsible ? " " : character,
						kind: character === "\t" && preserved ? "tab" : "glyph",
						visible: node.visible,
						collapsible,
						breakable: whitespace && mode !== "nowrap" && mode !== "pre",
						hangable: mode === "pre-wrap" && whitespace,
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
		finish(undefined, true);
		if (constraint !== "used") {
			measurements.push(Object.freeze({ id: block.id, width: measuredWidth }));
			continue;
		}
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
		contexts: Object.freeze(contexts),
		measurements: Object.freeze(measurements),
		metrics: Object.freeze(metrics),
	});
}
