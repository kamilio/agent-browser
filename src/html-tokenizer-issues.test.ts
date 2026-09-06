import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

type NativeRead = (tokenizer: HtmlTokenizer) => unknown;

const privateSentinel = "SYNTHETIC_ISSUE_PRIVATE";
const next: NativeRead = (tokenizer) => tokenizer.next();
const title: NativeRead = (tokenizer) => tokenizer.raw("title", true);
const style: NativeRead = (tokenizer) => tokenizer.raw("style");
const script: NativeRead = (tokenizer) => tokenizer.raw("script");
const issuePaths = [
	{
		name: "text character references",
		source: "&#0; &#xD800; &bogus;",
		read: next,
	},
	{
		name: "attribute references and duplicates",
		source: '<p title="&#0;" title="duplicate">',
		read: next,
	},
	{ name: "comment nulls", source: "<!--a\0b\0c-->", read: next },
	{ name: "abrupt comment", source: "<!-->", read: next },
	{ name: "nested comment", source: "<!--a<!--b-->", read: next },
	{ name: "missing doctype name", source: "<!DOCTYPE>", read: next },
	{
		name: "doctype identifiers",
		source: '<!DOCTYPE h\0tml PUBLIC"x\0" "y">',
		read: next,
	},
	{ name: "doctype EOF", source: "<!DOCTYPE html", read: next },
	{ name: "bogus declaration", source: "<!not-doctype\0>", read: next },
	{ name: "invalid end tag", source: "</9\0>", read: next },
	{ name: "unterminated attribute", source: '<p title="broken', read: next },
	{
		name: "unterminated processing declaration",
		source: "<?broken",
		read: next,
	},
	{
		name: "RCDATA character references",
		source: "&#0;&bogus;</title>",
		read: title,
	},
	{ name: "unterminated raw style", source: "body {}", read: style },
	{
		name: "unterminated double-escaped script",
		source: "<!--<script>nested</script>",
		read: script,
	},
];

function observe(source: string, read: NativeRead, maxIssues?: number) {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer(
		source,
		(issue) => issues.push(issue),
		maxIssues,
	);
	const result = read(tokenizer);
	return { tokenizer, issues, result };
}

function caught(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected synthetic tokenizer failure");
}

function safeError(error: unknown, code: string): AgentBrowserError {
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected native AgentBrowserError");
	expect(error.code).toBe(code);
	expect(error.message.length).toBeGreaterThan(0);
	expect(error.message.length).toBeLessThan(200);
	expect(error.message).not.toContain(privateSentinel);
	expect(Object.hasOwn(error, "cause")).toBe(false);
	return error;
}

function quotaError(
	action: () => unknown,
	limit: number,
	observed: number,
): AgentBrowserError {
	const error = safeError(caught(action), "resource-limit");
	const diagnostic = resourceLimitDiagnostic(error);
	expect(diagnostic).toEqual({
		kind: "html.issues",
		unit: "issues",
		limit,
		observed,
	});
	expect(Object.isFrozen(diagnostic)).toBe(true);
	return error;
}

function observeNativeBuffers(tokenizer: HtmlTokenizer): string[][] {
	const buffers: string[][] = [];
	let current: string[] | undefined;
	Object.defineProperty(tokenizer, "bufferedIssues", {
		configurable: true,
		get: () => current,
		set: (value: string[] | undefined) => {
			current = value;
			if (value !== undefined) buffers.push(value);
		},
	});
	return buffers;
}

