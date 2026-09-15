import {
	type ReleasedContext,
	type ReleasedCore,
	type ReleasedInvocation,
	type ReleasedRealm,
	loadReleasedCore,
} from "./released-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean; message?: string }[] = [];
const cleanupFailures: { fixture: string; message: string }[] = [];
let selected: { packageName: string; version: string } | undefined;
let completed = false;
let failure: { stage: string; message: string; label?: string } | undefined;

function message(error: unknown) {
	return error instanceof Error
		? error.message.slice(0, 512)
		: "Unknown probe failure";
}

async function check(
	label: string,
	operation: () => boolean | Promise<boolean>,
) {
	const entry: (typeof checks)[number] = { label, passed: false };
	checks.push(entry);
	try {
		entry.passed = await operation();
		if (!entry.passed) throw new Error("SafeJS release acceptance failed");
	} catch (error) {
		entry.message = message(error);
		failure = { stage: "contract", label, message: entry.message };
		throw error;
	} finally {
		if (process.argv.includes("--trace"))
			console.error(`${entry.passed ? "PASS" : "FAIL"} ${label}`);
	}
}

async function withCleanup(
	label: string,
	operation: () => Promise<void>,
	close: () => Promise<void>,
) {
	let failed = false;
	let primary: unknown;
	try {
		await operation();
	} catch (error) {
		failed = true;
		primary = error;
	}
	try {
		await close();
	} catch (error) {
		cleanupFailures.push({ fixture: label, message: message(error) });
		if (!failed) throw error;
	}
	if (failed) throw primary;
}

async function bounded<Value>(
	promise: Promise<Value>,
	abort: AbortController,
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					abort.abort();
					reject(new Error("SafeJS release probe deadline exceeded"));
				}, 2000);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

function fixture(core: ReleasedCore) {
	const abort = new AbortController();
	const marks: unknown[] = [];
	const callbacks: unknown[] = [];
	const references: unknown[] = [];
	const values = ["first", "second"];
	const named = new Map<string, unknown>([["theme", "light"]]);
	let context: ReleasedContext | undefined;
	let cleanups = 0;
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const extension = core.defineExtension({
		manifest: {
			version: 1,
			name: "browser-release-probe",
			globals: [
				"probe",
				"alias",
				"register",
				"mark",
				"wait",
				"capture",
				"nested",
			],
			capabilities: ["guest:retain", "source:nested"],
		},
		setup(owner) {
			context = owner;
			owner.onCleanup(() => {
				cleanups++;
			});
			const object = owner.createHostObject({
				properties: { fixed: { get: () => "protected" } },
				indexed: {
					length: () => values.length,
					get: (index) => values[index],
					maxLength: 8,
				},
				named: {
					keys: () => [...named.keys()],
					get: (name) => named.get(name),
					set: (name, value) => {
						named.set(name, value);
					},
					delete: (name) => named.delete(name),
					maxKeys: 8,
					maxKeyCodeUnits: 128,
				},
			});
			const capture = owner.retainGuestArguments(
				(...args: readonly unknown[]) => {
					references.push(...args);
				},
				0,
			);
			const nested = owner.nestedOperation(() =>
				owner.evaluateNested('mark("nested");'),
			);
			return {
				globals: {
					probe: object,
					alias: object,
					register: (callback: unknown) => {
						callbacks.push(callback);
					},
					mark: (value: unknown) => {
						marks.push(value);
					},
					wait: () => waiting,
					capture,
					nested,
				},
			};
		},
	});
	const realm: ReleasedRealm = core.createRealm({
		extensions: [extension],
		grants: ["guest:retain", "source:nested"],
		budget: new core.Budget({
			maxSteps: 50_000,
			deadline: Date.now() + 10_000,
			dataSize: 1_048_576,
		}),
		signal: abort.signal,
		limits: {
			hostObjects: 16,
			callbacks: 16,
			guestReferences: 16,
			cleanups: 16,
			nestedEvaluations: 4,
		},
	});
	return {
		realm,
		abort,
		marks,
		callbacks,
		references,
		values,
		named,
		release,
		get context() {
			if (!context) throw new Error("Extension setup did not initialize");
			return context;
		},
		get cleanups() {
			return cleanups;
		},
		async evaluate(source: string) {
			const result = await bounded(realm.evaluate(source), abort);
			if (!result.ok) throw new Error("Release fixture evaluation failed");
			return result.returnValue;
		},
		async close() {
			await bounded(realm.close(), abort);
		},
	};
}

