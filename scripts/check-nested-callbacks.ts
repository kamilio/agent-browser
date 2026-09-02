import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: {
	label: string;
	passed: boolean;
	expected: unknown[];
	observed: unknown[];
}[] = [];
const core = await loadExtendedCore();
const callbacks = new Map<string, unknown>();
const trace: unknown[] = [];
const pending: Promise<unknown>[] = [];
let release!: () => void;
const hold = new Promise<void>((resolve) => {
	release = resolve;
});
const surface = core.createHostObject({
	methods: {
		listen(name, callback) {
			callbacks.set(String(name), callback);
		},
		async dispatch(name) {
			trace.push(`${name}:start`);
			const invocation = core.startCallback(callbacks.get(String(name)), [], {
				thisValue: surface,
			});
			pending.push(invocation.result);
			void invocation.result.catch(() => undefined);
			await invocation.synchronous;
			trace.push(`${name}:end`);
			return 37;
		},
	},
});
const realm = core.createRealm({
	bindings: {
		surface,
		mark: (value: unknown) => {
			trace.push(value);
		},
		hold: () => hold,
	},
	budget: new core.Budget({ maxSteps: 20_000, deadline: Date.now() + 5000 }),
	maxEvaluations: 5,
	maxSourceLength: 8192,
	sink: { log() {}, error() {} },
});
let completed = false;
async function bounded<Result>(promise: Promise<Result>) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Nested callback probe deadline exceeded")),
					2000,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
function check(label: string, expected: unknown[]) {
	const passed = JSON.stringify(trace) === JSON.stringify(expected);
	checks.push({ label, passed, expected, observed: [...trace] });
	if (process.argv.includes("--trace"))
		console.error(
			`${passed ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(trace)}`,
		);
	if (!passed) throw new Error(label);
	trace.length = 0;
}
try {
	await bounded(
		realm.evaluate(
			'surface.listen("sync", function() { mark("listener"); }); mark("before"); var result = surface.dispatch("sync"); mark(result === 37); mark("after");',
		),
	);
	check(
		"Guest host-method call observes listener prefix and a non-Promise result before continuing",
		["before", "sync:start", "listener", "sync:end", true, "after"],
	);
	await bounded(
		realm.evaluate(
			'surface.listen("inner", function() { mark("inner listener"); }); surface.listen("outer", function() { mark("outer before"); surface.dispatch("inner"); mark("outer after"); }); surface.dispatch("outer"); mark("script after");',
		),
	);
	check("Nested host callbacks preserve inner and outer synchronous ordering", [
		"outer:start",
		"outer before",
		"inner:start",
		"inner listener",
		"inner:end",
		"outer after",
		"outer:end",
		"script after",
	]);
	await bounded(
		realm.evaluate(
			'surface.listen("async", async function() { mark("prefix"); await hold(); mark("tail"); }); surface.dispatch("async"); mark("script after");',
		),
	);
	check(
		"An async listener final result does not block guest host-method return",
		["async:start", "prefix", "async:end", "script after"],
	);
	release();
	await bounded(Promise.all(pending));
	check("The released asynchronous tail finishes separately", ["tail"]);
	completed = true;
} finally {
	release();
	await bounded(realm.close());
	await bounded(Promise.allSettled(pending));
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "existing-experimental-core-in-memory",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
