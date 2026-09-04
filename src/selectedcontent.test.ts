import { afterEach, expect, it } from "vitest";
import { controlValue, selectControlValues } from "./controls.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument, parseHtmlDocumentAsync } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source: string) {
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
	const html = (selector: string) => serializeHtml(tree, find(selector));
	return { tree, queries, find, html };
}

it("clones a parsed selected option's children into selectedcontent", () => {
	const { html } = fixture(
		"<select><button><selectedcontent></selectedcontent></button><option><b>Rich</b></option></select>",
	);
	expect(html("selectedcontent")).toBe("<b>Rich</b>");
});

it("replaces selectedcontent after native selection changes", () => {
	const { tree, find, html } = fixture(
		"<select><button><selectedcontent></selectedcontent></button><option value=a>A</option><option value=b><span>B</span></option></select>",
	);
	selectControlValues(tree, tree.reference(find("select")), ["b"]);
	expect(html("selectedcontent")).toBe("<span>B</span>");
});

it("updates the next primary selectedcontent when the first is removed", () => {
	const { tree, find, html } = fixture(
		"<select><button><selectedcontent id=first></selectedcontent><selectedcontent id=next></selectedcontent></button><option>Choice</option></select>",
	);
	tree.remove(find("#first"));
	expect(html("#next")).toBe("Choice");
});

it.each([
	"</option></select>",
	"</select>",
	"",
	"<option>Next</select>",
	"<optgroup></optgroup></select>",
])("finishes selected option content at %j", (ending) => {
	const { html } = fixture(
		`<select><button><selectedcontent></selectedcontent></button><option><span>First</span>${ending}`,
	);
	expect(html("selectedcontent")).toBe("<span>First</span>");
});

it("copies nodes rather than the label or value attributes", () => {
	const { tree, find, html } = fixture(
		"<select><button><selectedcontent></selectedcontent></button><option label=Label value=Value>Text<!--note--><b data-x=y>Bold</b></option></select>",
	);
	expect(html("selectedcontent")).toBe('Text<!--note--><b data-x="y">Bold</b>');
	expect(controlValue(tree, find("select"))).toBe("Value");
	const source = tree.get(find("option")).children;
	const copies = tree.get(find("selectedcontent")).children;
	expect(copies).toHaveLength(source.length);
	expect(copies.some((id) => source.includes(id))).toBe(false);
});

it("replaces old copies without moving the original children", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option value=a><b>A</b></option><option value=b><i>B</i></option></select>",
	);
	const source = tree.get(find("option")).children[0];
	const previous = tree.get(find("selectedcontent")).children[0];
	selectControlValues(tree, tree.reference(find("select")), ["b"]);
	expect(html("selectedcontent")).toBe("<i>B</i>");
	expect(tree.get(previous).parent).toBeNull();
	expect(tree.get(source).parent).toBe(find("option"));
});

it("clears the primary when selection is explicitly empty", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>Choice</option></select>",
	);
	tree.setSelectSelection(find("select"), []);
	expect(html("selectedcontent")).toBe("");
});

it("clears the primary on an explicit empty selection after removing the last option", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>Choice</option></select>",
	);
	tree.remove(find("option"));
	expect(html("selectedcontent")).toBe("Choice");
	tree.setSelectSelection(find("select"), []);
	expect(html("selectedcontent")).toBe("");
});

it("updates from explicit select-selection transactions", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option id=a>A</option><option id=b>B</option></select>",
	);
	tree.setSelectSelection(find("select"), [find("#b")]);
	expect(html("selectedcontent")).toBe("B");
	tree.setSelectSelection(find("select"), [find("#a")]);
	expect(html("selectedcontent")).toBe("A");
});

it("does not copy every later text or attribute mutation of an option", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option><span>Original</span></option></select>",
	);
	tree.setTextContent(find("option > span"), "Changed");
	tree.setAttribute(find("option > span"), "title", "later");
	expect(html("selectedcontent")).toBe("<span>Original</span>");
	tree.setSelectSelection(find("select"), [find("option")]);
	expect(html("selectedcontent")).toBe('<span title="later">Changed</span>');
});

it("copies into the first descendant even outside a button", () => {
	const { html } = fixture(
		"<select><div><selectedcontent></selectedcontent></div><option>Choice</option></select>",
	);
	expect(html("selectedcontent")).toBe("Choice");
});

