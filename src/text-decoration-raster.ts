import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { parseCssColor } from "./css-color.js";
import { initialTextStyle } from "./css-text.js";
import type { DocumentLayout } from "./document-layout.js";
import type { DocumentClip } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { fontStyleSlope, type NativeFontStyle } from "./font-style.js";
import { matchFontWeight } from "./font-weight.js";
import { isAtomicInline } from "./inline-atomic.js";
import { resolveInlineEdges } from "./inline-box.js";
import { layoutNumber } from "./layout-values.js";
import { type RasterImage, type Rgba, paintRasterRect } from "./raster.js";
import { documentStyles } from "./styles.js";
import type { TextGlyph, TextInlineFragment } from "./text-layout.js";

type DecorationLine = "underline" | "overline" | "line-through";
interface Decoration {
	parent: Decoration | null;
	domId: number;
	lines: readonly DecorationLine[];
	color: Rgba;
	thickness: number;
	underline: number;
	overline: number;
	strike: number;
}
interface InlineEdges {
	baseline: number;
	intervals: readonly (readonly [number, number])[];
}
export interface TextDecorations {
	chains: readonly (Decoration | null)[];
	inherited: readonly (Decoration | null)[];
	weights: readonly (400 | 700)[];
	slopes: readonly number[];
	lineSpacing: WeakSet<Readonly<TextGlyph>>;
	edges: WeakMap<Readonly<TextInlineFragment>, InlineEdges>;
	layers: Decoration[];
}

