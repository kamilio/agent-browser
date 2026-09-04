import { afterEach, expect, it, vi } from "vitest";
import { controlValue } from "./controls.js";
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

function fixture(attributes: Record<string, string> = {}, tag = "input") {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const actions = new DocumentInteractions(tree);
	const field = tree.createElement(tag, { value: "abcd", ...attributes });
	tree.append(tree.root, field);
	actions.focus.focus(tree.reference(field));
	return {
		tree,
		actions,
		field,
		keyboard: actions.keyboard,
		events: actions.events,
		read: () => readNativeControlSelection(tree, field),
	};
}

it("reads absent ownership without listeners, invalidation or callbacks", () => {
	const { tree, field, read } = fixture();
	const change = vi.spyOn(tree, "onChange");
	const close = vi.spyOn(tree, "onClose");
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	const revision = tree.revision;
	for (let count = 0; count < 20; count++) expect(read()).toBeUndefined();
	expect(readNativeControlSelection(tree, field + 100)).toBeUndefined();
	expect(change).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
	expect(invalidate).not.toHaveBeenCalled();
	expect(tree.revision).toBe(revision);
});

it("publishes actual keyboard movement, select-all and reverse selection", () => {
	const { tree, field, keyboard, read } = fixture();
	keyboard.collapseEnd(field);
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	expect(keyboard.press("ArrowLeft").selection).toEqual({ start: 3, end: 3 });
	expect(read()).toEqual({
		anchor: 3,
		focus: 3,
		start: 3,
		end: 3,
		valueLength: 4,
	});
	keyboard.press("Shift+ArrowLeft");
	expect(read()).toEqual({
		anchor: 3,
		focus: 2,
		start: 2,
		end: 3,
		valueLength: 4,
	});
	keyboard.press("Control+A");
	expect(read()).toEqual({
		anchor: 0,
		focus: 4,
		start: 0,
		end: 4,
		valueLength: 4,
	});
	keyboard.press("ArrowLeft");
	expect(read()?.focus).toBe(0);
	keyboard.press("Control+A");
	keyboard.press("ArrowRight");
	expect(read()?.focus).toBe(4);
	expect(invalidate).toHaveBeenCalledTimes(6);
	expect(controlValue(tree, field)).toBe("abcd");
});

it("invalidates direction-only changes but not equivalent records", () => {
	const { tree, field, read } = fixture();
	const owner = nativeControlCaret(tree);
	owner.move(owner.selection(field), 0, 4);
	const forward = read();
	const revision = tree.revision;
	owner.move(owner.selection(field), 4, 0);
	expect(tree.revision).toBe(revision + 1);
	expect(read()).toEqual({
		anchor: 4,
		focus: 0,
		start: 0,
		end: 4,
		valueLength: 4,
	});
	owner.move(owner.selection(field), 4, 0);
	expect(tree.revision).toBe(revision + 1);
	expect(forward).toEqual({
		anchor: 0,
		focus: 4,
		start: 0,
		end: 4,
		valueLength: 4,
	});
});

it.each(["End", "ArrowRight", "Shift+ArrowRight"])(
	"does not invalidate an existing end caret for %s",
	(key) => {
		const { tree, field, keyboard } = fixture();
		keyboard.collapseEnd(field);
		const invalidate = vi.spyOn(tree, "invalidatePresentation");
		keyboard.press(key);
		keyboard.collapseEnd(field);
		expect(invalidate).not.toHaveBeenCalled();
	},
);

it("does not invalidate repeated select-all or a canceled movement", () => {
	const { tree, keyboard, events, field, read } = fixture();
	keyboard.press("Control+A");
	const before = read();
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	keyboard.press("Meta+A");
	events.addEventListener(field, "keydown", (event) => event.preventDefault());
	expect(keyboard.press("ArrowLeft").canceled).toBe(true);
	expect(read()).toEqual(before);
	expect(invalidate).not.toHaveBeenCalled();
});

it("returns detached frozen numeric-only password snapshots without callbacks", () => {
	const secret = "secret🙂";
	const { tree, actions, keyboard, field, read } = fixture({
		type: "password",
		value: secret,
	});
	keyboard.collapseEnd(field);
	const owner = nativeControlCaret(tree);
	const record = owner.selection(field);
	const listener = vi.fn();
	tree.onChange(listener);
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	const focus = vi.spyOn(actions.focus, "active");
	const snapshot = read();
	expect(snapshot).toEqual({
		anchor: 8,
		focus: 8,
		start: 8,
		end: 8,
		valueLength: 8,
	});
	expect(Object.isFrozen(snapshot)).toBe(true);
	expect(
		Object.values(snapshot ?? {}).every((value) => typeof value === "number"),
	).toBe(true);
	expect(JSON.stringify(snapshot)).not.toContain(secret);
	expect(read()).not.toBe(snapshot);
	expect(owner.selection(field)).toBe(record);
	expect(listener).not.toHaveBeenCalled();
	expect(invalidate).not.toHaveBeenCalled();
	expect(focus).not.toHaveBeenCalled();
	keyboard.press("Home");
	expect(snapshot?.focus).toBe(8);
	expect(read()?.focus).toBe(0);
});

