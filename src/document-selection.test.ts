import { afterEach, expect, it } from "vitest";
import { controlValue, optionSelected, selectedOptions } from "./controls.js";
import { DocumentSelection } from "./document-selection.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture() {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	const select = tree.createElement("select");
	tree.append(form, select);
	const add = (
		value: string,
		attributes: Record<string, string> = {},
		parent = select,
	) => {
		const option = tree.createElement("option", { value, ...attributes });
		tree.append(parent, option);
		return option;
	};
	const first = add("one");
	const second = add("two");
	return {
		tree,
		form,
		select,
		first,
		second,
		add,
		value: () => controlValue(tree, select),
	};
}

it("materializes fallback selectedness in the native node without dirtying its default", () => {
	const { tree, first, second, value } = fixture();
	expect(tree.get(first).control.selected).toBe(true);
	tree.setAttribute(second, "selected", "");
	expect(value()).toBe("two");
	tree.setAttribute(first, "selected", "");
	expect(value()).toBe("one");
});

it("value selection dirties only the chosen option, leaving peer defaults reactive", () => {
	const { tree, select, first, second, value } = fixture();
	tree.setSelectSelection(select, [second]);
	tree.setAttribute(first, "selected", "");
	expect(value()).toBe("one");
	tree.setAttribute(second, "selected", "");
	expect(value()).toBe("one");
});

it("selecting an option automatically deselects peers without making those peers dirty", () => {
	const { tree, first, second, value } = fixture();
	tree.setOptionSelected(second, true);
	tree.setAttribute(first, "selected", "");
	expect(value()).toBe("one");
	expect(tree.get(second).control.selected).toBe(false);
});

it("a dirty option ignores default changes until reset", () => {
	const { tree, select, second, value } = fixture();
	tree.setAttribute(select, "size", "3");
	tree.setOptionSelected(second, false);
	tree.setAttribute(second, "selected", "");
	expect(optionSelected(tree, second)).toBe(false);
	tree.clearControl(second, ["selected"]);
	expect(value()).toBe("two");
	tree.removeAttribute(second, "selected");
	expect(optionSelected(tree, second)).toBe(false);
});

it("clearing select selection persists across reads and unrelated attributes", () => {
	const { tree, select, value } = fixture();
	tree.setSelectSelection(select, []);
	expect(value()).toBe("");
	tree.setAttribute(select, "class", "changed");
	tree.invalidatePresentation();
	expect(value()).toBe("");
});

it("inserting an unselected option requests selection repair after an explicit clear", () => {
	const { tree, select, add, value } = fixture();
	tree.setSelectSelection(select, []);
	add("three");
	expect(value()).toBe("one");
});

it("removing the selected option repairs to the first eligible option", () => {
	const { tree, first, second, value } = fixture();
	tree.remove(first);
	expect(value()).toBe("two");
	expect(tree.get(second).control.selected).toBe(true);
	expect(tree.get(first).control.selected).toBe(true);
});

it("moving a selected option repairs its previous owner and deselects its new peers", () => {
	const { tree, select, first, second, add, value } = fixture();
	const other = tree.createElement("select");
	tree.append(tree.root, other);
	const original = add("other", {}, other);
	tree.append(other, first);
	expect(value()).toBe("two");
	expect(controlValue(tree, other)).toBe("one");
	expect(optionSelected(tree, original)).toBe(false);
	tree.insert(select, first, second);
	expect(value()).toBe("one");
	expect(controlValue(tree, other)).toBe("other");
});

it("inserting a selected option before an existing selected option makes the inserted option win", () => {
	const { tree, select, first, value } = fixture();
	const incoming = tree.createElement("option", {
		selected: "",
		value: "incoming",
	});
	tree.insert(select, incoming, first);
	expect(value()).toBe("incoming");
	expect(optionSelected(tree, first)).toBe(false);
});

it("fragment insertion repairs selection in insertion order", () => {
	const { tree, select, add, value } = fixture();
	const fragment = tree.createFragment();
	add("three", { selected: "" }, fragment);
	add("four", { selected: "" }, fragment);
	tree.append(select, fragment);
	expect(value()).toBe("four");
	expect(selectedOptions(tree, select)).toHaveLength(1);
});

it("moving a selected optgroup repairs both owners and respects disabled fallback groups", () => {
	const { tree, select, first, second, add, value } = fixture();
	const group = tree.createElement("optgroup", { disabled: "" });
	tree.insert(select, group, first);
	add("disabled", {}, group);
	tree.setOptionSelected(second, true);
	tree.append(group, second);
	const other = tree.createElement("select");
	tree.append(tree.root, other);
	tree.append(other, group);
	expect(value()).toBe("one");
	expect(controlValue(tree, other)).toBe("two");
	tree.remove(second);
	expect(controlValue(tree, other)).toBe("");
});

it("multiple-to-single normalization persists when multiple is restored", () => {
	const { tree, select, first, second } = fixture();
	tree.setAttribute(select, "multiple", "");
	tree.setOptionSelected(second, true);
	expect(selectedOptions(tree, select)).toHaveLength(2);
	tree.removeAttribute(select, "multiple");
	expect(selectedOptions(tree, select).map((option) => option.id)).toEqual([
		second,
	]);
	tree.setAttribute(select, "multiple", "");
	expect(optionSelected(tree, first)).toBe(false);
	expect(selectedOptions(tree, select)).toHaveLength(1);
});

it("listbox size changes preserve selection and returning to dropdown repairs an empty list", () => {
	const { tree, select, first, value } = fixture();
	tree.setAttribute(select, "size", "3");
	expect(value()).toBe("one");
	tree.setOptionSelected(first, false);
	expect(value()).toBe("");
	tree.removeAttribute(select, "size");
	expect(value()).toBe("one");
});

