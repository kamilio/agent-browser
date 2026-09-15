import { expect, it } from "vitest";
import {
	boundedExtractionTextPrefix,
	type ExtractionContentFallback,
} from "./extraction-prefix.js";
import type { ExtractedNode } from "./extraction.js";
import type { ResourceLimitDiagnostic } from "./resource-limit.js";

const encoder = new TextEncoder();
const metadata = {
	document: "fixture",
	scope: "selected",
	title: 'Escaped "title" 雪',
	revision: 1,
	partial: true,
};
const trigger: Readonly<ResourceLimitDiagnostic> = Object.freeze({
	kind: "extraction.output",
	unit: "bytes",
	limit: 512,
	observed: 20_000,
});

function text(value: string): ExtractedNode {
	return { ref: "private-text-ref", type: "text", text: value };
}

function branch(
	type: ExtractedNode["type"],
	...children: ExtractedNode[]
): ExtractedNode {
	return { ref: "private-branch-ref", type, children };
}

function indented(value: string): string {
	return `${value
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n")}\n`;
}

function candidate(source: string, retainedCodeUnits: number) {
	const contentFallback: ExtractionContentFallback = {
		policy: "text-prefix-v1",
		representation: "indented-plain-text",
		sourceCodeUnits: source.length,
		retainedCodeUnits,
		truncated: retainedCodeUnits < source.length,
		trigger,
	};
	return {
		content: indented(source.slice(0, retainedCodeUnits)),
		contentFallback,
	};
}

function serializedBytes(payload: object, details: object = metadata): number {
	return encoder.encode(
		JSON.stringify({ ...details, format: "markdown", ...payload }),
	).byteLength;
}

function maximumCandidate(source: string, capacity: number) {
	let expected: ReturnType<typeof candidate> | undefined;
	let retainedCodeUnits = 0;
	for (const character of source) {
		retainedCodeUnits += character.length;
		const payload = candidate(source, retainedCodeUnits);
		if (
			/\S/u.test(source.slice(0, retainedCodeUnits)) &&
			serializedBytes(payload) <= capacity
		)
			expected = payload;
	}
	return expected;
}

it("fits the exact serialized envelope and prefers its maximum prefix", () => {
	const source = "x".repeat(300);
	const expected = candidate(source, 100);
	const capacity = serializedBytes(expected);
	const result = boundedExtractionTextPrefix(
		text(source),
		metadata,
		capacity,
		trigger,
	);
	expect(result).toEqual(expected);
	expect(serializedBytes(result as object)).toBe(capacity);
	expect(serializedBytes(candidate(source, 101))).toBeGreaterThan(capacity);
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity - 1, trigger),
	).toEqual(candidate(source, 99));
});

it.each([0, 1, 32, 128, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"returns no payload for unusable capacity %s",
	(capacity) => {
		expect(
			boundedExtractionTextPrefix(
				text("meaningful"),
				metadata,
				capacity,
				trigger,
			),
		).toBeUndefined();
	},
);

it("returns no payload when even one meaningful character cannot fit", () => {
	const source = "ab";
	const capacity = serializedBytes(candidate(source, 1)) - 1;
	expect(serializedBytes(candidate(source, 0))).toBeLessThanOrEqual(capacity);
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity, trigger),
	).toBeUndefined();
	expect(
		boundedExtractionTextPrefix(
			text(source),
			{ title: "x".repeat(2000) },
			512,
			trigger,
		),
	).toBeUndefined();
});

it.each(["", " \t\n\n ", "\u00a0\u2003"])(
	"returns no payload for empty or whitespace-only projection %j",
	(source) => {
		expect(
			boundedExtractionTextPrefix(text(source), metadata, 4096, trigger),
		).toBeUndefined();
	},
);

it("does not mistake a fitting whitespace-only prefix for meaningful text", () => {
	const source = `${" \t\n".repeat(30)}visible`;
	const capacity = serializedBytes(candidate(source, 90));
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity, trigger),
	).toBeUndefined();
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity + 1, trigger),
	).toEqual(candidate(source, 91));
});

it("bounds a long single line without scanning raw markup or emitting a suffix", () => {
	const source = "prefix ".repeat(150_000);
	const capacity = 4096;
	const result = boundedExtractionTextPrefix(
		text(source),
		metadata,
		capacity,
		trigger,
	);
	expect(result).toBeDefined();
	if (!result) return;
	expect(result.contentFallback.sourceCodeUnits).toBe(source.length);
	expect(result.contentFallback.retainedCodeUnits).toBeLessThan(capacity);
	expect(result.contentFallback.truncated).toBe(true);
	expect(result.content).toBe(
		indented(source.slice(0, result.contentFallback.retainedCodeUnits)),
	);
	expect(serializedBytes(result)).toBe(capacity);
	expect(
		serializedBytes(
			candidate(source, result.contentFallback.retainedCodeUnits + 1),
		),
	).toBeGreaterThan(capacity);
});

