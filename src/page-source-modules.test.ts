import { expect, it, vi } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	type PageSourceImport,
	type PageSourceModule,
	type PageSourceModuleOptions,
	PageSourceModuleRegistry,
	pageSourceModuleLimits,
} from "./page-source-modules.js";

const entrySource = 'import { value } from "./dependency"; export { value };';
const dependencySource = "export const value = 42;";

function graph(): PageSourceModuleOptions {
	return {
		sources: [
			{ id: "entry", source: entrySource },
			{ id: "dependency", source: dependencySource },
		],
		imports: [
			{ referrer: "entry", specifier: "./dependency", id: "dependency" },
			{ referrer: "entry", specifier: "alias", id: "dependency" },
		],
	};
}

function registry(input: unknown): PageSourceModuleRegistry {
	return new PageSourceModuleRegistry(input as PageSourceModuleOptions);
}

function scope(options: PageSourceModuleOptions = graph()) {
	return registry(options).createScope(
		new AbortController().signal,
		pageSourceModuleLimits.sourceCodeUnits,
	);
}

function failure(action: () => unknown, code: ErrorCode = "invalid-input") {
	let error: unknown;
	try {
		action();
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
	return error as AgentBrowserError;
}

it("exports the fixed frozen graph and scope limits", () => {
	expect(pageSourceModuleLimits).toEqual({
		sources: 128,
		imports: 512,
		sourceCodeUnits: 262144,
		totalSourceCodeUnits: 1048576,
		identifierCodeUnits: 4096,
		resolutions: 1024,
	});
	expect(Object.isFrozen(pageSourceModuleLimits)).toBe(true);
});

it("admits exact entries and resolves only explicit aliases to frozen records", () => {
	const modules = scope();
	expect(modules.validateEntry(entrySource, "entry")).toBeUndefined();
	expect(modules.validateEntry(dependencySource, "dependency")).toBeUndefined();
	const dependency = modules.resolve("./dependency", "entry", {});
	expect(dependency).toEqual({ id: "dependency", source: dependencySource });
	expect(Object.isFrozen(dependency)).toBe(true);
	expect(modules.resolve("alias", "entry", {})).toBe(dependency);
	for (const [specifier, referrer] of [
		["dependency", "entry"],
		["./dependency", "dependency"],
		["./dependency", "unknown"],
		["entry", "entry"],
		["./dependency", "ENTRY"],
	]) {
		expect(modules.resolve(specifier, referrer, {})).toBeUndefined();
	}
});

it("does not normalize URL, filesystem, whitespace, or Unicode identities", () => {
	const options: PageSourceModuleOptions = {
		sources: [
			{ id: "https://example.invalid/entry", source: "" },
			{ id: "/dependency", source: "" },
		],
		imports: [
			{
				referrer: "https://example.invalid/entry",
				specifier: "./café",
				id: "/dependency",
			},
		],
	};
	const modules = scope(options);
	expect(
		modules.resolve("./café", "https://example.invalid/entry", {}),
	).toEqual(options.sources[1]);
	for (const specifier of [
		"https://example.invalid/café",
		"./cafe\u0301",
		"./caf%C3%A9",
		"./nested/../café",
		" ./café",
		"/dependency",
	]) {
		expect(
			modules.resolve(specifier, "https://example.invalid/entry", {}),
		).toBeUndefined();
	}
});

it("rejects absent, unknown, and mismatched entry identities without leaking input", () => {
	const modules = scope();
	for (const [source, filename] of [
		[entrySource, undefined],
		[entrySource, ""],
		[entrySource, "unknown-private-id"],
		[dependencySource, "entry"],
		[`${entrySource}\n`, "entry"],
		["private-source-content", "entry"],
	] as const) {
		const error = failure(() => modules.validateEntry(source, filename));
		expect(error.message).not.toContain("private-source-content");
		expect(error.message).not.toContain("unknown-private-id");
		expect(error.message).not.toContain(entrySource);
	}
	const unicode = scope({ sources: [{ id: "é", source: "é\r\n" }] });
	failure(() => unicode.validateEntry("é\n", "é"));
	failure(() => unicode.validateEntry("e\u0301\r\n", "é"));
	failure(() => unicode.validateEntry("é\r\n", "e\u0301"));
});

it("accepts empty sources, self imports, and cyclic graph declarations", () => {
	const modules = scope({
		sources: [
			{ id: "first", source: "" },
			{ id: "second", source: "" },
		],
		imports: [
			{ referrer: "first", specifier: "next", id: "second" },
			{ referrer: "second", specifier: "next", id: "first" },
			{ referrer: "first", specifier: "self", id: "first" },
		],
	});
	modules.validateEntry("", "first");
	expect(modules.resolve("next", "first", {})).toEqual({
		id: "second",
		source: "",
	});
	expect(modules.resolve("next", "second", {})).toEqual({
		id: "first",
		source: "",
	});
	expect(modules.resolve("self", "first", {})?.id).toBe("first");
});

it("keeps prototype-like and delimiter-containing mapping keys distinct", () => {
	const sources = [
		"__proto__",
		"constructor",
		"toString",
		"left\0middle",
		"left",
		"left\nmiddle",
	].map((id) => ({ id, source: id }));
	const imports = [
		{ referrer: "__proto__", specifier: "constructor", id: "constructor" },
		{ referrer: "constructor", specifier: "__proto__", id: "__proto__" },
		{ referrer: "toString", specifier: "toString", id: "toString" },
		{ referrer: "left\0middle", specifier: "right", id: "__proto__" },
		{ referrer: "left", specifier: "middle\0right", id: "constructor" },
		{ referrer: "left\nmiddle", specifier: "right", id: "__proto__" },
		{ referrer: "left", specifier: "middle\nright", id: "constructor" },
	];
	const modules = scope({ sources, imports });
	for (const mapping of imports) {
		expect(modules.resolve(mapping.specifier, mapping.referrer, {})?.id).toBe(
			mapping.id,
		);
	}
	expect(modules.resolve("hasOwnProperty", "__proto__", {})).toBeUndefined();
});

it("snapshots arrays and records without freezing or retaining caller records", () => {
	const sources = [
		{ id: "entry", source: entrySource },
		{ id: "dependency", source: dependencySource },
	];
	const imports = [
		{ referrer: "entry", specifier: "./dependency", id: "dependency" },
	];
	const options = { sources, imports };
	const modules = registry(options);
	const first = modules.createScope(new AbortController().signal, 100);
	const snapshot = first.resolve("./dependency", "entry", {});
	expect(snapshot).not.toBe(sources[1]);
	expect(Object.isFrozen(sources[1])).toBe(false);
	sources[0].source = "changed";
	sources[1].id = "changed";
	sources[1].source = "changed";
	imports[0].referrer = "changed";
	imports[0].specifier = "changed";
	imports[0].id = "changed";
	sources.length = 0;
	imports.length = 0;
	options.sources = [{ id: "replacement", source: "" }];
	options.imports = [];
	const second = modules.createScope(new AbortController().signal, 100);
	for (const active of [first, second]) {
		active.validateEntry(entrySource, "entry");
		expect(active.resolve("./dependency", "entry", {})).toBe(snapshot);
		expect(active.resolve("changed", "changed", {})).toBeUndefined();
	}
	expect(Reflect.set(snapshot as object, "source", "changed")).toBe(false);
	expect(snapshot).toEqual({ id: "dependency", source: dependencySource });
});

it.each(["./dependency", "denied"])(
	"charges repeated %s resolutions through the exact per-scope limit",
	(specifier) => {
		const modules = registry(graph());
		const controller = new AbortController();
		const first = modules.createScope(controller.signal, 100);
		const second = modules.createScope(controller.signal, 100);
		for (let index = 0; index < pageSourceModuleLimits.resolutions; index++) {
			const result = first.resolve(specifier, "entry", {});
			expect(result?.id).toBe(
				specifier === "denied" ? undefined : "dependency",
			);
		}
		failure(() => first.resolve(specifier, "entry", {}), "resource-limit");
		failure(() => first.resolve("", "", {}), "resource-limit");
		first.validateEntry(entrySource, "entry");
		for (let index = 0; index < pageSourceModuleLimits.resolutions; index++) {
			expect(second.resolve("./dependency", "entry", {})?.id).toBe(
				"dependency",
			);
		}
		failure(
			() => second.resolve("./dependency", "entry", {}),
			"resource-limit",
		);
	},
);

it("does not charge entry admission or failed entry validation as resolutions", () => {
	const modules = scope();
	for (let index = 0; index <= pageSourceModuleLimits.resolutions; index++) {
		modules.validateEntry(entrySource, "entry");
		failure(() => modules.validateEntry("mismatch", "entry"));
	}
	expect(modules.resolve("./dependency", "entry", {})?.id).toBe("dependency");
});

it("charges malformed resolver arguments, contexts, and signals", () => {
	const requests: (() => void)[] = [];
	const modules = scope();
	requests.push(
		() => failure(() => modules.resolve("", "entry", {})),
		() =>
			failure(() => modules.resolve("alias", null as unknown as string, {})),
		() => failure(() => modules.resolve("alias", "entry", null as never)),
		() =>
			failure(() => modules.resolve("alias", "entry", { signal: {} as never })),
		() =>
			failure(
				() => modules.resolve("x".repeat(4097), "entry", {}),
				"resource-limit",
			),
	);
	for (let index = 0; index < pageSourceModuleLimits.resolutions; index++) {
		requests[index % requests.length]();
	}
	failure(() => modules.resolve("alias", "entry", {}), "resource-limit");
});

it("checks owning and request cancellation without exposing abort reasons", () => {
	const modules = registry(graph());
	const owner = new AbortController();
	const request = new AbortController();
	const active = modules.createScope(owner.signal, 100);
	request.abort("private-abort-reason");
	for (let index = 0; index <= pageSourceModuleLimits.resolutions; index++) {
		const error = failure(
			() => active.resolve("alias", "entry", { signal: request.signal }),
			"aborted",
		);
		expect(error.message).not.toContain("private-abort-reason");
	}
	expect(active.resolve("alias", "entry", {})?.id).toBe("dependency");
	owner.abort();
	failure(() => active.validateEntry(entrySource, "entry"), "aborted");
	failure(() => active.resolve("alias", "entry", {}), "aborted");
	failure(() => modules.createScope(owner.signal, 100), "aborted");
	expect(
		modules
			.createScope(new AbortController().signal, 100)
			.resolve("alias", "entry", {})?.id,
	).toBe("dependency");
});

it("prioritizes cancellation over exhausted budgets and malformed request strings", () => {
	const owner = new AbortController();
	const active = registry(graph()).createScope(owner.signal, 100);
	for (let index = 0; index < pageSourceModuleLimits.resolutions; index++) {
		active.resolve("denied", "entry", {});
	}
	const request = new AbortController();
	request.abort();
	failure(() => active.resolve("", "", { signal: request.signal }), "aborted");
	owner.abort();
	failure(() => active.resolve("", "", {}), "aborted");
	failure(() => active.validateEntry("", undefined), "aborted");
});

it("rejects malformed scope and request signals without reading caller accessors", () => {
	const getter = vi.fn(() => {
		throw new Error("unexpected signal getter");
	});
	const fakeSignal = Object.defineProperty({}, "aborted", { get: getter });
	const modules = registry(graph());
	const active = modules.createScope(new AbortController().signal, 100);
	for (const signal of [undefined, null, false, "signal", {}, fakeSignal]) {
		failure(() => modules.createScope(signal as AbortSignal, 100));
		if (signal !== undefined) {
			failure(() =>
				active.resolve("alias", "entry", { signal: signal as AbortSignal }),
			);
		}
	}
	expect(active.resolve("alias", "entry", { signal: undefined })?.id).toBe(
		"dependency",
	);
	expect(getter).not.toHaveBeenCalled();
});

it("enforces the page source maximum for every declared module at scope admission", () => {
	const modules = registry({
		sources: [
			{ id: "entry", source: "" },
			{ id: "unused", source: "😀" },
		],
	});
	const signal = new AbortController().signal;
	failure(() => modules.createScope(signal, 1), "resource-limit");
	const active = modules.createScope(signal, 2);
	active.validateEntry("😀", "unused");
	failure(() => active.validateEntry("😀 ", "unused"), "resource-limit");
	for (const maximum of [
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	]) {
		failure(() => modules.createScope(signal, maximum));
	}
	for (const maximum of [undefined, null, "2", 2n, {}]) {
		failure(() => modules.createScope(signal, maximum as number));
	}
	expect(modules.createScope(signal, Number.MAX_SAFE_INTEGER)).toBeDefined();
});

it("accepts source count equality and rejects overflow before inspecting elements", () => {
	const sources = Array.from(
		{ length: pageSourceModuleLimits.sources },
		(_, index) => ({
			id: `module-${index}`,
			source: "",
		}),
	);
	expect(registry({ sources })).toBeInstanceOf(PageSourceModuleRegistry);
	sources.push({ id: "overflow", source: "" });
	const getter = vi.fn(() => {
		throw new Error("unexpected getter");
	});
	Object.defineProperty(sources, "0", { get: getter });
	failure(() => registry({ sources }), "resource-limit");
	expect(getter).not.toHaveBeenCalled();
});

it("accepts import count equality and bounds both arrays before reading entries", () => {
	const sources = [{ id: "entry", source: "" }];
	const imports = Array.from(
		{ length: pageSourceModuleLimits.imports },
		(_, index) => ({
			referrer: "entry",
			specifier: `alias-${index}`,
			id: "entry",
		}),
	);
	expect(registry({ sources, imports })).toBeInstanceOf(
		PageSourceModuleRegistry,
	);
	imports.push({ referrer: "entry", specifier: "overflow", id: "entry" });
	const getter = vi.fn(() => {
		throw new Error("unexpected getter");
	});
	Object.defineProperty(sources, "0", { get: getter });
	Object.defineProperty(imports, "0", { get: getter });
	failure(() => registry({ sources, imports }), "resource-limit");
	expect(getter).not.toHaveBeenCalled();
});

it("bounds individual and aggregate source lengths in UTF-16 code units", () => {
	const source = "😀".repeat(pageSourceModuleLimits.sourceCodeUnits / 2);
	const sources = Array.from({ length: 4 }, (_, index) => ({
		id: `module-${index}`,
		source,
	}));
	expect(source.length * sources.length).toBe(
		pageSourceModuleLimits.totalSourceCodeUnits,
	);
	expect(registry({ sources })).toBeInstanceOf(PageSourceModuleRegistry);
	failure(
		() => registry({ sources: [{ id: "entry", source: `${source} ` }] }),
		"resource-limit",
	);
	expect(
		registry({ sources: [...sources, { id: "empty", source: "" }] }),
	).toBeDefined();
	failure(
		() => registry({ sources: [...sources, { id: "overflow", source: " " }] }),
		"resource-limit",
	);
});

it("bounds source IDs, import fields, entry filenames, and request identifiers", () => {
	const id = "😀".repeat(pageSourceModuleLimits.identifierCodeUnits / 2);
	const options = {
		sources: [{ id, source: "" }],
		imports: [{ referrer: id, specifier: id, id }],
	};
	const modules = scope(options);
	modules.validateEntry("", id);
	expect(modules.resolve(id, id, {})?.id).toBe(id);
	const oversized = `${id}x`;
	failure(
		() => registry({ sources: [{ id: oversized, source: "" }] }),
		"resource-limit",
	);
	for (const field of ["id", "referrer", "specifier"]) {
		failure(
			() =>
				registry({
					...options,
					imports: [{ ...options.imports[0], [field]: oversized }],
				}),
			"resource-limit",
		);
	}
	failure(() => modules.validateEntry("", oversized), "resource-limit");
	failure(() => modules.resolve(oversized, id, {}), "resource-limit");
	failure(() => modules.resolve(id, oversized, {}), "resource-limit");
});

it("rejects malformed options, arrays, and records without iterating arbitrary inputs", () => {
	const iterator = vi.fn(() => {
		throw new Error("unexpected iterator");
	});
	for (const options of [
		undefined,
		null,
		true,
		"options",
		[],
		{},
		{ sources: [] },
	]) {
		failure(() => registry(options));
	}
	for (const value of [
		null,
		{},
		"sources",
		new Set(),
		{ [Symbol.iterator]: iterator },
	]) {
		failure(() => registry({ sources: value }));
		failure(() => registry({ sources: graph().sources, imports: value }));
	}
	for (const value of [undefined, null, 1, "record", [], {}]) {
		failure(() => registry({ sources: [value] }));
		failure(() => registry({ sources: graph().sources, imports: [value] }));
	}
	expect(iterator).not.toHaveBeenCalled();
	expect(
		registry({ sources: graph().sources, imports: undefined }),
	).toBeDefined();
});

it("rejects nonprimitive string fields without coercion", () => {
	const coerce = vi.fn(() => {
		throw new Error("unexpected coercion");
	});
	const malformed = [
		undefined,
		null,
		false,
		1,
		Symbol("id"),
		{},
		{ toString: coerce },
		Object("entry"),
	];
	const modules = scope();
	for (const value of malformed) {
		failure(() => registry({ sources: [{ id: value, source: "" }] }));
		failure(() => registry({ sources: [{ id: "entry", source: value }] }));
		for (const field of ["id", "referrer", "specifier"]) {
			failure(() =>
				registry({
					sources: graph().sources,
					imports: [
						{
							referrer: "entry",
							specifier: "alias",
							id: "dependency",
							[field]: value,
						},
					],
				}),
			);
		}
		failure(() => modules.validateEntry(value as string, "entry"));
		failure(() => modules.validateEntry(entrySource, value as string));
		failure(() => modules.resolve(value as string, "entry", {}));
		failure(() => modules.resolve("alias", value as string, {}));
	}
	expect(coerce).not.toHaveBeenCalled();
	failure(() => registry({ sources: [{ id: "", source: "" }] }));
	for (const field of ["id", "referrer", "specifier"]) {
		failure(() =>
			registry({
				sources: graph().sources,
				imports: [
					{
						referrer: "entry",
						specifier: "alias",
						id: "dependency",
						[field]: "",
					},
				],
			}),
		);
	}
});

it("rejects duplicate declarations and unknown graph references", () => {
	for (const source of [entrySource, "different"]) {
		failure(() =>
			registry({ sources: [...graph().sources, { id: "entry", source }] }),
		);
	}
	for (const id of ["dependency", "entry"]) {
		failure(() =>
			registry({
				sources: graph().sources,
				imports: [
					...(graph().imports ?? []),
					{ referrer: "entry", specifier: "alias", id },
				],
			}),
		);
	}
	for (const mapping of [
		{ referrer: "entry", specifier: "alias", id: "unknown" },
		{ referrer: "unknown", specifier: "alias", id: "entry" },
	]) {
		failure(() => registry({ sources: graph().sources, imports: [mapping] }));
	}
});

it("rejects getter-backed options, records, and array elements without invoking getters", () => {
	const getter = vi.fn(() => {
		throw new Error("unexpected getter");
	});
	for (const field of ["sources", "imports"]) {
		const options = { ...graph() };
		Object.defineProperty(options, field, { get: getter });
		failure(() => registry(options));
	}
	for (const field of ["id", "source"]) {
		const entry = { id: "entry", source: "" };
		Object.defineProperty(entry, field, { get: getter });
		failure(() => registry({ sources: [entry] }));
	}
	for (const field of ["referrer", "specifier", "id"]) {
		const entry = { referrer: "entry", specifier: "alias", id: "dependency" };
		Object.defineProperty(entry, field, { get: getter });
		failure(() => registry({ sources: graph().sources, imports: [entry] }));
	}
	const sources: PageSourceModule[] = new Array(1);
	Object.defineProperty(sources, "0", { get: getter });
	failure(() => registry({ sources }));
	const imports: PageSourceImport[] = new Array(1);
	Object.defineProperty(imports, "0", { get: getter });
	failure(() => registry({ sources: graph().sources, imports }));
	const context = Object.defineProperty({}, "signal", { get: getter });
	failure(() => scope().resolve("alias", "entry", context));
	expect(getter).not.toHaveBeenCalled();
});

it("rejects inherited required or optional fields and holes even with inherited elements", () => {
	const getter = vi.fn(() => {
		throw new Error("unexpected inherited getter");
	});
	failure(() => registry(Object.create(graph())));
	const inheritedImports = Object.create({ imports: [] });
	inheritedImports.sources = graph().sources;
	failure(() => registry(inheritedImports));
	for (const field of ["id", "source"]) {
		const entry = { id: "entry", source: "" };
		Reflect.deleteProperty(entry, field);
		Object.setPrototypeOf(
			entry,
			Object.defineProperty({}, field, { get: getter }),
		);
		failure(() => registry({ sources: [entry] }));
	}
	for (const field of ["referrer", "specifier", "id"]) {
		const entry = { referrer: "entry", specifier: "alias", id: "dependency" };
		Reflect.deleteProperty(entry, field);
		Object.setPrototypeOf(
			entry,
			Object.defineProperty({}, field, { get: getter }),
		);
		failure(() => registry({ sources: graph().sources, imports: [entry] }));
	}
	for (const inherited of [false, true]) {
		const sources = new Array(1);
		const imports = new Array(1);
		if (inherited) {
			const prototype = Object.defineProperty({}, "0", { get: getter });
			Object.setPrototypeOf(sources, prototype);
			Object.setPrototypeOf(imports, prototype);
		}
		failure(() => registry({ sources }));
		failure(() => registry({ sources: graph().sources, imports }));
	}
	failure(() =>
		scope().resolve("alias", "entry", Object.create({ signal: undefined })),
	);
	expect(getter).not.toHaveBeenCalled();
});

it("accepts null-prototype data records and ignores custom array iteration", () => {
	const iterator = vi.fn(() => {
		throw new Error("unexpected iterator");
	});
	const sources = [{ id: "entry", source: "" }];
	const imports = [{ referrer: "entry", specifier: "self", id: "entry" }];
	Object.setPrototypeOf(sources[0], null);
	Object.setPrototypeOf(imports[0], null);
	Object.defineProperty(sources, Symbol.iterator, { get: iterator });
	Object.defineProperty(imports, Symbol.iterator, { get: iterator });
	const options = Object.assign(Object.create(null), { sources, imports });
	expect(scope(options).resolve("self", "entry", {})?.id).toBe("entry");
	expect(iterator).not.toHaveBeenCalled();
});
