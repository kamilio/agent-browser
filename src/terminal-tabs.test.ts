import { describe, expect, it } from "vitest";
import { terminalTabs, TerminalTabMenu } from "./terminal-tabs.js";
import { TerminalView } from "./terminal-view.js";

function tab(index = 0, selected = index === 0) {
	return {
		index,
		id: `tab-${index + 1}`,
		key: `epoch:tab-${index + 1}`,
		selected,
		loading: false,
		url: `https://example.com/${index}`,
		documentRef: `doc${index}`,
	};
}

describe("bounded terminal tab metadata", () => {
	it("copies and freezes only the displayed and guarded fields", () => {
		const source = [{ ...tab(), ignored: "not retained" }];
		const result = terminalTabs(source);
		expect(result).toEqual([tab()]);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result[0])).toBe(true);
		source[0].url = "https://changed.example/";
		expect(result[0].url).toBe("https://example.com/0");
	});

	it.each([
		["null", null],
		["not an array", {}],
		["null entry", [null]],
		["wrong index", [{ ...tab(), index: 1 }]],
		["missing key", [{ ...tab(), key: undefined }]],
		["empty key", [{ ...tab(), key: "" }]],
		["oversized key", [{ ...tab(), key: "x".repeat(257) }]],
		["empty id", [{ ...tab(), id: "" }]],
		["non-boolean selection", [{ ...tab(), selected: 1 }]],
		["non-boolean loading", [{ ...tab(), loading: "yes" }]],
		["missing URL", [{ ...tab(), url: undefined }]],
		["oversized URL", [{ ...tab(), url: "x".repeat(16_385) }]],
		["missing document", [{ ...tab(), documentRef: null }]],
		["duplicate id", [tab(), { ...tab(1), id: "tab-1" }]],
		["duplicate key", [tab(), { ...tab(1), key: "epoch:tab-1" }]],
		["no selected tab", [tab(0, false)]],
		["two selected tabs", [tab(), tab(1, true)]],
		["too many tabs", Array.from({ length: 129 }, (_, index) => tab(index))],
	])("rejects %s", (_label, value) => {
		expect(() => terminalTabs(value)).toThrow();
	});

	it("bounds aggregate strings and accepts blank and empty sessions", () => {
		const sparse = [tab()];
		sparse.length = 2;
		expect(() => terminalTabs(sparse)).toThrow();
		expect(() =>
			terminalTabs(
				Array.from({ length: 20 }, (_, index) => ({
					...tab(index),
					url: "x".repeat(16_384),
				})),
			),
		).toThrow(/exceeds its limit/);
		expect(terminalTabs([])).toEqual([]);
		expect(
			terminalTabs([
				{ ...tab(), url: null, documentRef: null, loading: true },
			])[0].url,
		).toBeNull();
	});
});

describe("terminal tab menu", () => {
	it("preserves selection by key across index shifts and cancels confirmation on refresh", () => {
		const menu = new TerminalTabMenu();
		menu.update([tab(), tab(1), tab(2)]);
		menu.move(1);
		menu.beginClose();
		expect(menu.confirming).toBe(true);
		menu.update([
			{ ...tab(1, true), index: 0 },
			{ ...tab(2), index: 1 },
		]);
		expect(menu.current?.key).toBe("epoch:tab-2");
		expect(menu.selection).toBe(0);
		expect(menu.confirming).toBe(false);
		expect(menu.select()).toEqual([
			"tab-select",
			"0",
			"--expected-key=epoch:tab-2",
		]);
		menu.update([{ ...tab(2, true), index: 0 }]);
		expect(menu.current?.key).toBe("epoch:tab-3");
	});

	it("only emits a guarded close after explicit confirmation", () => {
		const menu = new TerminalTabMenu();
		menu.update([tab(), tab(1)]);
		expect(menu.confirmClose()).toBeUndefined();
		menu.beginClose();
		menu.cancelClose();
		expect(menu.confirmClose()).toBeUndefined();
		menu.beginClose();
		expect(menu.confirmClose()).toEqual([
			"tab-close",
			"0",
			"--expected-key=epoch:tab-1",
		]);
		expect(menu.confirmClose()).toBeUndefined();
		menu.beginClose();
		menu.move(1);
		expect(menu.confirmClose()).toBeUndefined();
	});

	it("handles empty menus and pages through long lists", () => {
		const menu = new TerminalTabMenu();
		menu.update([]);
		menu.beginClose();
		expect(menu.select()).toBeUndefined();
		expect(menu.confirming).toBe(false);
		menu.update(Array.from({ length: 128 }, (_, index) => tab(index)));
		menu.move(1000);
		expect(menu.lines(3)).toHaveLength(3);
		expect(menu.lines(3).at(-1)).toContain("127 tab-128");
		menu.move(-1000);
		expect(menu.selection).toBe(0);
	});

	it("rejects malformed refreshes without partially replacing the menu", () => {
		const menu = new TerminalTabMenu();
		menu.update([tab()]);
		expect(() => menu.update([tab(), tab(0)])).toThrow();
		expect(menu.items).toEqual([tab()]);
	});
});