it.each([
	"first\nsecond\n\nlast",
	"\nfirst\n\nlast\n",
	"  leading\tspaces  \n\tindented\n\n",
])("preserves multiline and blank-line text %j", (source) => {
	const expected = candidate(source, source.length);
	const capacity = serializedBytes(expected);
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity, trigger),
	).toEqual(expected);
});

it.each([
	'😀雪"\\\n\t\u0000\u001fEND',
	"\n\n\t text 😀😀 漢字\n",
	"x".repeat(105),
	"😀",
	"a😀b",
	"😀😀end",
	"\ud800a\udc00😀tail",
])(
	"matches every safe prefix across all serialized capacities for %j",
	(source) => {
		const fullBytes = serializedBytes(candidate(source, source.length));
		for (let capacity = 0; capacity <= fullBytes + 1; capacity++) {
			const result = boundedExtractionTextPrefix(
				text(source),
				metadata,
				capacity,
				trigger,
			);
			expect(result).toEqual(maximumCandidate(source, capacity));
			if (result) expect(serializedBytes(result)).toBeLessThanOrEqual(capacity);
		}
	},
);

it("backs off instead of splitting a surrogate pair at the capacity boundary", () => {
	const source = "a😀b";
	const capacity = serializedBytes(candidate(source, 1)) + 3;
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity, trigger),
	).toEqual(candidate(source, 1));
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity + 1, trigger),
	).toEqual(candidate(source, 3));
});

it("includes the final truncated flag and retained-count digit changes in the bound", () => {
	const source = "x".repeat(10);
	const partial = candidate(source, 9);
	const complete = candidate(source, 10);
	const partialBytes = serializedBytes(partial);
	expect(serializedBytes(complete)).toBe(partialBytes + 3);
	expect(
		boundedExtractionTextPrefix(
			text(source),
			metadata,
			partialBytes + 2,
			trigger,
		),
	).toEqual(partial);
	expect(
		boundedExtractionTextPrefix(
			text(source),
			metadata,
			partialBytes + 3,
			trigger,
		),
	).toEqual(complete);
});

it("keeps fences, HTML and link-looking text inside indented code", () => {
	const source =
		"```js\n~~~\n<script>alert(1)</script>\n[go](https://example.invalid/)\n<https://example.invalid/>\n# heading\n- list\n```";
	const result = boundedExtractionTextPrefix(
		text(source),
		metadata,
		4096,
		trigger,
	);
	expect(result).toEqual(candidate(source, source.length));
	expect(result?.content.endsWith("\n")).toBe(true);
	expect(
		result?.content
			.slice(0, -1)
			.split("\n")
			.every((line) => line.startsWith("    ")),
	).toBe(true);
	const retained = source.indexOf("</script>") + 3;
	const capacity = serializedBytes(candidate(source, retained));
	expect(
		boundedExtractionTextPrefix(text(source), metadata, capacity, trigger),
	).toEqual(candidate(source, retained));
});

it("separates paragraphs, lists, tables, containers and nested block labels", () => {
	const root = branch(
		"container",
		branch("heading", text("Title")),
		branch("paragraph", text("First")),
		branch("paragraph", text("Second")),
		branch(
			"list",
			branch("list-item", text("One")),
			branch("list-item", text("Two")),
		),
		branch("blockquote", branch("paragraph", text("Quote"))),
		branch(
			"table",
			branch("row", branch("cell", text("A")), branch("cell", text("B"))),
			branch("row", branch("cell", text("C")), branch("cell", text("D"))),
		),
		branch(
			"container",
			text("Outer"),
			branch("container", text("Inner")),
			text("After"),
		),
	);
	const source =
		"Title\nFirst\nSecond\nOne\nTwo\nQuote\nA\nB\nC\nD\nOuter\nInner\nAfter";
	expect(boundedExtractionTextPrefix(root, metadata, 4096, trigger)).toEqual(
		candidate(source, source.length),
	);
});

it("preserves inline adjacency and image alt without URLs, refs or attributes", () => {
	const root = branch(
		"paragraph",
		text("Hello"),
		branch("inline", text(", "), branch("strong", text("bold"))),
		branch("emphasis", text("!")),
		{
			...branch("link", text("label")),
			url: "https://private.invalid/destination",
		},
		{
			ref: "private-image-ref",
			type: "image",
			text: "ALT",
			url: "https://private.invalid/image",
		},
		branch("code", text("()")),
		text("  tail"),
	);
	const source = "Hello, bold!labelALT()  tail";
	const result = boundedExtractionTextPrefix(root, metadata, 4096, trigger);
	expect(result).toEqual(candidate(source, source.length));
	expect(result?.content).not.toContain("private");
	expect(result?.content).not.toContain("https:");
});

