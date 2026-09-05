import { isAbsolute } from "node:path";
import { createBrowserIdentity } from "../src/browser-identity.js";
import { bindDocumentIdentity } from "../src/document-identity.js";
import { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { DocumentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import type { PageRuntime } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";

const evaluations = [
	{
		stage: "initial-identity",
		labels: [
			"native-user-agent",
			"preferred-language",
			"ordered-languages",
			"window-navigator-identity",
			"languages-is-array",
			"languages-stable-getter",
			"freeze-reflection-supported",
			"languages-frozen",
		],
		source: `
var savedLanguages = navigator.languages;
function identityCheck(assertion) {
  try { return assertion() === true; } catch { return false; }
}
JSON.stringify([
  identityCheck(() => navigator.userAgent === "AgentBrowser/0.1"),
  identityCheck(() => navigator.language === "pl-PL"),
  identityCheck(() => savedLanguages.length === 2 && savedLanguages[0] === "pl-PL" && savedLanguages[1] === "en-US"),
  identityCheck(() => navigator === window.navigator),
  identityCheck(() => Array.isArray(savedLanguages)),
  identityCheck(() => savedLanguages === navigator.languages && navigator.languages === navigator.languages),
  identityCheck(() => typeof Object.isFrozen === "function"),
  identityCheck(() => Object.isFrozen(savedLanguages) && Object.isFrozen(navigator.languages))
]);`,
	},
	{
		stage: "reflection-and-mutation",
		labels: [
			"languages-stable-across-evaluations",
			"descriptor-reflection-supported",
			"user-agent-descriptor-immutable",
			"language-descriptor-immutable",
			"languages-descriptor-immutable",
			"language-mutation-rejected",
			"languages-replacement-rejected",
			"saved-list-mutation-rejected",
			"getter-list-mutation-rejected",
			"user-agent-mutation-rejected",
		],
		source: `
function immutableIdentityDescriptor(name) {
  var descriptor = Object.getOwnPropertyDescriptor(navigator, name);
  return descriptor !== undefined && descriptor.configurable === false &&
    ((typeof descriptor.get === "function" && descriptor.set === undefined) ||
     ("value" in descriptor && descriptor.writable === false));
}
function originalLanguages(languages) {
  return languages.length === 2 && languages[0] === "pl-PL" && languages[1] === "en-US";
}
JSON.stringify([
  identityCheck(() => savedLanguages === navigator.languages),
  identityCheck(() => typeof Object.getOwnPropertyDescriptor === "function" &&
    Object.getOwnPropertyDescriptor(navigator, "userAgent") !== undefined &&
    Object.getOwnPropertyDescriptor(navigator, "language") !== undefined &&
    Object.getOwnPropertyDescriptor(navigator, "languages") !== undefined),
  identityCheck(() => immutableIdentityDescriptor("userAgent")),
  identityCheck(() => immutableIdentityDescriptor("language")),
  identityCheck(() => immutableIdentityDescriptor("languages")),
  identityCheck(() => {
    try { navigator.language = "fr-FR"; } catch {}
    return navigator.language === "pl-PL";
  }),
  identityCheck(() => {
    try { navigator.languages = ["fr-FR"]; } catch {}
    return originalLanguages(navigator.languages);
  }),
  identityCheck(() => {
    try { savedLanguages[0] = "fr-FR"; } catch {}
    try { savedLanguages.push("de-DE"); } catch {}
    try { savedLanguages.length = 0; } catch {}
    return originalLanguages(savedLanguages);
  }),
  identityCheck(() => {
    try { navigator.languages[0] = "fr-FR"; } catch {}
    try { navigator.languages.push("de-DE"); } catch {}
    return originalLanguages(navigator.languages);
  }),
  identityCheck(() => {
    try { navigator.userAgent = "SyntheticMutation/0"; } catch {}
    return navigator.userAgent === "AgentBrowser/0.1";
  })
]);`,
	},
	{
		stage: "persistent-identity",
		labels: [
			"persistent-user-agent",
			"persistent-language",
			"persistent-ordered-languages",
			"persistent-saved-list",
			"persistent-languages-identity",
			"persistent-window-navigator",
			"persistent-array-shape",
			"persistent-frozen-list",
		],
		source: `
JSON.stringify([
  identityCheck(() => navigator.userAgent === "AgentBrowser/0.1"),
  identityCheck(() => navigator.language === "pl-PL"),
  identityCheck(() => originalLanguages(navigator.languages)),
  identityCheck(() => originalLanguages(savedLanguages)),
  identityCheck(() => savedLanguages === navigator.languages && navigator.languages === navigator.languages),
  identityCheck(() => navigator === window.navigator),
  identityCheck(() => Array.isArray(savedLanguages) && Array.isArray(navigator.languages)),
  identityCheck(() => Object.isFrozen(savedLanguages) && Object.isFrozen(navigator.languages))
]);`,
	},
];

const startedAt = new Date().toISOString();
const checks = evaluations.flatMap((evaluation) =>
	["evaluation", "boolean-array", ...evaluation.labels].map((label) => ({
		label: `${evaluation.stage}:${label}`,
		passed: false,
	})),
);
checks.push({ label: "factory:single-native-runtime", passed: false });
const runtimes: PageRuntime[] = [];
let owner: PageScripts | undefined;
let document: DocumentTree | undefined;
let interactions: DocumentInteractions | undefined;
let stage = "authorization";
let adapter: "legacy" | "extension" | undefined;
let runtimeIdentity:
	| { packageName: string; version: string; publicExport: string }
	| undefined;
let errorClassification: string | undefined;
let cleanupComplete = false;
let completed = false;

function record(label: string, passed: boolean): void {
	const check = checks.find((candidate) => candidate.label === label);
	if (!check) throw new Error("Unknown fixed assertion");
	check.passed = passed;
}

async function bounded<Value>(
	operation: Promise<Value>,
	timeoutMs: number,
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new AgentBrowserError("timeout", "Probe deadline")),
					timeoutMs,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function summary(status: string): void {
	process.stdout.write(
		`${JSON.stringify({
			probe: "synthetic-identity-native-factory",
			startedAt,
			finishedAt: new Date().toISOString(),
			status,
			stage,
			adapter: adapter ?? null,
			runtimeIdentity: runtimeIdentity ?? null,
			checks,
			cleanupComplete,
			verified:
				completed &&
				cleanupComplete &&
				!errorClassification &&
				checks.every((check) => check.passed),
			...(errorClassification ? { errorClassification } : {}),
		})}\n`,
	);
}

const watchdog = setTimeout(() => {
	errorClassification = "outer-watchdog-timeout";
	cleanupComplete = false;
	summary("watchdog-incomplete-cleanup");
	process.exit(1);
}, 25_000);

try {
	const args = process.argv.slice(2);
	const root = args[1];
	const selectedAdapter = args[3];
	if (
		args.length !== 5 ||
		args[0] !== "--runtime-root" ||
		typeof root !== "string" ||
		!isAbsolute(root) ||
		root.length > 16_384 ||
		args[2] !== "--adapter" ||
		(selectedAdapter !== "legacy" && selectedAdapter !== "extension") ||
		args[4] !== "--authorize-synthetic-identity-runtime"
	)
		throw new AgentBrowserError("invalid-input", "Explicit selection required");
	adapter = selectedAdapter;
	stage = "load-native-factory";
	const loaded = await bounded(loadPageRuntime(root, { adapter }), 4000);
	adapter = loaded.adapter;
	runtimeIdentity = {
		packageName: loaded.packageName,
		version: loaded.version,
		publicExport: loaded.publicExport,
	};
	stage = "create-page-owner";
	document = new DocumentTree("https://identity.fixture.invalid/", {
		maxNodes: 32,
		maxDepth: 8,
		maxTextCodeUnits: 1024,
		maxChanges: 32,
	});
	bindDocumentIdentity(
		document,
		createBrowserIdentity({ languages: ["pl-PL", "en-US"] }),
	);
	interactions = new DocumentInteractions(document);
	owner = new PageScripts(
		{ document, interactions },
		{
			createPageRuntime(options) {
				const runtime = loaded.factory.createPageRuntime(options);
				runtimes.push(runtime);
				return runtime;
			},
		},
		{
			limits: {
				maxSourceCodeUnits: 8192,
				maxSteps: 100_000,
				maxCallDepth: 48,
				maxStringLength: 16_384,
				maxArrayLength: 1024,
				maxDataSize: 524_288,
				timeoutMs: 3000,
				maxRuns: 3,
				maxResultBytes: 1024,
			},
			maxPendingCallbacks: 4,
		},
	);
	for (const evaluation of evaluations) {
		stage = evaluation.stage;
		try {
			const result = await bounded(
				owner.evaluate(evaluation.source, { filename: `${stage}.js` }),
				3000,
			);
			record(`${stage}:evaluation`, result.ok);
			if (!result.ok) {
				errorClassification ??= "guest-evaluation-failed";
				continue;
			}
			if (typeof result.value !== "string" || result.value.length > 1024) {
				errorClassification ??= "invalid-guest-result";
				continue;
			}
			const values: unknown = JSON.parse(result.value);
			const valid =
				Array.isArray(values) &&
				values.length === evaluation.labels.length &&
				values.every((value) => typeof value === "boolean");
			record(`${stage}:boolean-array`, valid);
			if (!valid) errorClassification ??= "invalid-guest-result";
			for (const [index, label] of evaluation.labels.entries())
				record(
					`${stage}:${label}`,
					Array.isArray(values) && values[index] === true,
				);
		} catch {
			errorClassification ??= "guest-evaluation-threw-or-timed-out";
		}
	}
	record("factory:single-native-runtime", runtimes.length === 1);
	completed = true;
} catch {
	errorClassification ??=
		stage === "authorization"
			? "invalid-arguments"
			: stage === "load-native-factory"
				? "native-factory-unavailable"
				: "page-owner-setup-failed";
} finally {
	const cleanup: Promise<unknown>[] = [];
	for (const close of [
		() => owner?.close(),
		() => interactions?.close(),
		() => document?.close(),
		...runtimes.map((runtime) => () => runtime.close()),
	]) {
		try {
			cleanup.push(Promise.resolve(close()));
		} catch {
			cleanup.push(Promise.reject(new Error("Cleanup failed")));
		}
	}
	try {
		const settled = await bounded(Promise.allSettled(cleanup), 2000);
		cleanupComplete =
			settled.every((result) => result.status === "fulfilled") &&
			runtimes.every((runtime) => runtime.closed) &&
			(!owner || owner.closed) &&
			(!document || document.mutationMetrics().closed) &&
			(!interactions || interactions.events.metrics().closed);
		if (!cleanupComplete) errorClassification ??= "cleanup-incomplete";
	} catch {
		errorClassification ??= "cleanup-failed-or-timed-out";
	}
	clearTimeout(watchdog);
	const verified =
		completed &&
		cleanupComplete &&
		!errorClassification &&
		checks.every((check) => check.passed);
	summary(verified ? "passed" : "failed");
	process.exitCode = verified ? 0 : 1;
}
