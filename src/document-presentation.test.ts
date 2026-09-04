import { expect, it } from "vitest";
import { type DocumentChange, DocumentTree } from "./document.js";
import { DocumentStyles } from "./styles.js";

it.each([undefined, "style"] as const)(
	"preserves the untagged style notification for %s",
	(mode) => {
		const tree = new DocumentTree("about:blank");
		const before = tree.revision;
		const notifications: Readonly<DocumentChange>[] = [];
		tree.onChange((change) => notifications.push(change));
		tree.invalidatePresentation(mode);
		const expected = { revision: before + 1, kind: "style", target: tree.root };
		expect(notifications).toEqual([expected]);
		expect(tree.changesSince(before)).toEqual({
			revision: before + 1,
			reset: false,
			changes: [expected],
		});
		tree.close();
	},
);

it("tags paint notifications without changing their kind, target or revision", () => {
	const tree = new DocumentTree("about:blank");
	const before = tree.revision;
	const notifications: Readonly<DocumentChange>[] = [];
	tree.onChange((change) => notifications.push(change));
	tree.invalidatePresentation("paint");
	const expected = {
		revision: before + 1,
		kind: "style",
		target: tree.root,
		presentationOnly: true,
	};
	expect(notifications).toEqual([expected]);
	expect(Object.isFrozen(notifications[0])).toBe(true);
	const journal = tree.changesSince(before);
	expect(journal.changes).toEqual([expected]);
	journal.changes[0].presentationOnly = undefined;
	journal.changes[0].target = 999;
	expect(tree.changesSince(before).changes).toEqual([expected]);
	tree.close();
});

it.each([null, false, 0, "", "Paint", "layout", {}, []])(
	"rejects invalid presentation mode %j without a notification",
	(mode) => {
		const tree = new DocumentTree("about:blank");
		const before = tree.revision;
		const notifications: Readonly<DocumentChange>[] = [];
		tree.onChange((change) => notifications.push(change));
		expect(() => tree.invalidatePresentation(mode as "paint")).toThrow(
			"Invalid presentation mode",
		);
		expect(tree.revision).toBe(before);
		expect(notifications).toEqual([]);
		expect(tree.changesSince(before).changes).toEqual([]);
		tree.close();
	},
);

it("bounds tagged notifications and retains the journal reset signal", () => {
	const tree = new DocumentTree("about:blank", { maxChanges: 2 });
	const before = tree.revision;
	tree.invalidatePresentation("paint");
	tree.invalidatePresentation();
	tree.invalidatePresentation("paint");
	const journal = tree.changesSince(before);
	expect(journal.reset).toBe(true);
	expect(journal.changes).toEqual([
		{ revision: before + 2, kind: "style", target: tree.root },
		{
			revision: before + 3,
			kind: "style",
			target: tree.root,
			presentationOnly: true,
		},
	]);
	expect(tree.changesSince(before + 1).reset).toBe(false);
	tree.close();
});

it("keeps reentrant ordinary invalidation distinct from paint notification", () => {
	const tree = new DocumentTree("about:blank");
	const before = tree.revision;
	tree.onChange((change) => {
		if (change.presentationOnly) tree.invalidatePresentation();
	});
	tree.invalidatePresentation("paint");
	expect(tree.changesSince(before).changes).toEqual([
		{
			revision: before + 1,
			kind: "style",
			target: tree.root,
			presentationOnly: true,
		},
		{ revision: before + 2, kind: "style", target: tree.root },
	]);
	tree.close();
});

it("does not report either presentation mode as a DOM mutation", () => {
	const tree = new DocumentTree("about:blank");
	const mutations: unknown[] = [];
	tree.onMutation((record) => mutations.push(record));
	tree.invalidatePresentation("paint");
	tree.invalidatePresentation();
	expect(mutations).toEqual([]);
	tree.close();
});

it.each([undefined, "style", "paint", "invalid"])(
	"rejects closed document presentation before validating %s",
	(mode) => {
		const tree = new DocumentTree("about:blank");
		tree.close();
		const before = tree.revision;
		expect(() => tree.invalidatePresentation(mode as "paint")).toThrow(
			"Document is closed",
		);
		expect(tree.revision).toBe(before);
	},
);

it("counts only successful cascades after a resource-limited attempt", () => {
	const tree = new DocumentTree("about:blank");
	const style = tree.createElement("style");
	const text = tree.createText("div { display: block }");
	tree.append(tree.root, style);
	tree.append(style, text);
	const styles = new DocumentStyles(tree, { maxCodeUnits: 8 });
	expect(() => styles.metrics()).toThrow("limit");
	tree.setData(text, "");
	expect(styles.metrics().cascadeBuilds).toBe(1);
	tree.invalidatePresentation("paint");
	expect(styles.metrics().cascadeBuilds).toBe(1);
	tree.invalidatePresentation();
	expect(styles.metrics().cascadeBuilds).toBe(2);
	tree.setData(text, "div { display: none }");
	expect(() => styles.metrics()).toThrow("limit");
	tree.setData(text, "");
	expect(styles.metrics().cascadeBuilds).toBe(3);
	styles.close();
	expect(() => styles.metrics()).toThrow("closed");
	tree.close();
});
