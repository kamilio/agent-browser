import ts from "typescript";
import { expect, it } from "vitest";
import {
	pageEventBootstrapGlobal,
	pageEventBootstrapSource,
} from "./page-event-bootstrap.js";

const source = ts.createSourceFile(
	"event-bootstrap.js",
	pageEventBootstrapSource,
	ts.ScriptTarget.ES2022,
	true,
	ts.ScriptKind.JS,
);

function descendants(node: ts.Node): ts.Node[] {
	const result: ts.Node[] = [];
	function visit(child: ts.Node) {
		result.push(child);
		ts.forEachChild(child, visit);
	}
	visit(node);
	return result;
}

function guestClass(name: string) {
	const found = descendants(source).find(
		(node): node is ts.ClassDeclaration =>
			ts.isClassDeclaration(node) && node.name?.text === name,
	);
	if (!found) throw new Error(`Missing ${name} class`);
	return found;
}

it("parses the guarded guest constructors without executing the source", () => {
	expect(
		(source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
			.parseDiagnostics,
	).toEqual([]);
	expect(pageEventBootstrapGlobal).toBe("__agentBrowserEventBootstrap");
	expect(source.statements).toHaveLength(2);
	const guard = source.statements[0];
	if (!ts.isIfStatement(guard)) throw new Error("Missing bootstrap guard");
	expect(guard.expression.getText(source)).toBe(
		'typeof __agentBrowserEventBootstrap === "function"',
	);
	expect(guard.elseStatement).toBeUndefined();
	expect(source.statements.at(-1)?.getText(source)).toBe("void 0;");
});

it("publishes both constructors once and passes only flags and receiver to native", () => {
	const calls = descendants(source)
		.filter(ts.isCallExpression)
		.filter((call) => call.expression.getText(source).startsWith("port."))
		.map((call) => [
			call.expression.getText(source),
			call.arguments.map((argument) => argument.getText(source)),
		]);
	expect(calls).toEqual([
		[
			"port.create",
			[
				"name",
				"Boolean(options.bubbles)",
				"Boolean(options.cancelable)",
				"Boolean(options.composed)",
				"this",
			],
		],
		["port.window", []],
		["port.dispatch", ["target", "facade"]],
		["port.publish", ["Event", "CustomEvent", "dispatchEvent"]],
	]);
});

it("looks up the native event in a private guest WeakMap instead of retaining it again", () => {
	expect(pageEventBootstrapSource).toContain(
		"const eventFacades = new WeakMap();",
	);
	expect(pageEventBootstrapSource).toContain(
		"eventFacades.set(this, this.#event);",
	);
	expect(pageEventBootstrapSource).toContain(
		"const facade = eventFacades.get(event);",
	);
	expect(pageEventBootstrapSource).toContain(
		'if (!facade) throw new TypeError("dispatchEvent requires a constructed Event");',
	);
	expect(pageEventBootstrapSource).toContain(
		"value: constructors.dispatchEvent",
	);
});

it("rejects same-event recursion before host suspension and resets the guard on every exit", () => {
	const declaration = descendants(source).find(
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && node.name?.text === "dispatchEvent",
	);
	if (!declaration) throw new Error("Missing dispatcher");
	const text = declaration.getText(source);
	expect(text.indexOf("dispatching.has(event)")).toBeLessThan(
		text.indexOf("port.dispatch"),
	);
	expect(text).toContain('error.name = "InvalidStateError"');
	const guarded = declaration.body?.statements.find(ts.isTryStatement);
	expect(guarded?.finallyBlock?.getText(source)).toContain(
		"dispatching.delete(event)",
	);
	expect(guarded?.catchClause).toBeUndefined();
});

it("keeps arbitrary detail guest-owned and reads it before native allocation", () => {
	const custom = guestClass("CustomEvent");
	expect(custom.heritageClauses?.[0].getText(source)).toBe("extends Event");
	expect(custom.getText(source)).toContain("#detail;");
	expect(custom.getText(source)).toContain(
		"this.#detail = detail === undefined ? null : detail;",
	);
	expect(
		custom.getText(source).indexOf("const detail = options.detail;"),
	).toBeLessThan(custom.getText(source).indexOf("super(name, flags);"));
	const detail = custom.members.find(
		(member) => member.name?.getText(source) === "detail",
	);
	expect(detail?.getText(source)).toBe("get detail() { return this.#detail; }");
});

it("delegates dispatch-state access to the native event instead of guest copies", () => {
	const event = guestClass("Event");
	for (const name of [
		"type",
		"target",
		"currentTarget",
		"eventPhase",
		"defaultPrevented",
		"bubbles",
		"cancelable",
		"composed",
		"timeStamp",
	])
		expect(event.getText(source)).toContain(
			`get ${name}() { return this.#event.${name}; }`,
		);
	for (const name of [
		"preventDefault",
		"stopPropagation",
		"stopImmediatePropagation",
	])
		expect(event.getText(source)).toContain(
			`${name}() { this.#event.${name}(); }`,
		);
	expect(event.getText(source)).toContain(
		"composedPath() { return this.#event.composedPath(); }",
	);
});

it("defines isTrusted as a nonconfigurable own getter and exposes standard phase constants", () => {
	const definition = descendants(guestClass("Event"))
		.filter(ts.isCallExpression)
		.find(
			(call) => call.expression.getText(source) === "Object.defineProperty",
		);
	expect(definition?.arguments[0].getText(source)).toBe("this");
	expect(definition?.arguments[1].getText(source)).toBe('"isTrusted"');
	expect(definition?.arguments[2].getText(source)).toContain(
		"configurable: false",
	);
	expect(definition?.arguments[2].getText(source)).toContain(
		"get: () => this.#event.isTrusted",
	);
	for (const [name, phase] of [
		["NONE", 0],
		["CAPTURING_PHASE", 1],
		["AT_TARGET", 2],
		["BUBBLING_PHASE", 3],
	])
		expect(pageEventBootstrapSource).toContain(`["${name}", ${phase}]`);
});

it("uses writable configurable global constructors without legacy polyfill stubs", () => {
	for (const name of ["Event", "CustomEvent"])
		expect(pageEventBootstrapSource).toContain(
			`Object.defineProperty(globalThis, "${name}", {value: constructors.${name}, writable: true, configurable: true, enumerable: false});`,
		);
	expect(pageEventBootstrapSource).not.toMatch(
		/createEvent|initCustomEvent|initEvent|\beval\(/,
	);
	expect(pageEventBootstrapSource).toContain('typeof value === "symbol"');
	expect(pageEventBootstrapSource).toContain("arguments.length === 0");
});
