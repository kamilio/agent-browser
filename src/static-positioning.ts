import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import type { DocumentBox, DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import {
	layoutFormattingFlexFlow,
	layoutFormattingPageDocument,
} from "./flex-document.js";
import {
	type FormattingNode,
	type FormattingTree,
	formattingLimits,
	resolveFormattingBlockWidths,
} from "./formatting-tree.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";
import { applyRelativePositioning } from "./relative-positioning.js";
import { type TextLayoutOptions, layoutFormattingText } from "./text-layout.js";

export function flowStaticPosition(
	formatting: FormattingTree,
	id: number,
	boxes: ReadonlyMap<number, Readonly<DocumentBox>>,
	maxWork: number,
	options: TextLayoutOptions,
) {
	let work = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work >= maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Static-position reflow work limit exceeded",
			);
	};
	const target = formatting.nodes[id];
	let scopeId = target.parent ?? formatting.root;
	while (scopeId !== formatting.root) {
		charge();
		const candidate = formatting.nodes[scopeId];
		if (
			candidate.independentContext &&
			candidate.kind !== "anonymous-block" &&
			boxes.has(scopeId)
		)
			break;
		scopeId = candidate.parent ?? formatting.root;
	}
	const scope = boxes.get(scopeId);
	const nodes: FormattingNode[] = formatting.nodes.map((node) => {
		charge();
		return { ...node };
	});
	const display = target.staticDisplay ?? target.display ?? "block";
	const inline = display.startsWith("inline");
	const ordinaryInline = display === "inline" || display === "inline flow";
	const targetStyle = { ...(target.box ?? initialBoxStyle) };
	for (const edge of [
		"margin-top",
		"margin-right",
		"margin-bottom",
		"margin-left",
	] as const)
		if (targetStyle[edge] === "auto") targetStyle[edge] = "0px";
	nodes[id] = {
		...target,
		position: undefined,
		display,
		level: inline ? "inline" : "block",
		kind: ordinaryInline && target.kind !== "replaced" ? "inline" : target.kind,
		independentContext:
			target.contentMode === "flex" ||
			display.includes("flow-root") ||
			display === "inline-block",
		box: Object.freeze(targetStyle),
	};
	const normalize = (nodeId: number): number[] => {
		charge();
		const node = nodes[nodeId];
		if (
			nodeId !== scopeId &&
			nodeId !== id &&
			(node.position === "absolute" || node.position === "fixed")
		)
			return [];
		const children: number[] = [];
		for (const child of node.children) {
			charge();
			children.push(...normalize(child));
		}
		if (node.kind === "anonymous-block" && !node.flexItem && nodeId !== scopeId)
			return children;
		if (
			node.kind === "inline" &&
			children.some((child) => nodes[child].level === "block")
		)
			throw new AgentBrowserError(
				"unsupported",
				"Static positioning across block-in-inline splits is not implemented",
			);
		if (
			(node.kind === "block" ||
				node.kind === "viewport" ||
				node.kind === "anonymous-block") &&
			node.contentMode !== "flex"
		) {
			if (children.some((child) => nodes[child].level === "block")) {
				const normalized: number[] = [];
				let run: number[] = [];
				const flush = () => {
					if (!run.length) return;
					charge(run.length);
					if (
						nodes.length >=
						(options.formatting?.maxBoxes ?? formattingLimits.maxBoxes)
					)
						throw new AgentBrowserError(
							"resource-limit",
							"Static-position formatting box limit exceeded",
						);
					const anonymous = nodes.length;
					nodes.push({
						id: anonymous,
						parent: nodeId,
						kind: "anonymous-block",
						level: "block",
						contentMode: "inline",
						visible: node.visible,
						box: initialBoxStyle,
						typography: node.typography,
						children: run,
					});
					for (const child of run) nodes[child].parent = anonymous;
					normalized.push(anonymous);
					run = [];
				};
				for (const child of children) {
					charge();
					if (nodes[child].level === "block") {
						flush();
						normalized.push(child);
					} else run.push(child);
				}
				flush();
				node.children = normalized;
				node.contentMode = "blocks";
			} else {
				node.children = children;
				node.contentMode = "inline";
			}
		} else node.children = children;
		for (const child of node.children) nodes[child].parent = nodeId;
		if (node.orderModifiedChildren) {
			const retained = new Set(node.children);
			node.orderModifiedChildren = node.orderModifiedChildren.filter(
				(child) => {
					charge();
					return retained.has(child);
				},
			);
		}
		return [nodeId];
	};
	normalize(scopeId);
	if (scope)
		nodes[scopeId] = {
			...nodes[scopeId],
			position: undefined,
			level: "block",
			flexItem: false,
		};
	const hypothetical: FormattingTree = Object.freeze({
		...formatting,
		root: scopeId,
		issues: Object.freeze(
			Object.fromEntries(
				Object.entries(formatting.issues).filter(
					([name]) => name !== "positioned-layout-requires-coordination",
				),
			),
		),
		nodes: Object.freeze(
			nodes.map((node) =>
				Object.freeze({ ...node, children: Object.freeze(node.children) }),
			),
		),
	});
	const { formatting: _formatting, ...textOptions } = options;
	let layout: Readonly<DocumentLayout>;
	if (scope) {
		const horizontal = resolveFormattingBlockWidths(
			hypothetical,
			[
				{
					id: scopeId,
					containingBlock: scope.containingBlock,
					containingWidth: scope.containingWidth,
					containingHeight: scope.containingHeight,
					contentX: 0,
					usedWidth: scope,
					...(scope.definiteHeight === null
						? {}
						: { contentHeightOverride: scope.definiteHeight }),
				},
			],
			maxWork - work,
			true,
			() => {},
			{ atomicRoot: scopeId, text: textOptions },
		);
		charge(horizontal.metrics.work);
		const text = layoutFormattingText(horizontal, options);
		charge(text.metrics.work);
		layout = layoutFormattingFlexFlow(text, maxWork - work, options, true);
	} else
		layout = layoutFormattingPageDocument(
			hypothetical,
			maxWork - work,
			options,
		);
	layout = applyRelativePositioning(layout, maxWork - work);
	charge(layout.metrics.work);
	const root = layout.boxes.find((box) => {
		charge();
		return box.id === scopeId;
	});
	const deltaX = scope ? scope.borderX - (root?.borderX ?? 0) : 0;
	const deltaY = scope ? scope.borderY - (root?.borderY ?? 0) : 0;
	const block = layout.boxes.find((box) => {
		charge();
		return box.id === id;
	});
	if (block)
		return Object.freeze({
			left: layoutNumber(block.borderX - block.marginLeft + deltaX, true),
			top: layoutNumber(block.borderY - block.marginTop + deltaY, true),
			work,
		});
	for (const context of layout.contexts) {
		charge();
		const fragment = context.fragments.find((fragment) => {
			charge();
			return fragment.formattingId === id;
		});
		if (!fragment) continue;
		const line = context.lines.find((line) => {
			charge();
			return line.index === fragment.line;
		});
		if (!line && context.lines.length)
			throw new AgentBrowserError(
				"unsupported",
				"Static inline position requires an identified line box",
			);
		return Object.freeze({
			left: layoutNumber(
				fragment.x -
					resolveLayoutLength(
						targetStyle["margin-left"],
						context.contentWidth,
						true,
					) +
					deltaX,
				true,
			),
			top: layoutNumber((line?.top ?? context.contentY) + deltaY, true),
			work,
		});
	}
	throw new AgentBrowserError(
		"unsupported",
		"Static-position hypothetical box is unavailable",
	);
}