it("attribute-node writes and removals participate in default-selected synchronization", () => {
	const { tree, second, value } = fixture();
	const attribute = tree.createAttribute("selected");
	tree.setAttributeNode(second, attribute);
	expect(value()).toBe("two");
	tree.removeAttributeNode(second, attribute);
	expect(value()).toBe("one");
	tree.setAttributeNode(second, attribute);
	tree.setAttributeValue(attribute, "yes");
	expect(value()).toBe("two");
});

it("cloned and copied options preserve both current selection and dirtiness independently", () => {
	const { tree, second } = fixture();
	tree.setOptionSelected(second, false);
	tree.setAttribute(second, "selected", "");
	const clone = tree.clone(second);
	tree.removeAttribute(clone, "selected");
	tree.setAttribute(clone, "selected", "");
	expect(optionSelected(tree, clone)).toBe(false);
	const destination = new DocumentTree("https://other.example/");
	documents.push(destination);
	const copy = destination.copyFrom(tree, second);
	destination.removeAttribute(copy, "selected");
	destination.setAttribute(copy, "selected", "");
	expect(optionSelected(destination, copy)).toBe(false);
	destination.clearControl(copy, ["selected"]);
	expect(optionSelected(destination, copy)).toBe(true);
	expect(optionSelected(tree, second)).toBe(false);
});

it("moving an entire select preserves its intentionally empty selection", () => {
	const { tree, select, value } = fixture();
	tree.setSelectSelection(select, []);
	const target = tree.createElement("div");
	tree.append(tree.root, target);
	tree.append(target, select);
	expect(value()).toBe("");
	const copy = tree.clone(select, true);
	tree.append(target, copy);
	expect(controlValue(tree, copy)).toBe("");
});

it("replacement imports register new option owners and detach old selection", () => {
	const { tree, select, first, value } = fixture();
	const source = new DocumentTree("https://source.example/");
	documents.push(source);
	const fragment = source.createFragment();
	const replacement = source.createElement("option", { value: "replacement" });
	source.append(fragment, replacement);
	tree.replaceChildrenFrom(select, source, fragment);
	expect(value()).toBe("replacement");
	expect(tree.get(first).parent).toBe(null);
});

it("native form reset clears dirtiness and restores defaults without input/change events", async () => {
	const { tree, form, select, first, second, value } = fixture();
	const interactions = new DocumentInteractions(tree);
	const seen: string[] = [];
	for (const name of ["reset", "input", "change"])
		interactions.events.addEventListener(form, name, () => {
			seen.push(name);
		});
	tree.setAttribute(second, "selected", "");
	tree.setSelectSelection(select, [first], true);
	await interactions.forms.resetAsync(tree.reference(form));
	expect(value()).toBe("two");
	expect(seen).toEqual(["reset"]);
	tree.setAttribute(first, "selected", "");
	expect(value()).toBe("one");
});

it("failed structural and selection validation leaves current selection unchanged", () => {
	const { tree, select, first, second, value } = fixture();
	expect(() => tree.insert(first, select)).toThrow(/cycles/);
	expect(() => tree.setSelectSelection(select, [first, second])).toThrow(
		/at most one/,
	);
	expect(value()).toBe("one");
	expect(selectedOptions(tree, select)).toHaveLength(1);
});

it("parsed defaults choose the last selected attribute while keeping earlier defaults reactive", () => {
	const tree = parseHtmlDocument(
		'<select><option selected value="one"></option><option selected value="two"></option></select>',
		"https://example.com/",
	);
	documents.push(tree);
	const select = [...tree.walk()].find(({ node }) => node.tagName === "select")
		?.node.id;
	if (select === undefined) throw new Error("Missing select");
	const options = [...tree.walk(select)]
		.filter(({ node }) => node.tagName === "option")
		.map(({ node }) => node.id);
	expect(controlValue(tree, select)).toBe("two");
	tree.setAttribute(options[0], "selected", "yes");
	expect(controlValue(tree, select)).toBe("one");
});

it("disabled attribute updates refresh fallback eligibility without changing an existing selection", () => {
	const { tree, first, second, value } = fixture();
	tree.setAttribute(first, "disabled", "");
	expect(value()).toBe("one");
	tree.setOptionSelected(first, false);
	expect(value()).toBe("two");
	tree.removeAttribute(first, "disabled");
	tree.setOptionSelected(second, false);
	expect(value()).toBe("one");
});

it("appending a large all-disabled option list does not repeatedly scan its growing prefix", () => {
	const nodes = new Map<
		number,
		{
			id: number;
			kind: "element";
			tagName: string;
			attributes: Record<string, string>;
			data: string;
			parent: number | null;
			children: number[];
			control: { selected?: boolean };
		}
	>();
	const select = {
		id: 0,
		kind: "element" as const,
		tagName: "select",
		attributes: {},
		data: "",
		parent: null,
		children: [] as number[],
		control: {},
	};
	nodes.set(0, select);
	let reads = 0;
	const selection = new DocumentSelection(
		(id) => {
			reads++;
			const node = nodes.get(id);
			if (!node) throw new Error("Unknown fixture node");
			return node;
		},
		() => {},
	);
	for (let index = 1; index <= 5000; index++) {
		nodes.set(index, {
			id: index,
			kind: "element",
			tagName: "option",
			attributes: { disabled: "" },
			data: "",
			parent: 0,
			children: [],
			control: {},
		});
		select.children.push(index);
		selection.initialize(index);
		selection.moved(index);
	}
	expect(reads).toBeLessThan(30_000);
	expect([...nodes.values()].some((node) => node.control.selected)).toBe(false);
	selection.close();
});
