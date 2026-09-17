import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const theme = Array.from(
	{ length: 100 },
	(_value, index) => `--theme-${index}:value`,
).join(";");

function fixture(css: string, unique = false) {
	const content = Array.from(
		{ length: 200 },
		(_value, index) =>
			`<span class="item"${unique ? ` style="--unique:${index}"` : ""}>Paragraph ${index}</span>`,
	).join("");
	const tree = parseHtmlDocument(
		`<style>:root{${theme}}${css}</style><main>${content}</main>`,
		"https://css-retention.fixture.invalid/",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	const items = queries.querySelectorAll(".item");
	const sheet = queries.querySelector("style");
	if (sheet === null) throw new Error("Missing stylesheet");
	return { tree, styles, items, sheet };
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("shares sibling maps while retaining CSS-backed block extraction", () => {
	const { tree, styles, items } = fixture(
		".item{--mode:block;display:var(--mode)}",
	);
	for (const item of items) {
		expect(styles.get(item).display).toBe("block");
		expect(styles.custom(item, "--theme-99")).toBe("value");
	}
	const result = extractDocument(tree).content;
	expect(typeof result).toBe("string");
	expect((result as string).trim().split("\n\n")).toEqual(
		Array.from({ length: 200 }, (_value, index) => `Paragraph ${index}`),
	);
});

it.each(["before", "after"] as const)(
	"shares equivalent %s pseudo-element resolutions",
	(target) => {
		const { styles, items } = fixture(
			`.item::${target}{--label:"marker";content:var(--label)}`,
		);
		for (const item of items)
			expect(styles.generatedContent(item, target)?.content).toBe("marker");
	},
);

it("discards cached resolutions after stylesheet and inline mutations", () => {
	const { tree, styles, items, sheet } = fixture(
		".item{--mode:block;display:var(--mode)}",
	);
	expect(styles.get(items[0]).display).toBe("block");
	tree.setTextContent(
		sheet,
		`:root{${theme}}.item{--mode:inline;display:var(--mode)}`,
	);
	expect(styles.get(items[0]).display).toBe("inline");
	tree.setAttribute(items[0], "style", "--mode:none");
	expect(styles.get(items[0]).display).toBe("none");
	expect(styles.get(items[1]).display).toBe("inline");
	tree.removeAttribute(items[0], "style");
	expect(styles.get(items[0]).display).toBe("inline");
});

it("retains the unique-map limit and recovers after the failing source changes", () => {
	const { tree, styles, items } = fixture(".item{display:block}", true);
	expect(() => styles.get(items[0])).toThrow("retention limit");
	expect(() => styles.get(items[0])).toThrow("retention limit");
	for (const item of items) tree.removeAttribute(item, "style");
	expect(styles.get(items[0]).display).toBe("block");
	expect(styles.custom(items[0], "--theme-99")).toBe("value");
});

it("keeps closed style owners closed after cache use", () => {
	const { tree, styles, items } = fixture(".item{--mode:block}");
	expect(styles.custom(items[0], "--mode")).toBe("block");
	tree.close();
	expect(() => styles.custom(items[0], "--mode")).toThrow("closed");
});
