import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls, pageUrlLimits } from "./page-urls.js";
import type { ReleasedHostDefinition } from "./safejs-extension-types.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture(limits: Partial<typeof pageUrlLimits> = {}) {
	const controller = new AbortController();
	const hostObjects: object[] = [];
	const owner = new PageUrls(
		{
			signal: controller.signal,
			createHostObject(definition: ReleasedHostDefinition) {
				const object = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(object, name, property);
				for (const [name, method] of Object.entries(definition.methods ?? {}))
					Object.defineProperty(object, name, { value: method });
				hostObjects.push(object);
				return object;
			},
		},
		limits,
	);
	const context = createContext({
		__agentBrowserWindowGlobal: { urls: owner.port },
	});
	const evaluate = (source: string) =>
		runInContext(source, context, { timeout: 1000 });
	evaluate(pageUrlBootstrapSource);
	const close = () => {
		controller.abort();
		owner.close();
	};
	cleanups.push(close);
	return { owner, hostObjects, evaluate, close, controller };
}

it.each([
	["https://user:pass@ExAmPle.test:443/a/../b?q=a+b#hash", undefined],
	["../child?name=雪", "https://example.test/base/path"],
	["https://münich.example/\ud800", undefined],
	["mailto:name@example.test", undefined],
	["data:text/plain,a", undefined],
	["http://[::1]:8080/", undefined],
])(
	"parses and serializes %s using bounded native URL semantics",
	(input, base) => {
		const test = fixture();
		const native = new URL(input as string, base);
		expect(
			test.evaluate(
				`var value = new URL(${JSON.stringify(input)}, ${JSON.stringify(base)}); [value.href, value.origin, value.protocol, value.username, value.password, value.host, value.hostname, value.port, value.pathname, value.search, value.hash, String(value), value.toJSON()]`,
			),
		).toEqual([
			native.href,
			native.origin,
			native.protocol,
			native.username,
			native.password,
			native.host,
			native.hostname,
			native.port,
			native.pathname,
			native.search,
			native.hash,
			String(native),
			native.toJSON(),
		]);
	},
);

it.each([
	"protocol",
	"username",
	"password",
	"host",
	"hostname",
	"port",
	"pathname",
	"search",
	"hash",
	"href",
] as const)(
	"reflects writable URL %s without exposing native objects",
	(name) => {
		const test = fixture();
		const values = {
			protocol: "http:",
			username: "a b",
			password: "c@d",
			host: "other.test:81",
			hostname: "münich.example",
			port: "3000",
			pathname: "/space here/雪",
			search: "?a=1&a=2",
			hash: "#frag ment",
			href: "https://new.test/?q=yes",
		};
		const native = new URL("https://example.test/original?x=0");
		native[name] = values[name];
		expect(
			test.evaluate(
				`var value = new URL('https://example.test/original?x=0'); var params = value.searchParams; value.${name} = ${JSON.stringify(values[name])}; [value.href, value.searchParams === params, String(params), value instanceof URL, params instanceof URLSearchParams, Object.keys(value)]`,
			),
		).toEqual([native.href, true, String(native.searchParams), true, true, []]);
		expect(
			test.hostObjects.some(
				(object) => object instanceof URL || object instanceof URLSearchParams,
			),
		).toBe(false);
	},
);

it.each([
	"new URL()",
	"URL('https://example.test')",
	"URLSearchParams()",
	"new URL('/relative')",
	"new URL('https://[bad')",
	"new URL(Symbol('url'))",
	"new URL('https://example.test', Symbol('base'))",
	"new URLSearchParams(Symbol('query'))",
])("rejects invalid construction %s", (source) => {
	const test = fixture();
	expect(() => test.evaluate(source)).toThrow();
	expect(test.owner.metrics()).toMatchObject({
		urls: 0,
		searchParams: 0,
		retainedCodeUnits: 0,
	});
});

it.each([
	"undefined",
	"null",
	"'?a=1&a=2&empty&space=a+b&bad=%FF'",
	"[['x', '1'], ['x', '2'], ['space', 'a b'], ['unicode', '\\ud800']]",
	"{x: 1, y: null, z: undefined}",
	"new Map([['x', 1], ['y', 2]])",
	"new URLSearchParams('a=1&a=2')",
	"{'\\ud800': 1, '\\ud801': 2}",
])("initializes params from %s", (source) => {
	const test = fixture();
	const expected = runInContext(
		`String(new URLSearchParams(${source}))`,
		createContext({ URLSearchParams }),
	);
	expect(test.evaluate(`String(new URLSearchParams(${source}))`)).toBe(
		expected,
	);
});

it("converts strings and record getters in the guest with string-hint coercion and USV encoding", () => {
	const test = fixture();
	expect(
		test.evaluate(`
		var calls = []; var input = {toString() {calls.push('string'); return '/\\ud800';}, valueOf() {throw Error('wrong hint');}};
		var value = new URL(input, {toString() {calls.push('base'); return 'https://example.test';}});
		var params = new URLSearchParams({get key() {calls.push('getter'); return {toString() {calls.push('value'); return '\\ud800 +';}};}});
		[value.href, String(params), calls]
	`),
	).toEqual([
		"https://example.test/%EF%BF%BD",
		"key=%EF%BF%BD+%2B",
		["string", "base", "getter", "value"],
	]);
});

