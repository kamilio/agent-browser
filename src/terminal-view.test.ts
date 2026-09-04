import { expect, it } from "vitest";
import type { SemanticSnapshot } from "./snapshot.js";
import { TerminalView, terminalText } from "./terminal-view.js";

function snapshot(document = "doc1"): SemanticSnapshot {
	return {
		document,
		scope: "root",
		revision: 1,
		truncated: false,
		entries: [
			{ ref: `${document}:1`, role: "heading", name: "Welcome", depth: 0 },
			{
				ref: `${document}:2`,
				role: "link",
				name: "Next",
				href: "/next",
				depth: 1,
			},
			{
				ref: `${document}:3`,
				role: "textbox",
				name: "Name",
				value: "Before",
				depth: 1,
			},
			{
				ref: `${document}:4`,
				role: "checkbox",
				name: "Enabled",
				checked: false,
				depth: 1,
			},
			{
				ref: `${document}:5`,
				role: "button",
				name: "Disabled",
				disabled: true,
				depth: 1,
			},
		],
	};
}

it("projects snapshots with stable refs and bounded ASCII-only terminal content", () => {
	const view = new TerminalView("research\x1b]52;secret\x07");
	const page = snapshot();
	page.entries[0].name = "Hello\x1b[2J\r\n世界\u202e";
	view.update(page, "https://example.com/");
	const frame = view.render(48, 12);
	expect(frame).toHaveLength(12);
	expect(
		frame.every((line) => line.length <= 48 && /^[\x20-\x7e]*$/.test(line)),
	).toBe(true);
	expect(frame.join("\n")).toContain("doc1:1");
	expect(terminalText("世界\x1b\u202e")).toBe(
		"\\u{4e16}\\u{754c}\\u{1b}\\u{202e}",
	);
});

it("moves through refs and maps native actions without rewriting targets", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "tab" });
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
	view.key("", { name: "tab" });
	view.key("e");
	view.key("", { name: "u", ctrl: true });
	view.key("After");
	expect(view.key("", { name: "return" })).toEqual(["fill", "doc1:3", "After"]);
	view.key("", { name: "tab" });
	expect(view.key("", { name: "return" })).toEqual(["check", "doc1:4"]);
	view.key("j");
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(view.status).toContain("disabled");
});

it("prompts for a targeted key without turning navigation keys into page input", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "tab" });
	view.key("p");
	expect(view.render(100, 12).join("\n")).toContain("press doc1:2>");
	view.key("Enter");
	expect(view.key("", { name: "return" })).toEqual([
		"press",
		"--target=doc1:2",
		"--",
		"Enter",
	]);
});

it("bounds and cancels key drafts and rejects empty submission", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "tab" });
	view.key("p");
	expect(view.key("", { name: "return" })).toBeUndefined();
	view.key("a".repeat(129));
	expect(view.status).toContain("maximum 128");
	view.key("", { name: "escape" });
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
});

it("cancels targeted key drafts on document replacement", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "tab" });
	view.key("p");
	view.key("Enter");
	view.update(snapshot("doc2"), "https://example.com/new");
	expect(view.status).toContain("cancelled");
	expect(view.key("", { name: "return" })).toBeUndefined();
});

it("preserves selection on same-document updates and resets after navigation", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "tab" });
	const reordered = snapshot();
	reordered.entries.reverse();
	view.update(reordered, "https://example.com/");
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
	view.update(snapshot("doc2"), "https://example.com/new");
	expect(view.key("", { name: "return" })).toBeUndefined();
	view.key("", { name: "tab" });
	expect(view.key("", { name: "return" })).toEqual(["click", "doc2:2"]);
});

it("bounds scrolling and very small resized screens", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.render(70, 6);
	view.key("", { name: "end" });
	expect(view.render(70, 6).join("\n")).toContain("Disabled");
	expect(view.render(1, 1)).toHaveLength(1);
	expect(view.render(10_000, 10_000)).toHaveLength(80);
});

it("normalizes URL input and rejects credentials and unsupported protocols", () => {
	const view = new TerminalView("research");
	view.key("g");
	view.key("example.com/path");
	expect(view.key("", { name: "return" })).toEqual([
		"open",
		"https://example.com/path",
	]);
	for (const url of ["file:///tmp/private", "https://user:pass@example.com/"]) {
		view.key("g");
		view.key(url);
		expect(view.key("", { name: "return" })).toBeUndefined();
		expect(view.status).toContain("HTTP(S)");
		view.key("", { name: "escape" });
	}
});

