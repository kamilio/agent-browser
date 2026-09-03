import { afterEach, expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type GeneratedLocator,
	generateLocator,
} from "./locator-generation.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { parseTargetLocator, resolveBrowserTarget } from "./target-locator.js";

const documents: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];

function fixture(markup = "") {
	const tree = parseHtmlDocument(markup, "https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const generate = (target: string) => {
		const result = generateLocator(tree, queries, target);
		expect(resolveBrowserTarget(tree, queries, result.locator)).toBe(
			result.ref,
		);
		return result;
	};
	return { tree, queries, generate };
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of documents.splice(0)) tree.close();
});

it("prefers a unique test ID without mutating or consuming snapshot state", () => {
	const { tree, generate } = fixture(
		'<button id="save" data-testid="save">Save</button>',
	);
	const before = snapshotDocument(tree);
	expect(generate("#save")).toMatchObject({
		locator: 'getByTestId("save")',
		strategy: "test-id",
		structural: false,
		revision: before.revision,
		partial: true,
	});
	expect(snapshotDocument(tree)).toEqual(before);
});

it("falls back from duplicate test IDs to an exact unique accessible role/name", () => {
	const { generate } = fixture(
		'<button data-testid="action">Cancel</button><button id="save" data-testid="action" aria-label="Save changes">ignored</button>',
	);
	expect(generate("#save")).toMatchObject({
		locator: 'getByRole("button", {name: "Save changes", exact: true})',
		strategy: "role",
	});
});

it("does not return an ambiguous role or test ID", () => {
	const { generate } = fixture(
		'<button data-testid="action">Save</button><button id="save" data-testid="action">Save</button>',
	);
	expect(generate("#save")).toMatchObject({
		strategy: "id",
		structural: false,
	});
});

it("generates CSS for hidden elements excluded from role locators", () => {
	const { generate } = fixture('<button id="hidden" hidden>Save</button>');
	expect(generate("#hidden").strategy).toBe("id");
});

it.each([
	"quote\"single'back\\slash",
	"line\nbreak\tend",
	"\u001b[31m\u202eevil",
	"\u{e0001}日本語",
	"",
	"123 :[]#>*",
])(
	"escapes ID %j for CSS and JavaScript without terminal control characters",
	(identifier) => {
		const { tree, queries, generate } = fixture("<div></div>");
		const id = queries.querySelector("div") as number;
		tree.setAttribute(id, "id", identifier);
		const result = generate(tree.reference(id));
		expect(result.strategy).toBe("id");
		expect(result.locator).not.toMatch(/[\p{Cc}\p{Cf}]/u);
	},
);

it("escapes locator literals without interpreting attribute contents", () => {
	const { tree, queries, generate } = fixture("<div></div>");
	const id = queries.querySelector("div") as number;
	tree.setAttribute(
		id,
		"data-testid",
		'"); globalThis.secret = 1; ("\u2028\u2029\u202e',
	);
	const result = generate(tree.reference(id));
	expect(result.strategy).toBe("test-id");
	expect(parseTargetLocator(result.locator)).toEqual({
		kind: "test-id",
		value: tree.get(id).attributes["data-testid"],
	});
	expect(result.locator).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
});

it.each([
	[
		'<input type="password" placeholder="Account secret">',
		"input",
		"placeholder",
	],
	['<img alt="Brand" hidden>', "img", "alt-text"],
	['<div title="Details"></div>', "div", "title"],
])("uses exact attribute locator for %s", (markup, target, strategy) => {
	expect(fixture(markup).generate(target).strategy).toBe(strategy);
});

it("builds an anchored positional path across text/comments and duplicate IDs", () => {
	const { tree, queries, generate } = fixture(
		'<main><div id="duplicate"></div>text<!--gap--><div id="duplicate"><span></span><span></span></div></main>',
	);
	const id = queries.querySelector(
		"main > div:nth-child(2) > span:nth-child(2)",
	) as number;
	const result = generate(tree.reference(id));
	expect(result).toMatchObject({ strategy: "path", structural: true });
	expect(result.locator).toContain(":not(* *)");
	expect(generate(result.locator)).toEqual(result);
});

it("anchors paths even in native documents with multiple top-level elements", () => {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	for (let index = 0; index < 3; index++)
		tree.append(tree.root, tree.createElement("div"));
	const queries = new DocumentQueries(tree);
	for (const id of tree.get(tree.root).children) {
		const generated = generateLocator(tree, queries, tree.reference(id));
		expect(resolveBrowserTarget(tree, queries, generated.locator)).toBe(
			tree.reference(id),
		);
	}
});

it("skips a null-containing CSS identifier rather than silently replacing it", () => {
	const { tree, queries, generate } = fixture("<div></div>");
	const id = queries.querySelector("div") as number;
	tree.setAttribute(id, "id", "nul\0id");
	expect(generate(tree.reference(id)).strategy).toBe("path");
});

it("rechecks uniqueness after changes and preserves meaningful locators after moves", () => {
	const { tree, queries, generate } = fixture(
		'<main><button data-testid="save">Save</button></main><aside></aside>',
	);
	const id = queries.querySelector("button") as number;
	const first = generate(tree.reference(id));
	tree.append(queries.querySelector("aside") as number, id);
	expect(generate(tree.reference(id)).locator).toBe(first.locator);
	tree.append(
		queries.querySelector("main") as number,
		tree.createElement("button", {
			"data-testid": "save",
			"aria-label": "Save",
		}),
	);
	expect(generate(tree.reference(id)).strategy).toBe("path");
	expect(() => resolveBrowserTarget(tree, queries, first.locator)).toThrow(
		"multiple",
	);
});

