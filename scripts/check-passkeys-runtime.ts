import { isAbsolute } from "node:path";
import { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { DocumentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import {
	type NodePasskeyApprovalDecision,
	NodePasskeyAuthenticator,
} from "../src/node-passkey-authenticator.js";
import type { PageRuntime } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";

const origin = "https://passkeys.fixture.invalid";
const rpId = "passkeys.fixture.invalid";
const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const runtimes: PageRuntime[] = [];
const sourceAbort = new AbortController();
let stage = "authorization";
let errorClassification: string | undefined;
let completed = false;
let cleanupComplete = false;
let factoryLoaded = false;
let selectedAdapter: "legacy" | "extension" | undefined;
let runtimeIdentity:
	| { packageName: string; version: string; publicExport: string }
	| undefined;
let owner: PageScripts | undefined;
let document: DocumentTree | undefined;
let interactions: DocumentInteractions | undefined;
let authenticator: NodePasskeyAuthenticator | undefined;
let approvals = 0;
let cancellationReached = false;
let cancellationObserved = false;
let releaseCancellation: (() => void) | undefined;
let notifyCancellation: () => void = () => {};
const cancellationReady = new Promise<void>((resolve) => {
	notifyCancellation = resolve;
});

function check(label: string, passed: boolean): void {
	checks.push({ label, passed });
	if (!passed) throw new AgentBrowserError("unsupported", "Probe check failed");
}

function classify(error: unknown): string {
	return error instanceof AgentBrowserError &&
		[
			"aborted",
			"closed",
			"timeout",
			"invalid-input",
			"unsupported",
			"resource-limit",
		].includes(error.code)
		? error.code
		: "unclassified-error";
}

async function bounded<Value>(
	operation: Promise<Value>,
	timeoutMs = 4000,
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

async function evaluate(label: string, source: string): Promise<void> {
	stage = label;
	if (!owner) throw new AgentBrowserError("closed", "Missing page owner");
	const result = await bounded(
		owner.evaluate(source, { filename: `${label}.js` }),
	);
	check(`${label}:evaluation`, result.ok);
	check(`${label}:guest-assertions`, result.value === true);
}

function summary(status: string): void {
	process.stdout.write(
		`${JSON.stringify({
			probe: "synthetic-passkeys-native-factory",
			startedAt,
			finishedAt: new Date().toISOString(),
			status,
			stage,
			factoryLoaded,
			selectedAdapter,
			runtimeIdentity,
			bridgeVerified: completed && cleanupComplete,
			cleanupComplete,
			cancellationReached,
			cancellationObserved,
			independentCryptoVerification: "not-performed",
			checks,
			...(errorClassification ? { errorClassification } : {}),
		})}\n`,
	);
}

const watchdog = setTimeout(() => {
	errorClassification = "timeout";
	summary("watchdog-incomplete-cleanup");
	process.exit(1);
}, 20_000);

try {
	const args = process.argv.slice(2);
	const root = args[1];
	const adapter = args[3];
	if (
		args.length !== 5 ||
		args[0] !== "--runtime-root" ||
		typeof root !== "string" ||
		!isAbsolute(root) ||
		root.length > 16_384 ||
		args[2] !== "--adapter" ||
		(adapter !== "legacy" && adapter !== "extension") ||
		args[4] !== "--authorize-synthetic-passkey-runtime"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Explicit authorization and runtime selection required",
		);

	stage = "load-native-factory";
	const loaded = await bounded(loadPageRuntime(root, { adapter }));
	factoryLoaded = true;
	selectedAdapter = loaded.adapter;
	runtimeIdentity = {
		packageName: loaded.packageName,
		version: loaded.version,
		publicExport: loaded.publicExport,
	};
	document = new DocumentTree(origin, {
		maxNodes: 32,
		maxDepth: 8,
		maxTextCodeUnits: 1024,
		maxChanges: 32,
	});
	interactions = new DocumentInteractions(document);
	authenticator = new NodePasskeyAuthenticator({
		maxCredentials: 1,
		maxAssertionsPerCredential: 2,
		async approve(request) {
			approvals++;
			if (
				request.rpId !== rpId ||
				request.clientDataHash.byteLength !== 32 ||
				request.signal.aborted
			)
				return { approved: false };
			if (request.operation === "create") {
				return {
					approved:
						approvals === 1 &&
						request.rpName === "Synthetic runtime probe" &&
						request.user.name === "synthetic-only" &&
						request.user.displayName === "Synthetic only" &&
						request.user.id.byteLength === 4 &&
						request.user.id.every((byte, index) => byte === index + 1),
				};
			}
			if (
				request.credentials.length !== 1 ||
				request.credentials[0].user.name !== "synthetic-only"
			)
				return { approved: false };
			if (approvals === 2)
				return {
					approved: true,
					credentialId: request.credentials[0].credentialId,
				};
			if (approvals !== 3) return { approved: false };
			cancellationReached = true;
			return new Promise<NodePasskeyApprovalDecision>((resolve) => {
				const abort = () => {
					cancellationObserved = request.signal.aborted;
					request.signal.removeEventListener("abort", abort);
					resolve({ approved: false });
				};
				releaseCancellation = abort;
				request.signal.addEventListener("abort", abort, { once: true });
				notifyCancellation();
				if (request.signal.aborted) abort();
			});
		},
	});
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
				maxArrayLength: 8192,
				maxDataSize: 524_288,
				timeoutMs: 3000,
				maxRuns: 6,
				maxResultBytes: 1024,
			},
			maxPendingCallbacks: 4,
			passkeys: {
				authenticator,
				context: {
					topLevel: true,
					isCurrent: () => document?.mutationMetrics().closed === false,
				},
			},
		},
	);

	stage = "byte-prerequisites";
	const prerequisites = await bounded(
		owner.evaluate(
			`[typeof Uint8Array === "function", typeof ArrayBuffer === "function",
			typeof Promise === "function", navigator.credentials === window.navigator.credentials];`,
			{ filename: "byte-prerequisites.js" },
		),
	);
	check("prerequisites:evaluation", prerequisites.ok);
	const flags = prerequisites.value;
	if (
		!Array.isArray(flags) ||
		flags.length !== 4 ||
		flags.some((flag) => typeof flag !== "boolean")
	)
		throw new AgentBrowserError("unsupported", "Invalid prerequisite result");
	for (const [index, name] of [
		"Uint8Array",
		"ArrayBuffer",
		"Promise",
		"credentials-identity",
	].entries())
		checks.push({ label: `prerequisites:${name}`, passed: flags[index] });
	check(
		"prerequisites:all",
		flags.every((flag) => flag),
	);

	await evaluate(
		"create",
		`
		var registration = await navigator.credentials.create({ publicKey: {
			challenge: new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),
			rp: { id: "passkeys.fixture.invalid", name: "Synthetic runtime probe" },
			user: { id: new Uint8Array([1,2,3,4]), name: "synthetic-only", displayName: "Synthetic only" },
			pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 2000,
			authenticatorSelection: { userVerification: "discouraged" }
		} });
		var registeredId = new Uint8Array(registration.rawId);
		var publicAttestation = new Uint8Array(registration.response.attestationObject);
		var createClientData = new Uint8Array(registration.response.clientDataJSON);
		var originalByte = registeredId[0];
		registeredId[0] = originalByte ^ 255;
		return registration.type === "public-key" && typeof registration.id === "string" &&
		registration.id.length > 0 && registration.id.length <= 1364 &&
		registeredId.length === 32 && new Uint8Array(registration.rawId)[0] === originalByte &&
		publicAttestation.length > 100 && publicAttestation.length <= 4096 &&
		createClientData.length > 32 && createClientData.length <= 1024 &&
		typeof registration.getClientExtensionResults() === "object";
	`,
	);
	check("create:synthetic-approval", approvals === 1);

	await evaluate(
		"get",
		`
		var assertion = await navigator.credentials.get({ publicKey: {
			challenge: new Uint8Array([16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]),
			rpId: "passkeys.fixture.invalid", timeout: 2000, userVerification: "discouraged",
			allowCredentials: [{ type: "public-key", id: new Uint8Array(registration.rawId) }]
		} });
		var authenticationBytes = new Uint8Array(assertion.response.authenticatorData);
		var signatureBytes = new Uint8Array(assertion.response.signature);
		var getClientData = new Uint8Array(assertion.response.clientDataJSON);
		var userBytes = new Uint8Array(assertion.response.userHandle);
		return assertion.type === "public-key" && assertion.id === registration.id &&
		new Uint8Array(assertion.rawId).length === 32 && authenticationBytes.length === 37 &&
		(authenticationBytes[32] & 1) === 1 && (authenticationBytes[32] & 4) === 0 &&
		signatureBytes.length >= 64 && signatureBytes.length <= 80 &&
		getClientData.length > 32 && getClientData.length <= 1024 &&
		userBytes.length === 4 && userBytes[0] === 1 && userBytes[3] === 4;
	`,
	);
	check("get:synthetic-approval", approvals === 2);

	await evaluate(
		"wrong-rp",
		`
		var wrongRpDenied = false;
		try { await navigator.credentials.get({ publicKey: {
			challenge: new Uint8Array([1,2,3,4]), rpId: "other.fixture.invalid", timeout: 2000
		} }); } catch (error) { wrongRpDenied = error.name === "SecurityError"; }
		return wrongRpDenied;
	`,
	);
	check("wrong-rp:no-approval", approvals === 2);
	await evaluate(
		"required-uv",
		`
		var requiredUvDenied = false;
		try { await navigator.credentials.get({ publicKey: {
			challenge: new Uint8Array([1,2,3,4]), rpId: "passkeys.fixture.invalid",
			userVerification: "required", timeout: 2000
		} }); } catch (error) { requiredUvDenied = error.name === "NotSupportedError"; }
		return requiredUvDenied;
	`,
	);
	check("required-uv:no-approval", approvals === 2);

	stage = "cancel-source-operation";
	const pending = owner
		.evaluate(
			`
		await navigator.credentials.get({ publicKey: {
			challenge: new Uint8Array([1,2,3,4]), rpId: "passkeys.fixture.invalid",
			allowCredentials: [{ type: "public-key", id: new Uint8Array(registration.rawId) }],
			userVerification: "discouraged", timeout: 2000
		} });
	`,
			{ signal: sourceAbort.signal, filename: "cancel-source-operation.js" },
		)
		.then(
			() => "unexpected-completion",
			(error: unknown) => classify(error),
		);
	await bounded(
		Promise.race([
			cancellationReady,
			pending.then(() => {
				throw new AgentBrowserError(
					"unsupported",
					"Approval not reached before settlement",
				);
			}),
		]),
	);
	sourceAbort.abort();
	check("cancel:source-rejected", (await bounded(pending)) === "aborted");
	check("cancel:provider-signal", cancellationReached && cancellationObserved);
	check("cancel:owner-closed", owner.closed);
	check(
		"cancel:no-pending-work",
		!owner.metrics().active && owner.metrics().pendingCallbacks === 0,
	);
	check("factory:single-native-runtime", runtimes.length === 1);
	check("cancel:bounded-approvals", approvals === 3);
	completed = true;
} catch (error) {
	errorClassification = classify(error);
} finally {
	sourceAbort.abort();
	const cleanup: Promise<unknown>[] = [];
	for (const close of [
		() => authenticator?.close(),
		() => releaseCancellation?.(),
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
		errorClassification ??= "cleanup-timeout";
	}
	clearTimeout(watchdog);
	summary(completed && cleanupComplete ? "passed" : "failed");
	process.exitCode = completed && cleanupComplete ? 0 : 1;
}
