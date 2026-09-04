import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	controlValue,
	optionOwner,
	selectOptions,
	selectedOptions,
} from "./controls.js";
import { setInnerHtml } from "./html-content.js";
import { htmlParseInfo } from "./html-info.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { prepareFormSubmission } from "./forms.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function parse(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.test/",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const find = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	};
	return { tree, queries, find };
}

it("retains rich option descendants and their native value", () => {
	const { tree, find } = parse(
		"<select><option><span>Rich</span></option></select>",
	);
	expect(serializeHtml(tree, find("select"), { includeSelf: true })).toBe(
		"<select><option><span>Rich</span></option></select>",
	);
	expect(controlValue(tree, find("select"))).toBe("Rich");
});

it("does not close select when a textarea is inserted", () => {
	const { find } = parse(
		"<select><textarea>value</textarea><option>choice</option></select>",
	);
	expect(find("select > textarea")).toBeGreaterThan(0);
});

it("keeps the input-start exception and closes an in-scope select", () => {
	const { tree, find } = parse("<select><div>choice<input id=outside><p>after");
	expect(find("body > input")).toBe(find("#outside"));
	expect(serializeHtml(tree, find("select"), { includeSelf: true })).toBe(
		"<select><div>choice</div></select>",
	);
	expect(htmlParseInfo(tree)?.issues["select-closed-by-control"]).toBe(1);
});

it("does not close an out-of-scope select for an input inside a table cell", () => {
	const { tree, find } = parse(
		"<select><table><tr><td><input></td></tr></table><option>A</select>",
	);
	expect(find("select td > input")).toBeGreaterThan(0);
	expect(
		htmlParseInfo(tree)?.issues["select-closed-by-control"],
	).toBeUndefined();
});

it.each(["<keygen>", "<keygen/>"])(
	"treats %s as void without consuming a following select option",
	(token) => {
		const { tree, find } = parse(`<select>${token}<option>A</select>`);
		expect(tree.get(find("keygen")).children).toEqual([]);
		expect(find("select > option")).toBeGreaterThan(0);
	},
);

it("retains the input exception even below a wrapper in a select fragment", () => {
	const { tree, fragment } = parseHtmlFragment(
		"<div><input><textarea>kept</textarea></div>",
		"https://example.test/",
		{ tagName: "select" },
	);
	trees.push(tree);
	expect(serializeHtml(tree, fragment)).toBe(
		"<div><textarea>kept</textarea></div>",
	);
	expect(
		htmlParseInfo(tree)?.issues["ignored-control-in-select-fragment"],
	).toBe(1);
});

it("excludes options inside datalists from native select ownership", () => {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	const select = tree.createElement("select");
	const datalist = tree.createElement("datalist");
	const option = tree.createElement("option", { value: "hidden" });
	tree.append(tree.root, select);
	tree.append(select, datalist);
	tree.append(datalist, option);
	expect(optionOwner(tree, option)).toBeUndefined();
	expect(selectOptions(tree, select)).toEqual([]);
	expect(tree.get(option).control.selected).toBe(false);
});

it.each([
	[
		"<select><button><selectedcontent></selectedcontent></button><option>A</option></select>",
		"<select><button><selectedcontent></selectedcontent></button><option>A</option></select>",
	],
	[
		"<select><div><option><b>A</b></option></div></select>",
		"<select><div><option><b>A</b></option></div></select>",
	],
	[
		"<select><textarea>T</textarea><keygen><option>A</option></select>",
		"<select><textarea>T</textarea><keygen><option>A</option></select>",
	],
	[
		"<select><optgroup label=G><option>A<hr><option>B</select>",
		'<select><optgroup label="G"><option>A</option></optgroup><hr><option>B</option></select>',
	],
	[
		"<select><option><p>A<option>B</select>",
		"<select><option><p>A</p></option><option>B</option></select>",
	],
	[
		"<select><option>A<optgroup><option>B</select>",
		"<select><option>A</option><optgroup><option>B</option></optgroup></select>",
	],
	[
		"<select><optgroup><option>A<optgroup><option>B</select>",
		"<select><optgroup><option>A</option></optgroup><optgroup><option>B</option></optgroup></select>",
	],
	[
		"<select><option><div>A<option>B</select>",
		"<select><option><div>A<option>B</option></div></option></select>",
	],
	["<select><div>A</select><p>B", "<select><div>A</div></select>"],
	["<select><option>A<select><option>B", "<select><option>A</option></select>"],
	[
		"<select><table><tr><td>A</td></tr></table><option>B</select>",
		"<select><table><tbody><tr><td>A</td></tr></tbody></table><option>B</option></select>",
	],
])("uses current select tree construction for %s", (source, expected) => {
	const { tree, find } = parse(source);
	expect(serializeHtml(tree, find("select"), { includeSelf: true })).toBe(
		expected,
	);
});

