import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	SourceLinkLabelScope,
	sourceLinkLabelLimits,
	validateSourceLinkLabelPolicy,
} from "./source-link-labels.js";

function identity(value: string): string {
	return value;
}

function bind(scope: SourceLinkLabelScope, source: string): object {
	const node = {};
	scope.bind(node, source);
	return node;
}

function emit(scope: SourceLinkLabelScope, source: string): string | undefined {
	return scope.label(bind(scope, source));
}

function rejects(action: () => unknown): void {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected generic source label error");
	expect(caught.code).toBe("invalid-input");
	expect(caught.message).toBe("Invalid source link label input");
	expect(Object.hasOwn(caught, "cause")).toBe(false);
}

it("keeps the default disabled and accepts only the explicit source policy", () => {
	expect(validateSourceLinkLabelPolicy(undefined)).toBeUndefined();
	expect(validateSourceLinkLabelPolicy("source-aria-label-v1")).toBe(
		"source-aria-label-v1",
	);
});

it.each(
	[
		null,
		false,
		true,
		0,
		1,
		Number.NaN,
		1n,
		Symbol("private-label"),
		"",
		"private-label",
		"SOURCE-ARIA-LABEL-V1",
		" source-aria-label-v1",
		"source-aria-label-v1 ",
		[],
		{},
		["source-aria-label-v1"],
		Object("source-aria-label-v1"),
	].map((value) => ({ value })),
)("rejects malformed policy input %# without exposing it", ({ value }) => {
	rejects(() => validateSourceLinkLabelPolicy(value));
});

it("never coerces policy values or source strings", () => {
	const coercion = vi.fn(() => {
		throw new Error("Untrusted coercion");
	});
	const value = { toString: coercion, [Symbol.toPrimitive]: coercion };
	rejects(() => validateSourceLinkLabelPolicy(value));
	const scope = new SourceLinkLabelScope(identity);
	rejects(() => scope.bind({}, value as unknown as string));
	expect(coercion).not.toHaveBeenCalled();
});

it.each(
	[undefined, null, false, 1, "private-label", {}, []].map((value) => ({
		value,
	})),
)("requires a sanitizer function for %#", ({ value }) => {
	rejects(
		() =>
			new SourceLinkLabelScope(value as unknown as (source: string) => string),
	);
});

it.each([undefined, null, false, 0, "private-label", 1n, Symbol("node")])(
	"rejects primitive node identities %#",
	(value) => {
		const clean = vi.fn(identity);
		const scope = new SourceLinkLabelScope(clean);
		rejects(() => scope.bind(value as unknown as object, "private-label"));
		rejects(() => scope.label(value as unknown as object));
		expect(clean).not.toHaveBeenCalled();
		expect(scope.report()).toMatchObject({ links: 0, omittedCandidates: 0 });
	},
);

it.each(
	[undefined, null, false, 0, 1n, Symbol("label"), {}, [], identity].map(
		(value) => ({ value }),
	),
)(
	"rejects non-string source labels %# without reserving the node",
	({ value }) => {
		const scope = new SourceLinkLabelScope(identity);
		const node = {};
		rejects(() => scope.bind(node, value as unknown as string));
		scope.bind(node, "Original");
		expect(scope.label(node)).toBe("Source aria-label: Original");
	},
);

it("binds lazily and memoizes emitted labels and their sanitizer calls", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const node = bind(scope, " \t Read\n\r\f more \t ");
	expect(clean).not.toHaveBeenCalled();
	expect(scope.report()).toMatchObject({ links: 0, omittedCandidates: 0 });
	expect(scope.label(node)).toBe("Source aria-label: Read more");
	expect(scope.label(node)).toBe("Source aria-label: Read more");
	expect(clean).toHaveBeenCalledExactlyOnceWith("Read more");
	expect(scope.report()).toMatchObject({ links: 1, truncatedLabels: 0 });
});

it.each(["Original", "", " \t\r\n\f "])(
	"protects the first binding before and after evaluation for %j",
	(source) => {
		const scope = new SourceLinkLabelScope(identity);
		const node = bind(scope, source);
		rejects(() => scope.bind(node, "private-replacement"));
		const expected =
			source === "Original" ? "Source aria-label: Original" : undefined;
		expect(scope.label(node)).toBe(expected);
		rejects(() => scope.bind(node, source));
		expect(scope.label(node)).toBe(expected);
		expect(scope.report().omittedCandidates).toBe(0);
	},
);