it.each(issuePaths)(
	"preserves default callbacks/results and exact issue quotas for $name",
	({ source, read }) => {
		const omittedIssues: string[] = [];
		const omitted = new HtmlTokenizer(source, (issue) =>
			omittedIssues.push(issue),
		);
		const omittedResult = read(omitted);
		expect(omittedIssues.length).toBeGreaterThan(0);
		expect(omitted.issueCount).toBe(omittedIssues.length);
		for (const maximum of [
			undefined,
			omittedIssues.length,
			omittedIssues.length + 1,
		]) {
			const actual = observe(source, read, maximum);
			expect(actual.result).toEqual(omittedResult);
			expect(actual.issues).toEqual(omittedIssues);
			expect(actual.tokenizer.issueCount).toBe(omittedIssues.length);
			expect(actual.tokenizer.position).toBe(omitted.position);
			expect(actual.tokenizer.workUnits).toBe(omitted.workUnits);
			expect(actual.tokenizer.paused).toBe(omitted.paused);
		}
		const delivered: string[] = [];
		const limited = new HtmlTokenizer(
			source,
			(issue) => delivered.push(issue),
			omittedIssues.length - 1,
		);
		quotaError(
			() => read(limited),
			omittedIssues.length - 1,
			omittedIssues.length,
		);
		expect(limited.issueCount).toBe(omittedIssues.length);
		expect(delivered).toEqual([]);
	},
);

it("accepts zero, negative zero and safe-integer quotas without changing clean EOF behavior", () => {
	for (const limit of [0, -0, 1, Number.MAX_SAFE_INTEGER]) {
		const callback = vi.fn();
		const tokenizer = new HtmlTokenizer("<p>ok</p>", callback, limit);
		expect(tokenizer.issueCount).toBe(0);
		expect(tokenizer.next()).toMatchObject({ kind: "start", name: "p" });
		expect(tokenizer.next()).toEqual({ kind: "text", data: "ok" });
		expect(tokenizer.next()).toMatchObject({ kind: "end", name: "p" });
		expect(tokenizer.next()).toBeUndefined();
		expect(tokenizer.next()).toBeUndefined();
		expect(tokenizer.remainder()).toBe("");
		expect(tokenizer.issueCount).toBe(0);
		expect(callback).not.toHaveBeenCalled();
	}
	const maximum = observe("&#0;", next, Number.MAX_SAFE_INTEGER);
	expect(maximum.tokenizer.issueCount).toBe(1);
});

it("does not impose the cursor's 1024-event default on an unbounded native tokenizer", () => {
	const source = "&#0;".repeat(1025);
	const delivered: string[] = [];
	const omitted = new HtmlTokenizer(source, (issue) => delivered.push(issue));
	const result = omitted.next();
	expect(omitted.issueCount).toBe(1025);
	expect(delivered).toHaveLength(1025);
	for (const maximum of [undefined, 1025]) {
		const actual = observe(source, next, maximum);
		expect(actual.result).toEqual(result);
		expect(actual.issues).toEqual(delivered);
		expect(actual.tokenizer.issueCount).toBe(1025);
	}
	const limited = new HtmlTokenizer(source, () => {}, 1024);
	quotaError(() => limited.next(), 1024, 1025);
});

it("rejects invalid quotas at construction without coercing them or invoking issue callbacks", () => {
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const hostile = { toString: hook, valueOf: hook, [Symbol.toPrimitive]: hook };
	let message: string | undefined;
	for (const limit of [
		null,
		false,
		true,
		"",
		"0",
		"1",
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		1n,
		Symbol(privateSentinel),
		{},
		[],
		new Number(1),
		hostile,
	]) {
		const error = safeError(
			caught(() => new HtmlTokenizer("&#0;", hook, limit as number)),
			"invalid-input",
		);
		message ??= error.message;
		expect(error.message).toBe(message);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	}
	expect(hook).not.toHaveBeenCalled();
});

it("exposes issueCount as a read-only live counter", () => {
	const tokenizer = new HtmlTokenizer("&#0;<p>", () => {}, 1);
	expect(tokenizer.issueCount).toBe(0);
	expect(Reflect.set(tokenizer, "issueCount", 99)).toBe(false);
	expect(tokenizer.issueCount).toBe(0);
	tokenizer.next();
	expect(tokenizer.issueCount).toBe(1);
	expect(Reflect.set(tokenizer, "issueCount", 0)).toBe(false);
	expect(tokenizer.issueCount).toBe(1);
});