it("preserves breaks and pre whitespace without doubling existing block newlines", () => {
	const root = branch(
		"container",
		branch("paragraph", text("Before\n")),
		branch("pre", branch("code", text("  first\t \n\n"), text("  second\n"))),
		branch(
			"paragraph",
			text("After"),
			branch("break"),
			branch("break"),
			text("End"),
		),
		branch("separator"),
		text("Tail"),
	);
	const source = "Before\n  first\t \n\n  second\nAfter\n\nEnd\nTail";
	expect(boundedExtractionTextPrefix(root, metadata, 4096, trigger)).toEqual(
		candidate(source, source.length),
	);
});

it("does not invent text for empty structural nodes or separator-only trees", () => {
	const root = branch(
		"container",
		branch("paragraph"),
		branch("table", branch("row", branch("cell"))),
		branch("separator"),
		branch("break"),
	);
	expect(
		boundedExtractionTextPrefix(root, metadata, 4096, trigger),
	).toBeUndefined();
	const source = "Before\nAfter";
	expect(
		boundedExtractionTextPrefix(
			branch("container", text("Before"), root, text("After")),
			metadata,
			4096,
			trigger,
		),
	).toEqual(candidate(source, source.length));
});

it("walks deep and wide admitted synthetic trees iteratively in DOM order", () => {
	let root = text("Deep");
	for (let depth = 0; depth < 1023; depth++) root = branch("container", root);
	const siblings = Array.from({ length: 20_000 }, (_, index) =>
		text(String(index % 10)),
	);
	root = branch("container", root, ...siblings);
	const source = `Deep\n${"0123456789".repeat(2000)}`;
	expect(boundedExtractionTextPrefix(root, metadata, 32_768, trigger)).toEqual(
		candidate(source, source.length),
	);
});

it("does not mutate inputs and freezes independent fallback and trigger snapshots", () => {
	const leaf = text("Immutable");
	const root = branch("paragraph", leaf);
	Object.freeze(leaf);
	Object.freeze(root.children);
	Object.freeze(root);
	const details = Object.freeze({
		...metadata,
		nested: Object.freeze({ selected: true }),
	});
	const mutableTrigger = { ...trigger };
	const original = JSON.stringify({ root, details, mutableTrigger });
	const result = boundedExtractionTextPrefix(
		root,
		details,
		4096,
		mutableTrigger,
	);
	expect(JSON.stringify({ root, details, mutableTrigger })).toBe(original);
	expect(result).toBeDefined();
	if (!result) return;
	expect(Object.isFrozen(result.contentFallback)).toBe(true);
	expect(Object.isFrozen(result.contentFallback.trigger)).toBe(true);
	expect(result.contentFallback.trigger).not.toBe(mutableTrigger);
	expect(result.contentFallback.trigger).toEqual(trigger);
	expect(Reflect.set(result.contentFallback, "retainedCodeUnits", 0)).toBe(
		false,
	);
	expect(Reflect.set(result.contentFallback.trigger, "limit", 0)).toBe(false);
	mutableTrigger.observed++;
	expect(result.contentFallback.trigger.observed).toBe(trigger.observed);
	expect(Object.isFrozen(mutableTrigger)).toBe(false);
});

it("fits the complete plain projection when original Markdown formatting overflowed", () => {
	const source = "Visible label";
	const destination = `https://example.invalid/${"long-path/".repeat(200)}`;
	const root = { ...branch("link", text(source)), url: destination };
	const expected = candidate(source, source.length);
	const capacity = serializedBytes(expected);
	expect(
		serializedBytes({ content: `[${source}](<${destination}>)` }),
	).toBeGreaterThan(capacity);
	const result = boundedExtractionTextPrefix(root, metadata, capacity, trigger);
	expect(result).toEqual(expected);
	expect(result?.contentFallback.truncated).toBe(false);
	expect(serializedBytes(result as object)).toBe(capacity);
});

it("accounts for arbitrary metadata and overrides existing output fields without mutation", () => {
	const source = 'quoted " \\ 雪 '.repeat(20);
	const details = {
		...metadata,
		format: "json",
		content: { old: true },
		contentFallback: null,
		selection: { start: 9, end: 100, title: "\n\t雪" },
	};
	const original = JSON.stringify(details);
	const expected = candidate(source, 50);
	const capacity = serializedBytes(expected, details);
	const result = boundedExtractionTextPrefix(
		text(source),
		details,
		capacity,
		trigger,
	);
	expect(result).toEqual(expected);
	expect(serializedBytes(result as object, details)).toBe(capacity);
	expect(JSON.stringify(details)).toBe(original);
});