it("does not treat the selectedcontent disabled attribute as its internal flag", () => {
	const { html } = fixture(
		"<select><selectedcontent disabled></selectedcontent><option>Choice</option></select>",
	);
	expect(html("selectedcontent")).toBe("Choice");
});

it("does not update a multiple select's selectedcontent", () => {
	const { tree, find, html } = fixture(
		"<select multiple><selectedcontent>Authored</selectedcontent><option selected>Choice</option></select>",
	);
	tree.setSelectSelection(find("select"), [find("option")]);
	expect(html("selectedcontent")).toBe("Authored");
	tree.removeAttribute(find("select"), "multiple");
	expect(html("selectedcontent")).toBe("Authored");
	tree.setSelectSelection(find("select"), [find("option")]);
	expect(html("selectedcontent")).toBe("Choice");
});

it("updates a selectedcontent connected after the selected option", () => {
	const { tree, find, html } = fixture(
		"<select><option><b>Choice</b></option></select>",
	);
	const content = tree.createElement("selectedcontent");
	tree.append(find("select"), content);
	expect(html("selectedcontent")).toBe("<b>Choice</b>");
});

it("clears non-primary selectedcontent when connecting a populated subtree", () => {
	const { tree, find } = fixture("<select><option>Choice</option></select>");
	const wrapper = tree.createElement("div");
	const contents = [
		tree.createElement("selectedcontent"),
		tree.createElement("selectedcontent"),
	];
	for (const content of contents) {
		tree.append(content, tree.createText("Authored"));
		tree.append(wrapper, content);
	}
	tree.append(find("select"), wrapper);
	expect(serializeHtml(tree, contents[0])).toBe("Choice");
	expect(serializeHtml(tree, contents[1])).toBe("");
});

it("promotes the next primary when removing a containing button", () => {
	const { tree, find, html } = fixture(
		"<select><button><selectedcontent></selectedcontent></button><selectedcontent id=next></selectedcontent><option>Choice</option></select>",
	);
	tree.remove(find("button"));
	expect(html("#next")).toBe("Choice");
});

it("updates both selects when moving a selectedcontent between them", () => {
	const { tree, find, html } = fixture(
		"<select id=a><selectedcontent id=moving></selectedcontent><selectedcontent id=next></selectedcontent><option>A</option></select><select id=b><option>B</option></select>",
	);
	tree.append(find("#b"), find("#moving"));
	expect(html("#next")).toBe("A");
	expect(html("#moving")).toBe("B");
});

it("does not disable a detached valid subtree or clear its copied content", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>Choice</option></select>",
	);
	const select = find("select");
	const content = find("selectedcontent");
	expect(html("selectedcontent")).toBe("Choice");
	tree.remove(select);
	expect(serializeHtml(tree, content)).toBe("Choice");
	tree.setSelectSelection(select, []);
	expect(serializeHtml(tree, content)).toBe("");
});

it("disables selectedcontent inside an option without skipping it for a later primary", () => {
	const { html } = fixture(
		"<select><option><selectedcontent id=blocked>Authored</selectedcontent>Choice</option><selectedcontent id=later></selectedcontent></select>",
	);
	expect(html("#later")).toBe("");
	expect(html("#blocked")).toBe("Authored");
});

it("disables a prebuilt option's selectedcontent at connection without self-cloning", () => {
	const { tree, find } = fixture("<select></select>");
	const option = tree.createElement("option");
	const content = tree.createElement("selectedcontent");
	tree.append(content, tree.createText("Authored"));
	tree.append(option, content);
	tree.append(find("select"), option);
	expect(serializeHtml(tree, content)).toBe("Authored");
	const count = tree.nodeCount;
	tree.setSelectSelection(find("select"), [option]);
	expect(tree.nodeCount).toBe(count);
	expect(serializeHtml(tree, content)).toBe("Authored");
});

it("recomputes internal disabled state when reconnecting under a valid parent", () => {
	const { tree, find } = fixture(
		"<select><option><selectedcontent id=blocked></selectedcontent>Choice</option></select>",
	);
	const content = find("#blocked");
	tree.append(find("select"), content);
	expect(serializeHtml(tree, content)).toBe("Choice");
});

it("does not inherit disabled state from a select's own disabled attribute", () => {
	const { html } = fixture(
		"<select disabled><selectedcontent></selectedcontent><option>Choice</option></select>",
	);
	expect(html("selectedcontent")).toBe("Choice");
});