it("marks positional fallback as structural rather than promising identity after reordering", () => {
	const { tree, queries, generate } = fixture(
		"<main><span></span><span></span></main>",
	);
	const spans = queries.querySelectorAll("span");
	const generated = generate(tree.reference(spans[1]));
	expect(generated.structural).toBe(true);
	tree.append(queries.querySelector("main") as number, spans[0]);
	expect(tree.revision).toBeGreaterThan(generated.revision);
	expect(resolveBrowserTarget(tree, queries, generated.locator)).toBe(
		tree.reference(spans[0]),
	);
});

it("rejects non-elements, detached refs, missing and ambiguous targets", () => {
	const { tree, queries, generate } = fixture("<div>text</div><div></div>");
	expect(() => generate("div")).toThrow("multiple");
	expect(() => generate("#missing")).toThrow("no elements");
	expect(() => generate(tree.reference(tree.root))).toThrow(
		"requires an element",
	);
	const id = queries.querySelector("div") as number;
	expect(() => generate(tree.reference(tree.get(id).children[0]))).toThrow(
		"requires an element",
	);
	tree.remove(id);
	expect(() => generate(tree.reference(id))).toThrow("no longer");
	tree.close();
	expect(() => generate("e1")).toThrow("closed");
});

it("bounds deep fallback paths but allows a unique ID without a path", () => {
	const { tree, queries, generate } = fixture("<div></div>");
	let id = queries.querySelector("div") as number;
	for (let depth = 0; depth < 65; depth++) {
		const child = tree.createElement("div");
		tree.append(id, child);
		id = child;
	}
	expect(() => generate(tree.reference(id))).toThrow("path depth");
	tree.setAttribute(id, "id", "deep");
	expect(generate(tree.reference(id)).strategy).toBe("id");
});

it("fails closed when a candidate cannot be exhaustively checked", () => {
	const { tree, queries } = fixture(
		'<div data-testid="same"></div><div data-testid="same"></div>',
	);
	const id = queries.querySelector("div") as number;
	const limited = new DocumentQueries(tree, { maxResults: 1 });
	expect(() => generateLocator(tree, limited, tree.reference(id))).toThrow(
		"result limit",
	);
});

it("skips oversized candidate strings while retaining a verified structural fallback", () => {
	const { tree, queries, generate } = fixture("<div></div>");
	const id = queries.querySelector("div") as number;
	tree.setAttribute(id, "data-testid", "x".repeat(8192));
	tree.setAttribute(id, "id", "y".repeat(8192));
	expect(generate(tree.reference(id)).strategy).toBe("path");
});

it("bounds owned nodes including detached allocations", () => {
	const tree = new DocumentTree("https://example.com/", { maxNodes: 50_002 });
	documents.push(tree);
	const id = tree.createElement("div");
	tree.append(tree.root, id);
	const queries = new DocumentQueries(tree);
	const ref = tree.reference(id);
	while (tree.nodeCount <= 50_000) tree.createText("");
	expect(() => generateLocator(tree, queries, ref)).toThrow("document limit");
});

it("accepts only literal CSS locator calls, not expressions, options or chains", () => {
	expect(parseTargetLocator('locator("div > span")')).toEqual({
		kind: "css",
		value: "div > span",
	});
	for (const source of [
		"locator(document.title)",
		'locator("div" + "span")',
		'locator("div", {})',
		'locator("div").first()',
		'locator("div"); secret()',
	])
		expect(() => parseTargetLocator(source)).toThrow();
});

it("supports raw syntax on either side of the command without silently enabling it elsewhere", async () => {
	for (const argv of [
		["--raw", "generate-locator", "e1"],
		["generate-locator", "e1", "--raw"],
	])
		expect(parseInvocation(argv)).toMatchObject({
			command: "generate-locator",
			options: { raw: true },
		});
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("must not create");
		},
	});
	hosts.push(host);
	await expect(
		host.execute(["generate-locator", "e1", "--raw", "--json"]),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(host.execute(["snapshot", "--raw"])).rejects.toMatchObject({
		code: "unsupported",
	});
});

it("generates through the shared host and reuses its output for actions after navigation", async () => {
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) => {
					const tree = parseHtmlDocument(
						'<input id="name" type="password">',
						response.url,
					);
					documents.push(tree);
					return tree;
				},
			}),
	});
	hosts.push(host);
	await host.execute(["open", "https://example.com/"]);
	const generated = (await host.execute(["generate-locator", "#name", "--raw"]))
		.data as GeneratedLocator;
	expect(generated.strategy).toBe("id");
	await host.execute(["fill", generated.locator, "first"]);
	await host.execute(["reload"]);
	await host.execute(["fill", generated.locator, "second"]);
	const current = documents.at(-1) as DocumentTree;
	const input = current.get(
		new DocumentQueries(current).querySelector("input") as number,
	);
	expect(input.control?.value).toBe("second");
	expect(
		(await host.execute(["generate-locator", generated.locator])).data,
	).toMatchObject({ locator: generated.locator });
});