it("treats bracketed paste as bounded prompt data, never navigation hotkeys", () => {
	const view = new TerminalView("research");
	view.update(snapshot(), "https://example.com/");
	view.key("", { name: "paste-start" });
	expect(view.key("q")).toBeUndefined();
	expect(view.key("\r", { name: "return" })).toBeUndefined();
	view.key("", { name: "paste-end" });
	view.key("g");
	view.key("", { name: "paste-start" });
	view.key("example.com");
	expect(view.key("\n", { name: "enter" })).toBeUndefined();
	view.key("", { name: "paste-end" });
	expect(view.key("", { name: "return" })).toEqual([
		"open",
		"https://example.com/",
	]);
	view.key("g");
	view.key("a".repeat(20_000));
	expect(view.status).toContain("too long");
});

it("tracks paste boundaries across busy periods and allows intentional detach while busy", () => {
	const view = new TerminalView("research");
	view.key("", { name: "paste-start" }, true);
	expect(view.key("q")).toBeUndefined();
	view.key("", { name: "paste-end" });
	expect(view.key("g", {}, true)).toBeUndefined();
	expect(view.editing).toBe(false);
	expect(view.key("q", {}, true)).toBe("quit");
});

it("masks protected inputs, cancels prompts and never retargets stale edits", () => {
	const view = new TerminalView("research");
	const page = snapshot();
	page.entries[2].protected = true;
	view.update(page, "https://example.com/");
	view.key("", { name: "tab" });
	view.key("", { name: "tab" });
	view.key("e");
	view.key("secret-value");
	expect(view.render(120, 12).join("\n")).not.toContain("secret-value");
	expect(view.render(120, 12).join("\n")).not.toContain("Before");
	view.update(snapshot("other"), "https://example.com/new");
	expect(view.editing).toBe(false);
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(view.key("", { name: "c", ctrl: true })).toBe("quit");
});

it("exposes history/reload/refresh and reports partial or truncated pages", () => {
	const view = new TerminalView("research");
	const page = snapshot();
	page.truncated = true;
	page.html = { partial: true, scripting: true, issues: 1 };
	view.update(page, "https://example.com/");
	expect(view.render(160, 12).join("\n")).toContain("partial JS");
	expect(view.render(160, 12).join("\n")).toContain("truncated");
	expect(view.key("b")).toEqual(["go-back"]);
	expect(view.key("f")).toEqual(["go-forward"]);
	expect(view.key("r")).toEqual(["reload"]);
	expect(view.key("u")).toBe("refresh");
	expect(view.key("q")).toBe("quit");
});

function longPage(name: string): SemanticSnapshot {
	return {
		...snapshot(),
		entries: [
			{ ref: "doc1:long", role: "link", href: "/long", name, depth: 0 },
		],
	};
}

function body(view: TerminalView, width = 40, height = 9) {
	return view.render(width, height).slice(3, -2);
}

it("wraps long entries into navigable rows without losing the action reference", () => {
	const view = new TerminalView("research");
	view.update(
		longPage(`${"0123456789 ".repeat(60)}Readable tail`),
		"https://example.com/",
	);
	const first = body(view);
	expect(first.every((line) => line.length <= 40)).toBe(true);
	expect(first.slice(1).some((line) => line.trim().length > 0)).toBe(true);
	view.key("", { name: "pagedown" });
	expect(body(view)).not.toEqual(first);
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:long"]);
	view.key("", { name: "end" });
	expect(
		body(view)
			.map((line) => line.slice(2))
			.join(""),
	).toContain("Readable tail");
	view.key("", { name: "home" });
	expect(body(view)).toEqual(first);
});

it("pages by screen rows rather than skipping a long entry's contents", () => {
	const view = new TerminalView("research");
	view.update(longPage("0123456789".repeat(100)), "https://example.com/");
	const first = body(view, 22, 9);
	view.key(" ");
	const second = body(view, 22, 9);
	expect(second.join("")).not.toContain("doc1:long");
	view.key("", { name: "pageup" });
	expect(body(view, 22, 9)).toEqual(first);
	view.key("j");
	expect(body(view, 22, 9).findIndex((line) => line.startsWith(">"))).toBe(1);
	view.key("k");
	expect(body(view, 22, 9)).toEqual(first);
});

it("keeps the reading position across resize and unchanged observer refreshes", () => {
	const view = new TerminalView("research");
	const page = longPage(
		`${"before ".repeat(50)}POSITION${" after".repeat(50)}`,
	);
	view.update(page, "https://example.com/");
	view.key("/");
	view.key("POSITION");
	view.key("", { name: "return" });
	expect(body(view).join("")).toContain("POSITION");
	view.update(structuredClone(page), "https://example.com/");
	expect(body(view).join("")).toContain("POSITION");
	expect(body(view, 60).join("")).toContain("POSITION");
});

