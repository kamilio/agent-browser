import { loadBrowserDocument } from "../src/document-loader.js";
import { documentScriptState } from "../src/document-script-state.js";
import type { DocumentTree } from "../src/document.js";
import { extensionPageRuntime } from "../src/extension-page-runtime.js";
import { documentInteractions } from "../src/interactions.js";
import type { NetworkResponse } from "../src/network.js";
import type { PageNetworkModuleOptions } from "../src/page-network-modules.js";
import type { PageRuntimeFactory } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { loadReleasedCore } from "./released-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const cleanupFailures: { stage: string; message: string }[] = [];
const owners: {
	label: string;
	controller: AbortController;
	tree?: DocumentTree;
	scripts?: PageScripts;
}[] = [];
const evidence: unknown[] = [];
let selected: { packageName: string; version: string } | undefined;
let completed = false;
let stage = "selection";
let failure: { stage: string; message: string } | undefined;

function message(error: unknown) {
	return error instanceof Error
		? error.message.slice(0, 512)
		: "Unknown failure";
}

function check(label: string, passed: boolean) {
	stage = label;
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}

async function bounded<Value>(
	label: string,
	operation: () => Value | Promise<Value>,
	timeoutMs: number,
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.resolve().then(operation),
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error(`${label} deadline exceeded`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function response(
	url: string,
	source: string,
	contentType: string,
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [contentType] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

function text(tree: DocumentTree, id: string) {
	const entry = [...tree.walk()].find(({ node }) => node.attributes.id === id);
	if (!entry) throw new Error(`Missing fixture element: ${id}`);
	return tree.textContent(entry.node.id);
}

async function fixture(
	runtime: PageRuntimeFactory,
	label: string,
	html: string,
	sources: ReadonlyMap<string, string>,
) {
	stage = label;
	const controller = new AbortController();
	const owner: (typeof owners)[number] = { label, controller };
	owners.push(owner);
	const url = `https://fixture.invalid/${label}.html`;
	const requests: string[] = [];
	const errors: string[] = [];
	const fetchWithPolicy: PageNetworkModuleOptions["fetchWithPolicy"] = async (
		requested,
		policy,
		signal,
	) => {
		if (controller.signal.aborted || signal.aborted)
			throw new Error("Fixture transport aborted");
		if (policy.mode !== "cors" || policy.credentials !== "same-origin")
			throw new Error("Unexpected fixture fetch policy");
		requests.push(requested);
		const source = sources.get(requested);
		if (source === undefined || requests.length > sources.size)
			throw new Error("Unexpected in-memory module request");
		return {
			type: "basic",
			response: response(requested, source, "text/javascript; charset=utf-8"),
		};
	};
	const input = response(url, html, "text/html; charset=utf-8");
	const loader = new ScriptLoader({
		response: input,
		signal: controller.signal,
		fetchWithPolicy,
		limits: {
			modules: true,
			maxScripts: 4,
			maxExternal: 2,
			maxSourceBytes: 8192,
		},
		owner: (tree) => {
			owner.tree = tree;
			const interactions = documentInteractions(tree);
			interactions.events.addEventListener(
				tree.root,
				"error",
				(event) => {
					if (event.target === null) return;
					const target = tree.get(event.target);
					if (target.tagName === "script")
						errors.push(target.attributes.id ?? "");
				},
				{ capture: true },
			);
			owner.scripts = new PageScripts(
				{ document: tree, interactions },
				runtime,
				{
					limits: { timeoutMs: 1000, maxRuns: 8, maxSourceCodeUnits: 8192 },
					networkSourceModules: {
						documentUrl: url,
						entries: [],
						htmlEntries: true,
						fetchWithPolicy,
					},
				},
			);
			return owner.scripts;
		},
	});
	const tree = await bounded(
		label,
		() =>
			loadBrowserDocument(input, {
				scripts: loader,
				signal: controller.signal,
				tabId: label,
				limits: {
					maxNodes: 100,
					maxDepth: 16,
					maxTextCodeUnits: 8192,
					maxChanges: 100,
				},
			}),
		5000,
	);
	const report = documentScriptState(tree)?.report;
	evidence.push({ label, report: report ?? null, requests, errors });
	return { tree, report, requests, errors };
}

try {
	const loaded = await loadReleasedCore(
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_ROOT,
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_VERSION,
	);
	selected = { packageName: loaded.packageName, version: loaded.version };
	const runtime = extensionPageRuntime(loaded.core);
	const currentScript =
		'document.getElementById("current").textContent += document.currentScript === null ? "N" : "unexpected";';
	const entryUrl = "https://fixture.invalid/entry.js";
	const dependencyUrl = "https://fixture.invalid/dependency.js";
	const success = await fixture(
		runtime,
		"module-success",
		`<p id="inline"></p><p id="entry"></p><p id="dependency"></p><p id="current"></p>
<script type="module">export const value = "A"; document.getElementById("inline").textContent += value; ${currentScript}</script>
<script type="module">export const value = "B"; document.getElementById("inline").textContent += value; ${currentScript}</script>
<script type="module" src="/entry.js"></script><script type="module" src="/entry.js"></script>`,
		new Map([
			[
				entryUrl,
				`import { value } from "./dependency.js"; document.getElementById("entry").textContent += value; ${currentScript}`,
			],
			[
				dependencyUrl,
				`export const value = "imported"; document.getElementById("dependency").textContent += "D"; ${currentScript}`,
			],
		]),
	);
	check(
		"HTML module load completes without errors",
		success.report?.mode === "classic-and-module" &&
			success.report.complete &&
			!success.report.halted &&
			success.report.discovered === 4 &&
			success.report.executed === 3 &&
			success.report.failed === 0 &&
			success.errors.length === 0,
	);
	check(
		"Inline modules mutate the native DOM in distinct scopes",
		text(success.tree, "inline") === "AB",
	);
	check(
		"External entry imports its dependency",
		text(success.tree, "entry") === "imported" &&
			text(success.tree, "dependency") === "D",
	);
	check(
		"Duplicate external entry evaluates and fetches once",
		success.report?.skipped === 1 &&
			success.report.issues["module-already-evaluated"] === 1 &&
			success.requests.length === 2 &&
			success.requests.filter((url) => url === entryUrl).length === 1 &&
			success.requests.filter((url) => url === dependencyUrl).length === 1,
	);
	check(
		"Modules keep document.currentScript null",
		text(success.tree, "current") === "NNNN",
	);
	const negative = await fixture(
		runtime,
		"module-error",
		'<p id="status">not-run</p><script id="broken" type="module">document.getElementById("status").textContent = "before-throw"; throw new Error("fixture-module-error"); document.getElementById("status").textContent = "after-throw";</script>',
		new Map(),
	);
	check(
		"Thrown module error is surfaced without success",
		negative.report?.mode === "classic-and-module" &&
			negative.report.complete &&
			negative.report.discovered === 1 &&
			negative.report.executed === 0 &&
			negative.report.skipped === 0 &&
			negative.report.failed === 1 &&
			negative.report.issues["execution-script-error"] === 1 &&
			negative.requests.length === 0 &&
			negative.errors.length === 1 &&
			negative.errors[0] === "broken" &&
			text(negative.tree, "status") === "before-throw",
	);
	completed = true;
} catch (error) {
	failure = { stage, message: message(error) };
} finally {
	for (const owner of owners) {
		const cleanup: [string, () => void | Promise<void>][] = [
			["abort", () => owner.controller.abort()],
			[
				"scripts",
				async () => {
					await owner.scripts?.close();
					const metrics = owner.scripts?.metrics();
					if (
						metrics &&
						(!metrics.closed ||
							metrics.pendingCallbacks !== 0 ||
							metrics.active)
					)
						throw new Error("Fixture script owner did not finish cleanup");
				},
			],
			["document", () => owner.tree?.close()],
		];
		for (const [kind, operation] of cleanup) {
			const cleanupStage = `${owner.label}:${kind}`;
			try {
				await bounded(cleanupStage, operation, 2000);
			} catch (error) {
				const problem = { stage: cleanupStage, message: message(error) };
				cleanupFailures.push(problem);
				failure ??= problem;
			}
		}
	}
	if (!failure) {
		try {
			check(
				"All fixture owners close",
				owners.length === 2 &&
					owners.every(({ scripts }) => scripts?.closed === true),
			);
		} catch (error) {
			failure = { stage, message: message(error) };
			cleanupFailures.push(failure);
		}
	}
	if (failure) {
		completed = false;
		process.exitCode = 1;
	}
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				selected: selected ?? null,
				scope: "explicit-local-release-html-modules-in-memory",
				realNetwork: false,
				realPty: false,
				publicationProvenanceVerified: false,
				completed,
				failure: failure ?? null,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
				cleanupFailures,
				evidence,
				limitations: [
					"Fixture only: no website scripts or timer/top-level-await scheduling claims.",
					"Module errors expose a loader issue code/event, not a guest exception message.",
					"In-process deadlines are cooperative; external guarded execution remains a separate prerequisite.",
				],
			},
			null,
			2,
		),
	);
}
