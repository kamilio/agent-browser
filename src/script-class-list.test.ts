import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { type ClassListLimits, ScriptClassLists } from "./script-class-list.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Tokens {
	readonly length: number;
	readonly [index: number]: string | undefined;
	value: string;
	item(...args: unknown[]): string | null;
	contains(...args: unknown[]): boolean;
	add(...args: unknown[]): void;
	remove(...args: unknown[]): void;
	toggle(...args: unknown[]): boolean;
	replace(...args: unknown[]): boolean;
	supports(...args: unknown[]): boolean;
	toString(): string;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		const indexed = definition.indexed;
		if (!indexed) return target;
		Object.defineProperty(target, "length", { get: indexed.length });
		return new Proxy(target, {
			get(object, key) {
				if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
					return Number(key) < indexed.length()
						? indexed.get(Number(key))
						: undefined;
				return Reflect.get(object, key);
			},
		});
	},
};
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	raw?: string,
	limits: Partial<ClassListLimits> = {},
	documentLimit = 2_000_000,
) {
	const tree = new DocumentTree("https://example.com/", {
		maxTextCodeUnits: documentLimit,
	});
	trees.push(tree);
	const element = tree.createElement(
		"div",
		raw === undefined ? {} : { class: raw },
	);
	tree.append(tree.root, element);
	const lists = new ScriptClassLists(tree, factory, limits);
	const list = lists.get(element) as Tokens;
	return { tree, element, lists, list };
}

it("preserves one live identity, raw value, unique token order and missing indexed values", () => {
	const { list, lists, element } = fixture(" a\ta b\nC\r\f ");
	expect(lists.get(element)).toBe(list);
	expect(list.value).toBe(" a\ta b\nC\r\f ");
	expect(list.toString()).toBe(list.value);
	expect(list.length).toBe(3);
	expect([list[0], list[1], list[2], list[3]]).toEqual([
		"a",
		"b",
		"C",
		undefined,
	]);
	expect(list.item(3)).toBeNull();
	expect(list.contains("a")).toBe(true);
	expect(list.contains("c")).toBe(false);
});

it("updates saved lists after native class attribute changes and removal", () => {
	const { tree, element, list } = fixture("old");
	expect(list.length).toBe(1);
	tree.setAttribute(element, "class", "new new other");
	expect([list[0], list[1], list.length]).toEqual(["new", "other", 2]);
	tree.removeAttribute(element, "class");
	expect(list.length).toBe(0);
	expect(list.value).toBe("");
});

it("deduplicates additions and normalizes attribute serialization", () => {
	const { tree, element, list } = fixture(" a  a\tb ");
	expect(list.add("b", "c", "c")).toBeUndefined();
	expect(tree.get(element).attributes.class).toBe("a b c");
	list.remove("a", "missing");
	expect(list.value).toBe("b c");
});

it("normalizes zero-argument add/remove only when an attribute exists", () => {
	const { tree, element, list } = fixture();
	list.add();
	list.remove();
	expect(Object.hasOwn(tree.get(element).attributes, "class")).toBe(false);
	list.value = " a a  ";
	list.add();
	expect(list.value).toBe("a");
	list.value = " b b ";
	list.remove();
	expect(list.value).toBe("b");
});

it.each(["", "two words", "a\tb", "a\nb", "a\rb", "a\fb"])(
	"validates all mutating tokens atomically for %j",
	(invalid) => {
		const { list } = fixture(" original  original ");
		for (const call of [
			() => list.add("valid", invalid),
			() => list.remove("original", invalid),
			() => list.toggle(invalid),
			() => list.replace("original", invalid),
			() => list.replace(invalid, "valid"),
		]) {
			expect(call).toThrow();
			expect(list.value).toBe(" original  original ");
		}
		expect(list.contains(invalid)).toBe(false);
	},
);

it("keeps non-ASCII spaces and vertical tabs inside class tokens", () => {
	const { list } = fixture();
	list.add("a\u00a0b", "a\vb");
	expect(list.length).toBe(2);
	expect(list.contains("a\u00a0b")).toBe(true);
	expect(list.contains("a\vb")).toBe(true);
});

it("toggle handles omitted/undefined force, forced no-ops and primitive truthiness", () => {
	const { list } = fixture(" a  a ");
	expect(list.toggle("a", true)).toBe(true);
	expect(list.value).toBe(" a  a ");
	expect(list.toggle("absent", false)).toBe(false);
	expect(list.value).toBe(" a  a ");
	expect(list.toggle("a", undefined)).toBe(false);
	expect(list.toggle("a", undefined)).toBe(true);
	expect(list.toggle("a", null)).toBe(false);
	expect(list.toggle("a", "false")).toBe(true);
	expect(list.toggle("a")).toBe(false);
});

it.each([
	["a b c", "a", "c", "c b"],
	["a b c", "c", "a", "a b"],
	["a b c", "b", "d", "a d c"],
	[" a a b ", "a", "a", "a b"],
])(
	"replace preserves ordered-set position for %s",
	(raw, token, replacement, expected) => {
		const { list } = fixture(raw);
		expect(list.replace(token, replacement)).toBe(true);
		expect(list.value).toBe(expected);
	},
);

it("missing replacements do not normalize or create an attribute", () => {
	const { list } = fixture(" a  a ");
	expect(list.replace("missing", "other")).toBe(false);
	expect(list.value).toBe(" a  a ");
	expect(() => list.replace("missing", "")).toThrow();
});

