import { hitControlText } from "./control-text-layout.js";
import { controlValue, inputType, isControlDisabled } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { isInertSubtree } from "./inertness.js";

function pointerState(tree: DocumentTree, id: number) {
	if (
		!tree.isConnected(id) ||
		isControlDisabled(tree, id) ||
		isInertSubtree(tree, id)
	)
		return;
	const node = tree.get(id);
	if (
		node.tagName !== "textarea" &&
		!(
			node.tagName === "input" &&
			["text", "search", "url", "tel", "password"].includes(inputType(node))
		)
	)
		return;
	const reference = tree.reference(id);
	const layout = layoutDocument(tree);
	let used: (typeof layout.text.horizontal.images)[number] | undefined;
	for (const image of layout.text.horizontal.images) {
		if (image.ref !== reference) continue;
		if (used) return;
		used = image;
	}
	if (!used || used.contentWidth <= 0 || used.contentHeight <= 0) return;
	const formatting = layout.text.horizontal.formatting.nodes[used.id];
	const control = formatting.control;
	if (
		!formatting.visible ||
		!control ||
		(control.kind !== "text" && control.kind !== "textarea")
	)
		return;
	const rectangles = documentGeometry(tree).getClientRects(id);
	if (rectangles.length !== 1) return;
	const rectangle = rectangles[0];
	const originX = rectangle.x + used.borderLeft + used.paddingLeft;
	const originY = rectangle.y + used.borderTop + used.paddingTop;
	return {
		control,
		kind: control.kind,
		originX,
		originY,
		width: used.contentWidth,
		height: used.contentHeight,
		columns: Math.ceil(used.contentWidth),
		rows: Math.ceil(used.contentHeight),
		fingerprint: JSON.stringify([
			node.tagName,
			inputType(node),
			control.kind,
			control.text,
			control.fontSize,
			control.placeholder,
			originX,
			originY,
			used.contentWidth,
			used.contentHeight,
			rectangle,
		]),
	};
}

export function prepareControlPointer(
	tree: DocumentTree,
	id: number,
	point: Readonly<{ x: number; y: number }>,
) {
	if (
		!point ||
		typeof point !== "object" ||
		Array.isArray(point) ||
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid control pointer point",
		);
	const state = pointerState(tree, id);
	if (!state) return;
	let value = controlValue(tree, id);
	const allowedOffsets = [0];
	let position = 0;
	for (const character of value) {
		position += character.length;
		allowedOffsets.push(position);
	}
	const offset = hitControlText(
		{
			kind: state.kind,
			text: state.control.text,
			fontSize: state.control.fontSize,
			columns: state.columns,
			rows: state.rows,
			placeholder: state.control.placeholder,
			selection: state.control.selection,
		},
		{
			x: Math.max(
				0,
				Math.min(
					state.columns - 0.5,
					((point.x - state.originX) * state.columns) / state.width,
				),
			),
			y: Math.max(
				0,
				Math.min(
					state.rows - 0.5,
					((point.y - state.originY) * state.rows) / state.height,
				),
			),
		},
		allowedOffsets,
	);
	if (offset === undefined) return;
	const expectedFocusChanges =
		tree.activeElement === id ? 0 : tree.activeElement === null ? 1 : 2;
	let focusChanges = 0;
	let changed = false;
	let released = false;
	const unregister =
		expectedFocusChanges === 0
			? () => {}
			: tree.onChange((change) => {
					if (change.kind === "focus") focusChanges++;
					else if (
						["style", "insert", "remove"].includes(change.kind) ||
						(change.target === id &&
							["attribute", "control", "text"].includes(change.kind))
					)
						changed = true;
				});
	return Object.freeze({
		offset,
		verify() {
			if (
				released ||
				changed ||
				focusChanges !== expectedFocusChanges ||
				tree.activeElement !== id ||
				tree.generatedFocusReference !== null ||
				controlValue(tree, id) !== value ||
				pointerState(tree, id)?.fingerprint !== state.fingerprint
			)
				throw new AgentBrowserError(
					"not-actionable",
					"Control pointer target changed during focus",
				);
		},
		release() {
			if (released) return;
			released = true;
			value = "";
			unregister();
		},
	});
}