it("skips record fields deleted by an earlier getter without invoking inherited or hidden getters", () => {
	const test = fixture();
	expect(
		test.evaluate(`
		var input = {get first() {delete this.second; return 'ok';}, second: 'removed'};
		Object.setPrototypeOf(input, {get inherited() {throw Error('inherited getter');}});
		Object.defineProperty(input, 'hidden', {get() {throw Error('hidden getter');}, enumerable: false});
		String(new URLSearchParams(input))
	`),
	).toBe("first=ok");
});

it("keeps iteration live through deletion, forEach mutation, and permanent exhaustion", () => {
	const test = fixture();
	expect(
		test.evaluate(`
		var params = new URLSearchParams('a=1&b=2&c=3'), seen = [];
		params.forEach(function(value, key) {seen.push(key); if(key === 'a') {params.delete('b'); params.append('d','4');}});
		var iterator = params.entries(); var before = [...iterator]; params.append('e','5');
		var copied = params.getAll('a'); copied.push('unowned');
		[seen, before, iterator.next().done, params.getAll('a')]
	`),
	).toEqual([
		["a", "c", "d"],
		[
			["a", "1"],
			["c", "3"],
			["d", "4"],
		],
		true,
		["1"],
	]);
});

it("preserves live params and state after invalid href while releasing replaced retained storage", () => {
	const test = fixture();
	test.evaluate(
		"var url = new URL('https://example.test/?large='+'x'.repeat(100)), params = url.searchParams;",
	);
	const before = test.owner.metrics().retainedCodeUnits;
	expect(() => test.evaluate("url.href = 'not a URL'")).toThrow();
	expect(test.evaluate("params.get('large').length")).toBe(100);
	test.evaluate("params.delete('large')");
	expect(test.owner.metrics().retainedCodeUnits).toBeLessThan(before);
	expect(
		test.evaluate(
			"[url.href, params === url.searchParams, params.size, params.get('missing'), params.has('missing')]",
		),
	).toEqual(["https://example.test/", true, 0, null, false]);
});

it.each([
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	pageUrlLimits.maxUrls + 1,
])(
	"rejects invalid limit %s before constructing native capabilities",
	(value) => {
		expect(() => fixture({ maxUrls: value })).toThrow(/limits/i);
	},
);

it.each([
	"[1]",
	"[['a']]",
	"[['a','b','c']]",
	"{[Symbol.iterator]: 1}",
	"{[Symbol('key')]: 1}",
	"[['a',Symbol('value')]]",
])("rejects malformed or symbolic parameter initialization %s", (source) => {
	const test = fixture();
	expect(() => test.evaluate(`new URLSearchParams(${source})`)).toThrow();
	expect(test.owner.metrics()).toMatchObject({
		searchParams: 0,
		retainedCodeUnits: 0,
	});
});

it("keeps URL searchParams identity and duplicate-key mutations live in both directions", () => {
	const test = fixture();
	expect(
		test.evaluate(`
		var url = new URL('https://example.test/?a=1&a=2&b=three'); var params = url.searchParams;
		params.append('a','4'); var all = params.getAll('a'); params.delete('a','2'); params.set('b','a b~');
		var before = [url.href, all, params.has('a','1'), params.has('a','2'), params.size];
		url.search = '?new=ok'; var middle = [params === url.searchParams, String(params)];
		url.href = 'https://other.test/?x=1'; params.append('x','2'); [before, middle, params === url.searchParams, url.href]
	`),
	).toEqual([
		["https://example.test/?a=1&b=a+b%7E&a=4", ["1", "2", "4"], true, false, 3],
		[true, "new=ok"],
		true,
		"https://other.test/?x=1&x=2",
	]);
});

it("supports stable sorting, live iteration, duplicate entries and guest forEach receivers", () => {
	const test = fixture();
	expect(
		test.evaluate(`
		var params = new URLSearchParams('z=0&a=1&a=2'); params.sort();
		var iterator = params.entries(); var first = iterator.next().value; params.append('last','3');
		var rest = [...iterator]; var receiver = {}, visited = [];
		params.forEach(function(value, key, owner) {visited.push([key, value, this === receiver, owner === params]);}, receiver);
		[first, rest, [...params.keys()], [...params.values()], [...params], visited, iterator.next().done]
	`),
	).toEqual([
		["a", "1"],
		[
			["a", "2"],
			["z", "0"],
			["last", "3"],
		],
		["a", "a", "z", "last"],
		["1", "2", "0", "3"],
		[
			["a", "1"],
			["a", "2"],
			["z", "0"],
			["last", "3"],
		],
		[
			["a", "1", true, true],
			["a", "2", true, true],
			["z", "0", true, true],
			["last", "3", true, true],
		],
		true,
	]);
});

