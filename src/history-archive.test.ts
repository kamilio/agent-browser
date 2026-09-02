import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentHistory } from "./history.js";

it("validates a detached frozen prospective archive before committing state", () => {
	const { tree, history } = fixture();
	const before = history.capture();
	const revision = history.revision;
	expect(() =>
		history.pushState({ changed: true }, "?changed", (archive) => {
			expect(Object.isFrozen(archive)).toBe(true);
			expect(Object.isFrozen(archive.entries[1])).toBe(true);
			expect(archive.entries[1].serialized).toBe('{"changed":true}');
			throw new Error("denied");
		}),
	).toThrow("denied");
	expect(history.capture()).toEqual(before);
	expect(history.revision).toBe(revision);
	expect(tree.url).toBe(before.entries[0].url);
	tree.close();
});

function fixture(url = "https://example.com/a") {
	const tree = new DocumentTree(url);
	return {
		tree,
		history: new DocumentHistory(
			tree,
			new DocumentEvents(tree, {}, { window: true }),
		),
	};
}
it("restores keys, state and index into a fresh document without keeping old DOMs", async () => {
	const first = fixture();
	first.history.pushState({ step: 1 }, "?one");
	first.history.pushState({ step: 2 }, "?two");
	await first.history.back();
	const archive = first.history.capture();
	first.tree.close();
	expect(Object.isFrozen(archive.entries[0])).toBe(true);
	const next = fixture("https://example.com/a?one");
	expect(next.history.restore(archive)).toMatchObject({
		key: archive.entries[1].key,
		index: 1,
		length: 3,
		state: { step: 1 },
	});
	expect((await next.history.forward()).state).toEqual({ step: 2 });
	const key = next.history.pushState(null, "?three").key;
	expect(archive.entries.some((entry) => entry.key === key)).toBe(false);
});
it("returns detached state and permits restoration only once", () => {
	const first = fixture();
	first.history.replaceState({ value: 1 });
	const next = fixture();
	next.history.restore(first.history.capture());
	(next.history.snapshot().state as { value: number }).value = 2;
	expect(next.history.snapshot().state).toEqual({ value: 1 });
	expect(() => next.history.restore(first.history.capture())).toThrow(/fresh/);
});

it("retains a read-only archive after event shutdown but not after document disposal", () => {
	const tree = new DocumentTree("https://example.com/a");
	const events = new DocumentEvents(tree, {}, { window: true });
	const history = new DocumentHistory(tree, events);
	history.pushState({ value: 1 }, "#next");
	const before = history.capture();
	const revision = history.revision;
	events.close();
	expect(history.capture()).toEqual(before);
	expect(history.revision).toBe(revision);
	expect(history.snapshot().state).toEqual({ value: 1 });
	expect(() => history.pushState(null, "#wrong")).toThrow(/closed/i);
	tree.close();
	expect(() => history.capture()).toThrow(/closed/i);
});

it("does not reuse an imported key when allocating a later entry", () => {
	const { history } = fixture();
	const initial = history.capture().entries[0];
	const importedKey = initial.key.replace(/-1$/, "-2");
	history.restore({ index: 0, entries: [{ ...initial, key: importedKey }] });
	expect(history.pushState(null, "?next").key).not.toBe(importedKey);
});
it.each(["origin", "active-url", "state", "duplicate-key", "index", "bytes"])(
	"rejects invalid %s archive atomically",
	(problem) => {
		const first = fixture();
		first.history.pushState(null, "?next");
		const captured = first.history.capture();
		const archive = {
			index: captured.index,
			entries: captured.entries.map((entry) => ({ ...entry })),
		};
		if (problem === "origin") archive.entries[0].url = "https://other.example/";
		if (problem === "active-url")
			archive.entries[1].url = "https://example.com/wrong";
		if (problem === "state") archive.entries[0].serialized = "[invalid";
		if (problem === "duplicate-key")
			archive.entries[1].key = archive.entries[0].key;
		if (problem === "index") archive.index = 9;
		if (problem === "bytes")
			archive.entries[0].serialized = JSON.stringify("x".repeat(1_048_576));
		const next = fixture("https://example.com/a?next");
		const before = next.history.snapshot();
		expect(() => next.history.restore(archive)).toThrow();
		expect(next.history.snapshot()).toEqual(before);
	},
);
it("rejects an aborted queued traversal before changing its URL", async () => {
	const { history } = fixture();
	history.pushState(null, "?next");
	const controller = new AbortController();
	const pending = history.go(-1, controller.signal);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(history.snapshot().index).toBe(1);
});