try {
	const loaded = await loadReleasedCore(
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_ROOT,
		process.env.AGENT_BROWSER_SAFEJS_RELEASE_VERSION,
	);
	selected = { packageName: loaded.packageName, version: loaded.version };
	const capabilities = fixture(loaded.core);
	await withCleanup(
		"capabilities",
		async () => {
			await check(
				"Realm-owned host aliases preserve identity and indexed reads",
				async () =>
					(await capabilities.evaluate(
						'return probe === alias && probe.length === 2 && probe[0] === "first";',
					)) === true,
			);
			await check(
				"Indexed capabilities remain live across evaluations",
				async () => {
					capabilities.values.push("third");
					return (
						(await capabilities.evaluate(
							'return Array.from(probe).join(",");',
						)) === "first,second,third"
					);
				},
			);
			await check(
				"Named writes reach native storage",
				async () =>
					(await capabilities.evaluate(
						'probe.theme = "dark"; probe.fresh = "value"; return probe.theme === "dark" && probe.fresh === "value";',
					)) === true &&
					capabilities.named.get("theme") === "dark" &&
					capabilities.named.get("fresh") === "value",
			);
			await check(
				"Named deletion reaches native storage",
				async () =>
					(await capabilities.evaluate("return delete probe.fresh;")) ===
						true && !capabilities.named.has("fresh"),
			);
			await check(
				"Native named updates are visible without replacing the host object",
				async () => {
					capabilities.named.set("theme", "native");
					return (
						(await capabilities.evaluate("return alias.theme;")) === "native"
					);
				},
			);
			await check(
				"Named mutation cannot overwrite fixed members",
				async () =>
					(await capabilities.evaluate(
						'try { probe.fixed = "bad"; } catch (error) {} return probe.fixed === "protected";',
					)) === true && !capabilities.named.has("fixed"),
			);
			await check(
				"Explicit nested operations finish before the next guest statement",
				async () => {
					await capabilities.evaluate('nested(); mark("after");');
					return JSON.stringify(capabilities.marks) === '["nested","after"]';
				},
			);
		},
		() => capabilities.close(),
	);
	await check(
		"Repeated close runs extension cleanup exactly once",
		async () => {
			await capabilities.close();
			return capabilities.cleanups === 1 && capabilities.context.signal.aborted;
		},
	);
	await check("Closed realms reject further evaluation", async () => {
		const stale = await bounded(
			Promise.allSettled([capabilities.realm.evaluate("return 1;")]),
			capabilities.abort,
		);
		return stale[0].status === "rejected";
	});

	const phases = fixture(loaded.core);
	await withCleanup(
		"phases",
		async () => {
			let first!: ReleasedInvocation;
			let settled = false;
			await check(
				"Context callback prefix completes while the final result remains pending",
				async () => {
					await phases.evaluate(
						'register(async function() { mark("prefix"); await wait(); mark("tail"); return 7; }); register(function(value) { mark(value); });',
					);
					first = phases.context.startCallback(phases.callbacks[0]);
					void first.result.then(
						() => {
							settled = true;
						},
						() => {
							settled = true;
						},
					);
					void first.synchronous.catch(() => undefined);
					await bounded(first.synchronous, phases.abort);
					return (
						Object.isFrozen(first) &&
						!settled &&
						JSON.stringify(phases.marks) === '["prefix"]'
					);
				},
			);
			await check(
				"Realm callback progresses while an earlier async tail is pending",
				async () => {
					const second = phases.realm.startCallback(phases.callbacks[1], {
						args: ["second"],
					});
					void second.result.catch(() => undefined);
					void second.synchronous.catch(() => undefined);
					await bounded(
						Promise.all([second.synchronous, second.result]),
						phases.abort,
					);
					return (
						!settled && JSON.stringify(phases.marks) === '["prefix","second"]'
					);
				},
			);
			await check(
				"A new source evaluation progresses after a callback prefix while its async tail remains pending",
				async () => (await phases.evaluate("return 1;")) === 1 && !settled,
			);
			await check(
				"Callback result preserves async ordering and returned data",
				async () => {
					phases.release();
					return (
						(await bounded(first.result, phases.abort)) === 7 &&
						JSON.stringify(phases.marks) === '["prefix","second","tail"]'
					);
				},
			);
			await check(
				"Retained guest arguments can return through the owning callback",
				async () => {
					await phases.evaluate(
						'capture({ marker: "identity" }); register(function(value) { return value.marker === "identity"; });',
					);
					const retained = phases.realm.startCallback(phases.callbacks[2], {
						args: [phases.references[0]],
					});
					void retained.result.catch(() => undefined);
					void retained.synchronous.catch(() => undefined);
					return (
						(
							await bounded(
								Promise.all([retained.synchronous, retained.result]),
								phases.abort,
							)
						)[1] === true
					);
				},
			);
			await check("Released guest references reject reuse", async () => {
				phases.context.releaseGuestReference(phases.references[0]);
				const revoked = phases.realm.startCallback(phases.callbacks[2], {
					args: [phases.references[0]],
				});
				const outcomes = await bounded(
					Promise.allSettled([revoked.synchronous, revoked.result]),
					phases.abort,
				);
				return outcomes.every((outcome) => outcome.status === "rejected");
			});
		},
		() => phases.close(),
	);

	const cancellation = fixture(loaded.core);
	await withCleanup(
		"cancellation",
		async () => {
			await check(
				"Owner closure rejects a suspended callback without releasing its host wait",
				async () => {
					await cancellation.evaluate(
						'register(async function() { await wait(); mark("must not run"); });',
					);
					const invocation = cancellation.realm.startCallback(
						cancellation.callbacks[0],
					);
					void invocation.result.catch(() => undefined);
					void invocation.synchronous.catch(() => undefined);
					await bounded(invocation.synchronous, cancellation.abort);
					await cancellation.close();
					const outcomes = await bounded(
						Promise.allSettled([invocation.result]),
						cancellation.abort,
					);
					return (
						outcomes[0].status === "rejected" && cancellation.marks.length === 0
					);
				},
			);
		},
		() => cancellation.close(),
	);
	const consoleAbort = new AbortController();
	const consoleMessages: unknown[] = [];
	let consoleCleanups = 0;
	let consoleSetups = 0;
	const consoleExtension = loaded.core.defineExtension({
		manifest: {
			version: 1,
			name: "browser-console-probe",
			globals: ["console", "window", "self"],
		},
		setup(owner) {
			consoleSetups++;
			owner.onCleanup(() => {
				consoleCleanups++;
			});
			const console = owner.createHostObject({
				methods: {
					warn: (value) => {
						consoleMessages.push(value);
					},
				},
			});
			const window = owner.createHostObject({
				properties: { console: { get: () => console } },
			});
			return { globals: { console, window, self: window } };
		},
	});
	const consoleOptions = {
		extensions: [consoleExtension],
		signal: consoleAbort.signal,
		budget: new loaded.core.Budget({
			maxSteps: 10_000,
			deadline: Date.now() + 2000,
			dataSize: 1_048_576,
		}),
	};
	await check(
		"Builtin console remains protected without explicit authorization before setup",
		async () => {
			let collision = false;
			let unauthorized: ReleasedRealm | undefined;
			await withCleanup(
				"unauthorized-console",
				async () => {
					try {
						unauthorized = loaded.core.createRealm(consoleOptions);
					} catch {
						collision = true;
					}
				},
				async () => {
					if (unauthorized) await bounded(unauthorized.close(), consoleAbort);
				},
			);
			return collision && consoleSetups === 0;
		},
	);
	const consoleRealm = loaded.core.createRealm({
		...consoleOptions,
		builtinOverrides: { console: "browser-console-probe" },
	});
	await withCleanup(
		"console",
		async () => {
			await check(
				"Authorized console and Window aliases share the actual owned host object",
				async () => {
					const result = await bounded(
						consoleRealm.evaluate(
							'console.warn("owned"); return console === window.console && console === self.console;',
						),
						consoleAbort,
					);
					return (
						result.ok &&
						result.returnValue === true &&
						consoleMessages.length === 1 &&
						consoleMessages[0] === "owned" &&
						consoleSetups === 1
					);
				},
			);
		},
		() => bounded(consoleRealm.close(), consoleAbort),
	);
	await check(
		"Authorized console cleanup runs once across repeated owner closure",
		async () => {
			await bounded(consoleRealm.close(), consoleAbort);
			return consoleCleanups === 1;
		},
	);
	completed = true;
} catch (error) {
	failure ??= {
		stage: selected ? "contract" : "selection",
		message: message(error),
	};
	process.exitCode = 1;
} finally {
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				selected: selected ?? null,
				completed,
				scope: "explicit-local-release-contract-probe",
				publicationProvenanceVerified: false,
				browserIntegrationVerified: false,
				failure,
				cleanupFailures,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