it("keeps the native issue quota cumulative across successful reads and clean tokens", () => {
	const delivered: string[] = [];
	const tokenizer = new HtmlTokenizer(
		"&#0;<p>&bogus;</p><!--\0-->",
		(issue) => delivered.push(issue),
		2,
	);
	expect(tokenizer.next()).toMatchObject({ kind: "text" });
	expect(tokenizer.issueCount).toBe(1);
	expect(delivered).toHaveLength(1);
	expect(tokenizer.next()).toMatchObject({ kind: "start", name: "p" });
	expect(tokenizer.issueCount).toBe(1);
	expect(tokenizer.next()).toMatchObject({ kind: "text" });
	expect(tokenizer.issueCount).toBe(2);
	expect(delivered).toHaveLength(2);
	expect(tokenizer.next()).toMatchObject({ kind: "end", name: "p" });
	const earlier = [...delivered];
	quotaError(() => tokenizer.next(), 2, 3);
	expect(tokenizer.issueCount).toBe(3);
	expect(delivered).toEqual(earlier);
});

it("permits clean reads and EOF at equality until a further issue is actually attempted", () => {
	const tokenizer = new HtmlTokenizer("&#0;<p>ok</p>", () => {}, 1);
	tokenizer.next();
	expect(tokenizer.issueCount).toBe(1);
	expect(tokenizer.next()).toMatchObject({ kind: "start", name: "p" });
	expect(tokenizer.remainder()).toBe("ok</p>");
	expect(tokenizer.next()).toBeUndefined();
	expect(tokenizer.issueCount).toBe(1);
	tokenizer.insert("&#0;", tokenizer.position);
	quotaError(() => tokenizer.next(), 1, 2);
});

it.each([0, 1, 2])(
	"charges before appending the over-limit event to the actual native buffer at quota %s",
	(limit) => {
		const source = "&#0;&bogus;&#xD800;";
		const baseline = observe(source, next);
		expect(baseline.issues).toHaveLength(3);
		const callback = vi.fn();
		const tokenizer = new HtmlTokenizer(source, callback, limit);
		const buffers = observeNativeBuffers(tokenizer);
		quotaError(() => tokenizer.next(), limit, limit + 1);
		expect(tokenizer.issueCount).toBe(limit + 1);
		expect(buffers).toHaveLength(1);
		expect(buffers[0]).toEqual(baseline.issues.slice(0, limit));
		expect(callback).not.toHaveBeenCalled();
		const snapshot = [...buffers[0]];
		quotaError(() => tokenizer.remainder(), limit, limit + 1);
		expect(buffers[0]).toEqual(snapshot);
	},
);

it("counts all buffered attempts before delivering callbacks from a successful token", () => {
	const source = "&#0;&bogus;";
	const baseline = observe(source, next);
	const counts: number[] = [];
	const delivered: string[] = [];
	const tokenizer = new HtmlTokenizer(
		source,
		(issue) => {
			counts.push(tokenizer.issueCount);
			delivered.push(issue);
		},
		baseline.issues.length,
	);
	expect(tokenizer.next()).toEqual(baseline.result);
	expect(delivered).toEqual(baseline.issues);
	expect(counts).toEqual(baseline.issues.map(() => baseline.issues.length));
});

it.each([
	{ name: "next at real EOF", source: "&#0;", read: next },
	{ name: "raw at real EOF", source: "body", read: style },
])(
	"keeps quota exhaustion terminal after $name, with fresh errors for every read",
	({ source, read }) => {
		const callback = vi.fn();
		const tokenizer = new HtmlTokenizer(source, callback, 0);
		const original = quotaError(() => read(tokenizer), 0, 1);
		const originalMessage = original.message;
		expect(tokenizer.position).toBe(source.length);
		const hook = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		Object.defineProperties(original, {
			code: { get: hook },
			message: { get: hook },
		});
		const laterErrors: AgentBrowserError[] = [];
		for (const operation of [
			() => tokenizer.next(),
			() => tokenizer.raw("script"),
			() => tokenizer.remainder(),
			() => tokenizer.next(),
		]) {
			const error = quotaError(operation, 0, 1);
			expect(error === original).toBe(false);
			expect(laterErrors.includes(error)).toBe(false);
			expect(error.message).toBe(originalMessage);
			laterErrors.push(error);
			expect(tokenizer.issueCount).toBe(1);
			expect(tokenizer.position).toBe(source.length);
		}
		expect(callback).not.toHaveBeenCalled();
		expect(hook).not.toHaveBeenCalled();
	},
);

