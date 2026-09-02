import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { ConsoleBuffer, PageConsole, readPageConsole } from "./page-console.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

it("records bounded console entries with ordered IDs and severity filtering", () => {
	const buffer = new ConsoleBuffer();
	buffer.write("debug", ["detail"]);
	buffer.write("log", ["hello", 42]);
	buffer.write("warning", ["careful"]);
	buffer.write("error", ["failed"]);
	expect(buffer.read().entries.map((entry) => entry.text)).toEqual([
		"hello 42",
		"careful",
		"failed",
	]);
	expect(buffer.read("warning").entries.map((entry) => entry.level)).toEqual([
		"warning",
		"error",
	]);
	expect(buffer.read("debug").entries.map((entry) => entry.sequence)).toEqual([
		1, 2, 3, 4,
	]);
	expect(() => buffer.read("bogus")).toThrow("level");
});

it("evicts oldest entries and reports bounded truncation rather than retaining values", () => {
	const buffer = new ConsoleBuffer({
		maxEntries: 2,
		maxCodeUnits: 32,
		maxEntryCodeUnits: 16,
	});
	buffer.write("log", ["first"]);
	buffer.write("log", ["second"]);
	buffer.write("log", ["x".repeat(1000)]);
	const result = buffer.read();
	expect(result.entries).toHaveLength(2);
	expect(result.dropped).toBe(1);
	expect(result.entries[1].text.length).toBeLessThanOrEqual(16);
	expect(result.entries[1].truncated).toBe(true);
	expect(result.codeUnits).toBeLessThanOrEqual(32);
	result.entries.splice(0);
	expect(buffer.read().entries).toHaveLength(2);
});

it("formats cycles and descriptors without invoking getters or toJSON", () => {
	let calls = 0;
	const value: Record<string, unknown> = {
		nested: [1, "value"],
		toJSON() {
			calls++;
		},
	};
	value.self = value;
	Object.defineProperty(value, "trap", {
		enumerable: true,
		get() {
			calls++;
			return "secret";
		},
	});
	const buffer = new ConsoleBuffer();
	buffer.write("log", [value, undefined, null, Number.NaN, 1n]);
	const text = buffer.read().entries[0].text;
	expect(text).toContain("[Circular]");
	expect(text).toContain("[Getter]");
	expect(text).toContain("undefined null NaN 1n");
	expect(calls).toBe(0);
	value.nested = "changed";
	expect(buffer.read().entries[0].text).toBe(text);
});

it("bounds argument count, traversal and depth", () => {
	const buffer = new ConsoleBuffer({ maxFormatNodes: 4, maxDepth: 2 });
	buffer.write("log", [
		{ nested: { more: { data: "not traversed" } } },
		new Array(1000).fill("x"),
	]);
	expect(buffer.read().entries[0].truncated).toBe(true);
	expect(buffer.read().entries[0].text).not.toContain("not traversed");
	buffer.write("log", new Array(1000).fill("arg"));
	expect(buffer.read().entries[1].truncated).toBe(true);
});

it("clears history without reusing sequence IDs and releases it on close", () => {
	const buffer = new ConsoleBuffer();
	buffer.write("log", ["before"]);
	buffer.clear();
	buffer.write("error", ["after"]);
	expect(buffer.read().entries[0].sequence).toBe(2);
	expect(buffer.read().cleared).toBe(1);
	buffer.close();
	expect(() => buffer.read()).toThrow("closed");
});

it("rejects invalid and excessive limits", () => {
	for (const options of [
		{ maxEntries: 0 },
		{ maxCodeUnits: Number.NaN },
		{ maxDepth: 1000 },
		{ maxEntryCodeUnits: 50, maxCodeUnits: 10 },
	])
		expect(() => new ConsoleBuffer(options)).toThrow("limit");
});

it("binds window console methods and document-lifetime retention", () => {
	const tree = new DocumentTree("https://example.com");
	let closed = false;
	let calls = 0;
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			return { ...definition.methods };
		},
	};
	const console = new PageConsole(tree, factory, {
		isClosed: () => closed,
		onCall: () => {
			calls++;
		},
	});
	const methods = console.object as Record<
		string,
		(...args: unknown[]) => unknown
	>;
	expect(methods.log("hello")).toBeUndefined();
	methods.info("info");
	methods.warn("warn");
	methods.assert(true, "ignored");
	methods.assert(false, "failure");
	expect(readPageConsole(tree).entries.map((entry) => entry.level)).toEqual([
		"log",
		"info",
		"warning",
		"error",
	]);
	expect(calls).toBe(5);
	closed = true;
	expect(() => methods.log("late")).toThrow("closed");
	expect(readPageConsole(tree).entries).toHaveLength(4);
	tree.close();
	expect(() => readPageConsole(tree)).toThrow("closed");
});

it("does not fabricate console activity before a page runtime starts", () => {
	const tree = new DocumentTree("https://example.com");
	expect(readPageConsole(tree)).toMatchObject({
		started: false,
		entries: [],
		document: tree.reference(tree.root),
		url: "https://example.com/",
	});
	tree.close();
});