it("leaves stale records untouched on reads and refreshes at end on keyboard use", () => {
	const { tree, keyboard, field, read } = fixture();
	keyboard.press("Home");
	tree.setControl(field, { value: "longer" });
	const revision = tree.revision;
	expect(read()).toBeUndefined();
	expect(read()).toBeUndefined();
	expect(tree.revision).toBe(revision);
	tree.setControl(field, { value: "abcd" });
	expect(read()?.focus).toBe(0);
	tree.setControl(field, { value: "longer" });
	keyboard.press("ArrowLeft");
	expect(read()).toEqual({
		anchor: 5,
		focus: 5,
		start: 5,
		end: 5,
		valueLength: 6,
	});
});

it("keeps only one control record while retaining native blur/refocus policy", () => {
	const { tree, actions, keyboard, field, read } = fixture();
	keyboard.press("Home");
	actions.focus.focus(null);
	expect(read()).toBeUndefined();
	actions.focus.focus(tree.reference(field));
	expect(read()?.focus).toBe(0);
	const other = tree.createElement("input", { value: "other" });
	tree.append(tree.root, other);
	actions.focus.focus(tree.reference(other));
	keyboard.press("Home");
	expect(readNativeControlSelection(tree, other)?.focus).toBe(0);
	actions.focus.focus(tree.reference(field));
	expect(read()).toBeUndefined();
	keyboard.press("ArrowLeft");
	expect(read()?.focus).toBe(3);
});

it("drops disconnected ownership instead of reviving it on reattachment", () => {
	const { tree, actions, keyboard, field, read } = fixture();
	keyboard.press("Home");
	tree.remove(field);
	expect(read()).toBeUndefined();
	tree.append(tree.root, field);
	actions.focus.focus(tree.reference(field));
	expect(read()).toBeUndefined();
	keyboard.press("ArrowLeft");
	expect(read()?.focus).toBe(3);
});

it("uses UTF-16 snapshots and code-point movement/deletion", () => {
	const { tree, keyboard, field, read } = fixture({ value: "a🙂b" });
	keyboard.press("ArrowLeft");
	expect(read()?.focus).toBe(3);
	keyboard.press("Shift+ArrowLeft");
	expect(read()).toEqual({
		anchor: 3,
		focus: 1,
		start: 1,
		end: 3,
		valueLength: 4,
	});
	keyboard.press("Backspace");
	expect(controlValue(tree, field)).toBe("ab");
	expect(read()).toEqual({
		anchor: 1,
		focus: 1,
		start: 1,
		end: 1,
		valueLength: 2,
	});
});

it("preserves normalized textarea offsets and line Home/End behavior", () => {
	const { tree, keyboard, field, read } = fixture({}, "textarea");
	tree.setControl(field, { value: "ab\r\ncd\r\n" });
	keyboard.press("ArrowLeft");
	expect(read()?.focus).toBe(5);
	keyboard.press("Home");
	expect(read()?.focus).toBe(3);
	keyboard.press("End");
	expect(read()?.focus).toBe(5);
	expect(read()?.valueLength).toBe(6);
});

it("allows readonly selection but not editing", () => {
	const { tree, keyboard, field, read } = fixture({ readonly: "" });
	keyboard.press("Control+A");
	const before = read();
	expect(() => keyboard.type("x")).toThrow("readonly");
	expect(controlValue(tree, field)).toBe("abcd");
	expect(read()).toEqual(before);
});

it.each(["keydown", "keypress", "beforeinput"])(
	"preserves existing selection and value after canceled %s",
	(type) => {
		const { tree, keyboard, events, field, read } = fixture();
		keyboard.press("Control+A");
		const before = read();
		const invalidate = vi.spyOn(tree, "invalidatePresentation");
		events.addEventListener(field, type, (event) => event.preventDefault());
		expect(keyboard.press("x").canceled).toBe(true);
		expect(controlValue(tree, field)).toBe("abcd");
		expect(read()).toEqual(before);
		expect(invalidate).not.toHaveBeenCalled();
	},
);