it("value assignment retains whitespace and classList assignment forwards to value", () => {
	const { tree, element } = fixture();
	const dom = new ScriptDom(tree, factory);
	const node = dom.node(element) as { className: string; classList: Tokens };
	const saved = node.classList;
	Reflect.set(node, "classList", " a a  b ");
	expect(node.classList).toBe(saved);
	expect(saved.value).toBe(" a a  b ");
	expect(saved.length).toBe(2);
	node.className = "external";
	expect(saved[0]).toBe("external");
	Reflect.set(saved, "value", null);
	expect(node.className).toBe("null");
	dom.close();
	expect(() => saved.length).toThrow("closed");
});

it.each([
	[undefined, "a"],
	[null, "a"],
	[Number.NaN, "a"],
	[Number.POSITIVE_INFINITY, "a"],
	[4294967296, "a"],
	[-1, null],
	[1.9, "b"],
	["1", "b"],
])("converts item index %s", (index, expected) => {
	expect(fixture("a b").list.item(index)).toBe(expected);
});

it("requires positional arguments and does not run guest conversion hooks", () => {
	const { list } = fixture("original");
	for (const call of [
		() => list.item(),
		() => list.contains(),
		() => list.toggle(),
		() => list.replace("original"),
		() => list.supports(),
	])
		expect(call).toThrow("arguments");
	const convert = vi.fn(() => "coerced");
	const value = { toString: convert, valueOf: convert };
	for (const call of [
		() => list.add(value),
		() => list.remove(value),
		() => list.contains(value),
		() => list.item(value),
		() => {
			Reflect.set(list, "value", value);
		},
	])
		expect(call).toThrow("conversion");
	expect(convert).not.toHaveBeenCalled();
	expect(list.value).toBe("original");
	expect(list.toggle("forced", value)).toBe(true);
	expect(convert).not.toHaveBeenCalled();
});

it("supports throws because class names have no fixed supported vocabulary", () => {
	expect(() => fixture("anything").list.supports("anything")).toThrow(
		TypeError,
	);
});

it("keeps saved class lists live on detached nodes and revokes them on close", () => {
	const { tree, element, list, lists } = fixture("a");
	tree.remove(element);
	list.add("detached");
	expect(tree.get(element).attributes.class).toBe("a detached");
	tree.close();
	expect(() => list.contains("a")).toThrow("closed");
	expect(lists.metrics()).toMatchObject({
		lists: 0,
		cachedCodeUnits: 0,
		closed: true,
	});
});

it("bounds tokens, strings, arguments and list identity count without partial mutations", () => {
	const { tree, list, lists } = fixture("a b", {
		maxTokens: 2,
		maxCodeUnits: 8,
		maxArguments: 2,
		maxLists: 1,
	});
	expect(() => list.add("c")).toThrow("token limit");
	expect(() => {
		list.value = "123456789";
	}).toThrow("string limit");
	expect(() => list.add("a", "b", "c")).toThrow("argument limit");
	expect(() => lists.get(tree.createElement("span"))).toThrow("count limit");
	expect(list.value).toBe("a b");
});

it("checks aggregate cache capacity before mutating an attribute", () => {
	const { tree, element, list, lists } = fixture("a", {
		maxCachedCodeUnits: 40,
	});
	const other = tree.createElement("span", { class: "b" });
	const next = lists.get(other) as Tokens;
	expect(list.length + next.length).toBe(2);
	expect(() => {
		list.value = "abcd";
	}).toThrow("cache limit");
	expect(tree.get(element).attributes.class).toBe("a");
	expect(lists.metrics().cachedCodeUnits).toBe(36);
	tree.removeAttribute(element, "class");
	expect(list.length).toBe(0);
	next.value = "abcd";
	expect(next.value).toBe("abcd");
});

it("does not invalidate cached tokens for unrelated document mutations", () => {
	const { tree, list, lists } = fixture("a b");
	expect(list.length).toBe(2);
	const refreshes = lists.metrics().refreshes;
	tree.append(tree.root, tree.createElement("span"));
	expect(list.contains("b")).toBe(true);
	expect(lists.metrics().refreshes).toBe(refreshes);
});

it("keeps cached values unchanged when the underlying document rejects a write", () => {
	const { tree, element, list, lists } = fixture("a", {}, 10);
	expect(list.length).toBe(1);
	const before = lists.metrics().cachedCodeUnits;
	expect(() => {
		list.value = "123456";
	}).toThrow("limit");
	expect(tree.get(element).attributes.class).toBe("a");
	expect(list[0]).toBe("a");
	expect(lists.metrics().cachedCodeUnits).toBe(before);
});

it("rejects oversized external token sets without returning stale entries and permits recovery", () => {
	const { tree, element, list } = fixture("a", { maxTokens: 2 });
	expect(list[0]).toBe("a");
	tree.setAttribute(element, "class", "b c d");
	expect(() => list.length).toThrow("token limit");
	expect(list.value).toBe("b c d");
	list.value = "recovered";
	expect(list[0]).toBe("recovered");
});

it("rejects invalid limits and non-element owners", () => {
	const { tree, lists } = fixture();
	expect(() => lists.get(tree.root)).toThrow("element");
	expect(
		() => new ScriptClassLists(tree, factory, { maxTokens: 4097 }),
	).toThrow("limits");
	expect(
		() =>
			new ScriptClassLists(
				tree,
				factory,
				Object.fromEntries([["__proto__", 1]]),
			),
	).toThrow("limits");
});