export function flexStaticPosition(
	parent: Readonly<FormattingNode>,
	parentBox: Readonly<DocumentBox>,
	child: Readonly<FormattingNode>,
	width: number,
	height: number,
	axes: Readonly<{ horizontal: boolean; vertical: boolean }>,
) {
	const flex = parent.flex ?? initialFlexStyle;
	const self = child.staticFlex?.["align-self"] ?? "auto";
	const column = flex["flex-direction"].startsWith("column");
	const reverse = flex["flex-direction"].endsWith("reverse");
	const crossReverse = flex["flex-wrap"] === "wrap-reverse";
	const align = (
		value: string,
		free: number,
		reversed: boolean,
		main: boolean,
	) => {
		const keyword = value.replace(/^(safe|unsafe) /, "");
		if (value.startsWith("safe ") && free < 0) return 0;
		if (main && free < 0 && keyword.startsWith("space-")) return 0;
		if (main && column && ["left", "right"].includes(keyword)) return 0;
		if (keyword === "center") return free / 2;
		if (["start", "self-start", "left"].includes(keyword)) return 0;
		if (["end", "self-end", "right"].includes(keyword)) return free;
		if (keyword === "flex-end") return reversed ? 0 : free;
		if (main && ["space-around", "space-evenly"].includes(keyword))
			return free / 2;
		if (["normal", "stretch", "flex-start", "space-between"].includes(keyword))
			return reversed ? free : 0;
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported static flex alignment",
		);
	};
	const main = (column ? axes.vertical : axes.horizontal)
		? align(
				flex["justify-content"],
				column
					? parentBox.contentHeight - height
					: parentBox.contentWidth - width,
				reverse,
				true,
			)
		: 0;
	const cross = (column ? axes.horizontal : axes.vertical)
		? align(
				self === "auto" ? flex["align-items"] : self,
				column
					? parentBox.contentWidth - width
					: parentBox.contentHeight - height,
				crossReverse,
				false,
			)
		: 0;
	return Object.freeze({
		left: parentBox.contentX + (column ? cross : main),
		top: parentBox.contentY + (column ? main : cross),
	});
}