export function prepareTextDecorations(
	tree: DocumentTree,
	layout: DocumentLayout,
	charge: (work?: number) => void,
): TextDecorations | undefined {
	const styles = documentStyles(tree);
	if (!styles.hasTextDecorations()) return;
	const formatting = layout.text.horizontal.formatting;
	const chains = new Array<Decoration | null>(formatting.nodes.length).fill(
		null,
	);
	const inherited = new Array<Decoration | null>(formatting.nodes.length).fill(
		null,
	);
	const weights = new Array<400 | 700>(formatting.nodes.length).fill(400);
	const slopes = new Array<number>(formatting.nodes.length).fill(0);
	const pending = [formatting.root];
	while (pending.length) {
		charge();
		const node = formatting.nodes[pending.pop() as number];
		let chain = node.parent === null ? null : chains[node.parent];
		if (
			isAtomicInline(node) ||
			node.floatSide !== undefined ||
			node.position === "absolute" ||
			node.position === "fixed"
		)
			chain = null;
		inherited[node.id] = chain;
		weights[node.id] = matchFontWeight(
			Number(node.typography?.["font-weight"] ?? "400"),
		);
		slopes[node.id] = fontStyleSlope(
			(node.typography?.["font-style"] ?? "normal") as NativeFontStyle,
		);
		if (node.ref && (node.kind === "inline" || node.kind === "block")) {
			const domId = tree.resolve(node.ref).id;
			const style = styles.textDecoration(domId);
			if (style["text-decoration-line"] !== "none") {
				let duplicate = false;
				for (let ancestor = chain; ancestor; ancestor = ancestor.parent) {
					charge();
					if (ancestor.domId === domId) duplicate = true;
				}
				if (!duplicate) {
					const font = node.typography ?? initialTextStyle;
					const size = layoutNumber(Number.parseFloat(font["font-size"]));
					const color = parseCssColor(style["text-decoration-color"]);
					if (!color || color === "currentcolor")
						throw new AgentBrowserError(
							"invalid-input",
							"Unresolved text decoration color",
						);
					chain = {
						parent: chain,
						domId,
						lines: style["text-decoration-line"].split(" ") as DecorationLine[],
						color,
						thickness: size / 16,
						underline: size / 16,
						overline: (-size * bitmapFont.ascent) / bitmapFont.unitsPerEm,
						strike:
							-nativeFontXHeight(
								size,
								Number(font["font-weight"]),
								font["font-family"],
							) / 2,
					};
				}
			}
		}
		chains[node.id] = chain;
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	const lineSpacing = new WeakSet<Readonly<TextGlyph>>();
	const spacing = (glyph: Readonly<TextGlyph>) =>
		glyph.kind === "tab" || glyph.character === " " || glyph.advance === 0;
	for (const context of layout.text.contexts)
		for (const line of context.lines) {
			charge();
			let first = line.glyphStart;
			let last = line.glyphEnd;
			while (first < last && spacing(context.glyphs[first])) {
				charge();
				lineSpacing.add(context.glyphs[first++]);
			}
			while (last > first && spacing(context.glyphs[last - 1])) {
				charge();
				lineSpacing.add(context.glyphs[--last]);
			}
		}
	const edges = new WeakMap<Readonly<TextInlineFragment>, InlineEdges>();
	for (const context of layout.contexts) {
		const first = new Map<number, Readonly<TextInlineFragment>>();
		const last = new Map<number, Readonly<TextInlineFragment>>();
		for (const fragment of context.fragments) {
			charge();
			if (!first.has(fragment.formattingId))
				first.set(fragment.formattingId, fragment);
			last.set(fragment.formattingId, fragment);
		}
		for (const fragment of context.fragments) {
			charge();
			const node = formatting.nodes[fragment.formattingId];
			if (
				node.kind !== "inline" ||
				fragment.line === null ||
				!inherited[node.id]
			)
				continue;
			const box = resolveInlineEdges(context.contentWidth, node.box);
			const leading =
				first.get(node.id) === fragment && (node.fragmentIndex ?? 0) === 0;
			const trailing =
				last.get(node.id) === fragment &&
				(node.fragmentIndex ?? 0) === (node.fragmentCount ?? 1) - 1;
			const left = leading ? box["margin-left"] : 0;
			const right = trailing ? box["margin-right"] : 0;
			const before = leading
				? box["padding-left"] + (fragment.borders?.borderLeft ?? 0)
				: 0;
			const after = trailing
				? box["padding-right"] + (fragment.borders?.borderRight ?? 0)
				: 0;
			const size = Number.parseFloat(node.typography?.["font-size"] ?? "16px");
			edges.set(fragment, {
				baseline:
					fragment.y +
					box["padding-top"] +
					(fragment.borders?.borderTop ?? 0) +
					(size * bitmapFont.ascent) / bitmapFont.unitsPerEm,
				intervals: [
					[fragment.x - left, fragment.x + before],
					[
						fragment.x + fragment.width - after,
						fragment.x + fragment.width + right,
					],
				],
			});
		}
	}
	return { chains, inherited, weights, slopes, lineSpacing, edges, layers: [] };
}

function paintInterval(
	image: RasterImage,
	clip: DocumentClip,
	start: number,
	end: number,
	top: number,
	decoration: Decoration,
	charge: (work?: number) => void,
) {
	if (end <= start || decoration.thickness <= 0 || !decoration.color[3]) return;
	const left = Math.max(
		0,
		Math.min(image.width, Math.ceil(start - clip.x - 0.5)),
	);
	const right = Math.max(
		0,
		Math.min(image.width, Math.ceil(end - clip.x - 0.5)),
	);
	const upper = Math.max(
		0,
		Math.min(image.height, Math.ceil(top - clip.y - 0.5)),
	);
	const lower = Math.max(
		0,
		Math.min(
			image.height,
			Math.ceil(top + decoration.thickness - clip.y - 0.5),
		),
	);
	if (right <= left || lower <= upper) return;
	charge((right - left) * (lower - upper));
	paintRasterRect(
		image,
		left,
		upper,
		right - left,
		lower - upper,
		decoration.color,
	);
}

function paintLines(
	state: TextDecorations,
	chain: Decoration | null,
	lines: readonly DecorationLine[],
	paint: (decoration: Decoration, line: DecorationLine) => void,
	charge: (work?: number) => void,
) {
	state.layers.length = 0;
	for (let current = chain; current; current = current.parent) {
		charge();
		state.layers.push(current);
	}
	for (const line of lines)
		for (let index = state.layers.length - 1; index >= 0; index--) {
			charge();
			const decoration = state.layers[index];
			if (decoration.lines.includes(line)) paint(decoration, line);
		}
	state.layers.length = 0;
}

function offset(decoration: Decoration, line: DecorationLine) {
	return line === "underline"
		? decoration.underline
		: line === "overline"
			? decoration.overline
			: decoration.strike;
}

export function paintTextDecorations(
	state: TextDecorations | undefined,
	glyph: Readonly<TextGlyph>,
	contentY: number,
	image: RasterImage,
	clip: DocumentClip,
	phase: "before" | "after",
	charge: (work?: number) => void,
) {
	if (
		!state ||
		!glyph.visible ||
		glyph.advance <= 0 ||
		state.lineSpacing.has(glyph)
	)
		return;
	const chain = state.chains[glyph.formattingId];
	if (!chain) return;
	const scale = glyph.fontSize / bitmapFont.unitsPerEm;
	const baseline = contentY + glyph.y + bitmapFont.ascent * scale;
	paintLines(
		state,
		chain,
		phase === "before" ? ["underline", "overline"] : ["line-through"],
		(decoration, line) => {
			const top = baseline + offset(decoration, line);
			if (line === "line-through" || glyph.kind === "tab") {
				paintInterval(
					image,
					clip,
					glyph.x,
					glyph.x + glyph.advance,
					top,
					decoration,
					charge,
				);
				return;
			}
			const bitmap = bitmapGlyph(
				glyph.character,
				state.weights[glyph.formattingId],
			);
			const slope = state.slopes[glyph.formattingId];
			if (slope !== 0) {
				const intervals: [number, number][] = [];
				for (let row = 0; row < bitmap.rows.length; row++) {
					charge();
					const inkTop = contentY + glyph.y + row * scale;
					const startY = Math.max(inkTop, top);
					const endY = Math.min(inkTop + scale, top + decoration.thickness);
					if (startY >= endY) continue;
					for (let column = 0; column < bitmapFont.glyphWidth; column++) {
						charge();
						if (
							!(bitmap.rows[row] & (1 << (bitmapFont.glyphWidth - column - 1)))
						)
							continue;
						intervals.push([
							glyph.x +
								column * scale +
								slope * (baseline - endY) -
								decoration.thickness,
							glyph.x +
								(column + 1) * scale +
								slope * (baseline - startY) +
								decoration.thickness,
						]);
					}
				}
				intervals.sort((left, right) => {
					charge();
					return left[0] - right[0];
				});
				let cursor = glyph.x;
				for (const [start, end] of intervals) {
					charge();
					paintInterval(
						image,
						clip,
						cursor,
						Math.min(start, glyph.x + glyph.advance),
						top,
						decoration,
						charge,
					);
					cursor = Math.max(cursor, end);
				}
				paintInterval(
					image,
					clip,
					cursor,
					glyph.x + glyph.advance,
					top,
					decoration,
					charge,
				);
				return;
			}
			let blocked = 0;
			for (let row = 0; row < bitmap.rows.length; row++) {
				charge();
				const inkTop = contentY + glyph.y + row * scale;
				if (inkTop < top + decoration.thickness && inkTop + scale > top)
					blocked |= bitmap.rows[row];
			}
			let cursor = glyph.x;
			for (let column = 0; column < bitmapFont.glyphWidth; column++) {
				charge();
				if (!(blocked & (1 << (bitmapFont.glyphWidth - column - 1)))) continue;
				const start = glyph.x + column * scale - decoration.thickness;
				paintInterval(
					image,
					clip,
					cursor,
					Math.min(start, glyph.x + glyph.advance),
					top,
					decoration,
					charge,
				);
				cursor = Math.max(
					cursor,
					glyph.x + (column + 1) * scale + decoration.thickness,
				);
			}
			paintInterval(
				image,
				clip,
				cursor,
				glyph.x + glyph.advance,
				top,
				decoration,
				charge,
			);
		},
		charge,
	);
}

export function paintInlineDecorationEdges(
	state: TextDecorations | undefined,
	fragment: Readonly<TextInlineFragment>,
	image: RasterImage,
	clip: DocumentClip,
	charge: (work?: number) => void,
) {
	if (!state) return;
	const edges = state.edges.get(fragment);
	const chain = state.inherited[fragment.formattingId];
	if (!edges || !chain) return;
	paintLines(
		state,
		chain,
		["underline", "overline", "line-through"],
		(decoration, line) => {
			for (const [start, end] of edges.intervals)
				paintInterval(
					image,
					clip,
					start,
					end,
					edges.baseline + offset(decoration, line),
					decoration,
					charge,
				);
		},
		charge,
	);
}
