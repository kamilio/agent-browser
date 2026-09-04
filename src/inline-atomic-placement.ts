import type {
	DocumentLayout,
	PositionedTextContext,
} from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import type { AtomicInlineLayout } from "./inline-atomic-layout.js";
import { layoutNumber } from "./layout-values.js";
import {
	textLayoutLimits,
	type TextInlineFragment,
	type TextLayoutOptions,
} from "./text-layout.js";

export function mergeAtomicInlineLayouts(
	base: Readonly<DocumentLayout>,
	owners: readonly Readonly<AtomicInlineLayout>[],
	maxWork: number,
	options: TextLayoutOptions,
): Readonly<DocumentLayout> {
	if (!owners.length) return base;
	let work = base.metrics.work;
	const charge = () => {
		if (++work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Atomic inline placement work limit exceeded",
			);
	};
	const markers = new Map<
		number,
		{ fragment: Readonly<TextInlineFragment>; parent: number }
	>();
	for (const context of base.contexts) {
		charge();
		for (const fragment of context.fragments) {
			charge();
			if (!fragment.atomic) continue;
			if (markers.has(fragment.formattingId))
				throw new AgentBrowserError(
					"unsupported",
					"Duplicate atomic inline placement",
				);
			markers.set(fragment.formattingId, { fragment, parent: context.id });
		}
	}
	const boxes = [...base.boxes];
	const contexts = [...base.contexts];
	const relativeContexts = [...base.text.contexts];
	const images = [...base.text.horizontal.images];
	const atomics = [...(base.text.horizontal.atomics ?? [])];
	const textMetrics = { ...base.text.metrics };
	let glyphs = base.metrics.glyphs;
	let lines = base.metrics.lines;
	for (const owner of owners) {
		charge();
		const marker = markers.get(owner.id);
		const root = owner.document.boxes.find((box) => {
			charge();
			return box.id === owner.id;
		});
		if (!marker || !root)
			throw new AgentBrowserError(
				"unsupported",
				"Missing atomic inline placement",
			);
		const offsetX = layoutNumber(marker.fragment.x - root.borderX, true);
		const offsetY = layoutNumber(marker.fragment.y - root.borderY, true);
		for (const box of owner.document.boxes) {
			charge();
			const borderX = layoutNumber(box.borderX + offsetX, true);
			const borderY = layoutNumber(box.borderY + offsetY, true);
			layoutNumber(borderX + box.borderBoxWidth, true);
			layoutNumber(borderY + box.borderBoxHeight, true);
			boxes.push(
				Object.freeze({
					...box,
					borderX,
					borderY,
					containingBlock:
						box.id === owner.id ? marker.parent : box.containingBlock,
					contentX: layoutNumber(box.contentX + offsetX, true),
					contentY: layoutNumber(box.contentY + offsetY, true),
				}),
			);
		}
		for (const context of owner.document.contexts) {
			charge();
			const contentX = layoutNumber(context.contentX + offsetX, true);
			const contentY = layoutNumber(context.contentY + offsetY, true);
			const positioned: PositionedTextContext = Object.freeze({
				...context,
				contentX,
				contentY,
				lines: Object.freeze(
					context.lines.map((line) => {
						charge();
						lines++;
						return Object.freeze({
							...line,
							top: layoutNumber(line.top + offsetY, true),
							baseline: layoutNumber(line.baseline + offsetY, true),
						});
					}),
				),
				glyphs: Object.freeze(
					context.glyphs.map((glyph) => {
						charge();
						glyphs++;
						return Object.freeze({
							...glyph,
							x: layoutNumber(glyph.x + offsetX, true),
							y: layoutNumber(glyph.y + offsetY, true),
						});
					}),
				),
				fragments: Object.freeze(
					context.fragments.map((fragment) => {
						charge();
						return Object.freeze({
							...fragment,
							x: layoutNumber(fragment.x + offsetX, true),
							y: layoutNumber(fragment.y + offsetY, true),
						});
					}),
				),
			});
			contexts.push(positioned);
			relativeContexts.push(
				Object.freeze({
					id: context.id,
					...(context.ref ? { ref: context.ref } : {}),
					contentX,
					contentWidth: context.contentWidth,
					textHeight: context.textHeight,
					lines: Object.freeze(
						positioned.lines.map((line) => {
							charge();
							return Object.freeze({
								...line,
								top: layoutNumber(line.top - contentY, true),
								baseline: layoutNumber(line.baseline - contentY, true),
							});
						}),
					),
					glyphs: Object.freeze(
						positioned.glyphs.map((glyph) => {
							charge();
							return Object.freeze({
								...glyph,
								y: layoutNumber(glyph.y - contentY, true),
							});
						}),
					),
					fragments: Object.freeze(
						positioned.fragments.map((fragment) => {
							charge();
							return Object.freeze({
								...fragment,
								y: layoutNumber(fragment.y - contentY, true),
							});
						}),
					),
				}),
			);
		}
		for (const image of owner.document.text.horizontal.images) {
			charge();
			images.push(image);
		}
		for (const atomic of owner.document.text.horizontal.atomics ?? []) {
			charge();
			atomics.push(atomic);
		}
		for (const key of Object.keys(textMetrics) as (keyof typeof textMetrics)[])
			textMetrics[key] += owner.document.text.metrics[key];
		for (const [limit, metric] of [
			["maxTokens", "tokens"],
			["maxLines", "lines"],
			["maxFragments", "fragments"],
			["maxWork", "work"],
		] as const) {
			if (textMetrics[metric] > (options[limit] ?? textLayoutLimits[limit]))
				throw new AgentBrowserError(
					"resource-limit",
					"Atomic inline text limit exceeded",
				);
		}
	}
	const { atomicLayouts: _atomicLayouts, ...horizontal } = base.text.horizontal;
	return Object.freeze({
		...base,
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		text: Object.freeze({
			...base.text,
			contexts: Object.freeze(relativeContexts),
			metrics: Object.freeze(textMetrics),
			horizontal: Object.freeze({
				...horizontal,
				widths: Object.freeze(boxes),
				images: Object.freeze(images),
				atomics: Object.freeze(atomics),
			}),
		}),
		metrics: Object.freeze({ work, boxes: boxes.length, glyphs, lines }),
	});
}
