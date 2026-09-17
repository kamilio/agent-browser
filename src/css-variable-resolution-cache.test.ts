import { expect, it } from "vitest";
import type { CssDeclaration } from "./css-parser.js";
import { CustomPropertyResolutionCache } from "./css-variable-resolution-cache.js";
import { cssVariableLimits, resolveCustomProperties } from "./css-variables.js";

function declaration(property: `--${string}`, value: string): CssDeclaration {
	return { property, value, important: false };
}

it("reuses results for the same parent and declaration identity sequence", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>([["--theme", "red"]]);
	const alias = declaration("--alias", "var(--theme)");
	const result = cache.resolve([alias], parent);
	expect(result.get("--alias")).toBe("red");
	expect(result).not.toBe(parent);
	expect(cache.resolve([alias], parent)).toBe(result);
});

it("distinguishes parent identities even when their contents match", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>([["--theme", "red"]]);
	const otherParent = new Map(parent);
	const blueParent = new Map<string, string | null>([["--theme", "blue"]]);
	const declarations = [declaration("--alias", "var(--theme)")];
	const result = cache.resolve(declarations, parent);
	const other = cache.resolve(declarations, otherParent);
	expect(other).toEqual(result);
	expect(other).not.toBe(result);
	expect(cache.resolve(declarations, otherParent)).toBe(other);
	expect(cache.resolve(declarations, blueParent).get("--alias")).toBe("blue");
	expect(cache.resolve(declarations, parent)).toBe(result);
});

it("distinguishes declaration identities even when their contents match", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>();
	const original = declaration("--theme", "red");
	const copy = { ...original };
	const result = cache.resolve([original], parent);
	const other = cache.resolve([copy], parent);
	expect(other).toEqual(result);
	expect(other).not.toBe(result);
	expect(cache.resolve([copy], parent)).toBe(other);
	expect(cache.resolve([original], parent)).toBe(result);
});

it("preserves declaration ordering, repeated identities and prefix lengths", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>();
	const red = declaration("--theme", "red");
	const blue = declaration("--theme", "blue");
	const forward = cache.resolve([red, blue], parent);
	const reverse = cache.resolve([blue, red], parent);
	const prefix = cache.resolve([red], parent);
	const repeated = cache.resolve([red, red], parent);
	expect(forward.get("--theme")).toBe("blue");
	expect(reverse.get("--theme")).toBe("red");
	expect(prefix).toEqual(repeated);
	expect(prefix).not.toBe(repeated);
	expect(prefix).not.toBe(reverse);
	expect(cache.resolve([red, blue], parent)).toBe(forward);
	expect(cache.resolve([blue, red], parent)).toBe(reverse);
	expect(cache.resolve([red], parent)).toBe(prefix);
	expect(cache.resolve([red, red], parent)).toBe(repeated);
});

it("returns the parent directly for empty declarations without charging", () => {
	const cache = new CustomPropertyResolutionCache(() => {
		throw new Error("unexpected work");
	});
	const parent = new Map<string, string | null>([["--invalid", null]]);
	expect(cache.resolve([], parent)).toBe(parent);
});

it.each([
	["initial", null],
	["inherit", "red"],
	["unset", "red"],
	["revert", "red"],
	["revert-layer", "red"],
	["var(--missing)", null],
	["var(--invalid)", null],
	["var(--missing, blue)", "blue"],
	["var(--invalid, var(--inherited))", "green"],
	["var(--empty, blue)", ""],
	["var(--missing,)", ""],
	["var(--theme, blue)", null],
	["var(--missing", null],
	["", ""],
] as const)(
	"delegates variable value %s to the resolver",
	(source, expected) => {
		const cache = new CustomPropertyResolutionCache(() => {});
		const parent = new Map<string, string | null>([
			["--theme", "red"],
			["--inherited", "green"],
			["--invalid", null],
			["--empty", ""],
		]);
		const declarations = [declaration("--theme", source)];
		const expectedMap = resolveCustomProperties(
			new Map([["--theme", source]]),
			parent,
			() => {},
		);
		const result = cache.resolve(declarations, parent);
		expect(result).toEqual(expectedMap);
		expect(result.get("--theme")).toBe(expected);
		if (expectedMap === parent) expect(result).toBe(parent);
		expect(cache.resolve(declarations, parent)).toBe(result);
	},
);