it("does not reset a consumed quota through boundary changes or inserted source", () => {
	const tokenizer = new HtmlTokenizer("&#0;<p>tail</p>", () => {}, 1);
	tokenizer.next();
	expect(tokenizer.issueCount).toBe(1);
	tokenizer.setBoundary(tokenizer.position);
	expect(tokenizer.next()).toBeUndefined();
	expect(tokenizer.paused).toBe(true);
	tokenizer.setBoundary(undefined);
	tokenizer.insert("&#0;", tokenizer.position);
	expect(tokenizer.issueCount).toBe(1);
	quotaError(() => tokenizer.next(), 1, 2);
});

it("keeps all read methods terminal even when the offending event leaves unread input", () => {
	const source = "<!invalid><p>tail</p>";
	const callback = vi.fn();
	const tokenizer = new HtmlTokenizer(source, callback, 0);
	quotaError(() => tokenizer.next(), 0, 1);
	const position = tokenizer.position;
	expect(position).toBeLessThan(source.length);
	for (const operation of [
		() => tokenizer.next(),
		() => tokenizer.raw("style"),
		() => tokenizer.remainder(),
	]) {
		quotaError(operation, 0, 1);
		expect(tokenizer.position).toBe(position);
		expect(tokenizer.issueCount).toBe(1);
	}
	expect(callback).not.toHaveBeenCalled();
});

it("cannot revive terminal reads by clearing boundaries or inserting clean input", () => {
	const tokenizer = new HtmlTokenizer("&#0;", () => {}, 0);
	quotaError(() => tokenizer.next(), 0, 1);
	const position = tokenizer.position;
	tokenizer.setBoundary(position);
	tokenizer.setBoundary(undefined);
	tokenizer.insert("<p>clean</p>", position);
	for (const operation of [
		() => tokenizer.next(),
		() => tokenizer.raw("style"),
		() => tokenizer.remainder(),
	])
		quotaError(operation, 0, 1);
	expect(tokenizer.issueCount).toBe(1);
	expect(tokenizer.position).toBe(position);
});

it.each([
	{ name: "quoted tag", source: '<p title="ok">', boundary: 11, read: next },
	{ name: "comment", source: "<!--body-->", boundary: 8, read: next },
	{
		name: "script closing tag",
		source: "body</script>",
		boundary: 10,
		read: script,
	},
	{ name: "character reference", source: "&amp;", boundary: 3, read: next },
	{ name: "tag-name boundary", source: "<p>", boundary: 1, read: next },
])(
	"does not charge needInput control for a clean partial $name",
	({ source, boundary, read }) => {
		const baseline = observe(source, read);
		expect(baseline.issues).toEqual([]);
		const callback = vi.fn();
		const tokenizer = new HtmlTokenizer(source, callback, 0);
		tokenizer.setBoundary(boundary);
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(read(tokenizer)).toBeUndefined();
			expect(tokenizer.paused).toBe(true);
			expect(tokenizer.position).toBe(0);
			expect(tokenizer.issueCount).toBe(0);
		}
		tokenizer.setBoundary(undefined);
		expect(read(tokenizer)).toEqual(baseline.result);
		expect(tokenizer.issueCount).toBe(0);
		expect(callback).not.toHaveBeenCalled();
	},
);

