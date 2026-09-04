import { afterEach, expect, it, vi } from "vitest";
import * as controls from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import {
	nativeControlCaret,
	readNativeControlSelection,
} from "./native-control-caret.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	value = "abcd",
	attributes: Record<string, string> = {},
	tag = "input",
) {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const actions = new DocumentInteractions(tree);
	const field = tree.createElement(tag, attributes);
	tree.append(tree.root, field);
	tree.setControl(field, { value });
	actions.focus.focus(tree.reference(field));
	const owner = nativeControlCaret(tree);
	return {
		tree,
		actions,
		field,
		owner,
		read: () => readNativeControlSelection(tree, field),
	};
}

it.each([
	[1, 3],
	[3, 1],
	[2, 2],
	[0, 4],
	[4, 0],
])(
	"publishes first anchored selection %i/%i exactly once without an end-caret step",
	(anchor, position) => {
		const { tree, field, owner, read } = fixture();
		const observed: unknown[] = [];
		tree.onChange((change) => {
			if (change.kind === "style") observed.push(read());
		});
		const revision = tree.revision;
		const record = owner.select(field, anchor, position);
		const expected = {
			anchor,
			focus: position,
			start: Math.min(anchor, position),
			end: Math.max(anchor, position),
			valueLength: 4,
		};
		expect(observed).toEqual([expected]);
		expect(read()).toEqual(expected);
		expect(tree.revision).toBe(revision + 1);
		expect(record).toBe(owner.selection(field));
		expect(Object.isFrozen(record)).toBe(true);
	},
);

it("reads the relevant value once before publication and retains post-notification validation", () => {
	const { tree, field, owner } = fixture();
	const value = vi.spyOn(controls, "controlValue");
	const callsAtPublication: number[] = [];
	tree.onChange((change) => {
		if (change.kind === "style")
			callsAtPublication.push(value.mock.calls.length);
	});
	owner.select(field, 3, 1);
	expect(callsAtPublication).toEqual([1]);
	expect(value).toHaveBeenCalledTimes(2);
	value.mockClear();
	owner.select(field, 3, 1);
	expect(value).toHaveBeenCalledTimes(1);
});

it("returns the same authoritative record for a no-op and invalidates direction-only changes", () => {
	const { tree, field, owner, read } = fixture();
	const forward = owner.select(field, 1, 3);
	const snapshot = read();
	const revision = tree.revision;
	expect(owner.select(field, 1, 3)).toBe(forward);
	expect(tree.revision).toBe(revision);
	const reverse = owner.select(field, 3, 1);
	expect(reverse).not.toBe(forward);
	expect(reverse).toBe(owner.selection(field));
	expect(tree.revision).toBe(revision + 1);
	expect(read()).toEqual({
		anchor: 3,
		focus: 1,
		start: 1,
		end: 3,
		valueLength: 4,
	});
	expect(snapshot).toEqual({
		anchor: 1,
		focus: 3,
		start: 1,
		end: 3,
		valueLength: 4,
	});
});

it.each([
	[-1, 1],
	[1, -1],
	[5, 1],
	[1, 5],
	[0.5, 1],
	[1, 0.5],
	[Number.NaN, 1],
	[1, Number.NaN],
	[Number.POSITIVE_INFINITY, 1],
	[1, Number.NEGATIVE_INFINITY],
	[Number.MAX_SAFE_INTEGER + 1, 1],
	[1, Number.MAX_SAFE_INTEGER + 1],
	[2, 1],
	[1, 2],
	[2, 2],
])(
	"rejects invalid native boundary %s/%s without replacing or invalidating state",
	(anchor, position) => {
		const { tree, field, owner, read } = fixture("a🙂b");
		const record = owner.select(field, 3, 1);
		const before = read();
		const revision = tree.revision;
		expect(() => owner.select(field, anchor, position)).toThrow(
			"Invalid control caret boundary",
		);
		expect(tree.revision).toBe(revision);
		expect(owner.selection(field)).toBe(record);
		expect(read()).toEqual(before);
	},
);

it("does not create a record or notify for an invalid first selection", () => {
	const { tree, field, owner, read } = fixture("a🙂b");
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	expect(() => owner.select(field, 0, 2)).toThrow(
		"Invalid control caret boundary",
	);
	expect(owner.has(field)).toBe(false);
	expect(read()).toBeUndefined();
	expect(invalidate).not.toHaveBeenCalled();
});

it("keeps raw password text out of numeric snapshots while respecting surrogate boundaries", () => {
	const { field, owner, read } = fixture("a🙂b", { type: "password" });
	owner.select(field, 3, 1);
	const snapshot = read();
	expect(snapshot).toEqual({
		anchor: 3,
		focus: 1,
		start: 1,
		end: 3,
		valueLength: 4,
	});
	expect(Object.isFrozen(snapshot)).toBe(true);
	expect(
		Object.values(snapshot ?? {}).every((value) => typeof value === "number"),
	).toBe(true);
	expect(JSON.stringify(snapshot)).not.toContain("a🙂b");
	expect(() => owner.select(field, 2, 3)).toThrow(
		"Invalid control caret boundary",
	);
	expect(() => owner.select(field, 1, 2)).toThrow(
		"Invalid control caret boundary",
	);
});

it("uses normalized relevant textarea offsets", () => {
	const { field, owner, read } = fixture("ab\r\ncd", {}, "textarea");
	owner.select(field, 5, 3);
	expect(read()).toEqual({
		anchor: 5,
		focus: 3,
		start: 3,
		end: 5,
		valueLength: 5,
	});
	expect(() => owner.select(field, 0, 6)).toThrow(
		"Invalid control caret boundary",
	);
});

