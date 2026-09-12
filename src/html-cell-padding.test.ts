import { afterEach, expect, it, vi } from "vitest";
import { type DocumentNode, DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import {
	cellPaddingLength,
	cellPaddingOwner,
	supportsCellPaddingHint,
} from "./html-cell-padding.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
const cellTags = ["td", "th"];
const groupTags = ["thead", "tbody", "tfoot"];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function document(html?: string) {
	const tree =
		html === undefined
			? new DocumentTree("https://fixture.invalid/")
			: parseHtmlDocument(html, "https://fixture.invalid/");
	documents.push(tree);
	return tree;
}

function find(tree: DocumentTree, selector: string): number {
	const queries = new DocumentQueries(tree);
	try {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	} finally {
		queries.close();
	}
}

function chain(tree: DocumentTree, tags: readonly string[]) {
	const ids: number[] = [];
	for (const tag of tags) {
		const target = tree.createElement(tag);
		if (ids.length) tree.append(ids[ids.length - 1], target);
		ids.push(target);
	}
	return ids;
}

function expectOwner(
	tree: DocumentTree,
	target: number,
	owner: number | undefined,
	parents: readonly number[],
) {
	const node = tree.get(target);
	const get = tree.get.bind(tree);
	const events: string[] = [];
	const read = vi.spyOn(tree, "get").mockImplementation((id) => {
		events.push(`read:${id}`);
		return get(id);
	});
	const charge = vi.fn(() => {
		events.push("charge");
	});
	try {
		expect(cellPaddingOwner(tree, node, charge)).toBe(owner);
		expect(events).toEqual(
			parents.flatMap((parent) => ["charge", `read:${parent}`]),
		);
		expect(charge.mock.calls).toEqual(parents.map(() => []));
	} finally {
		read.mockRestore();
	}
}

it.each([
	["0", "0px"],
	["00", "0px"],
	["+0", "0px"],
	["-0", "0px"],
	["-000", "0px"],
	["-0.5", "0px"],
	["-0e99", "0px"],
	["-0x10", "0px"],
	["-000junk", "0px"],
	["-0 1", "0px"],
	["1", "1px"],
	["5", "5px"],
	["+5", "5px"],
	["0005", "5px"],
	["+0005", "5px"],
	[" 5", "5px"],
	["\t5", "5px"],
	["\n5", "5px"],
	["\f5", "5px"],
	["\r5", "5px"],
	[" \t\n\f\r+0005", "5px"],
	[" \t\n\f\r-000", "0px"],
	["5px", "5px"],
	["5%", "5px"],
	["5.9", "5px"],
	["5e2", "5px"],
	["5E9999999999999999999", "5px"],
	["5junk", "5px"],
	["5 999", "5px"],
	["5-999", "5px"],
	["5+999", "5px"],
	["5\u0000", "5px"],
	["5\ud83d\ude00", "5px"],
	["5\ud800", "5px"],
	["0x10", "0px"],
	["0b11", "0px"],
	["1e3", "1px"],
	["2147483648", "2147483648px"],
	["4294967296", "4294967296px"],
	["16777217", "16777217px"],
	["9007199254740990", "9007199254740990px"],
	["9007199254740991", "9007199254740991px"],
	["+0009007199254740991.99", "9007199254740991px"],
])("parses nonnegative integer prefix %j", (value, expected) => {
	expect(cellPaddingLength(value)).toBe(expected);
});

it.each([
	undefined,
	"",
	" ",
	"\t\n\f\r ",
	"+",
	"-",
	" +",
	" -",
	"+ 5",
	"- 0",
	"+\t5",
	"-\n0",
	"++5",
	"--0",
	"+-0",
	"-+0",
	".5",
	"-.0",
	"+.0",
	"NaN",
	"Infinity",
	"+Infinity",
	"five",
	"-1",
	"-0001",
	"-1.0",
	"-9007199254740991",
	"-9007199254740992",
	"-99999999999999999999999999999999999999",
	"\u00005",
	"\ud8005",
	"\ud83d\ude005",
])("ignores absent, invalid or negative integer prefix %j", (value) => {
	expect(cellPaddingLength(value)).toBeUndefined();
});

it.each(["\v", "\u00a0", "\u1680", "\u2003", "\u2028", "\u2029", "\ufeff"])(
	"does not skip non-ASCII-whitespace %j",
	(character) => {
		expect(cellPaddingLength(`${character}5`)).toBeUndefined();
		expect(cellPaddingLength(`+${character}5`)).toBeUndefined();
		expect(cellPaddingLength(`5${character}9`)).toBe("5px");
	},
);

it.each(["\uff15", "\u0665", "\u06f5", "\u096b", "\ud835\udfd3"])(
	"requires ASCII rather than Unicode digits %j",
	(digit) => {
		expect(cellPaddingLength(digit)).toBeUndefined();
		expect(cellPaddingLength(`+${digit}`)).toBeUndefined();
		expect(cellPaddingLength(`0${digit}`)).toBe("0px");
	},
);

it.each(["\u22125", "\uff0b5", "\uff0d0"])(
	"does not recognize Unicode sign lookalike %j",
	(value) => {
		expect(cellPaddingLength(value)).toBeUndefined();
	},
);

it.each([
	"9007199254740992",
	"9007199254740993",
	"+9007199254740992",
	"0009007199254740992%",
	"9007199254740999junk",
	"90071992547409910",
	"99999999999999999999999999999999999999",
])("reports resource precision failure rather than rounding %j", (value) => {
	expect(() => cellPaddingLength(value)).toThrow(AgentBrowserError);
	expect(() => cellPaddingLength(value)).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: expect.stringMatching(/precision/i),
		}),
	);
});