it("uses select scope rather than crossing an intervening table for nested starts", () => {
	const { tree, find } = parse(
		"<select id=outer><table><tr><td><select id=inner><option>A</select></td></tr></table></select>",
	);
	expect(find("#outer #inner")).toBeGreaterThan(0);
	expect(optionOwner(tree, find("option"))).toBe(find("#inner"));
});

it("does not close an outer select through an in-scope table boundary", () => {
	const { tree, find } = parse(
		"<select><table><tr><td>A</select>B</td></tr></table><option>C</select>",
	);
	expect(tree.textContent(find("td"))).toBe("AB");
	expect(find("select > option")).toBeGreaterThan(0);
});

it("reconstructs formatting across option and select transitions", () => {
	const { tree, find } = parse("<b><select><option>A</select>B</b>");
	expect(serializeHtml(tree, find("b"), { includeSelf: true })).toBe(
		"<b><select><option>A</option></select>B</b>",
	);
	expect(htmlParseInfo(tree)?.issues["ignored-tag-in-select"]).toBeUndefined();
});

it("reports blocked implied-end recovery without closing arbitrary option descendants", () => {
	const { tree, find } = parse(
		"<select><option id=outer><div>A<option id=inner>B</select>",
	);
	expect(htmlParseInfo(tree)?.issues["misnested-option-in-select"]).toBe(1);
	expect(optionOwner(tree, find("#inner"))).toBeUndefined();
	expect(selectOptions(tree, find("select")).map((node) => node.id)).toEqual([
		find("#outer"),
	]);
});

it.each(["optgroup", "hr"])(
	"reports blocked %s recovery inside an option descendant",
	(tag) => {
		const { tree } = parse(`<select><option><div>A<${tag}></select>`);
		expect(htmlParseInfo(tree)?.issues[`misnested-${tag}-in-select`]).toBe(1);
	},
);

it.each(["div", "span", "button"])(
	"keeps options under a %s wrapper in the native collection",
	(tag) => {
		const { tree, find } = parse(
			`<select><${tag}><option value=chosen>A</option></${tag}></select>`,
		);
		expect(selectOptions(tree, find("select")).map((node) => node.id)).toEqual([
			find("option"),
		]);
		expect(controlValue(tree, find("select"))).toBe("chosen");
	},
);

it.each(["datalist", "option", "hr", "optgroup"])(
	"excludes invalid %s ancestor chains from collection and selectedness",
	(tag) => {
		const tree = new DocumentTree("https://example.test/");
		trees.push(tree);
		const select = tree.createElement("select");
		const wrapper = tree.createElement(tag);
		const option = tree.createElement("option", {
			value: "excluded",
			selected: "",
		});
		tree.append(tree.root, select);
		tree.append(select, wrapper);
		if (tag === "optgroup") {
			const nested = tree.createElement("optgroup");
			tree.append(wrapper, nested);
			tree.append(nested, option);
		} else tree.append(wrapper, option);
		const valid = tree.createElement("option", {
			value: "valid",
			selected: "",
		});
		tree.append(select, valid);
		expect(optionOwner(tree, option)).toBeUndefined();
		expect(tree.get(option).control.selected).toBe(true);
		expect(selectedOptions(tree, select).map((node) => node.id)).toEqual([
			valid,
		]);
		expect(controlValue(tree, select)).toBe("valid");
	},
);

it("permits one optgroup through wrappers but not two", () => {
	const { tree, find } = parse(
		"<select><optgroup><div><option id=valid value=one>A</option><optgroup><option id=excluded value=two selected>B</option></optgroup></div></optgroup></select>",
	);
	expect(optionOwner(tree, find("#valid"))).toBe(find("select"));
	expect(optionOwner(tree, find("#excluded"))).toBeUndefined();
	expect(controlValue(tree, find("select"))).toBe("one");
});

it("rejects selecting an excluded option through the native selection API", () => {
	const { tree, find } = parse(
		"<select><datalist><option id=excluded>X</option></datalist><option>Y</option></select>",
	);
	expect(() =>
		tree.setSelectSelection(find("select"), [find("#excluded")]),
	).toThrow("Invalid select selection");
	expect(controlValue(tree, find("select"))).toBe("Y");
});

it("recomputes excluded option ownership when cloning a select subtree", () => {
	const { tree, find } = parse(
		"<select><datalist><option selected>X</option></datalist><div><option selected>Y</option></div></select>",
	);
	const clone = tree.clone(find("select"), true);
	expect(selectOptions(tree, clone)).toHaveLength(1);
	expect(controlValue(tree, clone)).toBe("Y");
});

