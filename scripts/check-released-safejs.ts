import {
	type ReleasedContext,
	type ReleasedCore,
	type ReleasedRealm,
	loadReleasedCore,
} from "./released-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
let selected: { packageName: string; version: string } | undefined;
let completed = false;
let failure: { stage: string; message: string } | undefined;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("SafeJS release acceptance failed");
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
	try {
		check(
			"Realm-owned host aliases preserve identity and indexed reads",
			(await capabilities.evaluate(
				'return probe === alias && probe.length === 2 && probe[0] === "first";',
			)) === true,
		);
		capabilities.values.push("third");
		check(
			"Indexed capabilities remain live across evaluations",
			(await capabilities.evaluate('return Array.from(probe).join(",");')) ===
				"first,second,third",
		);
		check(
			"Named writes reach native storage",
			(await capabilities.evaluate(
				'probe.theme = "dark"; probe.fresh = "value"; return probe.theme === "dark" && probe.fresh === "value";',
			)) === true &&
				capabilities.named.get("theme") === "dark" &&
				capabilities.named.get("fresh") === "value",
		);
		check(
			"Named deletion reaches native storage",
			(await capabilities.evaluate("return delete probe.fresh;")) === true &&
				!capabilities.named.has("fresh"),
		);
		capabilities.named.set("theme", "native");
		check(
			"Native named updates are visible without replacing the host object",
			(await capabilities.evaluate("return alias.theme;")) === "native",
		);
		check(
			"Named mutation cannot overwrite fixed members",
			(await capabilities.evaluate(
				'try { probe.fixed = "bad"; } catch (error) {} return probe.fixed === "protected";',
			)) === true && !capabilities.named.has("fixed"),
		);
		await capabilities.evaluate('nested(); mark("after");');
		check(
			"Explicit nested operations finish before the next guest statement",
			JSON.stringify(capabilities.marks) === '["nested","after"]',
		);
	} finally {
		await capabilities.close();
	}
	await capabilities.close();
	check(
		"Repeated close runs extension cleanup exactly once",
		capabilities.cleanups === 1 && capabilities.context.signal.aborted,
	);
	const stale = await bounded(
		Promise.allSettled([capabilities.realm.evaluate("return 1;")]),
		capabilities.abort,
	);
	check(
		"Closed realms reject further evaluation",
		stale[0].status === "rejected",
	);

	const phases = fixture(loaded.core);
	try {
		await phases.evaluate(
			'register(async function() { mark("prefix"); await wait(); mark("tail"); return 7; }); register(function(value) { mark(value); });',
		);
		const first = phases.context.startCallback(phases.callbacks[0]);
		let settled = false;
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
		check(
			"Context callback prefix completes while the final result remains pending",
			Object.isFrozen(first) &&
				!settled &&
				JSON.stringify(phases.marks) === '["prefix"]',
		);
		const second = phases.realm.startCallback(phases.callbacks[1], {
			args: ["second"],
		});
		void second.result.catch(() => undefined);
		void second.synchronous.catch(() => undefined);
		await bounded(
			Promise.all([second.synchronous, second.result]),
			phases.abort,
		);
		check(
			"Realm callback progresses while an earlier async tail is pending",
			!settled && JSON.stringify(phases.marks) === '["prefix","second"]',
		);
		phases.release();
		check(
			"Callback result preserves async ordering and returned data",
			(await bounded(first.result, phases.abort)) === 7 &&
				JSON.stringify(phases.marks) === '["prefix","second","tail"]',
		);
		await phases.evaluate(
			'capture({ marker: "identity" }); register(function(value) { return value.marker === "identity"; });',
		);
		const retained = phases.realm.startCallback(phases.callbacks[2], {
			args: [phases.references[0]],
		});
		void retained.result.catch(() => undefined);
		void retained.synchronous.catch(() => undefined);
		check(
			"Retained guest arguments can return through the owning callback",
			(
				await bounded(
					Promise.all([retained.synchronous, retained.result]),
					phases.abort,
				)
			)[1] === true,
		);
		phases.context.releaseGuestReference(phases.references[0]);
		const revoked = phases.realm.startCallback(phases.callbacks[2], {
			args: [phases.references[0]],
		});
		const outcomes = await bounded(
			Promise.allSettled([revoked.synchronous, revoked.result]),
			phases.abort,
		);
		check(
			"Released guest references reject reuse",
			outcomes.every((outcome) => outcome.status === "rejected"),
		);
	} finally {
		await phases.close();
	}

	const cancellation = fixture(loaded.core);
	try {
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
		check(
			"Owner closure rejects a suspended callback without releasing its host wait",
			outcomes[0].status === "rejected" && cancellation.marks.length === 0,
		);
	} finally {
		await cancellation.close();
	}
	completed = true;
} catch (error) {
	failure = {
		stage: selected ? "contract" : "selection",
		message:
			error instanceof Error
				? error.message.slice(0, 512)
				: "Unknown probe failure",
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
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
