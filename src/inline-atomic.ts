import { AgentBrowserError } from "./errors.js";
import type { FormattingNode, FormattingTree } from "./formatting-tree.js";
import { layoutNumber } from "./layout-values.js";

export const atomicInlineCapabilities = Object.freeze({
	partial: true,
	displays: Object.freeze([
		"inline-block",
		"inline flow-root",
		"inline-flex",
		"inline flex",
	]),
	inlineBlock: true,
	inlineFlex: true,
	inlineBlockBaseline: "last-in-flow",
	inlineFlexBaseline: "first",
	missingBaseline: "under-margin-edge",
	verticalAlign: "baseline-only",
	overflow: "visible-only",
});

export interface AtomicInlineMetrics {
	id: number;
	borderBoxWidth: number;
	marginLeft: number;
	marginRight: number;
	block?: Readonly<{
		borderBoxHeight: number;
		marginTop: number;
		marginBottom: number;
		baseline: number | null;
		unsupportedBaseline?: boolean;
	}>;
}

export function isAtomicInline(node: Readonly<FormattingNode> | undefined) {
	return (
		node?.level === "inline" &&
		(node.kind === "block" || node.contentMode === "flex")
	);
}

export function atomicInlineBaseline(
	block: NonNullable<AtomicInlineMetrics["block"]>,
) {
	return layoutNumber(
		block.baseline ?? block.borderBoxHeight + block.marginBottom,
		true,
	);
}

export function atomicInlineMetrics(
	formatting: FormattingTree,
	values: readonly Readonly<AtomicInlineMetrics>[],
	charge: (amount?: number) => void,
) {
	const result = new Map<number, Readonly<AtomicInlineMetrics>>();
	for (const value of values) {
		charge();
		if (
			!value ||
			!Number.isSafeInteger(value.id) ||
			value.id < 0 ||
			result.has(value.id)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid or duplicate atomic inline metrics",
			);
		const node = formatting.nodes[value.id];
		if (!isAtomicInline(node) || (!node?.ref && !node?.generatedContent))
			throw new AgentBrowserError(
				"unsupported",
				"Atomic inline metrics require a retained atomic container",
			);
		layoutNumber(value.borderBoxWidth);
		layoutNumber(value.marginLeft, true);
		layoutNumber(value.marginRight, true);
		layoutNumber(
			value.borderBoxWidth + value.marginLeft + value.marginRight,
			true,
		);
		if (value.block) {
			charge();
			layoutNumber(value.block.borderBoxHeight);
			layoutNumber(value.block.marginTop, true);
			layoutNumber(value.block.marginBottom, true);
			if (value.block.baseline !== null)
				layoutNumber(value.block.baseline, true);
			if (
				value.block.unsupportedBaseline !== undefined &&
				typeof value.block.unsupportedBaseline !== "boolean"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid atomic inline baseline support",
				);
		}
		result.set(value.id, value);
	}
	return result;
}
