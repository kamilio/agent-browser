import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

function fixture(
	css: string,
	html = '<span id="target" class="item">Text</span>',
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style><main>${html}</main>`,
		"https://selector-reuse.fixture.invalid/page",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, id, styles: documentStyles(tree) };
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

it("matches repeated selectors once while retaining later declarations", () => {
	const { styles, id } = fixture(
		`${".item{display:none}".repeat(100)}.item{display:block}`,
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	expect(styles.get(id("#target")).display).toBe("block");
	expect(matching).toHaveBeenCalledTimes(1);
});

it("keeps matched-branch specificity and source order separate from reuse", () => {
	const { styles, id } = fixture(
		".item,#target{display:none}.item{display:block}.item,#target{visibility:hidden}",
		'<span id="target" class="item"></span><span id="other" class="item"></span>',
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	expect(styles.get(id("#target")).display).toBe("none");
	expect(styles.get(id("#other")).display).toBe("block");
	expect(styles.get(id("#other")).visibility).toBe("hidden");
	expect(matching).toHaveBeenCalledTimes(2);
});

it("retains all element and pseudo-element specificity maps", () => {
	const { styles, id } = fixture(
		'.item,.item::before,.item::after{display:block}.item,.item::before,.item::after{color:red}.item::before{content:"before"}.item::after{content:"after"}',
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	const target = id("#target");
	expect(styles.get(target).display).toBe("block");
	expect(styles.generatedContent(target, "before")).toMatchObject({
		content: "before",
		display: "block",
	});
	expect(styles.generatedContent(target, "after")).toMatchObject({
		content: "after",
		display: "block",
	});
	expect(matching).toHaveBeenCalledTimes(3);
});

it("reuses empty matches only until the document changes", () => {
	const { tree, styles, id } = fixture(
		".missing{display:none}.missing{visibility:hidden}",
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	const target = id("#target");
	expect(styles.get(target).display).toBe("inline");
	expect(matching).toHaveBeenCalledTimes(1);
	tree.setAttribute(target, "class", "missing");
	expect(styles.get(target).display).toBe("none");
	expect(matching).toHaveBeenCalledTimes(2);
	tree.removeAttribute(target, "class");
	expect(styles.get(target).visible).toBe(true);
	expect(matching).toHaveBeenCalledTimes(3);
});

it.each([
	{
		selector: "input:checked + .item",
		input: '<input id="control" type="checkbox">',
		first: { checked: true },
		second: { checked: false },
		initial: true,
	},
	{
		selector: "input:invalid + .item",
		input: '<input id="control" required>',
		first: { value: "valid" },
		second: { value: "" },
		initial: false,
	},
])("reevaluates native control state for $selector", (entry) => {
	const { tree, styles, id } = fixture(
		`${entry.selector}{display:none}${entry.selector}{visibility:hidden}`,
		`${entry.input}<span id="target" class="item">Text</span>`,
	);
	const target = id("#target");
	expect(styles.get(target).visible).toBe(entry.initial);
	tree.setControl(id("#control"), entry.first);
	expect(styles.get(target).visible).toBe(!entry.initial);
	tree.setControl(id("#control"), entry.second);
	expect(styles.get(target).visible).toBe(entry.initial);
});

it("reevaluates focus-sensitive empty matches", () => {
	const { tree, styles, id } = fixture(
		"input:focus + .item{display:none}input:focus + .item{visibility:hidden}",
		'<input id="control"><span id="target" class="item">Text</span>',
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	new DocumentInteractions(tree).focus.focus(tree.reference(id("#control")));
	expect(styles.get(id("#target")).visible).toBe(false);
});

it("keeps media applicability independent and refreshes after resizing", () => {
	const { styles, id } = fixture(
		".item{display:block}@media(min-width:900px){.item{display:none}}",
	);
	styles.setViewport(1280, 800);
	expect(styles.get(id("#target")).display).toBe("none");
	styles.setViewport(640, 800);
	expect(styles.get(id("#target")).display).toBe("block");
});

it("refreshes after stylesheet text and external-sheet state changes", () => {
	const { tree, styles, id } = fixture(
		".item{display:none}.item{display:block}",
		'<link id="sheet" rel="stylesheet" href="/style.css"><span id="target" class="item">Text</span>',
	);
	styles.setExternalSheet(
		id("#sheet"),
		"https://selector-reuse.fixture.invalid/style.css",
		".item{display:none}",
	);
	expect(styles.get(id("#target")).display).toBe("none");
	tree.setAttribute(id("#sheet"), "disabled", "");
	expect(styles.get(id("#target")).display).toBe("block");
	tree.setTextContent(id("style"), ".item{display:inline}");
	expect(styles.get(id("#target")).display).toBe("inline");
});

it("does not retain selector failures or suppress repeated diagnostics", () => {
	const { styles, id } = fixture(
		".item:user-valid{display:none}.item:user-valid{visibility:hidden}",
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(matching).toHaveBeenCalledTimes(2);
	expect(styles.metrics().issues["unimplemented-or-invalid-css-selector"]).toBe(
		2,
	);
});

it("retains per-rule property diagnostic attribution on a cache hit", () => {
	const { styles, id } = fixture(".item{unknown-one:1}.item{unknown-two:2}");
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.metrics().issues["unimplemented-css-property"]).toBe(2);
	expect(styles.metrics().applicableIssues["unimplemented-css-property"]).toBe(
		2,
	);
});

it.each([false, true])(
	"skips diagnostic-only match traversal (following declarations: %s)",
	(followingDeclarations) => {
		const selector = ".item,.item::before,.item::after";
		const ruleCount = 64;
		const elementCount = 128;
		const { styles, id } = fixture(
			`${`${selector}{unknown-one:1}`.repeat(ruleCount)}${followingDeclarations ? `${selector}{display:block;content:"generated"}` : ""}`,
			`<span id="target" class="item">Text</span>${'<span class="item">More</span>'.repeat(elementCount - 1)}`,
		);
		const iterations = { elements: 0, before: 0, after: 0 };
		const visits = { elements: 0, before: 0, after: 0 };
		const original = DocumentQueries.prototype.matchingStyleSpecificities;
		const matching = vi
			.spyOn(DocumentQueries.prototype, "matchingStyleSpecificities")
			.mockImplementation(function (this: DocumentQueries, ...args) {
				const matches = original.apply(this, args);
				for (const name of ["elements", "before", "after"] as const) {
					const iterator = matches[name][Symbol.iterator].bind(matches[name]);
					vi.spyOn(matches[name], Symbol.iterator).mockImplementation(
						function* () {
							iterations[name]++;
							for (const entry of iterator()) {
								visits[name]++;
								yield entry;
							}
							return undefined;
						},
					);
				}
				return matches;
			});
		const target = id("#target");
		expect(styles.get(target).display).toBe(
			followingDeclarations ? "block" : "inline",
		);
		if (followingDeclarations) {
			for (const pseudo of ["before", "after"] as const)
				expect(styles.generatedContent(target, pseudo)).toMatchObject({
					content: "generated",
					display: "block",
				});
		}
		expect(styles.metrics().issues["unimplemented-css-property"]).toBe(
			ruleCount,
		);
		expect(
			styles.metrics().applicableIssues["unimplemented-css-property"],
		).toBe(ruleCount);
		const diagnostics = styles.diagnostics();
		expect(diagnostics.samples).toHaveLength(ruleCount);
		for (const sample of diagnostics.samples)
			expect(sample).toMatchObject({
				code: { value: "unimplemented-css-property" },
				selectors: [{ value: selector }],
				applicable: true,
				selectorState: "matched",
				mediaState: "active",
				matches: {
					elements: elementCount,
					before: elementCount,
					after: elementCount,
				},
			});
		expect(matching).toHaveBeenCalledTimes(1);
		for (const name of ["elements", "before", "after"] as const) {
			expect(iterations[name]).toBe(followingDeclarations ? 1 : 0);
			expect(visits[name]).toBe(followingDeclarations ? elementCount : 0);
		}
	},
);

it("keeps identical nested selector text scoped to its own parent", () => {
	const { styles, id } = fixture(
		".first{& .item{display:none}}.second{& .item{display:block}}",
		'<div class="first"><span id="target" class="item"></span></div><div class="second"><span id="other" class="item"></span></div>',
	);
	const matching = vi.spyOn(
		DocumentQueries.prototype,
		"matchingStyleSpecificities",
	);
	expect(styles.get(id("#target")).display).toBe("none");
	expect(styles.get(id("#other")).display).toBe("block");
	const nested = matching.mock.calls.filter((call) => call[2] !== undefined);
	expect(nested).toHaveLength(2);
	expect(nested[0][2]).not.toBe(nested[1][2]);
});

it("avoids repeated matching work on a repeated complex selector", () => {
	const { tree, id } = fixture(
		".item:not([data-missing]){display:block}".repeat(100),
		`<span id="target" class="item">Text</span>${'<span class="item">More</span>'.repeat(199)}`,
	);
	const styles = new DocumentStyles(tree, { maxWork: 80_000 });
	expect(styles.get(id("#target")).display).toBe("block");
	expect(styles.metrics().work).toBeLessThan(80_000);
});

it("never turns exhausted lookup budgets into selector diagnostics", () => {
	const { tree, id } = fixture(".item{display:block}");
	for (let maxWork = 1; maxWork <= 200; maxWork++) {
		const styles = new DocumentStyles(tree, { maxWork });
		try {
			styles.get(id("#target"));
			expect(
				styles.metrics().issues["unimplemented-or-invalid-css-selector"],
			).toBeUndefined();
		} catch (error) {
			expect(error).toMatchObject({ code: "resource-limit" });
		} finally {
			styles.close();
		}
	}
});

it("does not share results between documents with identical selector text", () => {
	const first = fixture(".item{display:none}.item{visibility:hidden}");
	const second = fixture(
		".item{display:none}.item{visibility:hidden}",
		'<span id="target">Text</span>',
	);
	expect(first.styles.get(first.id("#target")).visible).toBe(false);
	expect(second.styles.get(second.id("#target")).visible).toBe(true);
});
