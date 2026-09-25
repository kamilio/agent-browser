import { BrowserCommandHost } from "../src/command-host.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { DocumentQueries } from "../src/selectors.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
let requests = 0;
let transportClosed = false;
const session = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests++;
			return {
				url: input.url,
				status: 200,
				headers: {},
				body: new Uint8Array(),
				redirects: [],
				encodedBytes: 0,
				elapsedMs: 0,
			};
		},
		metrics: () => ({
			requests,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: transportClosed,
		}),
		close() {
			transportClosed = true;
		},
	}),
	loadDocument: (response) =>
		parseHtmlDocument(
			'<h1 id="result">Waiting</h1><input id="payload" value="Hello"><button id="encode">Encode</button>',
			response.url,
		),
});
const host = new BrowserCommandHost({ createSession: () => session });
await host.execute(["open", "https://fixture.invalid/base64"]);
const loaded = session.page(session.tabs()[0].id);
const page = new PageScripts(loaded, core);
const queries = new DocumentQueries(loaded.document);
const checks: { label: string; passed: boolean }[] = [];
const observations: Record<string, unknown> = {};
const compatibility: { label: string; passed: boolean; result: unknown }[] = [];
let passed = false;
function check(label: string, condition: boolean) {
	checks.push({ label, passed: condition });
	if (!condition) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await guest(
		"Global, Window and self calls use binary-string base64",
		'return btoa("Hello") === "SGVsbG8=" && window.atob("AP+A") === "\\x00\\xff\\x80" && self.btoa("\\xff") === "/w==";',
	);
	await guest(
		"Forgiving decoding accepts ASCII whitespace and unused bits",
		'return atob(" Z\\tg\\n=\\f=\\r ") === "f" && atob("Zh") === "f" && atob("Zm/=") === "fo";',
	);
	await guest(
		"Primitive conversion and detached global calls remain usable",
		'var detachedEncoder = btoa; return atob("Zg") === "f" && detachedEncoder(null) === "bnVsbA==" && detachedEncoder(undefined) === "dW5kZWZpbmVk" && detachedEncoder(123) === "MTIz";',
	);
	await guest(
		"Invalid encodings and non-byte characters are catchable",
		'var rejected = 0; try { atob("A==="); } catch (error) { rejected++; } try { btoa("\\u0100"); } catch (error) { rejected++; } try { atob(); } catch (error) { rejected++; } return rejected === 3 && atob("Zg") === "f";',
	);
	const errors = await page.evaluate(
		'var names = []; try { atob("!"); } catch (error) { names.push(error.name); } try { btoa(); } catch (error) { names.push(error.name); } return names;',
	);
	observations.guestErrorNames = errors;
	check(
		"Guest errors retain InvalidCharacterError and TypeError names",
		errors.ok &&
			JSON.stringify(errors.value) === '["InvalidCharacterError","TypeError"]',
	);
	await guest(
		"Guest listener encodes live form values into the shared DOM",
		'var payload = document.getElementById("payload"); var result = document.getElementById("result"); document.getElementById("encode").addEventListener("click", function(){ result.textContent = btoa(payload.value); }); return result.textContent === "Waiting";',
	);
	const input = queries.querySelector("#payload");
	const button = queries.querySelector("#encode");
	if (input === null || button === null)
		throw new Error("Missing fixture controls");
	await host.execute([
		"fill",
		loaded.document.reference(input),
		"Agent browser",
	]);
	await host.execute(["click", loaded.document.reference(button)]);
	await guest(
		"Agent fill/click runs guest base64 against the same document",
		'return result.textContent === "QWdlbnQgYnJvd3Nlcg==" && window.atob(result.textContent) === payload.value;',
	);
	await guest(
		"Repeated calls retain valid outputs",
		'var valid = true; for (var index = 0; index < 16; index++) { valid = valid && atob(btoa("entry" + index)) === "entry" + index; } return valid;',
	);
	for (const [label, source] of [
		[
			"Window/global function identity",
			"return atob === window.atob && btoa === window.btoa;",
		],
		[
			"Detached Window method invocation",
			'try { var detachedDecoder = window.atob; return detachedDecoder("Zg") === "f"; } catch (error) { return error.name + ": " + error.message; }',
		],
	]) {
		const result = await page.evaluate(source);
		compatibility.push({
			label,
			passed: result.ok && result.value === true,
			result: result.ok ? result.value : result.error,
		});
	}
	check("Only one synthetic document request occurs", requests === 1);
	await page.close();
	await host.close();
	check(
		"Page, document queries and transport close",
		page.closed && queries.metrics().closed && transportClosed,
	);
	passed = true;
} finally {
	await page.close();
	queries.close();
	await host.close();
	const compatibilityPassed =
		passed &&
		compatibility.length === 2 &&
		compatibility.every((check) => check.passed);
	if (!compatibilityPassed) process.exitCode = 1;
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed: compatibilityPassed,
				functionalPassed: passed,
				checks,
				compatibility,
				observations,
				requests,
				page: page.metrics(),
				fixture:
					"Existing experimental SafeJS, real command host and native document with synthetic transport; no sockets or public-site requests",
				limitations:
					"Functional binary-string encoding and interactions, not released-SDK, throughput, public-site or deployment acceptance",
			},
			null,
			2,
		),
	);
}