it.each([
	{
		name: "attribute entity",
		source: '<p value="&#0;" title="unfinished">',
		boundary: '<p value="&#0;" title="unfinished'.length,
	},
	{ name: "comment null", source: "<!--a\0b-->", boundary: "<!--a\0b".length },
	{
		name: "processing declaration",
		source: "<?payload>",
		boundary: "<?payload".length,
	},
	{
		name: "doctype EOF event",
		source: "<!DOCTYPE html>",
		boundary: "<!DOCTYPE html".length,
	},
])(
	"charges discarded partial $name attempts cumulatively without delivering them",
	({ source, boundary }) => {
		const baselineIssues: string[] = [];
		const baseline = new HtmlTokenizer(source, (issue) =>
			baselineIssues.push(issue),
		);
		baseline.setBoundary(boundary);
		expect(baseline.next()).toBeUndefined();
		expect(baseline.paused).toBe(true);
		expect(baseline.issueCount).toBeGreaterThan(0);
		expect(baselineIssues).toEqual([]);
		const allowance = baseline.issueCount;
		const delivered: string[] = [];
		const tokenizer = new HtmlTokenizer(
			source,
			(issue) => delivered.push(issue),
			allowance,
		);
		tokenizer.setBoundary(boundary);
		expect(tokenizer.next()).toBeUndefined();
		expect(tokenizer.paused).toBe(true);
		expect(tokenizer.position).toBe(0);
		expect(tokenizer.issueCount).toBe(allowance);
		expect(delivered).toEqual([]);
		quotaError(() => tokenizer.next(), allowance, allowance + 1);
		expect(tokenizer.issueCount).toBe(allowance + 1);
		expect(delivered).toEqual([]);
		tokenizer.setBoundary(undefined);
		quotaError(() => tokenizer.next(), allowance, allowance + 1);
	},
);

it("counts an allowed discarded issue again on a successful completed retry", () => {
	const source = '<p value="&#0;" title="unfinished">';
	const expected = observe(source, next);
	const delivered: string[] = [];
	const tokenizer = new HtmlTokenizer(
		source,
		(issue) => delivered.push(issue),
		2,
	);
	tokenizer.setBoundary(source.length - 2);
	expect(tokenizer.next()).toBeUndefined();
	expect(tokenizer.issueCount).toBe(1);
	expect(delivered).toEqual([]);
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual(expected.result);
	expect(tokenizer.issueCount).toBe(2);
	expect(delivered).toEqual(expected.issues);
	expect(delivered).toHaveLength(1);
});

it("charges partial doctype EOF events but not the eventual clean completion", () => {
	const source = "<!DOCTYPE html>";
	const delivered: string[] = [];
	const tokenizer = new HtmlTokenizer(
		source,
		(issue) => delivered.push(issue),
		1,
	);
	tokenizer.setBoundary(source.length - 1);
	expect(tokenizer.next()).toBeUndefined();
	expect(tokenizer.paused).toBe(true);
	expect(tokenizer.issueCount).toBe(1);
	expect(delivered).toEqual([]);
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual(observe(source, next).result);
	expect(tokenizer.issueCount).toBe(1);
	expect(delivered).toEqual([]);
	const disallowed = new HtmlTokenizer(source, () => {}, 0);
	disallowed.setBoundary(source.length - 1);
	quotaError(() => disallowed.next(), 0, 1);
	expect(disallowed.paused).toBe(false);
});

it("charges true-EOF unterminated raw issues only after a partial pause is released", () => {
	for (const read of [style, script]) {
		const callback = vi.fn();
		const tokenizer = new HtmlTokenizer("unfinished", callback, 0);
		tokenizer.setBoundary("unfinished".length);
		expect(read(tokenizer)).toBeUndefined();
		expect(tokenizer.issueCount).toBe(0);
		expect(tokenizer.paused).toBe(true);
		tokenizer.setBoundary(undefined);
		quotaError(() => read(tokenizer), 0, 1);
		expect(callback).not.toHaveBeenCalled();
	}
});

it("does not invent issues for literal raw text or remainder content", () => {
	const raw = new HtmlTokenizer("&#0;&bogus;</style>", () => {}, 0);
	expect(raw.raw("style")).toBe("&#0;&bogus;");
	expect(raw.issueCount).toBe(0);
	expect(raw.next()).toMatchObject({ kind: "end", name: "style" });
	const source = "&#0;<!--\0--><?broken";
	const tail = new HtmlTokenizer(source, () => {}, 0);
	expect(tail.remainder()).toBe(source);
	expect(tail.issueCount).toBe(0);
	expect(tail.next()).toBeUndefined();
});

