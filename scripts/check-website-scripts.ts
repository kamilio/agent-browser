import { createServer } from "node:http";
import type { ScriptLoadReport } from "../src/document-script-state.js";
import { AgentBrowserError } from "../src/errors.js";
import { BrowserSessionProcess } from "../src/node-session-process.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import type { NavigationResult } from "../src/session.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean; error?: string }[] = [];
const sites: {
	url: string;
	navigation: boolean;
	scripts?: ScriptLoadReport;
	error?: string;
	acceptance: string;
	elapsedMs?: number;
	timeoutSource?: string;
}[] = [];
const actors: BrowserSessionProcess[] = [];
const requests: string[] = [];
const markup = `<!doctype html><html><head><title>Automatic scripts fixture</title><script id="head-source">
let stages = [];
let headSawNoBody = document.body === null;
let headScriptIdentity = document.currentScript.id === "head-source";
let loadCurrentNull = false;
document.addEventListener("DOMContentLoaded", function() { stages.push("dom"); document.getElementById("status").textContent = "Automatic page scripts ready"; });
window.addEventListener("load", function() { stages.push("load"); loadCurrentNull = document.currentScript === null; });
</script><script id="deferred-source" defer src="/deferred.js"></script><script id="async-source" async src="/async.js"></script></head><body>
<h1 id="status">Before scripts</h1><button id="action">Change heading</button><script>
let bodySawFuture = document.getElementById("future") === null;
stages.push("body");
document.getElementById("action").addEventListener("click", function() { document.getElementById("status").textContent = "Native action reached page script"; });
</script><p id="future">Parsed after the body script</p><script type="application/json">{"inert":true}</script><noscript><script>throw new Error("must not execute")</script></noscript></body></html>`;
const website = createServer((request, response) => {
	requests.push(request.url ?? "");
	response.setHeader(
		"content-type",
		request.url?.endsWith(".js")
			? "text/javascript; charset=utf-8"
			: "text/html; charset=utf-8",
	);
	if (request.url === "/deferred.js")
		response.end(
			'stages.push("defer"); let deferredInteractive = document.readyState === "interactive"; let deferredSawFuture = document.getElementById("future") !== null;',
		);
	else if (request.url === "/write-child.js")
		response.end(
			'let childSawNoOriginal = document.getElementById("original") === null; document.write("<i id=child-insert>child</i>");',
		);
	else if (request.url === "/write")
		response.end(String.raw`<!doctype html><body><script id="writer">
document.write('<section id="wr');
document.write('itten">');
let sawWrittenSection = document.getElementById("written") !== null;
document.writeln("one", 2);
document.write('<script src="/write-child.js"><\/script><b id="after-child">tail</b>');
let pausedBeforeChild = document.getElementById("after-child") === null;
document.write('<em id="later-write">more</em></section>');
</script><p id="original">original</p>`);
	else if (request.url === "/write-inline")
		response.end(
			String.raw`<script>document.write('<script>let unsupportedNested = true;<\/script>');</script>`,
		);
	else if (request.url === "/dates")
		response.end(`<button id="date-action">Advance date</button><h1 id="date-result">Before date action</h1><script>
let pageDate = new Date("2000-02-29T12:34:56.789Z");
let validDateClock = Number.isFinite(Date.now()) && Math.abs(Date.now() - +new Date()) < 1000;
let validDateType = pageDate instanceof Date && Object.prototype.toString.call(pageDate) === "[object Date]";
let validDateValue = pageDate.toISOString() === "2000-02-29T12:34:56.789Z" && pageDate - new Date(0) === 951827696789;
let validDateJSON = JSON.stringify([new Date(0), new Date(NaN)]) === '["1970-01-01T00:00:00.000Z",null]';
document.getElementById("date-action").addEventListener("click", function() {
  pageDate.setUTCFullYear(2001);
  document.getElementById("date-result").textContent = pageDate.toISOString();
});
</script>`);
	else if (request.url === "/attributes")
		response.end(`<button id="attribute-action">Change attribute</button><h1 id="attribute-result" hidden>Attribute action reached the document</h1><script>
let attributeTarget = document.getElementById("attribute-result");
let attributeMap = attributeTarget.attributes;
let hiddenAttribute = attributeTarget.getAttributeNode("hidden");
let initialAttributeIdentity = attributeMap === attributeTarget.attributes && hiddenAttribute === attributeMap.hidden && hiddenAttribute === attributeMap[1] && hiddenAttribute.nodeType === 2 && hiddenAttribute.ownerElement === attributeTarget && hiddenAttribute.ownerDocument === document && hiddenAttribute.specified;
let attributeEnumeration = Object.keys(attributeMap).join(",") === "0,1" && Array.from(attributeMap)[1] === hiddenAttribute && "hidden" in attributeMap;
attributeTarget.setAttribute("data-live", "one");
let liveAttribute = attributeMap["data-live"];
liveAttribute.value = "two";
let attributeReflection = attributeTarget.getAttribute("data-live") === "two" && attributeMap.length === 3;
attributeTarget.removeAttribute("data-live");
attributeTarget.setAttribute("data-live", "three");
let detachedIdentity = liveAttribute.ownerElement === null && liveAttribute.value === "two" && attributeMap["data-live"] !== liveAttribute;
let replacementAttribute = document.createAttribute("data-live"); replacementAttribute.value = "four";
let replacedAttribute = attributeMap.setNamedItem(replacementAttribute);
let replacementIdentity = replacedAttribute.value === "three" && replacedAttribute.ownerElement === null && attributeMap["data-live"] === replacementAttribute;
document.getElementById("attribute-action").addEventListener("click", function() {
  attributeTarget.removeAttributeNode(hiddenAttribute);
  replacementAttribute.value = "action";
});
</script>`);
	else if (request.url === "/inline-styles")
		response.end(`<style>#style-result { display: none!important }</style><button id="style-action">Reveal result</button><h1 id="style-result">Inline styles reached the owned document</h1><script>
let styled = document.createElement("div");
styled.setAttribute("style", "top:1px;float:left;opacity:.5;display:block!important;display:none");
let inline = styled.style;
let parsedStyle = inline === styled.style && inline.top === "1px" && inline.cssFloat === "left" && inline.opacity === "0.5" && inline.display === "block" && inline.getPropertyPriority("display") === "important";
inline.cssText = "margin: 1px 2px; --Tone: initial; width:0";
inline.setProperty("--Tone", "changed", "important");
let styleMembers = inline.length === 6 && inline[0] === "margin-top" && inline.item(3) === "margin-left" && inline.item(99) === "" && inline[99] === undefined && inline.margin === "1px 2px" && inline.width === "0px";
let styleIteration = Array.from(inline).join(",") === "margin-top,margin-right,margin-bottom,margin-left,--Tone,width";
styled.setAttribute("style", "display:none");
let reflectedStyle = inline.display === "none" && inline.width === "";
styled.style = "opacity:.25";
let forwardedStyle = styled.style === inline && inline.opacity === "0.25";
let clonedStyle = styled.cloneNode().style;
clonedStyle.opacity = "0.75";
let independentStyle = clonedStyle !== inline && inline.opacity === "0.25";
document.getElementById("style-action").addEventListener("click", function() {
  document.getElementById("style-result").style.setProperty("display", "block", "important");
});
</script>`);
	else if (request.url === "/collections")
		response.end(`<main id="list"><p id="first" class="entry hot">one</p><section><p name="second" class="entry">two</p></section>text</main><button id="collection-action">Remove entry</button><h1 id="collection-status">Before</h1><script>
let collectionRoot = document.getElementById("list");
let tags = collectionRoot.getElementsByTagName("P");
let classes = collectionRoot.getElementsByClassName("entry hot");
let children = collectionRoot.children;
let initialCollections = tags.length === 2 && classes.length === 1 && children.length === 2 && tags[0] === document.getElementById("first");
let newEntry = document.createElement("p"); newEntry.id = "added"; newEntry.className = "entry hot"; newEntry.textContent = "three";
collectionRoot.appendChild(newEntry);
let liveCollections = tags.length === 3 && classes.length === 2 && children.length === 3 && children === collectionRoot.children;
let indexedIdentity = tags.item(2) === newEntry && tags[2] === newEntry && tags.namedItem("added") === newEntry && tags.namedItem("second") === tags[1] && tags[99] === undefined && tags.item(99) === null;
let iteratedEntries = 0; for (let entry of tags) { if (entry.tagName === "P") iteratedEntries++; }
let collectionIteration = iteratedEntries === 3 && Array.from(tags)[2] === newEntry && Object.keys(tags).join(",") === "0,1,2";
document.getElementById("collection-action").addEventListener("click", function() {
  tags[0].remove(); newEntry.className = "entry";
  document.getElementById("collection-status").textContent = "Live collection: " + tags.length + " entries, " + classes.length + " hot";
});
</script>`);
	else if (request.url === "/functions")
		response.end(`<h1 id="status">Constructor fixture ready</h1><button id="increment">Increment</button><script>
function Counter(value) { this.value = value; }
Counter.label = "page counter";
Counter.prototype.increment = function() { this.value++; return this.value; };
let counter = new Counter(1);
function Derived() {} Derived.prototype = new Counter(9);
let derived = new Derived();
let validInheritance = counter instanceof Counter && derived instanceof Counter && derived instanceof Derived;
let inspect = ({}).toString;
let inspectedTypes = [inspect.call([]), inspect.call(counter), inspect.call(Counter)].join(",");
let inheritedCounter = Object.create(counter);
let validObjectPrototype = Object.getPrototypeOf(inheritedCounter) === counter &&
  counter.isPrototypeOf(inheritedCounter) && inheritedCounter instanceof Counter &&
  !inheritedCounter.hasOwnProperty("value") && counter.propertyIsEnumerable("value");
let dictionary = Object.create(null);
let nullPrototypeIsolated = Object.getPrototypeOf(dictionary) === null && dictionary.toString === undefined;
document.getElementById("increment").addEventListener("click", function() {
  document.getElementById("status").textContent = Counter.label + ": " + counter.increment();
});
</script>`);
	else if (request.url === "/console")
		response.end(`<h1>Page console fixture</h1><script>
let sameConsole = console === window.console;
console.log("fixture log", 42, { answer: true });
console.info("fixture info");
console.warn("fixture warning");
console.error("fixture error");
console.debug("fixture debug");
console.assert(false, "fixture assertion");
console.log(document, document.body);
</script>`);
	else if (request.url === "/innerhtml")
		response.end(String.raw`<h1>HTML content fixture</h1><main id="panel"><b id="old">Old content</b></main><table id="table"></table><script>
let panel = document.getElementById("panel");
let oldContent = document.getElementById("old");
panel.innerHTML = '<button id="generated">Generated &amp; ready</button><p id="result">Before action</p><script src="/fragment-inert.js"><\/script>';
let generated = document.getElementById("generated");
let generatedIdentity = generated.ownerDocument === document && generated.parentNode === panel && oldContent.parentNode === null && oldContent.textContent === "Old content";
generated.addEventListener("click", function() { document.getElementById("result").innerHTML = '<strong id="changed">HTML action reached page script</strong>'; });
document.getElementById("table").innerHTML = '<tr><td>Cell one</td><td>Cell two</td></tr>';
let tableContext = document.querySelectorAll("#table > tbody > tr > td").length === 2;
let serializedHtml = generated.outerHTML === '<button id="generated">Generated &amp; ready</button>' && panel.innerHTML.indexOf('src="/fragment-inert.js"') >= 0;
</script>`);
	else if (request.url === "/fragments")
		response.end(`<h1>DOM fragment fixture</h1><main id="mount"></main><script>
let fragment = document.createDocumentFragment();
let originalButton = document.createElement("button");
originalButton.id = "original-button";
originalButton.textContent = "Original";
let originalCalls = 0;
let copyCalls = 0;
originalButton.addEventListener("click", function() { originalCalls++; });
fragment.appendChild(originalButton);
let clonedFragment = fragment.cloneNode(true);
let copiedButton = clonedFragment.querySelector("button");
copiedButton.id = "copied-button";
copiedButton.textContent = "Copied";
copiedButton.addEventListener("click", function() { copyCalls++; });
let fragmentWasDetached = fragment.nodeType === 11 && fragment.nodeName === "#document-fragment" && fragment.parentNode === null && fragment.ownerDocument === document && !fragment.isConnected && document.getElementById("original-button") === null && fragment.getElementById("original-button") === originalButton;
let mount = document.getElementById("mount");
let appendIdentity = mount.appendChild(fragment) === fragment;
mount.appendChild(clonedFragment);
let transferred = fragment.firstChild === null && clonedFragment.firstChild === null && originalButton.parentNode === mount && copiedButton.parentNode === mount && originalButton.isConnected && copiedButton.isConnected;
let independent = originalButton !== copiedButton && originalButton.textContent === "Original" && copiedButton.textContent === "Copied";
let radio = document.createElement("input");
radio.setAttribute("type", "radio");
radio.setAttribute("name", "cloned-radio");
radio.checked = true;
let copiedRadio = radio.cloneNode();
let detachedRadios = radio.checked && copiedRadio.checked && copiedRadio.getRootNode() === copiedRadio;
let radioFragment = document.createDocumentFragment();
radioFragment.appendChild(radio);
radioFragment.appendChild(copiedRadio);
radio.checked = true;
let groupedRadios = radio.checked && !copiedRadio.checked && radio.getRootNode() === radioFragment;
mount.appendChild(radioFragment);
let connectedRadios = radio.checked && !copiedRadio.checked && radio.getRootNode() === document;
</script>`);
	else if (request.url === "/async.js")
		setTimeout(
			() =>
				response.end(
					'stages.push("async"); let asyncScriptIdentity = document.currentScript.id === "async-source";',
				),
			100,
		);
	else if (request.url === "/cpu-block")
		response.end(`<h1>Readable before CPU timeout</h1><script>
let retained = [];
for (let index = 0; index < 250; index++) retained.push({ label: "retained", count: index, nested: { text: "state" } });
while (true) {}
</script><p>Parser continued after CPU timeout</p><a id="cpu-recover" href="/">Recover navigation</a>`);
	else if (request.url === "/error")
		response.end(
			'<h1>Readable after script failure</h1><script>throw new Error("fixture source failure")</script><script>let shouldNotRun = true;</script>',
		);
	else if (request.url === "/csp") {
		response.setHeader("content-security-policy", "script-src 'none'");
		response.end(markup);
	} else response.end(markup);
});

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Probe assertion failed");
}
async function evaluate(actor: BrowserSessionProcess, source: string) {
	const result = (await actor.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error(`Evaluation failed: ${result.error?.code}`);
	return result.value;
}

try {
	const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
	if (!packageRoot)
		throw new AgentBrowserError(
			"invalid-input",
			"Select the compiled extended SafeJS package explicitly",
		);
	await new Promise<void>((resolve, reject) => {
		website.once("error", reject);
		website.listen(0, "127.0.0.1", resolve);
	});
	const address = website.address();
	if (!address || typeof address === "string")
		throw new Error("Missing fixture listener");
	const origin = `http://127.0.0.1:${address.port}`;
	const actor = await BrowserSessionProcess.create({
		packageRoot,
		websiteScripts: "classic",
		network: { allowPrivateOrigins: [origin] },
	});
	actors.push(actor);
	const result = await actor.execute(["open", origin]);
	const navigation = (result.data as { navigation: NavigationResult })
		.navigation;
	check(
		"Actual owned-process navigation automatically executes inline, deferred and async script resources",
		navigation.html?.scripting === true &&
			navigation.scripts?.executed === 4 &&
			navigation.scripts.complete &&
			!navigation.scripts.halted,
	);
	check(
		"Head/body scripts observe parser boundaries rather than a prebuilt DOM",
		(await evaluate(
			actor,
			"headSawNoBody && bodySawFuture && deferredSawFuture && deferredInteractive",
		)) === true,
	);
	check(
		"Scripts and load handlers see their expected currentScript identity",
		(await evaluate(
			actor,
			"headScriptIdentity && asyncScriptIdentity && loadCurrentNull && document.currentScript === null",
		)) === true,
	);
	check(
		"Deferred, DOMContentLoaded, async and load phases execute in the fixture's expected order",
		(await evaluate(actor, 'stages.join(",")')) === "body,defer,dom,async,load",
	);
	check(
		"Native text output includes automatically generated page state",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"Automatic page scripts ready",
		),
	);
	await actor.execute(["click", "#action"]);
	check(
		"Native commands dispatch listeners installed by website scripts",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"Native action reached page script",
		),
	);
	check(
		"Data blocks and noscript markup are not executed",
		navigation.scripts?.discovered === 5 && navigation.scripts.skipped === 1,
	);
	await actor.execute(["reload"]);
	check(
		"Reload creates a fresh realm and re-executes that document's scripts once",
		(await evaluate(actor, 'stages.join(",")')) === "body,defer,dom,async,load",
	);
	const before = requests.length;
	const blocked = (await actor.execute(["goto", `${origin}/csp`]))
		.data as NavigationResult;
	check(
		"CSP does not silently permit script fetch or execution",
		blocked.scripts?.executed === 0 &&
			blocked.scripts.issues["csp-not-supported"] === 4 &&
			requests.length === before + 1,
	);
	const failed = (await actor.execute(["goto", `${origin}/error`]))
		.data as NavigationResult;
	check(
		"Source failure reports a halted realm while retaining readable HTML",
		failed.scripts?.halted === true &&
			failed.scripts.failed === 1 &&
			((await actor.execute(["text"])).data as { text: string }).text.includes(
				"Readable after script failure",
			),
	);
	check(
		"A halted page retains sanitized evaluation diagnostics for agents",
		(
			(await actor.execute(["console", "error"])).data as {
				entries: { source: string; text: string }[];
			}
		).entries.some(
			(entry) =>
				entry.source === "evaluation" && entry.text.includes("failed:"),
		),
	);
	await actor.execute(["goto", origin]);
	check(
		"Navigation recovers from a halted page using a new document and realm",
		(await evaluate(actor, "headSawNoBody && deferredInteractive")) === true,
	);
	const cpuPage = (await actor.execute(["goto", `${origin}/cpu-block`]))
		.data as NavigationResult;
	const cpuText = ((await actor.execute(["text"])).data as { text: string })
		.text;
	check(
		"CPU-only script timeout preserves readable HTML and lets the parser finish",
		cpuPage.scripts?.halted === true &&
			cpuPage.scripts.issues["execution-timeout"] === 1 &&
			cpuText.includes("Readable before CPU timeout") &&
			cpuText.includes("Parser continued after CPU timeout"),
	);
	await actor.execute(["click", "#cpu-recover"]);
	check(
		"A native link recovers from CPU timeout without replacing the owned actor",
		(await evaluate(actor, "headSawNoBody && deferredInteractive")) === true,
	);
	const written = (await actor.execute(["goto", `${origin}/write`]))
		.data as NavigationResult;
	check(
		"Document write uses the real parser and loads its written external script",
		written.scripts?.executed === 2 &&
			!written.scripts.halted &&
			(await evaluate(
				actor,
				'sawWrittenSection && pausedBeforeChild && childSawNoOriginal && document.getElementById("written").textContent === "one2\\nchildtailmore"',
			)) === true,
	);
	let nestedRejected = false;
	try {
		await actor.execute(["goto", `${origin}/write-inline`]);
	} catch (error) {
		nestedRejected =
			error instanceof AgentBrowserError && error.code === "unsupported";
	}
	check(
		"Unsupported nested inline writes reject rather than pretending synchronous execution",
		nestedRejected,
	);
	const late = (await actor.execute(["eval", 'document.write("replacement")']))
		.data as ScriptEvaluation;
	check(
		"Post-parse writes fail without replacing the prior readable document",
		!late.ok &&
			((await actor.execute(["text"])).data as { text: string }).text.includes(
				"one2",
			),
	);
	const fragments = (await actor.execute(["goto", `${origin}/fragments`]))
		.data as NavigationResult;
	check(
		"Page scripts create, clone, query and transfer real DOM fragments",
		fragments.scripts?.executed === 1 &&
			!fragments.scripts.halted &&
			(await evaluate(
				actor,
				"fragmentWasDetached && appendIdentity && transferred && independent",
			)) === true,
	);
	await actor.execute(["click", "#copied-button"]);
	check(
		"Cloned radio controls retain root-scoped state before and after fragment transfer",
		(await evaluate(
			actor,
			"detachedRadios && groupedRadios && connectedRadios",
		)) === true,
	);
	check(
		"Cloned buttons receive native actions without copying original listeners",
		(await evaluate(actor, "originalCalls === 0 && copyCalls === 1")) === true,
	);
	await actor.execute(["click", "#original-button"]);
	check(
		"Original listeners and rendered clone content remain independent",
		(await evaluate(actor, "originalCalls === 1 && copyCalls === 1")) ===
			true &&
			((await actor.execute(["text"])).data as { text: string }).text.includes(
				"Copied",
			),
	);
	const htmlContent = (await actor.execute(["goto", `${origin}/innerhtml`]))
		.data as NavigationResult;
	check(
		"Real page scripts replace and serialize context-aware HTML without executing inserted scripts",
		htmlContent.scripts?.executed === 1 &&
			!htmlContent.scripts.halted &&
			(await evaluate(
				actor,
				"generatedIdentity && tableContext && serializedHtml",
			)) === true &&
			!requests.includes("/fragment-inert.js"),
	);
	await actor.execute(["click", "#generated"]);
	check(
		"Native clicks reach controls created by innerHTML and expose subsequent HTML mutations",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"HTML action reached page script",
		) &&
			(await evaluate(
				actor,
				'document.getElementById("changed").outerHTML',
			)) === '<strong id="changed">HTML action reached page script</strong>',
	);
	check(
		"The HTML command serializes the live post-action tree rather than downloaded source",
		((await actor.execute(["html", "#changed"])).data as { html: string })
			.html === '<strong id="changed">HTML action reached page script</strong>',
	);
	const consolePage = (await actor.execute(["goto", `${origin}/console`]))
		.data as NavigationResult;
	const logs = (await actor.execute(["console", "debug"])).data as {
		entries: { level: string; text: string }[];
	};
	check(
		"Actual page console methods share Window identity and capture bounded structured values",
		consolePage.scripts?.executed === 1 &&
			!consolePage.scripts.halted &&
			(await evaluate(actor, "sameConsole")) === true &&
			logs.entries.length === 7 &&
			logs.entries.some(
				(entry) =>
					entry.text.includes("fixture log 42") &&
					entry.text.includes('"answer": true'),
			) &&
			logs.entries.some((entry) => entry.text === "#document <body>"),
	);
	check(
		"Console severity filtering returns real warning and error messages",
		(
			(await actor.execute(["console", "warning"])).data as {
				entries: unknown[];
			}
		).entries.length === 3,
	);
	await evaluate(actor, 'console.clear(); console.log("after clear")');
	check(
		"Page console clear removes retained diagnostics without replaying page code",
		(
			(await actor.execute(["console"])).data as { entries: { text: string }[] }
		).entries
			.map((entry) => entry.text)
			.join() === "after clear",
	);
	const functionsPage = (await actor.execute(["goto", `${origin}/functions`]))
		.data as NavigationResult;
	check(
		"Actual page scripts use function properties, constructor prototypes and inherited instanceof",
		functionsPage.scripts?.executed === 1 &&
			!functionsPage.scripts.halted &&
			(await evaluate(
				actor,
				'validInheritance && Counter.label === "page counter" && derived.increment() === 10 && Derived.prototype.value === 9',
			)) === true,
	);
	check(
		"Automatic scripts use sandbox-owned type inspection and ordinary/null prototype reflection",
		(await evaluate(
			actor,
			'inspectedTypes === "[object Array],[object Object],[object Function]" && validObjectPrototype && nullPrototypeIsolated',
		)) === true,
	);
	await actor.execute(["click", "#increment"]);
	check(
		"Native element actions invoke inherited guest methods and update the live semantic document",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"page counter: 2",
		),
	);
	const datePage = (await actor.execute(["goto", `${origin}/dates`]))
		.data as NavigationResult;
	check(
		"Automatic page scripts use owned Date clocks, identity, calendar values and JSON",
		datePage.scripts?.executed === 1 &&
			!datePage.scripts.halted &&
			(await evaluate(
				actor,
				"validDateClock && validDateType && validDateValue && validDateJSON",
			)) === true,
	);
	await actor.execute(["click", "#date-action"]);
	check(
		"Native actions mutate the retained Date and update the live semantic document",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"2001-03-01T12:34:56.789Z",
		),
	);
	const attributePage = (await actor.execute(["goto", `${origin}/attributes`]))
		.data as NavigationResult;
	check(
		"Actual page scripts share live named/indexed Attr identities and update real attributes",
		attributePage.scripts?.executed === 1 &&
			!attributePage.scripts.halted &&
			(await evaluate(
				actor,
				"initialAttributeIdentity && attributeEnumeration && attributeReflection && detachedIdentity && replacementIdentity",
			)) === true,
	);
	check(
		"Native snapshot respects the hidden attribute before the action",
		!JSON.stringify((await actor.execute(["snapshot"])).data).includes(
			"Attribute action reached the document",
		),
	);
	await actor.execute(["click", "#attribute-action"]);
	check(
		"Native action removes the exact Attr node and updates semantic visibility",
		JSON.stringify((await actor.execute(["snapshot"])).data).includes(
			"Attribute action reached the document",
		) &&
			(await evaluate(
				actor,
				'hiddenAttribute.ownerElement === null && attributeTarget.getAttribute("data-live") === "action"',
			)) === true,
	);
	const stylePage = (await actor.execute(["goto", `${origin}/inline-styles`]))
		.data as NavigationResult;
	check(
		"Actual page scripts parse, mutate, index and iterate live inline style declarations",
		stylePage.scripts?.executed === 1 &&
			!stylePage.scripts.halted &&
			(await evaluate(
				actor,
				"parsedStyle && styleMembers && styleIteration && reflectedStyle && forwardedStyle && independentStyle",
			)) === true,
	);
	check(
		"Stylesheet-important content remains hidden before a native action",
		!JSON.stringify((await actor.execute(["snapshot"])).data).includes(
			"Inline styles reached the owned document",
		),
	);
	await actor.execute(["click", "#style-action"]);
	check(
		"Native click updates real style attributes, cascade and agent snapshot",
		JSON.stringify((await actor.execute(["snapshot"])).data).includes(
			"Inline styles reached the owned document",
		) &&
			(await evaluate(
				actor,
				'document.getElementById("style-result").getAttribute("style") === "display: block !important;"',
			)) === true,
	);
	const collectionPage = (
		await actor.execute(["goto", `${origin}/collections`])
	).data as NavigationResult;
	check(
		"Automatic page scripts query descendant tag/class collections with real node identity",
		collectionPage.scripts?.executed === 1 &&
			!collectionPage.scripts.halted &&
			(await evaluate(actor, "initialCollections")) === true,
	);
	check(
		"Saved HTML collections and children refresh after DOM insertion without changing collection identity",
		(await evaluate(actor, "liveCollections && indexedIdentity")) === true,
	);
	check(
		"Guest iteration, Array.from and own-key inspection use live indexed capabilities",
		(await evaluate(actor, "collectionIteration")) === true,
	);
	await actor.execute(["click", "#collection-action"]);
	check(
		"Native actions update saved tag/class collections after removal and class changes",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"Live collection: 2 entries, 0 hot",
		),
	);
	await actor.close();
	if (process.argv.includes("--sites")) {
		for (const [url, readableMarker] of [
			["https://books.toscrape.com/", "All products"],
			["https://quotes.toscrape.com/js/", "Quotes to Scrape"],
		] as const) {
			const live = await BrowserSessionProcess.create({
				packageRoot,
				websiteScripts: "classic",
				commandTimeoutMs: 10_000,
			});
			actors.push(live);
			const navigationStarted = performance.now();
			try {
				const opened = (await live.execute(["open", url])).data as {
					navigation: NavigationResult;
				};
				const report = opened.navigation.scripts;
				sites.push({
					url,
					navigation: true,
					elapsedMs: Math.round(performance.now() - navigationStarted),
					scripts: report,
					acceptance:
						report?.halted || report?.failed || report?.skipped
							? "partial-or-failed-script-compatibility"
							: "script-loading-only; dynamic-site-behavior-not-verified",
				});
				check(
					`${url}: real website script handling is reported explicitly`,
					!!report && report.discovered > 0 && report.complete,
				);
				check(
					`${url}: public document remains readable after automatic-script handling`,
					(
						(await live.execute(["text"])).data as { text: string }
					).text.includes(readableMarker),
				);
			} catch (error) {
				sites.push({
					url,
					navigation: false,
					elapsedMs: Math.round(performance.now() - navigationStarted),
					...(error instanceof AgentBrowserError && error.code === "timeout"
						? {
								timeoutSource:
									error.message ===
									"Session process heartbeat deadline exceeded"
										? "heartbeat-deadline"
										: error.message === "Session command hard deadline exceeded"
											? "command-deadline"
											: "other-timeout",
							}
						: {}),
					error:
						error instanceof AgentBrowserError ? error.code : "probe-failed",
					acceptance: "failed-navigation",
				});
			} finally {
				await live.close();
			}
		}
	}
} catch (error) {
	checks.push({
		label: "Automatic website script probe",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
	if (process.argv.includes("--trace"))
		console.error(error instanceof Error ? error.message : "Probe failed");
} finally {
	await Promise.all(actors.map((actor) => actor.close()));
	website.closeAllConnections();
	await new Promise<void>((resolve) => website.close(() => resolve()));
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Actual extended SafeJS in owned browser processes, automatically loading HTTP document script elements without manual eval injection. Fixture evaluation commands only inspect resulting state. A temporary loopback fixture is explicitly allowed by trusted host policy; optional public sites use the normal private-network-denying policy. Public requests are read-only. Site compatibility failures are recorded separately and are not passing dynamic-site acceptance. No credentials or raw public page bodies retained.",
			checks,
			sites,
			parentRssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