it("retains native template-content ownership when cloning rich children", () => {
	const { tree, find } = fixture(
		"<select><selectedcontent></selectedcontent><option><template><b>Inert</b></template><i>Visible</i></option></select>",
	);
	const source = tree.templateContent(find("option > template"));
	const copy = tree.templateContent(find("selectedcontent > template"));
	expect(copy.id).not.toBe(source.id);
	expect(serializeHtml(copy.tree, copy.id)).toBe("<b>Inert</b>");
});

it("updates before native input/change notifications but does not add a reset trigger", () => {
	const { tree, find, html } = fixture(
		"<form><select><selectedcontent></selectedcontent><option value=a>A</option><option value=b>B</option></select></form>",
	);
	const actions = new DocumentInteractions(tree);
	const observed: string[] = [];
	for (const type of ["input", "change"])
		actions.events.addEventListener(find("select"), type, () =>
			observed.push(html("selectedcontent")),
		);
	actions.select(tree.reference(find("select")), ["b"]);
	expect(observed).toEqual(["B", "B"]);
	actions.forms.reset(tree.reference(find("form")));
	expect(controlValue(tree, find("select"))).toBe("a");
	expect(html("selectedcontent")).toBe("B");
	tree.setSelectSelection(find("select"), [find("option")]);
	expect(html("selectedcontent")).toBe("A");
});

it("clones at option-pop boundaries rather than every parser text insertion", async () => {
	const observed: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><select><selectedcontent></selectedcontent><option><b>A</b><script>inside</script></option><script>after</script></select>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(owner) {
				const content = new DocumentQueries(owner).querySelector(
					"selectedcontent",
				);
				if (content === null) throw new Error("Missing selectedcontent");
				observed.push(serializeHtml(owner, content));
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(observed).toEqual(["", "<b>A</b><script>inside</script>"]);
});

it("does not reexecute cloned script elements in native parser hooks", async () => {
	let scripts = 0;
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><select><selectedcontent></selectedcontent><option><script>source</script></option></select>",
		"https://example.test/",
		{},
		{
			start() {},
			async script() {
				scripts++;
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toBe(1);
});

it("keeps replacement atomic when cloning runs out of native nodes", () => {
	const tree = new DocumentTree("https://example.test/", { maxNodes: 20 });
	trees.push(tree);
	const select = tree.createElement("select");
	const content = tree.createElement("selectedcontent");
	const option = tree.createElement("option");
	tree.append(option, tree.createText("Choice"));
	tree.append(tree.root, select);
	tree.append(select, content);
	tree.append(select, option);
	tree.setSelectSelection(select, [option]);
	while (tree.nodeCount < 19) tree.createText("filler");
	expect(() => tree.setSelectSelection(select, [option])).toThrow("node limit");
	expect(serializeHtml(tree, content)).toBe("Choice");
});

it("refreshes a reinserted selectedcontent even when its position is unchanged", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>Original</option></select>",
	);
	const content = find("selectedcontent");
	tree.setTextContent(find("option"), "Changed");
	tree.insert(find("select"), content, content);
	expect(html("selectedcontent")).toBe("Changed");
});

it("runs connected updates after a fragment's option insertion steps", () => {
	const { tree, find } = fixture("<select></select>");
	const fragment = tree.createFragment();
	const content = tree.createElement("selectedcontent");
	const option = tree.createElement("option");
	tree.append(option, tree.createText("Choice"));
	tree.append(fragment, content);
	tree.append(fragment, option);
	tree.append(find("select"), fragment);
	expect(serializeHtml(tree, content)).toBe("Choice");
});

it("replays a selection change requested during cloning", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option id=a>A</option><option id=b>B</option></select>",
	);
	let changed = false;
	tree.onChange((change) => {
		if (changed || change.kind !== "insert") return;
		const node = tree.get(change.target);
		if (
			node.kind !== "text" ||
			node.parent === null ||
			tree.get(node.parent).kind !== "fragment"
		)
			return;
		changed = true;
		tree.setSelectSelection(find("select"), [find("#b")]);
	});
	tree.setSelectSelection(find("select"), [find("#a")]);
	expect(changed).toBe(true);
	expect(html("selectedcontent")).toBe("B");
});