it("preserves cyclic invalidation and fallbacks that depend on cycles", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>([["--inherited", "green"]]);
	const declarations = [
		declaration("--first", "var(--second, red)"),
		declaration("--second", "var(--first, blue)"),
		declaration("--fallback", "var(--first, var(--inherited))"),
	];
	const expected = resolveCustomProperties(
		new Map(declarations.map(({ property, value }) => [property, value])),
		parent,
		() => {},
	);
	const result = cache.resolve(declarations, parent);
	expect(result).toEqual(expected);
	expect(result.get("--first")).toBeNull();
	expect(result.get("--second")).toBeNull();
	expect(result.get("--fallback")).toBe("green");
	expect(cache.resolve(declarations, parent)).toBe(result);
});

it("does not mutate inputs or previously returned maps", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>([["--theme", "red"]]);
	const alias = Object.freeze(declaration("--alias", "var(--theme)"));
	const declarations = Object.freeze([alias]);
	const before = [...parent];
	const result = cache.resolve(declarations, parent);
	const resolvedBefore = [...result];
	cache.resolve([alias, declaration("--theme", "blue")], parent);
	expect([...parent]).toEqual(before);
	expect([...result]).toEqual(resolvedBefore);
	expect(alias).toEqual(declaration("--alias", "var(--theme)"));
	expect(declarations).toEqual([alias]);
	expect(cache.resolve(declarations, parent)).toBe(result);
});

it("bounds trie nodes and resolves uncached entries after saturation", () => {
	let work = 0;
	const cache = new CustomPropertyResolutionCache((amount) => {
		work += amount;
	});
	const parent = new Map<string, string | null>();
	const theme = declaration("--theme", "red");
	const declarations = Array.from(
		{ length: cssVariableLimits.maxRetainedBindings - 1 },
		() => theme,
	);
	const retained = cache.resolve(declarations, parent);
	expect(retained.get("--theme")).toBe("red");
	expect(cache.resolve(declarations, parent)).toBe(retained);
	const overflow = [theme, declaration("--alias", "var(--theme)")];
	const first = cache.resolve(overflow, parent);
	work = 0;
	const second = cache.resolve(overflow, parent);
	const uncachedWork = work;
	let resolverWork = 0;
	const expected = resolveCustomProperties(
		new Map(overflow.map(({ property, value }) => [property, value])),
		parent,
		(amount) => {
			resolverWork += amount;
		},
	);
	expect(second).toEqual(expected);
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(uncachedWork).toBeGreaterThan(resolverWork);
	const otherParent = new Map(parent);
	const other = cache.resolve([theme], otherParent);
	expect(cache.resolve([theme], otherParent)).toEqual(other);
	expect(cache.resolve([theme], otherParent)).not.toBe(other);
	expect(cache.resolve(declarations, parent)).toBe(retained);
	const freshCache = new CustomPropertyResolutionCache(() => {});
	const fresh = freshCache.resolve(overflow, parent);
	expect(fresh).toEqual(first);
	expect(freshCache.resolve(overflow, parent)).toBe(fresh);
});

it("skips oversized paths without consuming capacity for smaller paths", () => {
	const cache = new CustomPropertyResolutionCache(() => {});
	const parent = new Map<string, string | null>();
	const theme = declaration("--theme", "red");
	const oversized = Array.from(
		{ length: cssVariableLimits.maxRetainedBindings },
		() => theme,
	);
	const first = cache.resolve(oversized, parent);
	expect(cache.resolve(oversized, parent)).toEqual(first);
	expect(cache.resolve(oversized, parent)).not.toBe(first);
	const retained = cache.resolve([theme], parent);
	expect(cache.resolve([theme], parent)).toBe(retained);
});

