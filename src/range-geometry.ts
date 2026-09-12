import { type ClientRectangle, LayoutGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { DomBoundaryPoint, DomRange } from "./dom-range.js";
import { AgentBrowserError } from "./errors.js";
import { htmlDocumentFamily } from "./html-document-family.js";
import type { TextGlyph } from "./text-layout.js";
import {
	consolidateSourceGlyphs,
	sourceGlyphCoordinatesEqual,
} from "./text-source-glyphs.js";

export const rangeGeometryLimits = Object.freeze({
	maxWork: 2_000_000,
	maxNodes: 50_000,
	maxRectangles: 4_096,
	maxDepth: 256,
});
export const rangeGeometryCapabilities = Object.freeze({
	partial: true,
	profile: "ltr-source-indexed-shared-glyphs-and-element-boxes",
	preservedSegmentBreaks: "source-indexed-lf-cr-crlf-ff",
	ambiguousCollapsedPositions: false,
	bidiAndShaping: false,
	transforms: false,
});
type Limits = Partial<Record<keyof typeof rangeGeometryLimits, number>>;
interface SourceNode {
	id: number;
	before: number;
	after: number;
	start: number;
	length: number;
	slots?: number[];
}
interface SourceGlyph {
	glyph: Readonly<TextGlyph>;
	context: number;
	afterBreak?: Readonly<{ left: number; top: number }>;
}
const empty: readonly ClientRectangle[] = Object.freeze([]);

function rectangle(
	left: number,
	top: number,
	width: number,
	height: number,
): ClientRectangle {
	if (
		!Number.isFinite(left) ||
		!Number.isFinite(top) ||
		!Number.isFinite(width) ||
		width < 0 ||
		!Number.isFinite(height) ||
		height < 0 ||
		!Number.isFinite(left + width) ||
		!Number.isFinite(top + height)
	)
		throw new AgentBrowserError("unsupported", "Range rectangle is invalid");
	return Object.freeze({
		x: left,
		y: top,
		width,
		height,
		top,
		right: left + width,
		bottom: top + height,
		left,
	});
}

export function rangeClientRects(
	range: DomRange,
	options: Limits = {},
): readonly ClientRectangle[] {
	range.owner.ensureOpen();
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid Range geometry limits",
		);
	for (const [key, value] of Object.entries(options))
		if (
			!Object.hasOwn(rangeGeometryLimits, key) ||
			!Number.isSafeInteger(value) ||
			value < 1 ||
			value > rangeGeometryLimits[key as keyof typeof rangeGeometryLimits]
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid Range geometry limit",
			);
	const limits = { ...rangeGeometryLimits, ...options };
	const tree = range.owner.tree;
	const start = range.start;
	const end = range.end;
	if (
		!tree.isConnected(start.node) ||
		!tree.isConnected(end.node) ||
		tree.isTemplateContentsDocument ||
		htmlDocumentFamily(tree)
	)
		return empty;
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work >= limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Range geometry work limit exceeded",
			);
	};
	let cursor = 0;
	const nodes: SourceNode[] = [];
	const index = new Map<number, SourceNode>();
	const visit = (id: number, before: number, depth: number): SourceNode => {
		charge();
		if (nodes.length >= limits.maxNodes || depth > limits.maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Range geometry source index limit exceeded",
			);
		const node = tree.get(id);
		const source: SourceNode = {
			id,
			before,
			after: 0,
			start: ++cursor,
			length: 0,
		};
		nodes.push(source);
		index.set(id, source);
		if (node.kind === "text" || node.kind === "comment") {
			source.length = node.data.length;
			cursor += source.length;
		} else {
			source.slots = [cursor];
			for (const child of node.children) {
				charge();
				const entry = visit(child, cursor, depth + 1);
				entry.after = ++cursor;
				source.slots.push(cursor);
			}
		}
		return source;
	};
	visit(tree.root, 0, 0).after = ++cursor;
	const rank = (point: DomBoundaryPoint) => {
		const source = index.get(point.node);
		if (!source)
			throw new AgentBrowserError(
				"unsupported",
				"Range boundary has no document source index",
			);
		const value = source.slots
			? source.slots[point.offset]
			: source.start + point.offset;
		if (!Number.isSafeInteger(value))
			throw new AgentBrowserError(
				"unsupported",
				"Range boundary has no indexed offset",
			);
		return value;
	};
	const first = rank(start);
	const last = rank(end);
	const chosen = nodes.filter((source) => {
		charge();
		const node = tree.get(source.id);
		return node.kind === "element"
			? first <= source.before && last >= source.after && first !== last
			: node.kind === "text" &&
					(source.id === start.node ||
						source.id === end.node ||
						(first < source.start + source.length && last > source.start));
	});
	if (!chosen.length) return empty;
	const layout = layoutDocument(tree, { maxWork: limits.maxWork - work });
	charge(
		layout.metrics.work +
			layout.text.metrics.work +
			layout.text.horizontal.metrics.work,
	);
	const formatting = layout.text.horizontal.formatting;
	const fixed = new Set<number>();
	for (const id of layout.fixedIds ?? []) {
		charge();
		fixed.add(id);
	}
	const textNodes = new Map<string, (typeof formatting.nodes)[number]>();
	const fixedRefs = new Set<string>();
	for (const node of formatting.nodes) {
		charge();
		if (node.ref && node.kind === "text") textNodes.set(node.ref, node);
		if (node.ref && fixed.has(node.id)) fixedRefs.add(node.ref);
	}
	const glyphs = new Map<string, SourceGlyph[]>();
	const chosenTextRefs = new Set<string>();
	for (const source of chosen) {
		charge();
		if (tree.get(source.id).kind === "text")
			chosenTextRefs.add(tree.reference(source.id));
	}
	const relative = new Map<number, Readonly<{ left: number; top: number }>>();
	for (const position of layout.relativePositions ?? []) {
		charge();
		relative.set(position.id, position);
	}
	const localShifts = new Map<
		string,
		Readonly<{ left: number; top: number }>
	>();
	const localShift = (id: number, contextId: number) => {
		const key = `${contextId}:${id}`;
		const existing = localShifts.get(key);
		if (existing) return existing;
		let left = 0;
		let top = 0;
		let ancestor: number | null = id;
		while (ancestor !== contextId) {
			charge();
			if (ancestor === null)
				throw new AgentBrowserError(
					"unsupported",
					"Range break is outside its text context",
				);
			const shift = relative.get(ancestor);
			left += shift?.left ?? 0;
			top += shift?.top ?? 0;
			ancestor = formatting.nodes[ancestor].parent;
		}
		const shift = Object.freeze({ left, top });
		localShifts.set(key, shift);
		return shift;
	};
	for (const context of layout.contexts) {
		charge();
		for (const glyph of consolidateSourceGlyphs(context.glyphs, charge)) {
			charge();
			const entries = glyphs.get(glyph.ref) ?? [];
			entries.push({ glyph, context: context.id });
			glyphs.set(glyph.ref, entries);
		}
		for (const line of context.lines) {
			charge();
			const boundary = line.sourceBreak;
			if (!boundary) continue;
			if (
				!boundary.sources.some((source) => {
					charge();
					return chosenTextRefs.has(source.ref);
				})
			)
				continue;
			const ownerShift = localShift(
				boundary.sources[0].formattingId,
				context.id,
			);
			for (let index = 0; index < boundary.sources.length; index++) {
				charge();
				const source = boundary.sources[index];
				const shift = localShift(source.formattingId, context.id);
				if (shift.left !== ownerShift.left || shift.top !== ownerShift.top)
					throw new AgentBrowserError(
						"unsupported",
						"Range CRLF spans differently positioned inline owners",
					);
				const glyph: Readonly<TextGlyph> = Object.freeze({
					...source,
					character: "\n",
					kind: "glyph",
					supported: true,
					visible: false,
					fontSize: boundary.fontSize,
					line: line.index,
					x: context.contentX + boundary.inlineOffset + shift.left,
					y: line.baseline - boundary.ascent + shift.top,
					advance: 0,
				});
				const entries = glyphs.get(source.ref) ?? [];
				entries.push({
					glyph,
					context: context.id,
					...(index === boundary.sources.length - 1 && boundary.followingLine
						? {
								afterBreak: Object.freeze({
									left:
										context.contentX +
										boundary.followingLine.inlineOffset +
										shift.left,
									top:
										line.baseline +
										boundary.followingLine.baselineOffset -
										boundary.ascent +
										shift.top,
								}),
							}
						: {}),
				});
				glyphs.set(source.ref, entries);
			}
		}
	}
	const selected = new Set(chosen.map((source) => source.id));
	const scroll = documentScrollPosition(tree);
	const rects: ClientRectangle[] = [];
	const append = (rect: ClientRectangle, isFixed: boolean) => {
		charge();
		if (rects.length >= limits.maxRectangles)
			throw new AgentBrowserError(
				"resource-limit",
				"Range geometry rectangle limit exceeded",
			);
		rects.push(
			rectangle(
				rect.x - (isFixed ? 0 : scroll.x),
				rect.y - (isFixed ? 0 : scroll.y),
				rect.width,
				rect.height,
			),
		);
	};
	let geometry: LayoutGeometry | undefined;
	for (const source of chosen) {
		charge();
		const node = tree.get(source.id);
		const ref = tree.reference(source.id);
		if (node.kind === "element") {
			if (node.parent !== null && selected.has(node.parent)) continue;
			if (!geometry) {
				geometry = new LayoutGeometry(layout);
				charge(geometry.metrics().work);
			}
			for (const rect of geometry.getClientRects(ref))
				append(rect, fixedRefs.has(ref));
			continue;
		}
		if (node.kind !== "text") continue;
		const formatted = textNodes.get(ref);
		if (!formatted) continue;
		const data = node.data;
		charge(data.length);
		if (formatted.text !== data)
			throw new AgentBrowserError(
				"unsupported",
				"Range text differs from its formatting source",
			);
		if (
			/\p{Mark}|[\u0590-\u08ff\u200c-\u200f\u202a-\u202e\u2066-\u2069]/u.test(
				data,
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Range geometry for bidi or shaped text is unsupported",
			);
		const lower = Math.max(0, Math.min(data.length, first - source.start));
		const upper = Math.max(0, Math.min(data.length, last - source.start));
		const mode = formatted.typography?.["white-space"] ?? "normal";
		const breaks = ["pre", "pre-wrap", "pre-line"].includes(mode);
		const entries = glyphs.get(ref) ?? [];
		entries.sort((before, after) => {
			charge();
			return before.glyph.offset - after.glyph.offset;
		});
		let precedingEnd = 0;
		for (const { glyph } of entries) {
			charge();
			if (
				!Number.isFinite(glyph.x) ||
				!Number.isFinite(glyph.y) ||
				!Number.isFinite(glyph.advance) ||
				glyph.advance < 0 ||
				!Number.isFinite(glyph.x + glyph.advance) ||
				!Number.isFinite(glyph.fontSize) ||
				glyph.fontSize < 0 ||
				!Number.isFinite(glyph.y + glyph.fontSize) ||
				(glyph.fontSize === 0 && glyph.advance !== 0)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Range glyph metrics are invalid",
				);
			if (
				glyph.offset < precedingEnd ||
				glyph.codeUnits < 1 ||
				glyph.offset + glyph.codeUnits > data.length
			)
				throw new AgentBrowserError(
					"unsupported",
					"Range glyph source intervals are not uniquely mapped",
				);
			precedingEnd = glyph.offset + glyph.codeUnits;
		}
		if (!entries.length) {
			if (
				!data.length ||
				((mode === "normal" || mode === "nowrap" || mode === "pre-line") &&
					/^[\t \r\n\f]*$/.test(data) &&
					!(breaks && /[\r\n\f]/.test(data)))
			)
				continue;
			throw new AgentBrowserError(
				"unsupported",
				"Range text has no source-indexed glyph geometry",
			);
		}
		if (lower === upper) {
			const candidates: (SourceGlyph & { rect: ClientRectangle })[] = [];
			for (const { glyph, context, afterBreak } of entries) {
				charge();
				if (lower < glyph.offset || lower > glyph.offset + glyph.codeUnits)
					continue;
				const inside =
					lower > glyph.offset && lower < glyph.offset + glyph.codeUnits;
				const atEnd = lower === glyph.offset + glyph.codeUnits;
				const left =
					atEnd && afterBreak
						? afterBreak.left
						: glyph.x + (atEnd ? glyph.advance : 0);
				const rect = rectangle(
					left,
					atEnd && afterBreak ? afterBreak.top : glyph.y,
					inside ? glyph.advance : 0,
					glyph.fontSize,
				);
				if (
					!candidates.some(
						(candidate) =>
							(candidate.rect.x === rect.x ||
								(!candidate.afterBreak &&
									!afterBreak &&
									candidate.context === context &&
									candidate.glyph.formattingId === glyph.formattingId &&
									candidate.glyph.line === glyph.line &&
									candidate.glyph.offset + candidate.glyph.codeUnits ===
										lower &&
									glyph.offset === lower &&
									rect.width === 0 &&
									sourceGlyphCoordinatesEqual(candidate.rect.x, rect.x))) &&
							candidate.rect.y === rect.y &&
							candidate.rect.width === rect.width &&
							candidate.rect.height === rect.height,
					)
				)
					candidates.push({ glyph, context, afterBreak, rect });
			}
			if (candidates.length !== 1)
				throw new AgentBrowserError(
					"unsupported",
					"Range collapsed source position has no unambiguous glyph boundary",
				);
			append(candidates[0].rect, fixedRefs.has(ref));
			continue;
		}
		let current:
			| { context: number; line: number; rect: ClientRectangle }
			| undefined;
		let matched = false;
		let covered = lower;
		const missing = (until: number) => {
			charge(Math.max(0, until - covered));
			if (
				until > covered &&
				(mode === "pre" ||
					mode === "pre-wrap" ||
					!/^[\t \r\n\f]*$/.test(data.slice(covered, until)))
			)
				throw new AgentBrowserError(
					"unsupported",
					"Range text source interval is not mapped to glyphs",
				);
		};
		for (const { glyph, context } of entries) {
			charge();
			if (glyph.offset >= upper || glyph.offset + glyph.codeUnits <= lower)
				continue;
			missing(Math.max(lower, glyph.offset));
			covered = Math.max(
				covered,
				Math.min(upper, glyph.offset + glyph.codeUnits),
			);
			matched = true;
			const rect = rectangle(glyph.x, glyph.y, glyph.advance, glyph.fontSize);
			if (
				current &&
				current.context === context &&
				current.line === glyph.line
			) {
				const left = Math.min(current.rect.left, rect.left);
				const top = Math.min(current.rect.top, rect.top);
				current.rect = rectangle(
					left,
					top,
					Math.max(current.rect.right, rect.right) - left,
					Math.max(current.rect.bottom, rect.bottom) - top,
				);
			} else {
				if (current) append(current.rect, fixedRefs.has(ref));
				current = { context, line: glyph.line, rect };
			}
		}
		missing(upper);
		if (current) append(current.rect, fixedRefs.has(ref));
		if (!matched)
			throw new AgentBrowserError(
				"unsupported",
				"Range contains only unmapped collapsed whitespace",
			);
	}
	return Object.freeze(rects);
}

export function rangeBoundingClientRect(
	range: DomRange,
	options: Limits = {},
): ClientRectangle {
	const rects = rangeClientRects(range, options);
	if (!rects.length) return rectangle(0, 0, 0, 0);
	if (rects.every((rect) => rect.width === 0 || rect.height === 0))
		return rects[0];
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		if (rect.width === 0 && rect.height === 0) continue;
		left = Math.min(left, rect.left);
		top = Math.min(top, rect.top);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	return rectangle(left, top, right - left, bottom - top);
}