it("publishes one replacement record for the primary's children", () => {
	const { tree, find } = fixture(
		"<select><selectedcontent></selectedcontent><option id=a>A</option><option id=b><b>B</b><i>C</i></option></select>",
	);
	const content = find("selectedcontent");
	const old = [...tree.get(content).children];
	const records: { added: readonly number[]; removed: readonly number[] }[] =
		[];
	tree.onMutation((record) => {
		if (record.target === content && record.type === "childList")
			records.push({
				added: record.addedNodes ?? [],
				removed: record.removedNodes ?? [],
			});
	});
	tree.setSelectSelection(find("select"), [find("#b")]);
	expect(records).toEqual([
		{ added: [...tree.get(content).children], removed: old },
	]);
});

it("does not finalize an option at a document-write input boundary", async () => {
	let scripts = 0;
	const observed: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><select><selectedcontent></selectedcontent><script>write</script><script>observe</script></select>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(owner, _id, context) {
				if (++scripts === 1) context.write("<option><b>Written</b>");
				else {
					const content = new DocumentQueries(owner).querySelector(
						"selectedcontent",
					);
					if (content === null) throw new Error("Missing selectedcontent");
					observed.push(serializeHtml(owner, content));
				}
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(observed).toEqual([""]);
	const content = new DocumentQueries(tree).querySelector("selectedcontent");
	if (content === null) throw new Error("Missing selectedcontent");
	expect(serializeHtml(tree, content)).toBe(
		"<b>Written</b><script>observe</script>",
	);
});

it("does not update connected selectedcontent below two select ancestors", () => {
	const { tree, find } = fixture("<select></select>");
	const nested = tree.createElement("select");
	const content = tree.createElement("selectedcontent");
	tree.append(nested, content);
	tree.append(find("select"), nested);
	const option = tree.createElement("option");
	tree.append(option, tree.createText("Choice"));
	tree.append(nested, option);
	expect(serializeHtml(tree, content)).toBe("");
});

it("retains initially enabled behavior for a detached select", () => {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	const select = tree.createElement("select");
	const content = tree.createElement("selectedcontent");
	const option = tree.createElement("option");
	tree.append(option, tree.createText("Choice"));
	tree.append(select, content);
	tree.append(select, option);
	tree.setSelectSelection(select, [option]);
	expect(serializeHtml(tree, content)).toBe("Choice");
});

it("fails closed after the native owner closes", () => {
	const { tree, find } = fixture(
		"<select><selectedcontent></selectedcontent><option>Choice</option></select>",
	);
	const option = find("option");
	tree.close();
	expect(() => tree.setOptionSelected(option, true)).toThrow("closed");
	expect(() => tree.finishParserOption(option)).toThrow("closed");
});

it("does not refresh existing copies when an unrelated option is inserted", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>A</option></select>",
	);
	tree.setTextContent(find("option"), "Changed");
	tree.append(find("select"), tree.createElement("option"));
	expect(html("selectedcontent")).toBe("A");
});

it("does not clone merely because an option's selected attribute changes", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>A</option><option id=b>B</option></select>",
	);
	tree.setAttribute(find("#b"), "selected", "");
	expect(controlValue(tree, find("select"))).toBe("B");
	expect(html("selectedcontent")).toBe("A");
});

it("does not clone merely because an option selected setter asks for reset", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option>A</option><option id=b>B</option></select>",
	);
	tree.setOptionSelected(find("#b"), true);
	expect(controlValue(tree, find("select"))).toBe("B");
	expect(html("selectedcontent")).toBe("A");
});

it("updates through native host value/index setters without adding an option setter trigger", () => {
	const { tree, find, html } = fixture(
		"<select><selectedcontent></selectedcontent><option value=a>A</option><option id=b value=b>B</option></select>",
	);
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const host = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(host, name, property);
			Object.assign(host, definition.methods);
			return host;
		},
	});
	const select = dom.node(find("select")) as {
		value: string;
		selectedIndex: number;
	};
	select.value = "b";
	expect(html("selectedcontent")).toBe("B");
	select.selectedIndex = 0;
	expect(html("selectedcontent")).toBe("A");
	(dom.node(find("#b")) as { selected: boolean }).selected = true;
	expect(select.value).toBe("b");
	expect(html("selectedcontent")).toBe("A");
});

it("does not recursively refresh when cloned descendants themselves contain options", () => {
	const { tree, html } = fixture(
		"<select><selectedcontent></selectedcontent><option><div>A<option>B</option></div></option></select>",
	);
	expect(html("selectedcontent")).toBe("<div>A<option>B</option></div>");
	expect(tree.nodeCount).toBeLessThan(30);
});