it("selects an empty placeholder value only at zero", () => {
	const { tree, field, owner, read } = fixture("", {
		placeholder: "not the value",
	});
	owner.select(field, 0, 0);
	expect(read()).toEqual({
		anchor: 0,
		focus: 0,
		start: 0,
		end: 0,
		valueLength: 0,
	});
	const revision = tree.revision;
	owner.select(field, 0, 0);
	expect(() => owner.select(field, 0, 1)).toThrow(
		"Invalid control caret boundary",
	);
	expect(tree.revision).toBe(revision);
});

it("allows readonly anchored selection without editing the value", () => {
	const { tree, field, owner, read } = fixture("abcd", { readonly: "" });
	owner.select(field, 3, 1);
	expect(read()?.anchor).toBe(3);
	expect(read()?.focus).toBe(1);
	expect(controls.controlValue(tree, field)).toBe("abcd");
});

it("selects against the current stale-replacement value without first collapsing at end", () => {
	const { tree, field, owner, read } = fixture();
	owner.select(field, 3, 1);
	tree.setControl(field, { value: "longer" });
	expect(read()).toBeUndefined();
	const observed: unknown[] = [];
	tree.onChange((change) => {
		if (change.kind === "style") observed.push(read());
	});
	owner.select(field, 1, 2);
	expect(observed).toEqual([
		{ anchor: 1, focus: 2, start: 1, end: 2, valueLength: 6 },
	]);
});

it("does not refresh a stale record when either new boundary is invalid", () => {
	const { tree, field, owner, read } = fixture();
	const record = owner.select(field, 3, 1);
	tree.setControl(field, { value: "x" });
	const revision = tree.revision;
	expect(() => owner.select(field, 3, 0)).toThrow(
		"Invalid control caret boundary",
	);
	expect(() => owner.select(field, 0, 3)).toThrow(
		"Invalid control caret boundary",
	);
	expect(tree.revision).toBe(revision);
	expect(read()).toBeUndefined();
	tree.setControl(field, { value: "abcd" });
	expect(owner.selection(field)).toBe(record);
});

it("rejects a stale focus target without losing the existing single record", () => {
	const { tree, actions, field, owner, read } = fixture();
	const record = owner.select(field, 3, 1);
	const other = tree.createElement("input", { value: "other" });
	tree.append(tree.root, other);
	actions.focus.focus(tree.reference(other));
	const revision = tree.revision;
	expect(() => owner.select(field, 0, 2)).toThrow("target changed");
	expect(tree.revision).toBe(revision);
	expect(read()).toBeUndefined();
	actions.focus.focus(tree.reference(field));
	expect(owner.selection(field)).toBe(record);
});

it("does not select a disconnected control", () => {
	const { tree, field, owner, read } = fixture();
	owner.select(field, 3, 1);
	tree.remove(field);
	const revision = tree.revision;
	expect(() => owner.select(field, 1, 2)).toThrow("target changed");
	expect(tree.revision).toBe(revision);
	expect(read()).toBeUndefined();
});

it("preserves a newer selection made during the single publication", () => {
	const { tree, field, owner, read } = fixture();
	let newer: ReturnType<typeof owner.select> | undefined;
	const stop = tree.onChange((change) => {
		if (change.kind !== "style") return;
		stop();
		newer = owner.select(field, 3, 2);
	});
	expect(() => owner.select(field, 0, 1)).toThrow(
		"changed during notification",
	);
	expect(owner.selection(field)).toBe(newer);
	expect(read()).toEqual({
		anchor: 3,
		focus: 2,
		start: 2,
		end: 3,
		valueLength: 4,
	});
});

it.each(["value", "value-roundtrip", "focus", "focus-roundtrip"])(
	"rejects reentrant %s mutation during the first selection publication",
	(kind) => {
		const { tree, actions, field, owner, read } = fixture();
		const stop = tree.onChange((change) => {
			if (change.kind !== "style") return;
			stop();
			if (kind.startsWith("value")) {
				tree.setControl(field, { value: "changed" });
				if (kind === "value-roundtrip")
					tree.setControl(field, { value: "abcd" });
			} else {
				actions.focus.focus(null);
				if (kind === "focus-roundtrip")
					actions.focus.focus(tree.reference(field));
			}
		});
		expect(() => owner.select(field, 1, 3)).toThrow("changed");
		if (kind === "value" || kind === "focus") expect(read()).toBeUndefined();
	},
);

it.each(["owner", "keyboard", "document"])(
	"does not return or resurrect ownership after reentrant %s close",
	(kind) => {
		const { tree, actions, field, owner, read } = fixture();
		if (kind === "keyboard") actions.keyboard.collapseEnd(field);
		const stop = tree.onChange((change) => {
			if (change.kind !== "style") return;
			stop();
			if (kind === "owner") owner.close();
			else if (kind === "keyboard") actions.keyboard.close();
			else tree.close();
		});
		expect(() => owner.select(field, 1, 3)).toThrow("closed");
		expect(read()).toBeUndefined();
		expect(() => owner.select(field, 0, 1)).toThrow("closed");
		expect(() => nativeControlCaret(tree)).toThrow("closed");
	},
);

it("does not reopen an explicitly closed owner on select", () => {
	const { tree, field, owner, read } = fixture();
	owner.close();
	const revision = tree.revision;
	expect(() => owner.select(field, 0, 1)).toThrow("closed");
	expect(tree.revision).toBe(revision);
	expect(read()).toBeUndefined();
	expect(() => nativeControlCaret(tree)).toThrow("closed");
});
