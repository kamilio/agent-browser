import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	layoutFormattingDocument,
	type DocumentBox,
	type DocumentLayout,
	type PositionedTextContext,
} from "./document-layout.js";
import {
	buildFormattingTree,
	formattingLimits,
	resolveFormattingPageWidths,
	type FormattingBlockWidth,
} from "./formatting-tree.js";
import { layoutFormattingFlexContainer } from "./flex-layout.js";
import { layoutNumber } from "./layout-values.js";
import { mergeAtomicInlineLayouts } from "./inline-atomic-placement.js";
import { isAtomicInline } from "./inline-atomic.js";
import {
	layoutFormattingText,
	textLayoutLimits,
	textLayoutWorkLimit,
	type TextContext,
	type TextLayoutOptions,
	type DocumentTextLayout,
} from "./text-layout.js";

export function layoutPageDocument(
	tree: DocumentTree,
	maxWork: number,
	options: TextLayoutOptions = {},
): Readonly<DocumentLayout> {
	textLayoutWorkLimit(options);
	const formatting = buildFormattingTree(tree, options.formatting);
	const shells: Readonly<FormattingBlockWidth>[] = [];
	const needsCoordinatedLayout = formatting.nodes.some(
		(node) => node.contentMode === "flex" || isAtomicInline(node),
	);
	const { formatting: _formatting, ...textLimits } = options;
	const horizontal = resolveFormattingPageWidths(
		formatting,
		needsCoordinatedLayout
			? Math.min(maxWork, formattingLimits.maxWork)
			: formattingLimits.maxWork,
		needsCoordinatedLayout ? (width) => shells.push(width) : undefined,
		{ nesting: 0, text: textLimits },
	);
	const text = layoutFormattingText(horizontal, options);
	if (!needsCoordinatedLayout) return layoutFormattingDocument(text, maxWork);
	return layoutFormattingFlexFlow(
		text,
		maxWork,
		options,
		false,
		0,
		formatting.metrics.work + horizontal.metrics.work + text.metrics.work,
	);
}