it("does not sanitize or reserve unbound identities", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const node = {};
	for (let index = 0; index < 1000; index++) {
		expect(scope.label({})).toBeUndefined();
		expect(scope.label(node)).toBeUndefined();
	}
	expect(clean).not.toHaveBeenCalled();
	expect(scope.report()).toMatchObject({ links: 0, omittedCandidates: 0 });
	scope.bind(node, "Later");
	expect(scope.label(node)).toBe("Source aria-label: Later");
});

it("uses only object identity without inspecting properties or prototypes", () => {
	const access = vi.fn(() => {
		throw new Error("Unexpected node access");
	});
	const scope = new SourceLinkLabelScope(identity);
	const nodes = [
		Object.create(null),
		Object.prototype,
		{ name: "__proto__" },
		{ name: "constructor" },
		Object.freeze({}),
		identity,
		new Proxy({}, { get: access, getPrototypeOf: access, ownKeys: access }),
	];
	for (const [index, node] of nodes.entries()) {
		scope.bind(node, `Label ${index}`);
		expect(scope.label(node)).toBe(`Source aria-label: Label ${index}`);
		expect(scope.label(node)).toBe(`Source aria-label: Label ${index}`);
	}
	expect(scope.report().links).toBe(nodes.length);
	expect(access).not.toHaveBeenCalled();
});

it.each(["", " ", "\t\n\r\f ", " ".repeat(4096)])(
	"memoizes exhausted empty or HTML-whitespace-only source %j",
	(source) => {
		const clean = vi.fn(identity);
		const scope = new SourceLinkLabelScope(clean);
		const node = bind(scope, source);
		expect(scope.label(node)).toBeUndefined();
		expect(scope.label(node)).toBeUndefined();
		expect(clean).toHaveBeenCalledTimes(source.length === 0 ? 0 : 1);
		expect(scope.report()).toMatchObject({
			links: 0,
			truncatedLabels: 0,
			omittedCandidates: 0,
		});
	},
);

it("collapses ASCII whitespace and trims outer Unicode whitespace without Markdown escaping", () => {
	const scope = new SourceLinkLabelScope(identity);
	expect(emit(scope, " \t[Read](next)  *now*\n ")).toBe(
		"Source aria-label: [Read](next) *now*",
	);
	expect(emit(scope, " \u00a0\u2003Read\u00a0 \t")).toBe(
		"Source aria-label: Read",
	);
	expect(emit(scope, "Read\u00a0\u2003more")).toBe(
		"Source aria-label: Read\u00a0\u2003more",
	);
});

it("passes normalized control and format characters through the trusted sanitizer", () => {
	const clean = vi.fn((value: string) =>
		value.replace(
			/[\p{Cc}\p{Cf}]/gu,
			(character) => `\\u{${character.codePointAt(0)?.toString(16)}}`,
		),
	);
	const scope = new SourceLinkLabelScope(clean);
	expect(emit(scope, "\tA\0\v\u202e\u200b\nB\r")).toBe(
		"Source aria-label: A\\u{0}\\u{b}\\u{202e}\\u{200b} B",
	);
	expect(clean).toHaveBeenCalledExactlyOnceWith("A\0\v\u202e\u200b B");
});

it.each([1024, 1025])("bounds a cleaned name of %i code units", (length) => {
	const scope = new SourceLinkLabelScope(identity);
	const truncated = length > 1024;
	expect(emit(scope, "a".repeat(length))).toBe(
		`Source aria-label${truncated ? " (truncated)" : ""}: ${"a".repeat(1024)}`,
	);
	expect(scope.report()).toMatchObject({
		links: 1,
		truncatedLabels: Number(truncated),
		omittedCandidates: 0,
	});
});

it.each([4096, 4097])(
	"bounds a raw source of %i code units before cleaning",
	(length) => {
		const clean = vi.fn(identity);
		const scope = new SourceLinkLabelScope(clean);
		const node = bind(scope, `Name${" ".repeat(length - 4)}`);
		const truncated = length > 4096;
		expect(scope.label(node)).toBe(
			`Source aria-label${truncated ? " (truncated)" : ""}: Name`,
		);
		expect(scope.label(node)).toBe(
			`Source aria-label${truncated ? " (truncated)" : ""}: Name`,
		);
		expect(clean).toHaveBeenCalledExactlyOnceWith("Name");
		expect(scope.report().truncatedLabels).toBe(Number(truncated));
	},
);

