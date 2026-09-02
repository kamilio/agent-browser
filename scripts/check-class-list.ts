import { readFile } from "node:fs/promises";
import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { documentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";
import { renderSnapshot } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const html = await readFile(
	new URL("../../fixtures/class-list-ui.html", import.meta.url),
	"utf8",
);
const owners = new Map<DocumentTree, PageScripts>();
let requests = 0;
const browser = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests++;
			const body = new TextEncoder().encode(html);
			return {
				url: input.url,
				status: 200,
				headers: { "content-type": ["text/html"] },
				body,
				redirects: [],
				encodedBytes: body.length,
				elapsedMs: 0,
			};
		},
		metrics: () => ({
			requests,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: false,
		}),
		close() {},
	}),
	loadDocument: (response, context) =>
		loadBrowserDocument(response, {
			...context,
			scripts: new ScriptLoader({
				response,
				signal: context.signal,
				owner: (tree) => {
					const owner = new PageScripts(
						{ document: tree, interactions: documentInteractions(tree) },
						core,
					);
					owners.set(tree, owner);
					return owner;
				},
			}),
		}),
});
const tab = browser.createTab().id;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	const owner = owners.get(browser.page(tab).document);
	if (!owner) throw new Error("Missing class-list page owner");
	const result = await owner.evaluate(source);
	if (!result.ok)
		throw new Error(`Class-list evaluation failed: ${result.error?.code}`);
	return result.value;
}
function reference(selector: string) {
	const page = browser.page(tab);
	const target = page.queries.querySelector(selector);
	if (target === null) throw new Error("Missing class-list action target");
	return page.document.reference(target);
}
try {
	await browser.navigate(tab, "https://fixture.invalid/classes");
	check(
		"Parser-time code receives stable classList identity and raw token values",
		(await evaluate(
			'var tokenClasses = document.getElementById("tokens").classList; return secretClasses === document.getElementById("secret").classList && tokenClasses.value === " a a b " && tokenClasses.length === 2;',
		)) === true,
	);
	check(
		"Class-dependent CSS excludes the concealed action from the semantic snapshot",
		!renderSnapshot(browser.snapshot(tab)).includes("Private action"),
	);
	let blocked = false;
	try {
		await browser.click(tab, reference("#secret"));
	} catch (error) {
		blocked =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check("The native action path refuses a class-concealed button", blocked);
	const savedReference = reference("#secret");
	await browser.click(tab, reference("#reveal"));
	check(
		"Interpreted class toggling changes the actual CSS visibility and preserves its node reference",
		renderSnapshot(browser.snapshot(tab)).includes("Private action") &&
			reference("#secret") === savedReference &&
			requests === 1,
	);
	await browser.click(tab, savedReference);
	check(
		"The revealed native action runs its interpreted handler and class replacement",
		(await evaluate(
			'return document.getElementById("status").textContent === "Activated" && document.getElementById("status").classList.contains("activated");',
		)) === true,
	);
	check(
		"Indexed reads, for-of and Array.from use the live unique token sequence",
		(await evaluate(
			'var seen = []; for (var token of tokenClasses) seen.push(token); return tokenClasses[0] === "a" && tokenClasses[2] === undefined && tokenClasses.item(2) === null && seen.join(",") === "a,b" && Array.from(tokenClasses).join(",") === "a,b";',
		)) === true,
	);
	check(
		"Multi-token validation leaves the attribute unchanged on failure",
		(await evaluate(
			'var before = tokenClasses.value; var rejected = false; try { tokenClasses.add("valid", "bad token"); } catch (error) { rejected = true; } return rejected && tokenClasses.value === before;',
		)) === true,
	);
	check(
		"Forwarded classList assignment keeps object identity and normalizes only on mutation",
		(await evaluate(
			'document.getElementById("tokens").classList = " a a b c "; var raw = tokenClasses.value; tokenClasses.replace("a", "c"); return document.getElementById("tokens").classList === tokenClasses && raw === " a a b c " && tokenClasses.value === "c b";',
		)) === true,
	);
	check(
		"Saved lists follow ordinary className writes and token removal during iteration",
		(await evaluate(
			'document.getElementById("tokens").className = "a b c"; var removed = []; for (var current of tokenClasses) { removed.push(current); tokenClasses.remove(current); } return removed.join(",") === "a,c" && tokenClasses.value === "b";',
		)) === true,
	);
	check(
		"Undefined force is omitted and read-only queries do not reject invalid token strings",
		(await evaluate(
			'tokenClasses.value = "a"; var first = tokenClasses.toggle("a", undefined); var second = tokenClasses.toggle("a", undefined); return first === false && second === true && tokenClasses.contains("") === false && tokenClasses.contains("a b") === false;',
		)) === true,
	);
	check(
		"Detached nodes retain live token mutation while class vocabularies remain unrestricted",
		(await evaluate(
			'var detached = document.createElement("span"); var detachedClasses = detached.classList; detachedClasses.add("custom"); var unsupported = false; try { detachedClasses.supports("custom"); } catch (error) { unsupported = true; } return unsupported && detached.className === "custom" && detachedClasses.contains("custom");',
		)) === true,
	);
	await evaluate('secretClasses.add("concealed"); return true;');
	check(
		"Rehiding through classList updates the semantic view without a new response",
		!renderSnapshot(browser.snapshot(tab)).includes("Private action") &&
			requests === 1,
	);
	check(
		"Read-only token indices and length cannot disguise the underlying sequence",
		(await evaluate(
			'tokenClasses.value = "a b"; try { tokenClasses[0] = "forged"; } catch (error) {} try { tokenClasses.length = 99; } catch (error) {} return tokenClasses[0] === "a" && tokenClasses.length === 2 && tokenClasses.contains("forged") === false;',
		)) === true,
	);
	const previous = owners.get(browser.page(tab).document);
	await browser.reload(tab);
	check(
		"Document replacement revokes the old class-list owner and releases its cache",
		previous?.closed === true &&
			previous.metrics().dom?.classLists.closed === true &&
			previous.metrics().dom?.classLists.lists === 0 &&
			previous.metrics().dom?.classLists.cachedCodeUnits === 0,
	);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"Existing experimental SafeJS, self-authored fixture, actual parser/DOM/CSS/snapshots and native agent clicks over in-memory responses. No public site, external browser, PTY, service activation or released-SDK verification. DOMTokenList constructors/prototypes, full iterator helper methods and exception identity are not claimed.",
				checks,
			},
			null,
			2,
		),
	);
} finally {
	browser.close();
	await Promise.all([...owners.values()].map((owner) => owner.close()));
}