it("finds successive literal matches within one entry, wraps and searches backwards", () => {
	const view = new TerminalView("research");
	view.update(
		longPage(
			`Needle FIRST ${"padding ".repeat(40)}needle SECOND ${"padding ".repeat(40)}NEEDLE THIRD`,
		),
		"https://example.com/",
	);
	view.key("/");
	view.key("needle");
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(body(view).join("")).toContain("FIRST");
	view.key("n");
	expect(body(view).join("")).toContain("SECOND");
	view.key("n");
	expect(body(view).join("")).toContain("THIRD");
	view.key("n");
	expect(body(view).join("")).toContain("FIRST");
	expect(view.status).toContain("wrapped");
	view.key("N", { name: "n", shift: true });
	expect(body(view).join("")).toContain("THIRD");
});

it("searches displayed public values and hrefs but never protected values", () => {
	const view = new TerminalView("research");
	const page = snapshot();
	page.entries[2].protected = true;
	page.entries[2].value = "secret-only-value";
	page.entries[1].href = "https://example.com/destination-only";
	view.update(page, "https://example.com/");
	view.key("/");
	view.key("secret-only-value");
	view.key("", { name: "return" });
	expect(view.status).toContain("No match");
	view.key("/");
	view.key("destination-only");
	view.key("", { name: "return" });
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
	expect(view.render(100, 15).join("\n")).toContain(
		"https://example.com/destination-only",
	);
});

it("treats regex syntax as literal search and preserves matches across unchanged refreshes", () => {
	const view = new TerminalView("research");
	const page = longPage(`.* FIRST ${"space ".repeat(35)}.* SECOND`);
	view.update(page, "https://example.com/");
	view.key("/");
	view.key(".*");
	view.key("", { name: "return" });
	view.update(structuredClone(page), "https://example.com/");
	view.key("n");
	expect(body(view).join("")).toContain("SECOND");
	view.key("/");
	view.key("does-not-exist");
	view.key("", { name: "escape" });
	view.key("n");
	expect(body(view).join("")).toContain("FIRST");
});

it("keeps narrow and escaped output bounded even for a single huge entry", () => {
	const view = new TerminalView("research");
	view.update(
		longPage(`${"\u202e\x1b界".repeat(50_000)}TAIL`),
		"https://example.com/",
	);
	expect(body(view, 1).every((line) => line.length <= 1)).toBe(true);
	view.key("", { name: "end" });
	expect(body(view, 50).join("")).toContain("TAIL");
	expect(view.render(50, 9).every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(
		true,
	);
});

it("preserves every projected character across single-row scrolling", () => {
	const view = new TerminalView("research");
	const name = `Alpha beta gamma \u754c\u202e\x1b[2J ${"longword".repeat(10)}`;
	view.update(longPage(name), "https://example.com/");
	let joined = "";
	let previous = "";
	for (let index = 0; index < 100; index++) {
		const line = body(view, 13, 6)[0].slice(2);
		if (line === previous) break;
		joined += line;
		previous = line;
		view.key("j");
	}
	expect(joined).toBe(terminalText(`[doc1:long] link: ${name} [href=/long]`));
});

it("finds across entries in both directions and retains the selected reference after insertion", () => {
	const view = new TerminalView("research");
	const page = snapshot();
	page.entries[0].name = "Needle heading";
	page.entries[1].name = "Needle link";
	page.entries[2].value = "Needle input";
	view.update(page, "https://example.com/");
	view.key("/");
	view.key("needle");
	view.key("", { name: "return" });
	view.key("n");
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
	const inserted = structuredClone(page);
	inserted.entries.unshift({
		ref: "doc1:new",
		role: "text",
		name: "New leading row",
		depth: 0,
	});
	view.update(inserted, "https://example.com/");
	expect(view.key("", { name: "return" })).toEqual(["click", "doc1:2"]);
	view.key("N");
	expect(view.key("", { name: "return" })).toBeUndefined();
	view.key("N");
	expect(view.status).toContain("wrapped");
	view.key("e");
	expect(view.render(100, 12).at(-1)).toContain("fill doc1:3");
});

it("handles empty snapshots and literal search without a prior query", () => {
	const view = new TerminalView("research");
	view.update({ ...snapshot(), entries: [] }, "https://example.com/");
	view.key("n");
	expect(view.status).toContain("Use /");
	view.key("/");
	view.key("missing");
	view.key("", { name: "return" });
	expect(view.status).toContain("No match");
	view.key("", { name: "end" });
	expect(body(view).every((line) => line === "")).toBe(true);
});
