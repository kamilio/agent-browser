import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = await loadExtendedCore();

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

async function bounded<Result>(promise: Promise<Result>): Promise<Result> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Callback probe deadline exceeded")),
					2000,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

function fixture() {
	const callbacks: unknown[] = [];
	const marks: unknown[] = [];
	const results: Promise<unknown>[] = [];
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const realm = core.createRealm({
		bindings: {
			register: (callback: unknown) => {
				callbacks.push(callback);
			},
			mark: (value: unknown) => {
				marks.push(value);
			},
			wait: () => waiting,
		},
		budget: new core.Budget({ maxSteps: 10_000, deadline: Date.now() + 5000 }),
		maxEvaluations: 4,
		maxSourceLength: 4096,
		sink: { log() {}, error() {} },
	});
	return {
		realm,
		marks,
		release,
		start(index = 0) {
			const invocation = core.startCallback(callbacks[index], [], {
				thisValue: undefined,
			});
			results.push(invocation.result);
			void invocation.result.catch(() => undefined);
			void invocation.synchronous.catch(() => undefined);
			return invocation;
		},
		async close() {
			await bounded(realm.close());
			await bounded(Promise.allSettled(results));
		},
	};
}

try {
	const pending = fixture();
	try {
		await bounded(
			pending.realm.evaluate(
				'register(async function() { mark("prefix"); await wait(); mark("tail"); return 7; }); register(function() { mark("second"); });',
			),
		);
		const first = pending.start();
		let settled = false;
		void first.result.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await bounded(first.synchronous);
		check(
			"The synchronous boundary observes effects before the first host suspension",
			JSON.stringify(pending.marks) === '["prefix"]',
		);
		check(
			"The final result remains pending after the synchronous boundary",
			!settled,
		);
		const second = pending.start(1);
		await bounded(second.synchronous);
		await bounded(second.result);
		check(
			"Another listener completes while the first listener is suspended",
			JSON.stringify(pending.marks) === '["prefix","second"]' && !settled,
		);
		pending.release();
		check(
			"Final settlement preserves the async return value and ordering",
			(await bounded(first.result)) === 7 &&
				JSON.stringify(pending.marks) === '["prefix","second","tail"]',
		);
	} finally {
		await pending.close();
	}

	const synchronousFailure = fixture();
	try {
		await bounded(
			synchronousFailure.realm.evaluate(
				'register(function() { throw new Error("synchronous fixture failure"); });',
			),
		);
		const invocation = synchronousFailure.start();
		const outcomes = await bounded(
			Promise.allSettled([invocation.synchronous, invocation.result]),
		);
		check(
			"A synchronous listener failure rejects both boundaries",
			outcomes.every((outcome) => outcome.status === "rejected"),
		);
	} finally {
		await synchronousFailure.close();
	}

	const asynchronousFailure = fixture();
	try {
		await bounded(
			asynchronousFailure.realm.evaluate(
				'register(async function() { await wait(); throw new Error("asynchronous fixture failure"); });',
			),
		);
		const invocation = asynchronousFailure.start();
		await bounded(invocation.synchronous);
		asynchronousFailure.release();
		const [outcome] = await bounded(Promise.allSettled([invocation.result]));
		check(
			"An async-tail failure does not retroactively reject a completed prefix",
			outcome.status === "rejected",
		);
	} finally {
		await asynchronousFailure.close();
	}

	const closing = fixture();
	try {
		await bounded(
			closing.realm.evaluate(
				'register(async function() { await wait(); mark("must not run"); });',
			),
		);
		const invocation = closing.start();
		await bounded(invocation.synchronous);
		await closing.close();
		const [outcome] = await bounded(Promise.allSettled([invocation.result]));
		check(
			"Closing the owner rejects suspended results without releasing the host wait",
			outcome.status === "rejected" && closing.marks.length === 0,
		);
		check("The closed realm reports terminal ownership", closing.realm.closed);
	} finally {
		await closing.close();
	}
} catch (error) {
	checks.push({
		label: error instanceof Error ? error.message : "Callback probe failed",
		passed: false,
	});
}

console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Existing experimental SafeJS public core; in-memory callback contract only. Not published-SDK verification, DOM dispatch conformance, public-site or live terminal acceptance.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((entry) => !entry.passed)) process.exitCode = 1;