it("bounds sanitizer input and counts combined source and name clipping only once", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const node = bind(scope, "a".repeat(100_000));
	const expected = `Source aria-label (truncated): ${"a".repeat(1024)}`;
	expect(scope.label(node)).toBe(expected);
	expect(scope.label(node)).toBe(expected);
	expect(clean).toHaveBeenCalledExactlyOnceWith("a".repeat(4096));
	expect(scope.report()).toMatchObject({
		links: 1,
		truncatedLabels: 1,
		omittedCandidates: 0,
	});
});

it("never searches beyond a bounded prefix of huge leading whitespace", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const node = bind(scope, `${" ".repeat(1_000_000)}Hidden`);
	expect(scope.label(node)).toBeUndefined();
	expect(scope.label(node)).toBeUndefined();
	expect(clean).toHaveBeenCalledExactlyOnceWith("");
	expect(scope.report()).toMatchObject({
		links: 0,
		truncatedLabels: 0,
		omittedCandidates: 1,
	});
	expect(emit(scope, "Shown")).toBe("Source aria-label: Shown");
});

it("counts clipped whitespace as unknown even if the unseen suffix is also whitespace", () => {
	const scope = new SourceLinkLabelScope(identity);
	expect(emit(scope, " ".repeat(4097))).toBeUndefined();
	expect(scope.report().omittedCandidates).toBe(1);
});

it("clips sanitizer expansion after one bounded call", () => {
	const clean = vi.fn((value: string) => value.replace(/\0/g, "\\u{0}"));
	const scope = new SourceLinkLabelScope(clean);
	const node = bind(scope, "\0".repeat(205));
	const name = "\\u{0}".repeat(205).slice(0, 1024);
	expect(scope.label(node)).toBe(`Source aria-label (truncated): ${name}`);
	expect(scope.label(node)).toBe(`Source aria-label (truncated): ${name}`);
	expect(clean).toHaveBeenCalledExactlyOnceWith("\0".repeat(205));
	expect(scope.report()).toMatchObject({ links: 1, truncatedLabels: 1 });
});

it("memoizes unusable sanitized nonempty names as omitted without consuming a link", () => {
	const clean = vi.fn((value: string) => (value === "Removed" ? "" : value));
	const scope = new SourceLinkLabelScope(clean);
	const node = bind(scope, "Removed");
	expect(scope.label(node)).toBeUndefined();
	expect(scope.label(node)).toBeUndefined();
	expect(clean).toHaveBeenCalledExactlyOnceWith("Removed");
	expect(emit(scope, "Shown")).toBe("Source aria-label: Shown");
	expect(scope.report()).toMatchObject({ links: 1, omittedCandidates: 1 });
});

it("enforces 128 emitted links, not bindings, empty names, or repeated calls", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const nodes = Array.from({ length: 129 }, () => bind(scope, "Read"));
	for (let index = 0; index < 128; index++) {
		expect(emit(scope, "")).toBeUndefined();
		expect(scope.label(nodes[index])).toBe("Source aria-label: Read");
		expect(scope.label(nodes[index])).toBe("Source aria-label: Read");
	}
	expect(clean).toHaveBeenCalledTimes(128);
	expect(scope.label(nodes[128])).toBeUndefined();
	expect(scope.label(nodes[128])).toBeUndefined();
	expect(emit(scope, "")).toBeUndefined();
	expect(clean).toHaveBeenCalledTimes(128);
	expect(scope.report()).toMatchObject({
		links: 128,
		truncatedLabels: 0,
		omittedCandidates: 1,
	});
});

it("charges only emitted name units, excluding annotation prefixes and memoized calls", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	const name = "a".repeat(1024);
	for (let index = 0; index < 16; index++) {
		const node = bind(scope, name);
		expect(scope.label(node)).toBe(`Source aria-label: ${name}`);
		expect(scope.label(node)).toBe(`Source aria-label: ${name}`);
	}
	const rejected = bind(scope, "b");
	expect(scope.label(rejected)).toBeUndefined();
	expect(scope.label(rejected)).toBeUndefined();
	expect(clean).toHaveBeenCalledTimes(16);
	expect(scope.report()).toMatchObject({
		links: 16,
		truncatedLabels: 0,
		omittedCandidates: 1,
	});
});