it("charges every cache hit traversal and forwards all resolver work on misses", () => {
	const charges: number[] = [];
	const cache = new CustomPropertyResolutionCache((amount) => {
		charges.push(amount);
	});
	const parent = new Map<string, string | null>([["--theme", "red"]]);
	const declarations = [declaration("--alias", "var(--theme)")];
	const resolverCharges: number[] = [];
	resolveCustomProperties(
		new Map([["--alias", "var(--theme)"]]),
		parent,
		(amount) => {
			resolverCharges.push(amount);
		},
	);
	const result = cache.resolve(declarations, parent);
	expect(charges).toEqual([1, 1, ...resolverCharges, 1, 1]);
	charges.length = 0;
	expect(cache.resolve(declarations, parent)).toBe(result);
	expect(charges).toEqual([1, 1]);
	const extended = [...declarations, declaration("--other", "blue")];
	const longer = cache.resolve(extended, parent);
	charges.length = 0;
	expect(cache.resolve(extended, parent)).toBe(longer);
	expect(charges).toEqual([1, 1, 1]);
});

it("propagates work errors on cached traversals without losing the result", () => {
	const failure = new Error("work exhausted");
	let remaining = Number.POSITIVE_INFINITY;
	const cache = new CustomPropertyResolutionCache(() => {
		if (--remaining < 0) throw failure;
	});
	const parent = new Map<string, string | null>();
	const declarations = [declaration("--theme", "red")];
	const result = cache.resolve(declarations, parent);
	remaining = 0;
	expect(() => cache.resolve(declarations, parent)).toThrow(failure);
	remaining = 1;
	expect(() => cache.resolve(declarations, parent)).toThrow(failure);
	remaining = Number.POSITIVE_INFINITY;
	expect(cache.resolve(declarations, parent)).toBe(result);
});

it.each(["resolution", "insertion"] as const)(
	"does not cache exceptions during %s",
	(phase) => {
		const failure = new Error("work exhausted");
		const parent = new Map<string, string | null>();
		const declarations = [declaration("--theme", "red")];
		let resolverCalls = 0;
		resolveCustomProperties(new Map([["--theme", "red"]]), parent, () => {
			resolverCalls++;
		});
		let calls = 0;
		const failAt = phase === "resolution" ? 3 : resolverCalls + 4;
		let fail = true;
		const cache = new CustomPropertyResolutionCache(() => {
			calls++;
			if (fail && calls === failAt) throw failure;
		});
		expect(() => cache.resolve(declarations, parent)).toThrow(failure);
		fail = false;
		calls = 0;
		const result = cache.resolve(declarations, parent);
		expect(calls).toBeGreaterThan(resolverCalls);
		expect(result.get("--theme")).toBe("red");
		expect(cache.resolve(declarations, parent)).toBe(result);
	},
);

it("does not cache resolver resource-limit exceptions", () => {
	const charges: number[] = [];
	const cache = new CustomPropertyResolutionCache((amount) => {
		charges.push(amount);
	});
	const parent = new Map<string, string | null>();
	const declarations = [
		declaration("--theme", "x".repeat(cssVariableLimits.maxValueCodeUnits + 1)),
	];
	expect(() => cache.resolve(declarations, parent)).toThrow(
		"CSS variable resource limit exceeded",
	);
	const firstCharges = [...charges];
	charges.length = 0;
	expect(() => cache.resolve(declarations, parent)).toThrow(
		"CSS variable resource limit exceeded",
	);
	expect(charges).toEqual(firstCharges);
});

it("isolates result identities and work between cache instances", () => {
	let firstWork = 0;
	let secondWork = 0;
	const firstCache = new CustomPropertyResolutionCache((amount) => {
		firstWork += amount;
	});
	const secondCache = new CustomPropertyResolutionCache((amount) => {
		secondWork += amount;
	});
	const parent = new Map<string, string | null>();
	const declarations = [declaration("--theme", "red")];
	const first = firstCache.resolve(declarations, parent);
	const before = firstWork;
	expect(secondWork).toBe(0);
	const second = secondCache.resolve(declarations, parent);
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(firstWork).toBe(before);
	expect(secondWork).toBe(before);
	expect(firstCache.resolve(declarations, parent)).toBe(first);
	expect(secondCache.resolve(declarations, parent)).toBe(second);
});