it("shares the same cumulative allowance between raw entity reads and next", () => {
	const delivered: string[] = [];
	const tokenizer = new HtmlTokenizer(
		"&#0;</title>&bogus;",
		(issue) => delivered.push(issue),
		1,
	);
	expect(tokenizer.raw("title", true)).toBe("\ufffd");
	expect(tokenizer.issueCount).toBe(1);
	expect(delivered).toHaveLength(1);
	expect(tokenizer.next()).toMatchObject({ kind: "end", name: "title" });
	quotaError(() => tokenizer.next(), 1, 2);
	expect(delivered).toHaveLength(1);
});

it("preserves native script escaped and double-escaped closing behavior with zero quota", () => {
	const source = "<!--<script>inner</script>-->tail</script>";
	const baseline = observe(source, script);
	expect(baseline.issues).toEqual([]);
	const actual = observe(source, script, 0);
	expect(actual.result).toBe("<!--<script>inner</script>-->tail");
	expect(actual.result).toBe(baseline.result);
	expect(actual.tokenizer.position).toBe(baseline.tokenizer.position);
	expect(actual.tokenizer.issueCount).toBe(0);
	expect(actual.tokenizer.next()).toMatchObject({
		kind: "end",
		name: "script",
	});
});

it("does not turn a trusted callback exception into quota exhaustion", () => {
	const sentinel = new Error(privateSentinel);
	const tokenizer = new HtmlTokenizer(
		"&#0;<p>tail</p>",
		() => {
			throw sentinel;
		},
		2,
	);
	expect(caught(() => tokenizer.next())).toBe(sentinel);
	expect(tokenizer.issueCount).toBe(1);
	expect(resourceLimitDiagnostic(sentinel)).toBeUndefined();
	expect(tokenizer.next()).toMatchObject({ kind: "start", name: "p" });
	expect(tokenizer.remainder()).toBe("tail</p>");
	expect(tokenizer.next()).toBeUndefined();
	expect(tokenizer.issueCount).toBe(1);
});

it("keeps unrelated native attribute resource failures distinct from issue-quota failures", () => {
	const source = `<p ${Array.from({ length: 1025 }, (_value, index) => `attr${index}=x`).join(" ")}>`;
	const tokenizer = new HtmlTokenizer(source, () => {}, 0);
	const error = safeError(
		caught(() => tokenizer.next()),
		"resource-limit",
	);
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "html.attributes",
		unit: "attributes",
		limit: 1024,
		observed: 1025,
	});
	expect(tokenizer.issueCount).toBe(0);
});

it("keeps issue diagnostics immutable and bound to the actual trusted error identity", () => {
	const tokenizer = new HtmlTokenizer("&#0;", () => {}, 0);
	const error = quotaError(() => tokenizer.next(), 0, 1);
	const diagnostic = resourceLimitDiagnostic(error);
	if (diagnostic === undefined)
		throw new Error("Expected actual issue diagnostic");
	expect(Reflect.set(diagnostic, "observed", 99)).toBe(false);
	expect(resourceLimitDiagnostic(error)).toBe(diagnostic);
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const forged = new AgentBrowserError("resource-limit", error.message);
	Object.defineProperty(forged, "resourceLimit", { get: hook });
	expect(resourceLimitDiagnostic(forged)).toBeUndefined();
	expect(resourceLimitDiagnostic({ ...error, diagnostic })).toBeUndefined();
	expect(
		resourceLimitDiagnostic(new Proxy(error, { get: hook })),
	).toBeUndefined();
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "html.issues",
		unit: "issues",
		limit: 0,
		observed: 1,
	});
	expect(hook).not.toHaveBeenCalled();
});

it("uses the same fixed quota message across native paths, limits and private source text", () => {
	const text = new HtmlTokenizer(`${privateSentinel}&#0;`, () => {}, 0);
	const textError = quotaError(() => text.next(), 0, 1);
	const raw = new HtmlTokenizer(privateSentinel, () => {}, 0);
	const rawError = quotaError(() => raw.raw("style"), 0, 1);
	const repeated = new HtmlTokenizer(
		`&#0;${privateSentinel}&bogus;`,
		() => {},
		1,
	);
	const repeatedError = quotaError(() => repeated.next(), 1, 2);
	expect(rawError.message).toBe(textError.message);
	expect(repeatedError.message).toBe(textError.message);
});