it("clips to the remaining total name budget and charges sanitizer expansion", () => {
	const clean = vi.fn((value: string) => value.repeat(2));
	const scope = new SourceLinkLabelScope(clean);
	for (let index = 0; index < 15; index++) emit(scope, "a".repeat(512));
	emit(scope, "b".repeat(500));
	expect(emit(scope, "c".repeat(13))).toBe(
		`Source aria-label (truncated): ${"c".repeat(24)}`,
	);
	expect(emit(scope, "d")).toBeUndefined();
	expect(clean).toHaveBeenCalledTimes(17);
	expect(scope.report()).toMatchObject({
		links: 17,
		truncatedLabels: 1,
		omittedCandidates: 1,
	});
});

it("charges raw scanned prefixes once, not normalized lengths", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	for (let index = 0; index < 16; index++) {
		const node = bind(scope, `a${" ".repeat(4095)}`);
		expect(scope.label(node)).toBe("Source aria-label: a");
		expect(scope.label(node)).toBe("Source aria-label: a");
	}
	const rejected = bind(scope, "b");
	expect(scope.label(rejected)).toBeUndefined();
	expect(scope.label(rejected)).toBeUndefined();
	expect(clean).toHaveBeenCalledTimes(16);
	expect(scope.report()).toMatchObject({
		links: 16,
		truncatedLabels: 0,
		omittedCandidates: 1,
	});
});

it("charges exhausted whitespace scans without consuming links or label units", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	for (let index = 0; index < 16; index++) {
		const node = bind(scope, " ".repeat(4096));
		expect(scope.label(node)).toBeUndefined();
		expect(scope.label(node)).toBeUndefined();
	}
	expect(scope.report()).toMatchObject({ links: 0, omittedCandidates: 0 });
	expect(emit(scope, "Read")).toBeUndefined();
	expect(emit(scope, "")).toBeUndefined();
	expect(clean).toHaveBeenCalledTimes(16);
	expect(scope.report().omittedCandidates).toBe(1);
});

it.each([3, 4])(
	"bounds processing to the last three scan units for a %i-unit source",
	(length) => {
		const clean = vi.fn(identity);
		const scope = new SourceLinkLabelScope(clean);
		for (let index = 0; index < 15; index++) emit(scope, " ".repeat(4096));
		emit(scope, " ".repeat(4093));
		expect(emit(scope, "a".repeat(length))).toBe(
			`Source aria-label${length > 3 ? " (truncated)" : ""}: aaa`,
		);
		expect(clean).toHaveBeenLastCalledWith("aaa");
		expect(emit(scope, "b")).toBeUndefined();
		expect(clean).toHaveBeenCalledTimes(17);
		expect(scope.report()).toMatchObject({
			links: 1,
			truncatedLabels: Number(length > 3),
			omittedCandidates: 1,
		});
	},
);

it.each([1022, 1023])(
	"preserves surrogate pairs at the name boundary after %i units",
	(length) => {
		const scope = new SourceLinkLabelScope(identity);
		const prefix = "a".repeat(length);
		const complete = length === 1022;
		expect(emit(scope, `${prefix}😀`)).toBe(
			`Source aria-label${complete ? "" : " (truncated)"}: ${prefix}${complete ? "😀" : ""}`,
		);
		expect(scope.report().truncatedLabels).toBe(Number(!complete));
	},
);

it.each([4094, 4095])(
	"preserves surrogate pairs at the source boundary after %i units",
	(length) => {
		const clean = vi.fn(identity);
		const scope = new SourceLinkLabelScope(clean);
		const complete = length === 4094;
		expect(emit(scope, `A${" ".repeat(length - 1)}😀`)).toBe(
			complete ? "Source aria-label: A 😀" : "Source aria-label (truncated): A",
		);
		expect(clean).toHaveBeenCalledExactlyOnceWith(complete ? "A 😀" : "A");
		expect(scope.report().truncatedLabels).toBe(Number(!complete));
	},
);

it("preserves surrogate pairs without refunding scanned-window units", () => {
	const clean = vi.fn(identity);
	const scope = new SourceLinkLabelScope(clean);
	for (let index = 0; index < 15; index++) emit(scope, " ".repeat(4096));
	emit(scope, " ".repeat(4094));
	expect(emit(scope, "A😀")).toBe("Source aria-label (truncated): A");
	expect(clean).toHaveBeenLastCalledWith("A");
	const omitted = bind(scope, "😀");
	expect(scope.label(omitted)).toBeUndefined();
	expect(scope.label(omitted)).toBeUndefined();
	expect(emit(scope, "B")).toBeUndefined();
	expect(emit(scope, "C")).toBeUndefined();
	expect(scope.report()).toMatchObject({
		links: 1,
		truncatedLabels: 1,
		omittedCandidates: 3,
	});
});