export function layoutFormattingFlexFlow(
	text: DocumentTextLayout,
	maxWork: number,
	options: TextLayoutOptions = {},
	isolated = false,
	nesting = 0,
	initialWork = 0,
): Readonly<DocumentLayout> {
	const horizontal = text.horizontal;
	const formatting = horizontal.formatting;
	const shells = horizontal.widths.filter(
		(width) => formatting.nodes[width.id].contentMode === "flex",
	);
	if (!shells.length && !horizontal.atomicLayouts?.length)
		return layoutFormattingDocument(text, maxWork, isolated);
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Page flex layout work limit exceeded",
			);
	};
	const remaining = () => {
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Page flex layout work limit exceeded",
			);
		return maxWork - work;
	};
	charge(initialWork);
	type FlexLayout = ReturnType<typeof layoutFormattingFlexContainer>;
	const layouts = new Map<number, FlexLayout>();
	const { formatting: _formatting, ...textOptions } = options;
	const textMetrics = { ...text.metrics };
	for (const shell of shells) {
		charge();
		const layout = layoutFormattingFlexContainer(
			formatting,
			shell.id,
			{
				contentWidth: shell.contentWidth,
				containingWidth: shell.containingWidth,
				containingHeight: shell.containingHeight,
			},
			{ maxWork: remaining(), reflow: { text: textOptions } },
			{
				atomicRoot: formatting.nodes[shell.id].level === "inline",
				validatedFormatting: true,
				nesting,
				contentHeight: shell.contentHeightOverride,
				contentHeightDefinite: shell.contentHeightDefinite,
				intrinsicHeight: shell.intrinsicHeight,
			},
		);
		charge(layout.metrics.work);
		layouts.set(shell.id, layout);
		for (const key of Object.keys(textMetrics) as (keyof typeof textMetrics)[])
			textMetrics[key] += layout.textMetrics[key];
		for (const [limit, metric] of [
			["maxTokens", "tokens"],
			["maxLines", "lines"],
			["maxFragments", "fragments"],
			["maxWork", "work"],
		] as const) {
			if (textMetrics[metric] > (options[limit] ?? textLayoutLimits[limit]))
				throw new AgentBrowserError(
					"resource-limit",
					"Page flex text limit exceeded",
				);
		}
	}
	const outer = layoutFormattingDocument(text, remaining(), isolated, layouts);
	charge(outer.metrics.work);
	const boxes: Readonly<DocumentBox>[] = [];
	const contexts: Readonly<PositionedTextContext>[] = [...outer.contexts];
	const relativeContexts: Readonly<TextContext>[] = [...text.contexts];
	const images = [...horizontal.images];
	const atomics = [...(horizontal.atomics ?? [])];
	let glyphs = outer.metrics.glyphs;
	let lines = outer.metrics.lines;
	for (const shell of outer.boxes) {
		charge();
		const layout = layouts.get(shell.id);
		if (!layout) {
			boxes.push(shell);
			continue;
		}
		const baselineOffset = shell.borderTop + shell.paddingTop;
		boxes.push(
			Object.freeze({
				...shell,
				flexBaselines: Object.freeze({
					first:
						layout.baselines.first === null
							? null
							: layoutNumber(layout.baselines.first + baselineOffset, true),
					last:
						layout.baselines.last === null
							? null
							: layoutNumber(layout.baselines.last + baselineOffset, true),
					unsupported: layout.baselines.unsupported,
				}),
			}),
		);
		if (layout.contentHeight !== shell.contentHeight)
			throw new AgentBrowserError(
				"unsupported",
				"Inconsistent flex container height",
			);
		for (const box of layout.boxes) {
			charge();
			const borderX = layoutNumber(box.borderX + shell.contentX, true);
			const borderY = layoutNumber(box.borderY + shell.contentY, true);
			layoutNumber(borderX + box.borderBoxWidth, true);
			layoutNumber(borderY + box.borderBoxHeight, true);
			boxes.push(
				Object.freeze({
					...box,
					borderX,
					borderY,
					contentX: layoutNumber(box.contentX + shell.contentX, true),
					contentY: layoutNumber(box.contentY + shell.contentY, true),
				}),
			);
		}
		for (const context of layout.contexts) {
			charge();
			const contentX = layoutNumber(context.contentX + shell.contentX, true);
			const contentY = layoutNumber(context.contentY + shell.contentY, true);
			const positioned: PositionedTextContext = {
				...context,
				contentX,
				contentY,
				lines: Object.freeze(
					context.lines.map((line) => {
						charge();
						lines++;
						const top = layoutNumber(line.top + shell.contentY, true);
						layoutNumber(top + line.height, true);
						return Object.freeze({
							...line,
							top,
							baseline: layoutNumber(line.baseline + shell.contentY, true),
						});
					}),
				),
				glyphs: Object.freeze(
					context.glyphs.map((glyph) => {
						charge();
						glyphs++;
						const x = layoutNumber(glyph.x + shell.contentX, true);
						const y = layoutNumber(glyph.y + shell.contentY, true);
						layoutNumber(x + glyph.advance, true);
						layoutNumber(y + glyph.fontSize, true);
						return Object.freeze({ ...glyph, x, y });
					}),
				),
				fragments: Object.freeze(
					context.fragments.map((fragment) => {
						charge();
						const x = layoutNumber(fragment.x + shell.contentX, true);
						const y = layoutNumber(fragment.y + shell.contentY, true);
						layoutNumber(x + fragment.width, true);
						layoutNumber(y + fragment.height, true);
						return Object.freeze({ ...fragment, x, y });
					}),
				),
			};
			contexts.push(Object.freeze(positioned));
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
		for (const image of layout.images) {
			charge();
			images.push(image);
		}
		for (const atomic of layout.atomics) {
			charge();
			atomics.push(atomic);
		}
	}
	const result = Object.freeze({
		...outer,
		text: Object.freeze({
			...text,
			contexts: Object.freeze(relativeContexts),
			metrics: Object.freeze(textMetrics),
			horizontal: Object.freeze({
				...horizontal,
				widths: Object.freeze(boxes),
				images: Object.freeze(images),
				...(atomics.length ? { atomics: Object.freeze(atomics) } : {}),
			}),
		}),
		boxes: Object.freeze(boxes),
		contexts: Object.freeze(contexts),
		metrics: Object.freeze({ work, boxes: boxes.length, glyphs, lines }),
	});
	return mergeAtomicInlineLayouts(
		result,
		horizontal.atomicLayouts ?? [],
		maxWork,
		options,
	);
}
