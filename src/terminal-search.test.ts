import { afterEach, expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { findInDocument } from "./snapshot-search.js";
import { snapshotDocument } from "./snapshot.js";
import { TerminalView } from "./terminal-view.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = parseHtmlDocument(
		"<button>Buy</button><button>Buy more</button>",
		"https://example.test/",
	);
	documents.push(tree);
	const view = new TerminalView("search");
	view.update(snapshotDocument(tree), "https://example.test/");
	const results = findInDocument(tree, "Buy", { context: 1 });
	return { tree, view, results };
}

it("keeps local search separate and issues bounded literal and regex requests", () => {
	const { view } = fixture();
	view.key("/");
	view.key("buy");
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(view.status).toContain("Found");
	for (const key of ["s", "S"]) {
		view.key(key);
		view.key("Buy");
		expect(view.key("", { name: "return" })).toEqual([
			"find",
			"--max-results=100",
			"--context=1",
			"--max-bytes=32768",
			...(key === "S" ? ["--regex"] : []),
			"--",
			"Buy",
		]);
	}
});

it("requires a nonempty query, bounds input and treats paste as data", () => {
	const { view } = fixture();
	view.key("s");
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(view.editing).toBe(true);
	view.key("x".repeat(1025));
	expect(view.status).toContain("1024");
	view.key("", { name: "paste-start" });
	view.key("q\nU\u001b");
	view.key("", { name: "paste-end" });
	expect(view.key("", { name: "return" })).toContain("qU");
});

it("never treats a backend query as CLI options or a session selector", () => {
	const { view } = fixture();
	for (const query of ["--session=other", "--regex", "--help", "-s"]) {
		view.key("s");
		view.key(query);
		const request = view.key("", { name: "return" });
		if (!Array.isArray(request)) throw new Error("Expected a search request");
		const invocation = parseInvocation(request);
		expect(invocation.session).toBe("default");
		expect(invocation.arguments).toEqual([query]);
		expect(invocation.options.regex).toBeUndefined();
	}
});

it("renders bounded safe results and inspects rather than clicking", () => {
	const { view, results } = fixture();
	results.matches[0].context[0].text = "Buy\u001b[2J\u202e";
	view.showSearch(results, "Buy");
	const lines = view.render(100, 10);
	expect(lines).toHaveLength(10);
	expect(
		lines.every((line) => line.length <= 100 && /^[\x20-\x7e]*$/.test(line)),
	).toBe(true);
	expect(lines.join("\n")).toContain("partial backend search");
	view.key("j");
	expect(view.key("", { name: "enter" })).toEqual({
		kind: "inspect",
		ref: results.matches[1].ref,
		document: results.document,
	});
	expect(view.key("q")).toBe("quit");
});

it("bounds selection and reruns the backend query without changing regex mode", () => {
	const { view, results } = fixture();
	view.showSearch(results, "Buy", true);
	view.key("", { name: "end" });
	view.key("j");
	expect(view.key("", { name: "enter" })).toMatchObject({
		ref: results.matches.at(-1)?.ref,
	});
	view.key("", { name: "home" });
	view.key("k");
	expect(view.key("", { name: "enter" })).toMatchObject({
		ref: results.matches[0].ref,
	});
	expect(view.key("u")).toContain("--regex");
	expect(view.key("U")).toBe("root");
	expect(view.key("", { name: "escape" })).toBe("refresh");
	expect(view.searching).toBe(false);
});

it("shows empty and truncated searches honestly, and invalidates results on navigation", () => {
	const { view, tree } = fixture();
	const results = findInDocument(tree, "absent");
	view.showSearch(results, "absent");
	expect(view.key("", { name: "enter" })).toBeUndefined();
	expect(view.render(100, 10).join("\n")).toContain("0 matches");
	view.showSearch({ ...results, truncated: true }, "absent");
	expect(view.render(100, 10).join("\n")).toContain("truncated");
	view.update(
		{ ...snapshotDocument(tree), document: "new-document" },
		"https://example.test/next",
	);
	expect(view.searching).toBe(false);
});

it("rejects malformed or excessive result data before rendering", () => {
	const { view, results } = fixture();
	expect(() =>
		view.showSearch(
			{ ...results, matches: Array(501).fill(results.matches[0]) },
			"Buy",
		),
	).toThrow("Invalid terminal search result");
	results.matches[0].context[0].text = "x".repeat(32_769);
	expect(() => view.showSearch(results, "Buy")).toThrow(
		"Invalid terminal search context",
	);
	expect(view.searching).toBe(false);
});

it("discloses scoped inspection and keeps root navigation available", () => {
	const { tree, view, results } = fixture();
	view.update(
		snapshotDocument(tree, { root: results.matches[0].ref }),
		"https://example.test/",
	);
	expect(view.render(200, 10)[0]).toContain(`scope ${results.matches[0].ref}`);
	expect(view.key("U")).toBe("root");
});
