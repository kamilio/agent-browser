import { BrowserCommandHost } from "../src/command-host.js";
import type { DocumentTree } from "../src/document.js";
import type { DomInspection } from "../src/dom-inspection.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const owners = new Map<DocumentTree, PageScripts>();
const host = new BrowserCommandHost({
	createSession: () =>
		new BrowserSession({
			createTransport: () => ({
				async request(input) {
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
					requests: 0,
					active: 0,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
					closed: false,
				}),
				close() {},
			}),
			loadDocument: (response, context) =>
				parseHtmlDocument(
					'<button id="go" disabled>Go</button><input id="name" readonly><select id="choice"><option value="initial">Initial</option></select><input id="check" type="checkbox" disabled><p id="status">Waiting</p>',
					response.url,
					{ limits: context.limits, signal: context.signal },
				),
		}),
	evaluatePage: (page, source, signal) => {
		let owner = owners.get(page.document);
		if (!owner) {
			owner = new PageScripts(
				{ document: page.document, interactions: page.interactions },
				core,
			);
			owners.set(page.document, owner);
		}
		return owner.evaluate(source, { signal });
	},
});
let completed = false;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

async function evaluate(source: string) {
	const result = (await host.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok)
		throw new Error(
			`Action waiting fixture evaluation failed: ${result.error?.code}`,
		);
	return result.value;
}

try {
	await host.execute(["open", "https://example.com/"]);
	await evaluate(`
var clicks = 0; var inputs = 0; var changes = 0;
document.getElementById("go").addEventListener("click", function() { clicks++; });
document.getElementById("name").addEventListener("input", function() { inputs++; });
document.getElementById("choice").addEventListener("change", function() { changes++; });
setTimeout(function() { document.getElementById("go").removeAttribute("disabled"); }, 50);
`);
	await host.execute([
		"click",
		"getByRole('button', {name:'Go', exact:true})",
		"--timeout=2000",
	]);
	check(
		"Role-targeted click waits for an interpreted timer and runs exactly once",
		(await evaluate("return clicks;")) === 1,
	);
	await evaluate(
		'setTimeout(function() { document.getElementById("name").removeAttribute("readonly"); }, 50);',
	);
	await host.execute(["fill", "#name", "Waited input", "--timeout=2000"]);
	check(
		"Fill waits for readonly removal before its interpreted input handler",
		(await evaluate(
			'return inputs === 1 && document.getElementById("name").value === "Waited input";',
		)) === true,
	);
	await evaluate(
		'setTimeout(function() { var option = document.createElement("option"); option.value = "late"; option.textContent = "Late"; document.getElementById("choice").appendChild(option); }, 50);',
	);
	await host.execute(["select", "#choice", "late", "--timeout=2000"]);
	const selected = (await host.execute(["dom", '#choice option[value="late"]']))
		.data as DomInspection;
	check(
		"Select waits for an interpreted option insertion and changes once",
		(await evaluate(
			'return changes === 1 && document.getElementById("choice").value === "late";',
		)) === true && selected.nodes[0].control?.selected === true,
	);
	await evaluate(
		'setTimeout(function() { document.getElementById("check").removeAttribute("disabled"); }, 50);',
	);
	await host.execute(["check", "#check", "--timeout=2000"]);
	check(
		"Check waits for interpreted enabled state",
		(await evaluate('return document.getElementById("check").checked;')) ===
			true,
	);
	await host.execute(["uncheck", "#check"]);
	check(
		"Uncheck preserves immediate native state changes",
		(await evaluate('return document.getElementById("check").checked;')) ===
			false,
	);
	await evaluate(
		'setTimeout(function() { var button = document.createElement("button"); button.textContent = "Late button"; button.addEventListener("click", function() { clicks++; }); document.body.appendChild(button); }, 50);',
	);
	await host.execute([
		"click",
		"getByRole('button', {name:'Late button', exact:true})",
		"--timeout=2000",
	]);
	check(
		"Missing role target is resolved after interpreted attachment",
		(await evaluate("return clicks;")) === 2,
	);
	await evaluate('document.getElementById("go").setAttribute("disabled", "");');
	let timeout = false;
	try {
		await host.execute(["click", "#go", "--timeout=10"]);
	} catch (error) {
		timeout = error instanceof AgentBrowserError && error.code === "timeout";
	}
	await evaluate('document.getElementById("go").removeAttribute("disabled");');
	await new Promise((resolve) => setTimeout(resolve, 60));
	check(
		"Expired action never dispatches after the target later becomes enabled",
		timeout && (await evaluate("return clicks;")) === 2,
	);
	const pending = host.execute(["click", "#never"]).then(
		() => false,
		(error: unknown) =>
			error instanceof AgentBrowserError && error.code === "closed",
	);
	await new Promise((resolve) => setTimeout(resolve, 5));
	await host.execute(["close"]);
	const closed = await pending;
	await new Promise((resolve) => setTimeout(resolve, 0));
	check(
		"Session closure aborts pending action waiting and drains command accounting",
		closed && host.metrics().pendingCommands === 0,
	);
	completed = true;
} finally {
	host.close();
	for (const owner of owners.values()) await owner.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "existing-experimental-core-in-memory-command-host",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