it.each([
	"append('a')",
	"set('a')",
	"get()",
	"getAll()",
	"delete()",
	"has()",
	"append(Symbol(), 'x')",
	"forEach(null)",
])(
	"enforces params required arguments and callable contracts: %s",
	(method) => {
		const test = fixture();
		expect(() => test.evaluate(`new URLSearchParams().${method}`)).toThrow();
	},
);

it("leaves unsupported URL object-URL statics absent and brands prototype methods", () => {
	const test = fixture();
	expect(
		test.evaluate(
			"[typeof URL.createObjectURL, typeof URL.revokeObjectURL, URL.length, URLSearchParams.length, URLSearchParams.prototype[Symbol.iterator] === URLSearchParams.prototype.entries]",
		),
	).toEqual(["undefined", "undefined", 1, 0, true]);
	for (const source of [
		"URL.prototype.toString.call({})",
		"URLSearchParams.prototype.append.call({},'a','b')",
		"URLSearchParams.prototype.entries.call({})",
	])
		expect(() => test.evaluate(source)).toThrow();
});

it("bounds URL and parameter ownership counts, including attached params", () => {
	const test = fixture({ maxUrls: 1, maxSearchParams: 2 });
	test.evaluate(
		"var url = new URL('https://example.test'); var params = new URLSearchParams();",
	);
	expect(() => test.evaluate("new URL('https://other.test')")).toThrow(
		/limit/i,
	);
	expect(() => test.evaluate("new URLSearchParams()")).toThrow(/limit/i);
	expect(test.owner.metrics()).toMatchObject({ urls: 1, searchParams: 2 });
});

it("bounds input, serialization, pair count and retained storage with atomic mutations", () => {
	const test = fixture({
		maxInputCodeUnits: 64,
		maxSerializedCodeUnits: 64,
		maxParams: 2,
		maxRetainedCodeUnits: 100,
	});
	test.evaluate(
		"var params = new URLSearchParams('a=1&b=2'); var url = new URL('https://x.test/?a=1');",
	);
	const before = test.evaluate(
		"[String(params), url.href, String(url.searchParams)]",
	);
	const retained = test.owner.metrics().retainedCodeUnits;
	for (const source of [
		"params.append('c','3')",
		"params.set('a', 'x'.repeat(65))",
		"params.set('a', '雪'.repeat(22))",
		"url.href = 'https://x.test/?a=1&b=2&c=3'",
		"url.search = '?a='+'x'.repeat(55)",
	])
		expect(() => test.evaluate(source)).toThrow(/limit/i);
	expect(
		test.evaluate("[String(params), url.href, String(url.searchParams)]"),
	).toEqual(before);
	expect(test.owner.metrics().retainedCodeUnits).toBe(retained);
});

it("closes bounded iterables on overlong initialization and charges mutation/iteration work", () => {
	const test = fixture({ maxParams: 2 });
	expect(() =>
		test.evaluate(
			`var closed = false; new URLSearchParams({*[Symbol.iterator]() {try {while(true) yield ['a','1'];} finally {closed = true;}}});`,
		),
	).toThrow(/limit/i);
	expect(test.evaluate("closed")).toBe(true);
	const limited = fixture({ maxWork: 200 });
	expect(() =>
		limited.evaluate(
			"var params = new URLSearchParams('a=1'); for(var index=0;index<1000;index++) params.set('a','1');",
		),
	).toThrow(/limit/i);
	expect(limited.owner.metrics().work).toBeLessThanOrEqual(200);
});

it("does not invoke arbitrary objects through the native port", () => {
	const test = fixture();
	const coercion = vi.fn(() => "https://example.test");
	const port = test.owner.port as {
		url(input: unknown, base?: unknown): unknown;
		params(input: unknown): unknown;
		encode(name: unknown, value: unknown): unknown;
	};
	for (const operation of [
		() => port.url({ toString: coercion }),
		() => port.params({ toString: coercion }),
		() => port.encode({ toString: coercion }, "x"),
	])
		expect(operation).toThrow();
	expect(coercion).not.toHaveBeenCalled();
});

it.each(["abort", "close"])(
	"revokes retained constructors, ports, URLs, params and iterators on %s",
	(kind) => {
		const test = fixture();
		test.evaluate(
			"var SavedURL = URL, SavedParams = URLSearchParams, url = new URL('https://x.test/?a=1'), params = url.searchParams, iterator = params.entries();",
		);
		if (kind === "abort") test.controller.abort();
		else test.owner.close();
		for (const source of [
			"new SavedURL('https://x.test')",
			"new SavedParams()",
			"url.href",
			"url.searchParams",
			"url.hash = '#a'",
			"String(params)",
			"params.append('a','2')",
			"iterator.next()",
			"params.forEach(function(){})",
		])
			expect(() => test.evaluate(source)).toThrow(/closed/i);
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			urls: 0,
			searchParams: 0,
			retainedCodeUnits: 0,
		});
	},
);