it("does not consume link or name budget when a pair cannot fit the final name unit", () => {
	const scope = new SourceLinkLabelScope(identity);
	for (let index = 0; index < 15; index++) emit(scope, "a".repeat(1024));
	emit(scope, "a".repeat(1023));
	const omitted = bind(scope, "😀");
	expect(scope.label(omitted)).toBeUndefined();
	expect(scope.label(omitted)).toBeUndefined();
	expect(emit(scope, "b")).toBe("Source aria-label: b");
	expect(emit(scope, "c")).toBeUndefined();
	expect(scope.report()).toMatchObject({
		links: 17,
		truncatedLabels: 0,
		omittedCandidates: 2,
	});
});

it("clips pairs in sanitizer output rather than splitting them", () => {
	const clean = vi.fn(() => `${"a".repeat(1023)}😀`);
	const scope = new SourceLinkLabelScope(clean);
	expect(emit(scope, "Read")).toBe(
		`Source aria-label (truncated): ${"a".repeat(1023)}`,
	);
	expect(clean).toHaveBeenCalledExactlyOnceWith("Read");
});

it("clips a partial name at the total-budget pair boundary without wasting the remainder", () => {
	const scope = new SourceLinkLabelScope(identity);
	for (let index = 0; index < 15; index++) emit(scope, "a".repeat(1024));
	emit(scope, "a".repeat(1022));
	expect(emit(scope, "A😀")).toBe("Source aria-label (truncated): A");
	expect(emit(scope, "B")).toBe("Source aria-label: B");
	expect(emit(scope, "C")).toBeUndefined();
	expect(scope.report()).toMatchObject({
		links: 18,
		truncatedLabels: 1,
		omittedCandidates: 1,
	});
});

it("keeps independent bindings and counters for each scope", () => {
	const first = new SourceLinkLabelScope(identity);
	const second = new SourceLinkLabelScope(identity);
	const node = {};
	first.bind(node, "First");
	second.bind(node, "Second");
	for (let index = 0; index < 128; index++) emit(first, "Filled");
	expect(first.label(node)).toBeUndefined();
	expect(second.label(node)).toBe("Source aria-label: Second");
	expect(first.report()).toMatchObject({ links: 128, omittedCandidates: 1 });
	expect(second.report()).toMatchObject({ links: 1, omittedCandidates: 0 });
});

it("exports frozen limits and fresh frozen source-only report snapshots", () => {
	expect(sourceLinkLabelLimits).toEqual({
		maxLinks: 128,
		maxLabelCodeUnits: 1024,
		maxTotalLabelCodeUnits: 16_384,
		maxSourceCodeUnitsPerLabel: 4096,
		maxScannedSourceCodeUnits: 65_536,
	});
	expect(Object.isFrozen(sourceLinkLabelLimits)).toBe(true);
	expect(Reflect.set(sourceLinkLabelLimits, "maxLinks", 1)).toBe(false);
	const scope = new SourceLinkLabelScope(identity);
	const before = scope.report();
	expect(before).toEqual({
		policy: "source-aria-label-v1",
		attribute: "aria-label",
		rendered: false,
		verified: false,
		links: 0,
		truncatedLabels: 0,
		omittedCandidates: 0,
	});
	expect(Object.isFrozen(before)).toBe(true);
	expect(Reflect.set(before, "links", 99)).toBe(false);
	emit(scope, "Read");
	const after = scope.report();
	expect(after).not.toBe(before);
	expect(after).not.toBe(scope.report());
	expect(Object.isFrozen(after)).toBe(true);
	expect(after.links).toBe(1);
	expect(before.links).toBe(0);
});
it("treats bounded outer Unicode whitespace as an empty name", () => {
	const scope = new SourceLinkLabelScope((value) => value);
	const node = {};
	scope.bind(node, "\u00a0\u2003\u202f");
	expect(scope.label(node)).toBeUndefined();
	expect(scope.report()).toMatchObject({ links: 0, omittedCandidates: 0 });
});
