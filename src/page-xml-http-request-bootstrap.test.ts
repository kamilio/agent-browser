import ts from "typescript";
import { expect, it } from "vitest";
import {
	pageXmlHttpRequestBootstrapGlobal,
	pageXmlHttpRequestBootstrapSource,
} from "./page-xml-http-request-bootstrap.js";

const source = ts.createSourceFile(
	"xhr-bootstrap.js",
	pageXmlHttpRequestBootstrapSource,
	ts.ScriptTarget.ES2022,
	true,
	ts.ScriptKind.JS,
);

function descendants(node: ts.Node): ts.Node[] {
	const nodes: ts.Node[] = [];
	function visit(child: ts.Node) {
		nodes.push(child);
		ts.forEachChild(child, visit);
	}
	visit(node);
	return nodes;
}

const declaration = descendants(source).find(ts.isClassDeclaration);
if (!declaration) throw new Error("Missing guest XMLHttpRequest class");
const guestClass = declaration;

function member(name: string) {
	const found = guestClass.members.find(
		(value) => value.name?.getText(source) === name,
	);
	if (!found) throw new Error(`Missing guest member: ${name}`);
	return found;
}

function calls(node: ts.Node) {
	return descendants(node).filter(ts.isCallExpression);
}

function callNames(node: ts.Node) {
	return calls(node).map((call) => call.expression.getText(source));
}

function eventSequence(node: ts.Node) {
	return calls(node)
		.filter((call) => call.expression.getText(source) === "this.#dispatch")
		.map((call) => call.arguments[0]?.getText(source));
}

function branches() {
	const send = member("send");
	if (!ts.isMethodDeclaration(send) || !send.body)
		throw new Error("Missing send body");
	const synchronous = send.body.statements.find(ts.isIfStatement);
	const asyncCall = calls(send).find(
		(call) =>
			call.expression.getText(source) === "port.sendAsync(this.#request).then",
	);
	if (!synchronous || !asyncCall) throw new Error("Missing send branches");
	return { send, synchronous: synchronous.thenStatement, asyncCall };
}

it("parses the guest source without evaluating it", () => {
	const parsed = source as ts.SourceFile & {
		parseDiagnostics: readonly ts.Diagnostic[];
	};
	expect(parsed.parseDiagnostics).toEqual([]);
	expect(pageXmlHttpRequestBootstrapGlobal).toBe(
		"__agentBrowserXMLHttpRequestBootstrap",
	);
	expect(guestClass.name?.text).toBe("XMLHttpRequest");
});

it("finishes with undefined instead of exporting the guest global", () => {
	const completion = source.statements.at(-1);
	expect(completion && ts.isExpressionStatement(completion)).toBe(true);
	expect(completion?.getText(source)).toBe("void 0;");
});

it("guards all publication when the native bootstrap is absent", () => {
	expect(source.statements).toHaveLength(2);
	const guard = source.statements[0];
	if (!guard || !ts.isIfStatement(guard)) throw new Error("Missing guard");
	expect(guard.expression.getText(source)).toBe(
		'typeof __agentBrowserXMLHttpRequestBootstrap === "function"',
	);
	expect(guard.elseStatement).toBeUndefined();
	const publication = calls(guard).find(
		(call) =>
			call.expression.getText(source) === "Object.defineProperty" &&
			call.arguments[0]?.getText(source) === "globalThis",
	);
	expect(publication?.arguments[1]?.getText(source)).toBe('"XMLHttpRequest"');
	for (const property of [
		"value: XMLHttpRequest",
		"writable: true",
		"configurable: true",
		"enumerable: true",
	])
		expect(publication?.arguments[2]?.getText(source)).toContain(property);
	expect(
		callNames(source).filter((name) => name === "port.publish"),
	).toHaveLength(1);
	expect(pageXmlHttpRequestBootstrapSource).toContain(
		"port.publish(XMLHttpRequest);\n\t\treturn XMLHttpRequest;",
	);
});

