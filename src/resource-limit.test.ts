import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ResourceLimitKind,
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";

function failure(action: () => unknown) {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe("resource-limit");
		return resourceLimitDiagnostic(error);
	}
	throw new Error("Expected resource failure");
}

it("keeps immutable numeric metadata separate from error properties", () => {
	const error = resourceLimitError("reader.text", 2, 3, "PRIVATE_MESSAGE");
	expect(error.code).toBe("resource-limit");
	expect(error.message).toBe("PRIVATE_MESSAGE");
	const diagnostic = resourceLimitDiagnostic(error);
	expect(diagnostic).toEqual({
		kind: "reader.text",
		unit: "code-units",
		limit: 2,
		observed: 3,
	});
	expect(Object.isFrozen(diagnostic)).toBe(true);
	expect(Reflect.set(diagnostic as object, "observed", 99)).toBe(false);
	expect(resourceLimitDiagnostic(error)).toBe(diagnostic);
	expect(Object.keys(error)).not.toContain("resourceLimit");
	expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE_MESSAGE");
	error.message = "CHANGED";
	expect(resourceLimitDiagnostic(error)).toBe(diagnostic);
});

it.each([
	[-1, 3],
	[1.5, 3],
	[Number.NaN, 3],
	[Number.POSITIVE_INFINITY, 3],
	[2, 2],
	[2, 1],
	[2, -3],
	[2, 3.5],
	[2, Number.NaN],
	[2, Number.POSITIVE_INFINITY],
	[2, Number.MAX_SAFE_INTEGER + 1],
	[Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2],
])(
	"does not invent a measurement for limit %s / observed %s",
	(limit, observed) => {
		const error = resourceLimitError("html.tokens", limit, observed, "Budget");
		expect(error.code).toBe("resource-limit");
		expect(error.message).toBe("Budget");
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it.each(["constructor", "__proto__", "private.kind", null, {}])(
	"rejects non-enumerated runtime kind %s without losing the resource error",
	(kind) => {
		const error = resourceLimitError(kind as ResourceLimitKind, 1, 2, "Budget");
		expect(error.code).toBe("resource-limit");
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it.each([undefined, null, false, 1, "error", Symbol("error"), 1n])(
	"ignores primitive lookup %s",
	(value) => expect(resourceLimitDiagnostic(value)).toBeUndefined(),
);

it("does not inspect fake errors, getters, prototypes or revoked proxies", () => {
	const tagged = resourceLimitError("html.tokens", 1, 2, "Budget");
	const fake = Object.create(tagged);
	Object.defineProperty(fake, "resourceLimit", {
		get() {
			throw new Error("Getter must not run");
		},
	});
	const proxy = Proxy.revocable(tagged, {
		get() {
			throw new Error("Proxy must not run");
		},
		getPrototypeOf() {
			throw new Error("Prototype must not run");
		},
	});
	expect(resourceLimitDiagnostic(fake)).toBeUndefined();
	expect(resourceLimitDiagnostic(proxy.proxy)).toBeUndefined();
	proxy.revoke();
	expect(resourceLimitDiagnostic(proxy.proxy)).toBeUndefined();
	expect(resourceLimitDiagnostic(() => tagged)).toBeUndefined();
	expect(
		resourceLimitDiagnostic(new AgentBrowserError("resource-limit", "Budget")),
	).toBeUndefined();
});

it.each(["reader.encoded", "text.encoded", "html.encoded"] as const)(
	"identifies %s counts as bytes",
	(kind) => {
		expect(
			resourceLimitDiagnostic(resourceLimitError(kind, 0, 1, "Budget")),
		).toEqual({ kind, unit: "bytes", limit: 0, observed: 1 });
	},
);

it("accepts exact safe integer measurements without rounding", () => {
	expect(
		resourceLimitDiagnostic(
			resourceLimitError(
				"document.nodes",
				Number.MAX_SAFE_INTEGER - 1,
				Number.MAX_SAFE_INTEGER,
				"Budget",
			),
		),
	).toEqual({
		kind: "document.nodes",
		unit: "nodes",
		limit: Number.MAX_SAFE_INTEGER - 1,
		observed: Number.MAX_SAFE_INTEGER,
	});
});

it.each(["node", "attribute"])(
	"reports attempted %s allocation without mutating usage",
	(kind) => {
		const tree = new DocumentTree("about:blank", { maxNodes: 2 });
		try {
			tree.createText("");
			const before = tree.resourceUsage();
			expect(
				failure(() =>
					kind === "node" ? tree.createText("") : tree.createAttribute("id"),
				),
			).toEqual({
				kind: "document.nodes",
				unit: "nodes",
				limit: 2,
				observed: 3,
			});
			expect(tree.resourceUsage()).toEqual(before);
		} finally {
			tree.close();
		}
	},
);

it("reports UTF-16 document text growth and preserves the old value", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 3 });
	try {
		const text = tree.createText("😀x");
		expect(failure(() => tree.setData(text, "😀xy"))).toEqual({
			kind: "document.text",
			unit: "code-units",
			limit: 3,
			observed: 4,
		});
		expect(tree.get(text).data).toBe("😀x");
		tree.setData(text, "x");
		tree.setData(text, "😀x");
	} finally {
		tree.close();
	}
});

it("reports insertion depth without attaching the rejected subtree", () => {
	const tree = new DocumentTree("about:blank", { maxDepth: 2 });
	try {
		const outer = tree.createElement("div");
		const inner = tree.createElement("div");
		const deep = tree.createElement("div");
		tree.append(tree.root, outer);
		tree.append(outer, inner);
		expect(failure(() => tree.append(inner, deep))).toEqual({
			kind: "document.depth",
			unit: "levels",
			limit: 2,
			observed: 3,
		});
		expect(tree.get(deep).parent).toBeNull();
	} finally {
		tree.close();
	}
});
