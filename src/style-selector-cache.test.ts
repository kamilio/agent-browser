import { expect, it } from "vitest";
import type { DocumentQueries, SelectorSpecificity } from "./selectors.js";
import {
	StyleSelectorCache,
	styleSelectorCacheLimits,
} from "./style-selector-cache.js";

type StyleSelectorMatches = ReturnType<
	DocumentQueries["matchingStyleSpecificities"]
>;

function matches(
	elementCount = 0,
	beforeCount = 0,
	afterCount = 0,
): StyleSelectorMatches {
	const map = (count: number, weight: SelectorSpecificity) => {
		const result = new Map<number, SelectorSpecificity>();
		for (let index = 0; index < count; index++) result.set(index, weight);
		return result;
	};
	return Object.freeze({
		elements: map(elementCount, Object.freeze([1, 0, 0])),
		before: map(beforeCount, Object.freeze([0, 2, 1])),
		after: map(afterCount, Object.freeze([0, 1, 2])),
	});
}

it("exports frozen retention limits", () => {
	expect(styleSelectorCacheLimits).toEqual({
		maxEntries: 1024,
		maxRetainedUnits: 32_768,
		maxSelectorCodeUnits: 65_536,
	});
	expect(Object.isFrozen(styleSelectorCacheLimits)).toBe(true);
});

it("retains successful results and all three target maps by identity", () => {
	const cache = new StyleSelectorCache(() => {});
	const result = matches(2, 3, 4);
	cache.set(".item, .item::before, .item::after", result);
	const retained = cache.get(".item, .item::before, .item::after");
	expect(retained).toBe(result);
	for (const target of ["elements", "before", "after"] as const)
		expect(retained?.[target]).toBe(result[target]);
	expect(retained?.elements.get(0)).toEqual([1, 0, 0]);
	expect(retained?.before.get(0)).toEqual([0, 2, 1]);
	expect(retained?.after.get(0)).toEqual([0, 1, 2]);
});

it("distinguishes retained empty successes from absent selectors", () => {
	const cache = new StyleSelectorCache(() => {});
	const empty = matches();
	expect(cache.get(".missing")).toBeUndefined();
	cache.set(".missing", empty);
	expect(cache.get(".missing")).toBe(empty);
	expect(cache.get(".other")).toBeUndefined();
});

it("keys results by exact selector string without normalization", () => {
	const cache = new StyleSelectorCache(() => {});
	const selectors = [".item", ".ITEM", " .item", ".item ", ".item::before", ""];
	const results = selectors.map(() => matches());
	for (const [index, selector] of selectors.entries())
		cache.set(selector, results[index]);
	for (const [index, selector] of selectors.entries())
		expect(cache.get(selector)).toBe(results[index]);
	expect(cache.get([".", "item"].join(""))).toBe(results[0]);
	expect(cache.get(".item:before")).toBeUndefined();
});

it("keeps cascade instances independent", () => {
	const first = new StyleSelectorCache(() => {});
	const second = new StyleSelectorCache(() => {});
	const original = matches(1);
	const replacement = matches(0, 1);
	first.set(".item", original);
	expect(second.get(".item")).toBeUndefined();
	second.set(".item", replacement);
	expect(first.get(".item")).toBe(original);
	expect(second.get(".item")).toBe(replacement);
});

it("charges every get by UTF-16 length plus one and every set once", () => {
	const charges: number[] = [];
	const cache = new StyleSelectorCache((work) => charges.push(work));
	const result = matches(2, 3, 4);
	cache.get(".missing");
	cache.set(".😀", result);
	cache.get(".😀");
	cache.set(".😀", matches());
	cache.set(
		"x".repeat(styleSelectorCacheLimits.maxSelectorCodeUnits + 1),
		result,
	);
	cache.get("");
	expect(charges).toEqual([9, 1, 4, 1, 1, 1]);
});

it("propagates get charge failures on both hits and misses without losing entries", () => {
	const failure = new Error("work limit");
	let fail = false;
	const charges: number[] = [];
	const cache = new StyleSelectorCache((work) => {
		charges.push(work);
		if (fail) throw failure;
	});
	const result = matches(1);
	cache.set(".item", result);
	fail = true;
	expect(() => cache.get(".item")).toThrow(failure);
	expect(() => cache.get(".missing")).toThrow(failure);
	fail = false;
	expect(cache.get(".item")).toBe(result);
	expect(cache.get(".missing")).toBeUndefined();
	expect(charges).toEqual([1, 6, 9, 6, 9]);
});