it("passes no receiver, callbacks, events or bodies through the bootstrap port", () => {
	const portCalls = calls(source)
		.filter((call) => /^port\.[a-zA-Z]+$/.test(call.expression.getText(source)))
		.map((call) => [
			call.expression.getText(source),
			call.arguments.map((argument) => argument.getText(source)),
		]);
	expect(portCalls).toEqual([
		["port.create", []],
		["port.sendSync", ["this.#request"]],
		["port.sendAsync", ["this.#request"]],
		["port.publish", ["XMLHttpRequest"]],
	]);
	expect(pageXmlHttpRequestBootstrapSource).not.toMatch(
		/startCallback|retainGuestArguments|console\.|fetch\(/,
	);
});

it("keeps methods on a mutable guest prototype without shadowing publisher hooks", () => {
	for (const name of ["open", "send", "setRequestHeader", "abort"])
		expect(ts.isMethodDeclaration(member(name))).toBe(true);
	expect(pageXmlHttpRequestBootstrapSource).not.toMatch(
		/onsend|_open|_send|Object\.(freeze|seal)|this\.url/,
	);
	expect(member("#request").name?.kind).toBe(ts.SyntaxKind.PrivateIdentifier);
	expect(pageXmlHttpRequestBootstrapSource).toContain(
		"Object.defineProperties(XMLHttpRequest.prototype, constants)",
	);
	for (const [name, value] of [
		["UNSENT", 0],
		["OPENED", 1],
		["HEADERS_RECEIVED", 2],
		["LOADING", 3],
		["DONE", 4],
	])
		expect(pageXmlHttpRequestBootstrapSource).toContain(
			`${name}: { value: ${value}, enumerable: true }`,
		);
});

it("rejects credential arguments before converting or forwarding open arguments", () => {
	const text = member("open").getText(source);
	expect(
		text.indexOf("user !== undefined || password !== undefined"),
	).toBeLessThan(text.indexOf("this.#request.open("));
	expect(callNames(member("open"))).toEqual([
		"this.#request.open",
		"String",
		"String",
		"Boolean",
		"this.#dispatch",
	]);
	expect(text).toContain(
		"this.#request.open(String(method), String(url), Boolean(async))",
	);
});

it("prepares synchronously before either send branch and never returns a Promise", () => {
	const { send } = branches();
	expect(send.body?.statements[0]?.getText(source)).toBe(
		"const generation = this.#request.prepare(body);",
	);
	expect(
		send.modifiers?.some((value) => value.kind === ts.SyntaxKind.AsyncKeyword),
	).not.toBe(true);
	expect(descendants(send).some(ts.isAwaitExpression)).toBe(false);
	expect(
		descendants(send)
			.filter(ts.isReturnStatement)
			.every((value) => !value.expression),
	).toBe(true);
});

it("finishes synchronous native state before terminal events and lets errors propagate", () => {
	const { synchronous } = branches();
	expect(callNames(synchronous)).toEqual([
		"port.sendSync",
		"this.#current",
		"this.#request.advance",
		"this.#request.advance",
		"this.#dispatch",
		"this.#dispatch",
		"this.#dispatch",
	]);
	expect(
		calls(synchronous)
			.filter(
				(call) => call.expression.getText(source) === "this.#request.advance",
			)
			.map((call) =>
				call.arguments.map((argument) => argument.getText(source)),
			),
	).toEqual([
		["generation", "3"],
		["generation", "4"],
	]);
	expect(eventSequence(synchronous)).toEqual([
		'"readystatechange"',
		'"load"',
		'"loadend"',
	]);
	expect(descendants(synchronous).some(ts.isTryStatement)).toBe(false);
});

it("guards async loadstart before native work and each successful state/event boundary", () => {
	const { send, asyncCall } = branches();
	expect(send.getText(source)).toContain(
		'if (!this.#dispatch("loadstart", generation)) return;\n\t\t\t\tport.sendAsync',
	);
	const success = asyncCall.arguments[0];
	if (!success) throw new Error("Missing completion callback");
	expect(eventSequence(success)).toEqual([
		'"readystatechange"',
		'"readystatechange"',
		'"readystatechange"',
		'"load"',
		'"loadend"',
	]);
	expect(success.getText(source)).toContain(
		"completed !== generation || !this.#current(generation)",
	);
	expect(
		calls(success)
			.filter((call) => call.expression.getText(source) === "this.#dispatch")
			.slice(0, -1)
			.every(
				(call) =>
					ts.isPrefixUnaryExpression(call.parent) &&
					ts.isIfStatement(call.parent.parent),
			),
	).toBe(true);
});

it("maps current rejection to failure events without duplicate abort or fake success", () => {
	const failure = branches().asyncCall.arguments[1];
	if (!failure) throw new Error("Missing rejection callback");
	expect(failure.getText(source)).toContain(
		"if (!this.#current(generation)) return;",
	);
	expect(failure.getText(source)).toContain('if (failure === "abort") return;');
	expect(eventSequence(failure)).toEqual([
		'"readystatechange"',
		'failure === "timeout" ? "timeout" : "error"',
		'"loadend"',
	]);
});

it("invalidates native state before abort events and conditionally resets afterward", () => {
	const abort = member("abort");
	expect(callNames(abort)).toEqual([
		"this.#request.abort",
		"this.#dispatch",
		"this.#dispatch",
		"this.#dispatch",
		"this.#request.resetAbort",
	]);
	expect(eventSequence(abort)).toEqual([
		'"readystatechange"',
		'"abort"',
		'"loadend"',
	]);
	expect(abort.getText(source)).toContain("if (!active) return;");
	expect(
		calls(abort)
			.filter((call) => call.expression.getText(source) === "this.#dispatch")
			.every(
				(call) =>
					ts.isPrefixUnaryExpression(call.parent) &&
					ts.isIfStatement(call.parent.parent),
			),
	).toBe(true);
});

it("keeps bounded listener identity, once removal and dispatch snapshots in the guest", () => {
	const add = member("addEventListener").getText(source);
	expect(add).toContain(
		"entry.type === type && entry.listener === listener && entry.capture === capture",
	);
	expect(add.indexOf("this.#listeners.some")).toBeLessThan(
		add.indexOf("this.#listenerCount >= 32"),
	);
	expect(member("removeEventListener").getText(source)).toContain(
		"!entry.handler",
	);
	const dispatch = member("#dispatch").getText(source);
	expect(dispatch).toContain("this.#listeners.slice()");
	expect(dispatch).toContain("!entry.active || entry.type !== type");
	expect(dispatch.indexOf("if (entry.once) this.#remove(entry)")).toBeLessThan(
		dispatch.indexOf("entry.listener.call(this, event)"),
	);
	expect(dispatch).toContain("handleEvent.call(entry.listener, event)");
	expect(dispatch).toContain(
		"if (++this.#events > 8192) throw eventLimitError;",
	);
	expect(dispatch).toContain(
		"if (error === listenerLimitError || error === eventLimitError) throw error;",
	);
});

it("uses guest events with correct targets, reentrant checks and dispatch lifetime", () => {
	const dispatch = member("#dispatch").getText(source);
	expect(dispatch).toContain("get target() { return target; }");
	expect(dispatch).toContain(
		"get currentTarget() { return dispatching ? target : null; }",
	);
	expect(dispatch).toContain("finally {\n\t\t\t\t\tdispatching = false;");
	expect(dispatch.match(/!this\.#current\(generation\)/g)).toHaveLength(4);
	expect(dispatch).toContain("stopImmediatePropagation() { stopped = true; }");
	expect(dispatch).toContain("return this.#current(generation);");
});

it("keeps handler slots ordered with listeners and never shadows the custom send hook", () => {
	const block = guestClass.members.find(ts.isClassStaticBlockDeclaration);
	expect(block?.getText(source)).toContain(
		'Object.defineProperty(this.prototype, "on" + type',
	);
	expect(block?.getText(source)).toContain(
		"else if (existing) existing.listener = value;",
	);
	expect(block?.getText(source)).toContain("this.#listeners.push(entry)");
	expect(block?.getText(source)).toContain("delete this.#handlers[type]");
	const events = descendants(source).find(
		(node) =>
			ts.isVariableDeclaration(node) &&
			node.name.getText(source) === "eventTypes",
	);
	if (!events || !ts.isVariableDeclaration(events) || !events.initializer)
		throw new Error("Missing event types");
	expect(
		descendants(events.initializer)
			.filter(ts.isStringLiteral)
			.map((literal) => literal.text),
	).toEqual([
		"loadstart",
		"readystatechange",
		"progress",
		"load",
		"error",
		"timeout",
		"abort",
		"loadend",
	]);
});

it("exposes buffered text only and explicitly rejects unsupported upload and MIME APIs", () => {
	expect(member("response").getText(source)).toContain(
		"return this.#request.responseText",
	);
	expect(member("responseXML").getText(source)).toContain("return null");
	for (const name of ["upload", "overrideMimeType"])
		expect(descendants(member(name)).some(ts.isThrowStatement)).toBe(true);
	expect(member("#dispatch").getText(source)).toContain(
		"event.lengthComputable = false",
	);
});