it("refreshes the numeric owner and unchanged result shape after input value changes", () => {
	const { tree, keyboard, events, field, read } = fixture();
	events.addEventListener(field, "input", () =>
		tree.setControl(field, { value: "" }),
	);
	expect(keyboard.type("x").selection).toEqual({ start: 0, end: 0 });
	expect(read()).toEqual({
		anchor: 0,
		focus: 0,
		start: 0,
		end: 0,
		valueLength: 0,
	});
});

it.each(["owner", "keyboard", "document"])(
	"clears ownership on %s close and never recreates it",
	(kind) => {
		const { tree, keyboard, field, read } = fixture();
		keyboard.collapseEnd(field);
		const owner = nativeControlCaret(tree);
		if (kind === "owner") owner.close();
		else if (kind === "keyboard") keyboard.close();
		else tree.close();
		expect(read()).toBeUndefined();
		expect(() => nativeControlCaret(tree)).toThrow("closed");
		expect(() => owner.selection(field)).toThrow("closed");
		expect(() => keyboard.collapseEnd(field)).toThrow("closed");
		owner.close();
		keyboard.close();
	},
);

it.each(["owner", "keyboard", "document"])(
	"does not return an owner abandoned during %s close notification",
	(kind) => {
		const { tree, keyboard, field, read } = fixture();
		keyboard.collapseEnd(field);
		const owner = nativeControlCaret(tree);
		const stop = tree.onChange((change) => {
			if (change.kind !== "style") return;
			stop();
			if (kind === "owner") owner.close();
			else if (kind === "keyboard") keyboard.close();
			else tree.close();
		});
		expect(() => keyboard.press("Home")).toThrow("closed");
		expect(read()).toBeUndefined();
		expect(() => nativeControlCaret(tree)).toThrow("closed");
	},
);

it.each(["value", "focus", "focus-roundtrip", "value-roundtrip"])(
	"rejects reentrant %s changes during publication",
	(kind) => {
		const { tree, actions, keyboard, field, read } = fixture();
		keyboard.collapseEnd(field);
		const stop = tree.onChange((change) => {
			if (change.kind !== "style") return;
			stop();
			if (kind.startsWith("value")) {
				tree.setControl(field, { value: "replacement" });
				if (kind === "value-roundtrip")
					tree.setControl(field, { value: "abcd" });
			} else {
				actions.focus.focus(null);
				if (kind === "focus-roundtrip")
					actions.focus.focus(tree.reference(field));
			}
		});
		expect(() => keyboard.press("Home")).toThrow("changed");
		if (kind === "focus") expect(read()).toBeUndefined();
		if (kind === "value") expect(read()?.focus).toBe(11);
	},
);

it("never overwrites a newer selection committed by a change notification", () => {
	const { tree, keyboard, field, read } = fixture();
	keyboard.collapseEnd(field);
	const owner = nativeControlCaret(tree);
	const stop = tree.onChange((change) => {
		if (change.kind !== "style") return;
		stop();
		owner.move(owner.selection(field), 1, 2);
	});
	expect(() => keyboard.press("Home")).toThrow("changed during notification");
	expect(read()).toEqual({
		anchor: 1,
		focus: 2,
		start: 1,
		end: 2,
		valueLength: 4,
	});
});

it.each(["selection", "focus-roundtrip", "value-roundtrip"])(
	"rejects reentrant %s during the value write without a later caret overwrite",
	(kind) => {
		const { tree, actions, keyboard, field, read } = fixture();
		keyboard.collapseEnd(field);
		const owner = nativeControlCaret(tree);
		const stop = tree.onChange((change) => {
			if (change.kind !== "control" || change.target !== field) return;
			stop();
			if (kind === "selection") owner.move(owner.selection(field), 1, 2);
			else if (kind === "focus-roundtrip") {
				actions.focus.focus(null);
				actions.focus.focus(tree.reference(field));
			} else {
				tree.setControl(field, { value: "replacement" });
				tree.setControl(field, { value: "abcdx" });
			}
		});
		expect(() => keyboard.type("x")).toThrow("changed");
		expect(controlValue(tree, field)).toBe("abcdx");
		if (kind === "selection")
			expect(read()).toEqual({
				anchor: 1,
				focus: 2,
				start: 1,
				end: 2,
				valueLength: 5,
			});
	},
);