it("accepts very long leading whitespace, zeroes and ignored suffixes", () => {
	const zeroes = "0".repeat(100_000);
	const spaces = " ".repeat(100_000);
	const suffix = "x".repeat(100_000);
	expect(cellPaddingLength(`${spaces}+${zeroes}5${suffix}`)).toBe("5px");
	expect(cellPaddingLength(`${zeroes}9007199254740991`)).toBe(
		"9007199254740991px",
	);
	expect(cellPaddingLength(zeroes)).toBe("0px");
	expect(cellPaddingLength(`-${zeroes}`)).toBe("0px");
	expect(cellPaddingLength(`-${zeroes}.${suffix}`)).toBe("0px");
	expect(cellPaddingLength(`+0${suffix}`)).toBe("0px");
	expect(cellPaddingLength(spaces)).toBeUndefined();
});

it("distinguishes huge positive precision failures from negative rejection", () => {
	const zeroes = "0".repeat(100_000);
	const magnitude = "9".repeat(100_000);
	for (const value of [magnitude, `${zeroes}9007199254740992`])
		expect(() => cellPaddingLength(value)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(cellPaddingLength(`-${magnitude}`)).toBeUndefined();
	expect(cellPaddingLength(`-${zeroes}1`)).toBeUndefined();
	expect(cellPaddingLength(`-0.${magnitude}`)).toBe("0px");
});

it("supports an HTML table independently of attribute presence and value", () => {
	const tree = document();
	const target = tree.createElement("table");
	const attributeSets: Record<string, string>[] = [
		{},
		{ cellpadding: "0" },
		{ cellpadding: "bad" },
	];
	for (const namespaceURI of [undefined, htmlNamespace])
		for (const attributes of attributeSets)
			expect(
				supportsCellPaddingHint({
					...tree.get(target),
					namespaceURI,
					attributes,
				}),
			).toBe(true);
});

it.each([
	"td",
	"th",
	"tr",
	"thead",
	"tbody",
	"tfoot",
	"caption",
	"col",
	"colgroup",
	"div",
	"body",
	"template",
	"constructor",
	"__proto__",
	"TABLE",
	"x:table",
])("does not enable table hints on role %s", (tagName) => {
	const tree = document();
	const target = tree.createElement("div", {
		cellpadding: "5",
		style: "display:table",
		role: "table",
	});
	expect(supportsCellPaddingHint({ ...tree.get(target), tagName })).toBe(false);
});

it.each([svgNamespace, mathmlNamespace, "", "urn:custom"])(
	"excludes a table namesake in namespace %j",
	(namespaceURI) => {
		const tree = document();
		const target = tree.createElement("table");
		expect(supportsCellPaddingHint({ ...tree.get(target), namespaceURI })).toBe(
			false,
		);
	},
);

it("excludes non-element kinds from table and cell roles without reads", () => {
	const tree = document();
	const target = tree.createElement("td");
	const kinds: DocumentNode["kind"][] = [
		"document",
		"fragment",
		"text",
		"comment",
		"doctype",
	];
	const read = vi.spyOn(tree, "get");
	const node = tree.get(target);
	read.mockClear();
	const charge = vi.fn();
	for (const kind of kinds) {
		expect(supportsCellPaddingHint({ ...node, kind, tagName: "table" })).toBe(
			false,
		);
		expect(cellPaddingOwner(tree, { ...node, kind }, charge)).toBeUndefined();
	}
	expect(read).not.toHaveBeenCalled();
	expect(charge).not.toHaveBeenCalled();
});

it.each(cellTags)(
	"recognizes native parser implied tbody ownership for %s",
	(tag) => {
		const tree = document(
			`<!doctype html><table id="owner"><tr><${tag} id="cell"></${tag}></tr></table>`,
		);
		const owner = find(tree, "#owner");
		const cell = find(tree, "#cell");
		const row = find(tree, "#owner > tbody > tr");
		const group = find(tree, "#owner > tbody");
		expectOwner(tree, cell, owner, [row, group, owner]);
	},
);

it.each(cellTags)("recognizes direct DOM table/tr/%s membership", (tag) => {
	const tree = document();
	const [table, row, cell] = chain(tree, ["table", "tr", tag]);
	expectOwner(tree, cell, table, [row, table]);
});

it.each(groupTags)("recognizes exact %s row-group membership", (groupTag) => {
	const tree = document();
	for (const tag of cellTags) {
		const [table, group, row, cell] = chain(tree, [
			"table",
			groupTag,
			"tr",
			tag,
		]);
		expectOwner(tree, cell, table, [row, group, table]);
	}
});

it("includes multiple headers, bodies and footers irrespective of order", () => {
	const tree = document();
	const table = tree.createElement("table");
	for (const groupTag of [
		"tfoot",
		"thead",
		"tbody",
		"tfoot",
		"thead",
		"tbody",
	]) {
		const [group, row, cell] = chain(tree, [groupTag, "tr", "td"]);
		tree.append(table, group);
		expectOwner(tree, cell, table, [row, group, table]);
	}
});

it.each([
	{ tags: ["table", "div", "tr", "td"], reads: 2 },
	{ tags: ["table", "tbody", "div", "tr", "td"], reads: 2 },
	{ tags: ["table", "div", "tbody", "tr", "td"], reads: 3 },
	{ tags: ["table", "tr", "div", "td"], reads: 1 },
	{ tags: ["table", "tbody", "tr", "span", "th"], reads: 1 },
	{ tags: ["table", "td"], reads: 1 },
	{ tags: ["table", "tbody", "td"], reads: 1 },
	{ tags: ["table", "tbody", "tbody", "tr", "td"], reads: 3 },
	{ tags: ["table", "tr", "tr", "td"], reads: 2 },
	{ tags: ["table", "caption", "tr", "td"], reads: 2 },
])("rejects intervening malformed wrappers %#", ({ tags, reads }) => {
	const tree = document();
	const ids = chain(tree, tags);
	expectOwner(
		tree,
		ids[ids.length - 1],
		undefined,
		ids.slice(-reads - 1, -1).reverse(),
	);
});

it.each([0, 1, 2, 3])(
	"checks namespace at ancestry position %i",
	(foreignIndex) => {
		for (const namespaceURI of [svgNamespace, mathmlNamespace]) {
			const tree = document();
			const tags = ["td", "tr", "tbody", "table"];
			const ids = tags.map((tag, index) =>
				tree.createParserElement(
					tag,
					{},
					index === foreignIndex ? namespaceURI : htmlNamespace,
				),
			);
			for (let index = 0; index < ids.length - 1; index++)
				tree.append(ids[index + 1], ids[index]);
			expectOwner(tree, ids[0], undefined, ids.slice(1, foreignIndex + 1));
		}
	},
);

it("does not treat CSS display, hidden state or ARIA roles as HTML membership", () => {
	const tree = document();
	const [table, group, row, cell] = chain(tree, ["table", "tbody", "tr", "td"]);
	for (const target of [table, group, row, cell]) {
		tree.setAttribute(target, "style", "display:none;visibility:hidden");
		tree.setAttribute(target, "hidden", "");
		tree.setAttribute(target, "role", "presentation");
		tree.setAttribute(target, "aria-hidden", "true");
	}
	expectOwner(tree, cell, table, [row, group, table]);
	const [wrapper, fakeRow, fakeCell] = chain(tree, ["div", "div", "div"]);
	tree.setAttribute(wrapper, "style", "display:table");
	tree.setAttribute(fakeRow, "style", "display:table-row");
	tree.setAttribute(fakeCell, "style", "display:table-cell");
	tree.setAttribute(fakeCell, "role", "cell");
	expectOwner(tree, fakeCell, undefined, []);
});

it("never crosses an inner table to borrow an outer cellpadding attribute", () => {
	const tree = document();
	const [outer, outerRow, outerCell, inner, innerRow, innerCell] = chain(tree, [
		"table",
		"tr",
		"td",
		"table",
		"tr",
		"th",
	]);
	tree.setAttribute(outer, "cellpadding", "7");
	expectOwner(tree, outerCell, outer, [outerRow, outer]);
	expectOwner(tree, innerCell, inner, [innerRow, inner]);
	for (const value of ["0", "2", "invalid", "-1"]) {
		tree.setAttribute(inner, "cellpadding", value);
		expectOwner(tree, innerCell, inner, [innerRow, inner]);
	}
});

it("requires an actual table even for detached rows and groups", () => {
	const tree = document();
	const cell = tree.createElement("td");
	expectOwner(tree, cell, undefined, []);
	const row = tree.createElement("tr");
	tree.append(row, cell);
	expectOwner(tree, cell, undefined, [row]);
	const group = tree.createElement("tbody");
	tree.append(group, row);
	expectOwner(tree, cell, undefined, [row, group]);
	const table = tree.createElement("table");
	tree.append(table, group);
	expectOwner(tree, cell, table, [row, group, table]);
});

it("rechecks current parents after moving and removing a row without caching", () => {
	const tree = document();
	const [first, row, cell] = chain(tree, ["table", "tr", "td"]);
	const [second, group] = chain(tree, ["table", "tfoot"]);
	expectOwner(tree, cell, first, [row, first]);
	tree.append(group, row);
	expectOwner(tree, cell, second, [row, group, second]);
	tree.remove(row);
	expectOwner(tree, cell, undefined, [row]);
	tree.append(first, row);
	expectOwner(tree, cell, first, [row, first]);
});

it.each([false, true])(
	"does not cross a template fragment, grouped=%s",
	(grouped) => {
		const tree = document();
		const [table, template] = chain(tree, ["table", "template"]);
		const content = tree.templateContent(template);
		const ids = chain(
			content.tree,
			grouped ? ["tbody", "tr", "td"] : ["tr", "td"],
		);
		content.tree.append(content.id, ids[0]);
		const cell = ids[ids.length - 1];
		expectOwner(content.tree, cell, undefined, [
			...ids.slice(0, -1).reverse(),
			content.id,
		]);
		expect(supportsCellPaddingHint(tree.get(table))).toBe(true);
	},
);

it("allows a real table within template content to own its own cells", () => {
	const tree = document();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	const [table, row, cell] = chain(content.tree, ["table", "tr", "td"]);
	content.tree.append(content.id, table);
	expectOwner(content.tree, cell, table, [row, table]);
});

it("stops before a full ancestor walk through many unrelated wrappers", () => {
	const tree = document();
	const ids = chain(tree, [
		"table",
		...Array<string>(32).fill("div"),
		"tr",
		"td",
	]);
	expectOwner(
		tree,
		ids[ids.length - 1],
		undefined,
		ids.slice(-3, -1).reverse(),
	);
});

it.each([1, 2, 3])(
	"propagates charge failure before parent read %i",
	(failureAt) => {
		const tree = document();
		const [table, group, row, cell] = chain(tree, [
			"table",
			"tbody",
			"tr",
			"td",
		]);
		const node = tree.get(cell);
		const reads = vi.spyOn(tree, "get");
		const failure = new AgentBrowserError(
			"resource-limit",
			"Fixture work exhausted",
		);
		let charges = 0;
		const charge = () => {
			charges++;
			if (charges === failureAt) throw failure;
		};
		expect(() => cellPaddingOwner(tree, node, charge)).toThrow(failure);
		expect(charges).toBe(failureAt);
		expect(reads.mock.calls).toEqual(
			[row, group, table].slice(0, failureAt - 1).map((parent) => [parent]),
		);
	},
);
