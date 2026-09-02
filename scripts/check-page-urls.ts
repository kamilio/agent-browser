import { loadBrowserDocument } from "../src/document-loader.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const requests: string[] = [];
const browser = new BrowserSession({
	createTransport: () => ({
		async request(input) {
			requests.push(input.url);
			const body = new TextEncoder().encode(
				'<base href="/assets/"><a id="next" href="page">next</a><script id="resource" type="application/json"></script>',
			);
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
			requests: requests.length,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: false,
		}),
		close() {},
	}),
	loadDocument: loadBrowserDocument,
});
let owner: PageScripts | undefined;
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}
async function evaluate(source: string) {
	if (!owner) throw new Error("Missing page owner");
	const result = await owner.evaluate(source);
	if (!result.ok)
		throw new Error(`Interpreted URL probe failed: ${result.error?.code}`);
	return result.value;
}
try {
	const tab = browser.createTab().id;
	await browser.navigate(tab, "https://fixture.invalid/start?q=1#initial");
	const page = browser.page(tab);
	owner = new PageScripts(page, core);
	check(
		"Actual SafeJS shares global, Window and document Location identity",
		(await evaluate(
			"return location === window.location && location === document.location;",
		)) === true,
	);
	check(
		"Location reads the actual document URL rather than the base URL",
		(await evaluate(
			'return location.href === "https://fixture.invalid/start?q=1#initial" && location.pathname === "/start" && location.search === "?q=1" && location.hash === "#initial" && location.origin === "https://fixture.invalid" && location.toString() === document.URL;',
		)) === true,
	);
	check(
		"Interpreted hyperlink getters resolve relative URLs and expose components",
		(await evaluate(
			'var link = document.querySelector("#next"); return link.href === "https://fixture.invalid/assets/page" && link.pathname === "/assets/page" && link.getAttribute("href") === "page" && link.toString() === link.href;',
		)) === true,
	);
	check(
		"DOM baseURI and hyperlink getters follow a changed base element",
		(await evaluate(
			'document.querySelector("base").setAttribute("href", "/changed/"); return document.baseURI === "https://fixture.invalid/changed/" && link.baseURI === document.baseURI && link.pathname === "/changed/page";',
		)) === true,
	);
	check(
		"Component writes update the actual link attribute without navigating",
		(await evaluate(
			'link.pathname = "/destination"; link.search = "q=two words"; link.hash = "part"; return link.href === "https://fixture.invalid/destination?q=two%20words#part" && link.getAttribute("href") === link.href && location.pathname === "/start";',
		)) === true && requests.length === 1,
	);
	check(
		"Resource URL reflection changes source attributes without fetching scripts",
		(await evaluate(
			'var resource = document.querySelector("#resource"); resource.src = "app.js"; return resource.src === "https://fixture.invalid/changed/app.js" && resource.getAttribute("src") === "app.js";',
		)) === true && requests.length === 1,
	);
	check(
		"Window Location replacement rejects unsupported URL schemes",
		(await evaluate(
			'try { window.location = "javascript:blocked"; return false; } catch (error) { return location.pathname === "/start"; }',
		)) === true,
	);
	check(
		"Document Location replacement rejects unsupported URL schemes",
		(await evaluate(
			'try { document.location = "file:///blocked"; return false; } catch (error) { return location.pathname === "/start"; }',
		)) === true,
	);
	check(
		"Location URL writes reject embedded credentials",
		(await evaluate(
			'try { location.href = "https://user:secret@fixture.invalid/"; return false; } catch (error) { return location.pathname === "/start"; }',
		)) === true,
	);
	check(
		"Location assign rejects malformed URLs without transport activity",
		(await evaluate(
			'try { location.assign("http://["); return false; } catch (error) { return true; }',
		)) === true && requests.length === 1,
	);
	check(
		"Global Location assignment cannot silently replace the URL capability",
		(await evaluate(
			'try { location = "/no"; return false; } catch (error) { return location.pathname === "/start"; }',
		)) === true,
	);
	await browser.navigate(tab, "https://fixture.invalid/start?q=1#changed");
	check(
		"Same-document navigation keeps the realm and updates Location",
		(await evaluate(
			'return location.hash === "#changed" && document.URL === location.href;',
		)) === true &&
			requests.length === 1 &&
			browser.page(tab).document === page.document,
	);
	const reference = page.document.reference(
		page.queries.querySelector("#next") as number,
	);
	const action = await browser.click(tab, reference);
	check(
		"Following the script-mutated link loads its actual destination",
		requests.length === 2 &&
			requests[1] ===
				"https://fixture.invalid/destination?q=two%20words#part" &&
			action !== undefined,
	);
	check(
		"Document replacement revokes the old page URL capability",
		owner.closed,
	);
	let revoked = false;
	try {
		await owner.evaluate("return location.href;");
	} catch {
		revoked = true;
	}
	check(
		"The old realm rejects evaluation of its retained Location after replacement",
		revoked,
	);
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"Existing experimental SafeJS core, actual DOM/URL/session code and in-memory transport. No live HTTP, DNS, server, PTY, published-SDK migration or service activation.",
				checks,
			},
			null,
			2,
		),
	);
} finally {
	browser.close();
	await owner?.close();
}