it("charges get before lookup", () => {
	const result = matches(1);
	let insert = false;
	const cache = new StyleSelectorCache(() => {
		if (!insert) return;
		insert = false;
		cache.set(".item", result);
	});
	insert = true;
	expect(cache.get(".item")).toBe(result);
});

it("does not retain entries or consume any capacity when set charging throws", () => {
	const failure = new Error("work limit");
	let fail = true;
	const cache = new StyleSelectorCache(() => {
		if (fail) throw failure;
	});
	const selector = "x".repeat(styleSelectorCacheLimits.maxSelectorCodeUnits);
	const result = matches(styleSelectorCacheLimits.maxRetainedUnits - 1);
	expect(() => cache.set(selector, result)).toThrow(failure);
	fail = false;
	expect(cache.get(selector)).toBeUndefined();
	cache.set(selector, result);
	expect(cache.get(selector)).toBe(result);
});

it("preserves full entry capacity after a failed insertion", () => {
	const failure = new Error("work limit");
	let fail = true;
	const cache = new StyleSelectorCache(() => {
		if (fail) throw failure;
	});
	const empty = matches();
	expect(() => cache.set(".failed", empty)).toThrow(failure);
	fail = false;
	for (let index = 0; index < styleSelectorCacheLimits.maxEntries; index++)
		cache.set(`.item${index}`, empty);
	expect(cache.get(".failed")).toBeUndefined();
	expect(cache.get(`.item${styleSelectorCacheLimits.maxEntries - 1}`)).toBe(
		empty,
	);
});

it("charges before duplicate and capacity checks even when charging throws", () => {
	const failure = new Error("work limit");
	let fail = false;
	const cache = new StyleSelectorCache(() => {
		if (fail) throw failure;
	});
	const result = matches(styleSelectorCacheLimits.maxRetainedUnits - 1);
	cache.set(".item", result);
	fail = true;
	expect(() => cache.set(".item", matches())).toThrow(failure);
	expect(() => cache.set(".other", matches())).toThrow(failure);
	fail = false;
	expect(cache.get(".item")).toBe(result);
	expect(cache.get(".other")).toBeUndefined();
});

it("bounds empty successes by entry count without eviction or duplicate counting", () => {
	const charges: number[] = [];
	const cache = new StyleSelectorCache((work) => charges.push(work));
	const empty = matches();
	for (let index = 0; index < styleSelectorCacheLimits.maxEntries; index++) {
		cache.set(`.item${index}`, empty);
		cache.set(`.item${index}`, matches(1));
	}
	charges.length = 0;
	cache.set(".overflow", matches());
	cache.set(".item0", matches(1));
	expect(charges).toEqual([1, 1]);
	expect(cache.get(".overflow")).toBeUndefined();
	for (let index = 0; index < styleSelectorCacheLimits.maxEntries; index++)
		expect(cache.get(`.item${index}`)).toBe(empty);
	const independent = new StyleSelectorCache(() => {});
	independent.set(".overflow", empty);
	expect(independent.get(".overflow")).toBe(empty);
});

it.each(["elements", "before", "after"] as const)(
	"bounds memberships in the %s map including entry overhead and empty results",
	(target) => {
		const cache = new StyleSelectorCache(() => {});
		const result = matches();
		const weight: SelectorSpecificity = Object.freeze([0, 1, 0]);
		for (
			let index = 0;
			index < styleSelectorCacheLimits.maxRetainedUnits - 2;
			index++
		)
			result[target].set(index, weight);
		const empty = matches();
		cache.set(".large", result);
		cache.set(".empty", empty);
		cache.set(".overflow", empty);
		expect(cache.get(".large")).toBe(result);
		expect(cache.get(".empty")).toBe(empty);
		expect(cache.get(".overflow")).toBeUndefined();
	},
);

it("counts memberships across all targets even when node IDs overlap", () => {
	const cache = new StyleSelectorCache(() => {});
	const memberships = styleSelectorCacheLimits.maxRetainedUnits - 1;
	const perTarget = Math.floor(memberships / 3);
	const result = matches(perTarget, perTarget, memberships - perTarget * 2);
	cache.set(".item, .item::before, .item::after", result);
	cache.set(".overflow", matches());
	expect(cache.get(".item, .item::before, .item::after")).toBe(result);
	expect(cache.get(".overflow")).toBeUndefined();
});