it("does not merge implied optgroup starts across a virtual select context", () => {
	const { tree, fragment } = parseHtmlFragment(
		"<optgroup><option>A<optgroup><option>B",
		"https://example.test/",
		{ tagName: "select" },
	);
	trees.push(tree);
	expect(serializeHtml(tree, fragment)).toBe(
		"<optgroup><option>A</option><optgroup><option>B</option></optgroup></optgroup>",
	);
});

it("updates ownership and selection when options move into and out of excluded subtrees", () => {
	const { tree, find } = parse(
		"<select><div id=wrapper><option id=first value=one>A</option></div><option id=second value=two>B</option><datalist></datalist></select>",
	);
	const select = find("select");
	expect(controlValue(tree, select)).toBe("one");
	tree.append(find("datalist"), find("#wrapper"));
	expect(optionOwner(tree, find("#first"))).toBeUndefined();
	expect(controlValue(tree, select)).toBe("two");
	tree.append(select, find("#wrapper"));
	expect(optionOwner(tree, find("#first"))).toBe(select);
	expect(controlValue(tree, select)).toBe("one");
	expect(selectedOptions(tree, select)).toHaveLength(1);
});

it("keeps the nearest inner select even inside an excluded outer subtree", () => {
	const { tree, find } = parse(
		"<select id=outer><datalist><table><tr><td><select id=inner><option>A</select></td></tr></table></datalist></select>",
	);
	expect(optionOwner(tree, find("option"))).toBe(find("#inner"));
	expect(selectOptions(tree, find("#outer"))).toEqual([]);
});

it("prepares form data from valid rich options without submitting excluded selections", () => {
	const { tree, find } = parse(
		"<form><select name=choice><datalist><option value=excluded selected>hidden</option></datalist><div><option value=valid selected><span>Visible</span></option></div></select></form>",
	);
	const request = prepareFormSubmission(
		tree,
		tree.reference(find("form")),
	).request;
	expect(new URL(request.url).searchParams.getAll("choice")).toEqual(["valid"]);
});

it("shares option exclusions through native host collections and indexes", () => {
	const { tree, find } = parse(
		"<select><datalist><option id=excluded>X</option></datalist><div><option id=valid>Y</option></div></select>",
	);
	const createHostObject = (definition: ScriptHostObjectDefinition) => {
		const host = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(host, name, descriptor);
		Object.assign(host, definition.methods);
		if (definition.indexed)
			Object.defineProperty(host, "length", { get: definition.indexed.length });
		return host;
	};
	const dom = new ScriptDom(tree, { createHostObject });
	const select = dom.node(find("select")) as {
		length: number;
		value: string;
		options: { length: number };
	};
	expect(select.length).toBe(1);
	expect(select.options.length).toBe(1);
	expect(select.value).toBe("Y");
	expect((dom.node(find("#excluded")) as { index: number }).index).toBe(0);
});

it("uses current parsing when replacing select innerHTML", () => {
	const { tree, find } = parse("<select></select>");
	setInnerHtml(
		tree,
		find("select"),
		"<button>label</button><option><span>Rich</span></option><input>",
	);
	expect(find("select > button")).toBeGreaterThan(0);
	expect(new DocumentQueries(tree).querySelector("select > input")).toBeNull();
	expect(controlValue(tree, find("select"))).toBe("Rich");
});

it("ignores select start tags in a select fragment without closing its virtual root", () => {
	const { tree, fragment } = parseHtmlFragment(
		"<div><select><option>A</option></div><input>",
		"https://example.test/",
		{ tagName: "select" },
	);
	trees.push(tree);
	expect(serializeHtml(tree, fragment)).toBe("<div><option>A</option></div>");
});

it("keeps template content ownership separate from rich select options", () => {
	const { tree, find } = parse(
		"<select><template><div><option>inert</option></div></template><div><option>live</option></div></select>",
	);
	expect(selectOptions(tree, find("select"))).toHaveLength(1);
	const content = tree.templateContent(find("template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<div><option>inert</option></div>",
	);
	expect(controlValue(tree, find("select"))).toBe("live");
});

it("keeps parser writes and raw text inside select without a legacy mode switch", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><select><script>write</script></select>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write(
					"<div><option><span>Written</span></option></div><textarea>raw</textarea>",
				);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelector("select > div > option > span")).not.toBeNull();
	expect(queries.querySelector("select > textarea")).not.toBeNull();
});

it("bounds newly retained select descendants with the existing node quota", () => {
	let candidate: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument(
			`<select>${"<div></div>".repeat(20)}`,
			"https://example.test/",
			{
				limits: { maxNodes: 8 },
				initializeDocument(owner) {
					candidate = owner;
				},
			},
		),
	).toThrow("node limit");
	expect(candidate?.nodeCount).toBe(0);
});
