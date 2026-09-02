import { expect, it } from "vitest";
import type { HistoryArchive } from "./history.js";
import { NavigationHistory } from "./navigation-history.js";

function archive(prefix: string, count = 1, index = count - 1): HistoryArchive {
	return {
		index,
		entries: Array.from({ length: count }, (_, position) => ({
			key: `${prefix}-${position}`,
			url: `https://example.com/${prefix}#${position}`,
			serialized: String(position),
		})),
	};
}

function fixture(maxBytes = 10_000) {
	const history = new NavigationHistory(8, maxBytes);
	const first = archive("first", 3);
	const last = archive("last");
	history.record(undefined, first, true, false);
	history.record(first, last, false, false);
	const target = history.target(last, -2);
	if (!target) throw new Error("Missing target");
	history.commitTraversal(target, target.archive);
	return { history, current: target.archive };
}

it("replaces only the active entry while preserving all surrounding entries and POST flags", () => {
	const { history, current } = fixture();
	history.replaceDocument(current, archive("replacement"), false);
	const snapshot = history.snapshot();
	expect(snapshot.index).toBe(1);
	expect(snapshot.entries.map((entry) => entry.key)).toEqual([
		"first-0",
		"replacement-0",
		"first-2",
		"last-0",
	]);
	expect(snapshot.entries.map((entry) => entry.requiresResubmission)).toEqual([
		true,
		false,
		true,
		false,
	]);
	expect(
		history.target(archive("replacement"), 1)?.archive.entries[0].serialized,
	).toBe("2");
});

it("replacement preview agrees with commit without mutating the active archive", () => {
	const { history, current } = fixture();
	const before = history.snapshot();
	expect(
		history.previewLength(current, archive("replacement"), {
			post: false,
			replace: false,
			replaceDocument: true,
		}),
	).toBe(4);
	expect(history.snapshot()).toEqual(before);
	history.replaceDocument(current, archive("replacement"), false);
	expect(history.snapshot().length).toBe(4);
});

it("replacement parser branches discard forward history but preserve the prior segment", () => {
	const { history, current } = fixture();
	history.replaceDocument(current, archive("replacement", 2), false);
	expect(history.snapshot().entries.map((entry) => entry.key)).toEqual([
		"first-0",
		"replacement-0",
		"replacement-1",
	]);
	expect(history.snapshot().index).toBe(2);
});

it("rejects oversized replacements atomically without dropping forward entries", () => {
	const { history, current } = fixture(400);
	const before = history.snapshot();
	const replacement = archive("oversized");
	const oversized = {
		...replacement,
		entries: replacement.entries.map((entry) => ({
			...entry,
			serialized: JSON.stringify("x".repeat(500)),
		})),
	};
	expect(() => history.replaceDocument(current, oversized, false)).toThrow(
		"budget",
	);
	expect(history.snapshot()).toEqual(before);
});

it("applies document segment retention limits consistently in preview and commit", () => {
	const history = new NavigationHistory(2, 10_000);
	const current = archive("first", 3, 1);
	history.record(undefined, current, false, false);
	const count = history.previewLength(current, archive("replacement"), {
		post: false,
		replace: false,
		replaceDocument: true,
	});
	history.replaceDocument(current, archive("replacement"), false);
	expect(history.snapshot().length).toBe(count);
	expect(history.snapshot().entries.map((entry) => entry.key)).toEqual([
		"replacement-0",
		"first-2",
	]);
	expect(history.snapshot().evictedDocuments).toBe(1);
});

it("allows replacement to initialize an empty session archive", () => {
	const history = new NavigationHistory(8, 10_000);
	history.replaceDocument(undefined, archive("first"), false);
	expect(history.snapshot()).toMatchObject({ index: 0, length: 1 });
});