describe("terminal tab keyboard projection", () => {
	it("opens the menu, selects by guarded index, confirms closing and detaches independently", () => {
		const view = new TerminalView("session");
		expect(view.key("T")).toEqual({ kind: "tabs" });
		view.showTabs([tab(), tab(1)]);
		expect(view.browsingTabs).toBe(true);
		view.key("j");
		expect(view.key("", { name: "return" })).toEqual([
			"tab-select",
			"1",
			"--expected-key=epoch:tab-2",
		]);
		view.key("x");
		expect(view.key("", { name: "return" })).toBeUndefined();
		expect(view.render(100, 10).join("\n")).toContain("y confirms");
		expect(view.render(40, 10).at(-1)).toContain("n/Esc cancels");
		view.key("n");
		expect(view.key("y")).toBeUndefined();
		view.key("x");
		expect(view.key("y")).toEqual([
			"tab-close",
			"1",
			"--expected-key=epoch:tab-2",
		]);
		expect(view.key("q")).toBe("quit");
		expect(view.key("", { name: "escape" })).toBe("refresh");
		expect(view.browsingTabs).toBe(false);
	});

	it("creates blank tabs or normalized HTTP(S) tabs without accepting credentialed URLs", () => {
		const view = new TerminalView("session");
		view.key("t");
		expect(view.key("", { name: "return" })).toEqual(["tab-new"]);
		view.key("t");
		view.key("example.com/path");
		expect(view.key("", { name: "return" })).toEqual([
			"tab-new",
			"https://example.com/path",
		]);
		for (const url of [
			"file:///tmp/private",
			"https://user:password@example.com/",
			"javascript:alert(1)",
		]) {
			view.key("t");
			view.key(url);
			expect(view.key("", { name: "return" })).toBeUndefined();
			expect(view.status).toContain("HTTP(S)");
			view.key("", { name: "escape" });
		}
	});

	it("cannot turn a paste or busy key into a tab mutation", () => {
		const view = new TerminalView("session");
		view.showTabs([tab()]);
		view.key("", { name: "paste-start" });
		for (const text of ["T", "x", "y", "t"])
			expect(view.key(text)).toBeUndefined();
		view.key("", { name: "paste-end" });
		expect(view.key("y")).toBeUndefined();
		expect(view.key("t", {}, true)).toBeUndefined();
		expect(view.key("T", {}, true)).toBeUndefined();
		expect(view.editing).toBe(false);
	});

	it("escapes tab text and confirmation content and bounds every frame", () => {
		const view = new TerminalView("bad\x1b]52;clipboard\x07");
		view.showTabs([{ ...tab(), url: "https://example.com/\x1b[2J\r\n世界" }]);
		view.key("x");
		for (const width of [1, 2, 20, 100, 240]) {
			const frame = view.render(width, 10);
			expect(frame).toHaveLength(10);
			expect(
				frame.every(
					(line) => line.length <= width && /^[\x20-\x7e]*$/.test(line),
				),
			).toBe(true);
		}
		expect(view.render(240, 10).join("\n")).toContain("\\u{1b}");
	});

	it("clears stale page data and drafts without discarding an open menu", () => {
		const view = new TerminalView("session");
		view.update(
			{
				document: "doc",
				scope: "root",
				revision: 1,
				truncated: false,
				entries: [
					{ ref: "doc:1", role: "heading", name: "Private old page", depth: 0 },
				],
			},
			"https://old.example/",
		);
		view.showTabs([tab()]);
		view.clearDocument("Blank tab");
		expect(view.browsingTabs).toBe(true);
		view.dismissTabs();
		const frame = view.render(100, 12).join("\n");
		expect(frame).not.toContain("Private old page");
		expect(frame).not.toContain("old.example");
		expect(frame).toContain("Blank tab");
		expect(view.key("", { name: "return" })).toBeUndefined();
	});
});