it("does not edit after keyboard close in beforeinput", () => {
	const { tree, keyboard, events, field, read } = fixture();
	keyboard.collapseEnd(field);
	events.addEventListener(field, "beforeinput", () => keyboard.close());
	expect(() => keyboard.type("x")).toThrow("closed");
	expect(controlValue(tree, field)).toBe("abcd");
	expect(read()).toBeUndefined();
});

it("does not return a stale result after keyboard close in input", () => {
	const { tree, keyboard, events, field, read } = fixture();
	events.addEventListener(field, "input", () => keyboard.close());
	expect(() => keyboard.type("x")).toThrow("closed");
	expect(controlValue(tree, field)).toBe("abcdx");
	expect(read()).toBeUndefined();
});

it("rejects beforeinput selection replacement without overwriting it", () => {
	const { tree, keyboard, events, field, read } = fixture();
	keyboard.collapseEnd(field);
	const owner = nativeControlCaret(tree);
	events.addEventListener(field, "beforeinput", () =>
		owner.move(owner.selection(field), 0, 1),
	);
	expect(() => keyboard.type("x")).toThrow("changed during notification");
	expect(controlValue(tree, field)).toBe("abcd");
	expect(read()).toEqual({
		anchor: 0,
		focus: 1,
		start: 0,
		end: 1,
		valueLength: 4,
	});
});

it("keeps committed state after a throwing notification and still cleans up", () => {
	const { tree, keyboard, field, read } = fixture();
	keyboard.collapseEnd(field);
	const stop = tree.onChange((change) => {
		if (change.kind === "style") throw new Error("notification failed");
	});
	expect(() => keyboard.press("Home")).toThrow("notification failed");
	expect(read()?.focus).toBe(0);
	expect(() => keyboard.close()).toThrow("notification failed");
	expect(read()).toBeUndefined();
	stop();
	keyboard.close();
});

it.each(["onChange", "onClose"] as const)(
	"does not attach an abandoned owner when %s registration closes keyboard",
	(method) => {
		const { tree, keyboard, field, read } = fixture();
		if (method === "onChange") {
			const register = tree.onChange.bind(tree);
			vi.spyOn(tree, "onChange").mockImplementationOnce((handler) => {
				const stop = register(handler);
				keyboard.close();
				return stop;
			});
		} else {
			const register = tree.onClose.bind(tree);
			vi.spyOn(tree, "onClose").mockImplementationOnce((handler) => {
				const stop = register(handler);
				keyboard.close();
				return stop;
			});
		}
		expect(() => keyboard.collapseEnd(field)).toThrow("closed");
		expect(read()).toBeUndefined();
		expect(() => nativeControlCaret(tree)).toThrow("closed");
	},
);

it("rolls back partial registration on capacity failure and allows a clean retry", () => {
	const { tree, field, read } = fixture();
	const cleanups: (() => void)[] = [];
	for (;;) {
		try {
			cleanups.push(tree.onChange(() => {}));
		} catch {
			break;
		}
	}
	for (let attempt = 0; attempt < 70; attempt++)
		expect(() => nativeControlCaret(tree)).toThrow(
			"Document change handler limit exceeded",
		);
	expect(read()).toBeUndefined();
	for (const cleanup of cleanups) cleanup();
	const owner = nativeControlCaret(tree);
	owner.selection(field);
	expect(read()?.focus).toBe(4);
	owner.close();
});

it("never retries an owner explicitly closed during cleanup registration", () => {
	const { tree, read } = fixture();
	const register = tree.onClose.bind(tree);
	vi.spyOn(tree, "onClose").mockImplementationOnce((handler) => {
		const stop = register(handler);
		handler();
		return stop;
	});
	expect(() => nativeControlCaret(tree)).toThrow("closed");
	expect(read()).toBeUndefined();
	expect(() => nativeControlCaret(tree)).toThrow("closed");
});

it("preserves activation when a previously edited input changes to a checkbox", () => {
	const { tree, keyboard, field, read } = fixture();
	keyboard.press("Home");
	tree.setAttribute(field, "type", "checkbox");
	expect(read()).toBeUndefined();
	expect(keyboard.press("Space").selection).toBeUndefined();
	expect(tree.get(field).control.checked).toBe(true);
	expect(read()).toBeUndefined();
});

it.each(["email", "number"])(
	"does not expand native keyboard editing to %s",
	(type) => {
		const { tree, keyboard, field, read } = fixture({
			type,
			value: type === "number" ? "12" : "a@b",
		});
		keyboard.press("Control+A");
		keyboard.press("Home");
		expect(read()).toBeUndefined();
		expect(() => keyboard.type("x")).toThrow();
		expect(controlValue(tree, field)).toBe(type === "number" ? "12" : "a@b");
	},
);
