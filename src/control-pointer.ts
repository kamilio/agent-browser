import { hitControlText } from "./control-text-layout.js";
import { controlTextState } from "./control-text-state.js";
import { controlValue } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export function prepareControlPointer(
	tree: DocumentTree,
	id: number,
	point: Readonly<{ x: number; y: number; shift?: boolean }>,
) {
	if (
		!point ||
		typeof point !== "object" ||
		Array.isArray(point) ||
		(point.shift !== undefined && typeof point.shift !== "boolean") ||
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid control pointer point",
		);
	const state = controlTextState(tree, id);
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
			wordSpacing: state.control.wordSpacing,
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
	const anchor =
		point.shift && state.control.focused
			? (state.control.selection?.anchor ?? offset)
			: offset;
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
		anchor,
		verify() {
			const current =
				released ||
				changed ||
				focusChanges !== expectedFocusChanges ||
				tree.activeElement !== id ||
				tree.generatedFocusReference !== null ||
				controlValue(tree, id) !== value
					? undefined
					: controlTextState(tree, id);
			if (
				current?.fingerprint !== state.fingerprint ||
				current?.control.wordSpacing !== state.control.wordSpacing
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