it("skips oversized results without consuming capacity for a subsequent valid entry", () => {
	const cache = new StyleSelectorCache(() => {});
	cache.set(".oversized", matches(styleSelectorCacheLimits.maxRetainedUnits));
	const small = matches(1, 1, 1);
	cache.set(".small", small);
	const remainder = matches(styleSelectorCacheLimits.maxRetainedUnits - 5);
	cache.set(".remainder", remainder);
	cache.set(".overflow", matches());
	expect(cache.get(".oversized")).toBeUndefined();
	expect(cache.get(".small")).toBe(small);
	expect(cache.get(".remainder")).toBe(remainder);
	expect(cache.get(".overflow")).toBeUndefined();
});

it("bounds cumulative UTF-16 selector units while allowing an empty key", () => {
	const cache = new StyleSelectorCache(() => {});
	const first = "😀".repeat(
		styleSelectorCacheLimits.maxSelectorCodeUnits / 2 - 1,
	);
	const empty = matches();
	cache.set(first, empty);
	cache.set("ab", empty);
	cache.set("c", empty);
	cache.set("", empty);
	expect(cache.get(first)).toBe(empty);
	expect(cache.get("ab")).toBe(empty);
	expect(cache.get("c")).toBeUndefined();
	expect(cache.get("")).toBe(empty);
});

it("skips oversized keys without consuming capacity for a subsequent valid entry", () => {
	const cache = new StyleSelectorCache(() => {});
	const oversized = "x".repeat(
		styleSelectorCacheLimits.maxSelectorCodeUnits + 1,
	);
	const remainder = "x".repeat(
		styleSelectorCacheLimits.maxSelectorCodeUnits - 1,
	);
	const empty = matches();
	cache.set(oversized, empty);
	cache.set("a", empty);
	cache.set(remainder, empty);
	cache.set("b", empty);
	expect(cache.get(oversized)).toBeUndefined();
	expect(cache.get("a")).toBe(empty);
	expect(cache.get(remainder)).toBe(empty);
	expect(cache.get("b")).toBeUndefined();
});

it("does not replace duplicate results or count their units or keys again", () => {
	const cache = new StyleSelectorCache(() => {});
	const selector = "x".repeat(
		styleSelectorCacheLimits.maxSelectorCodeUnits - 1,
	);
	const original = matches(1);
	cache.set(selector, original);
	cache.set(selector, matches(styleSelectorCacheLimits.maxRetainedUnits));
	const remainder = matches(styleSelectorCacheLimits.maxRetainedUnits - 3);
	cache.set("a", remainder);
	cache.set("b", matches());
	expect(cache.get(selector)).toBe(original);
	expect(cache.get("a")).toBe(remainder);
	expect(cache.get("b")).toBeUndefined();
});

it("does not mutate supplied maps or specificity weights", () => {
	const cache = new StyleSelectorCache(() => {});
	const result = matches(2, 3, 4);
	const targets = [result.elements, result.before, result.after];
	const snapshots = targets.map((target) => [...target]);
	cache.set(".item", result);
	cache.get(".item");
	cache.set(".item", matches(1));
	for (const [index, target] of targets.entries()) {
		expect([...target]).toEqual(snapshots[index]);
		for (const [node, weight] of snapshots[index]) {
			expect(target.get(node)).toBe(weight);
			expect(Object.isFrozen(weight)).toBe(true);
		}
	}
});

it("only reads map sizes on insertion and never inspects maps on a hit", () => {
	const cache = new StyleSelectorCache(() => {});
	const result = matches(1, 1, 1);
	let retained = false;
	const unexpected = () => {
		throw new Error("unexpected map access");
	};
	for (const target of [result.elements, result.before, result.after]) {
		Object.defineProperty(target, "size", {
			get: () => {
				if (retained) return unexpected();
				return Reflect.get(Map.prototype, "size", target);
			},
		});
		for (const method of [
			"get",
			"has",
			"set",
			"delete",
			"clear",
			"entries",
			"keys",
			"values",
			"forEach",
			Symbol.iterator,
		])
			Object.defineProperty(target, method, { value: unexpected });
	}
	cache.set(".item", result);
	retained = true;
	expect(cache.get(".item")).toBe(result);
	cache.set(".item", result);
	expect(cache.get(".item")).toBe(result);
});
