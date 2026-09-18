import type { DocumentTree } from "../src/document.js";
import { bindDocumentWebSockets } from "../src/document-websocket-owner.js";
import { extensionPageRuntime } from "../src/extension-page-runtime.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import type { PageRuntimeFactory } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";
import { pageWebSocketCheckLabels } from "../src/page-websocket-check-labels.js";
import type {
	NativeWebSocketMessage,
	WebSocketCloseResult,
	WebSocketConnection,
	WebSocketConnectOptions,
	WebSocketTransport,
} from "../src/websocket-transport.js";
import { loadReleasedCore } from "./released-safejs-core.js";

const startedAt = new Date().toISOString();
const deadline = Date.now() + 30_000;
const checkLabels = {
	"constructor-identity": pageWebSocketCheckLabels[0],
	"synchronous-admission": pageWebSocketCheckLabels[1],
	connecting: pageWebSocketCheckLabels[2],
	open: pageWebSocketCheckLabels[3],
	"text-send": pageWebSocketCheckLabels[4],
	"text-receive": pageWebSocketCheckLabels[5],
	"binary-send": pageWebSocketCheckLabels[6],
	"binary-receive": pageWebSocketCheckLabels[7],
	listeners: pageWebSocketCheckLabels[8],
	"close-open": pageWebSocketCheckLabels[9],
	"close-connecting": pageWebSocketCheckLabels[10],
	"bootstrap-authority": pageWebSocketCheckLabels[11],
	"document-cleanup": pageWebSocketCheckLabels[12],
	"realm-cleanup": pageWebSocketCheckLabels[13],
	"all-owners-closed": pageWebSocketCheckLabels[14],
} as const;
type CheckId = keyof typeof checkLabels;
const checks: { id: CheckId; label: string; passed: boolean }[] = [];
const cleanupFailures: { stage: string; message: string }[] = [];
const owners: Fixture[] = [];
let selected: { packageName: string; version: string } | undefined;
let failure: { stage: string; message: string } | undefined;
let stage = "selection";
let completed = false;

function message(error: unknown) {
	return error instanceof Error
		? error.message.slice(0, 512)
		: "Unknown failure";
}

function requireValue(passed: boolean, detail: string): asserts passed {
	if (!passed) throw new Error(detail);
}

async function bounded<Value>(
	label: string,
	operation: () => Value | Promise<Value>,
	timeoutMs = 2000,
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

async function check(id: CheckId, operation: () => void | Promise<void>) {
	stage = id;
	try {
		requireValue(
			pageWebSocketCheckLabels[checks.length] === checkLabels[id],
			"Fixture check order mismatch",
		);
		requireValue(Date.now() < deadline, "Fixture deadline exceeded");
		await bounded(id, operation, Math.min(2000, deadline - Date.now()));
		checks.push({ id, label: checkLabels[id], passed: true });
	} catch (error) {
		checks.push({ id, label: checkLabels[id], passed: false });
		throw error;
	}
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((resolveValue, rejectValue) => {
		resolve = resolveValue;
		reject = rejectValue;
	});
	return { promise, resolve, reject };
}

class MemoryConnection implements WebSocketConnection {
	private readonly completion = deferred<WebSocketCloseResult>();
	private reader?: ReturnType<
		typeof deferred<NativeWebSocketMessage | undefined>
	>;
	private readonly messages: NativeWebSocketMessage[] = [];
	readonly closed = this.completion.promise;
	readonly sent: (string | Uint8Array)[] = [];
	readonly closeCalls: { code: number; reason: string }[] = [];
	abortCalls = 0;
	finished = false;
	readCalls = 0;

	constructor(
		readonly url: string,
		readonly protocol: string,
	) {}

	read(): Promise<NativeWebSocketMessage | undefined> {
		this.readCalls++;
		requireValue(this.readCalls <= 32, "Fixture read limit exceeded");
		requireValue(!this.reader, "Concurrent in-memory reads");
		if (this.messages.length) return Promise.resolve(this.messages.shift());
		if (this.finished) return Promise.resolve(undefined);
		this.reader = deferred<NativeWebSocketMessage | undefined>();
		return this.reader.promise;
	}

	async send(data: string | Uint8Array): Promise<void> {
		requireValue(!this.finished, "Send after fixture connection close");
		requireValue(this.sent.length < 8, "Fixture send limit exceeded");
		this.sent.push(data);
	}

	close(code = 1000, reason = ""): Promise<WebSocketCloseResult> {
		this.closeCalls.push({ code, reason });
		this.finish({ code, reason, wasClean: true });
		return this.closed;
	}

	abort(): void {
		this.abortCalls++;
		this.finish({ code: 1006, reason: "", wasClean: false });
	}

	push(data: string | Uint8Array): void {
		requireValue(!this.finished, "Receive after fixture connection close");
		const next = { data };
		if (this.reader) {
			const reader = this.reader;
			this.reader = undefined;
			reader.resolve(next);
		} else {
			requireValue(this.messages.length < 8, "Fixture message limit exceeded");
			this.messages.push(next);
		}
	}

	finish(result: WebSocketCloseResult): void {
		if (this.finished) return;
		this.finished = true;
		this.messages.length = 0;
		this.reader?.resolve(undefined);
		this.reader = undefined;
		this.completion.resolve(result);
	}
}

class MemoryTransport implements WebSocketTransport {
	readonly requests: {
		url: string;
		origin: string;
		protocols: readonly string[];
		signal?: AbortSignal;
		aborted: boolean;
		pending: boolean;
		connection?: MemoryConnection;
		completion: ReturnType<typeof deferred<WebSocketConnection>>;
		detach(): void;
	}[] = [];

	connect(url: string, options: WebSocketConnectOptions) {
		requireValue(this.requests.length < 8, "Fixture connection limit exceeded");
		const request: (typeof this.requests)[number] = {
			url,
			origin: options.origin,
			protocols: [...(options.protocols ?? [])],
			signal: options.signal,
			aborted: options.signal?.aborted ?? false,
			pending: true,
			completion: deferred<WebSocketConnection>(),
			detach: () => options.signal?.removeEventListener("abort", abort),
		};
		const abort = () => {
			request.aborted = true;
		};
		options.signal?.addEventListener("abort", abort, { once: true });
		this.requests.push(request);
		return request.completion.promise;
	}

	open(index: number, protocol = "") {
		const request = this.requests[index];
		requireValue(!!request?.pending, "No pending fixture connection");
		const connection = new MemoryConnection(request.url, protocol);
		request.connection = connection;
		request.pending = false;
		request.completion.resolve(connection);
		return connection;
	}

	dispose() {
		for (const request of this.requests) {
			request.detach();
			if (request.pending) {
				request.pending = false;
				request.completion.reject(new Error("Fixture disposed"));
			}
			request.connection?.abort();
		}
	}
}

interface Fixture {
	label: string;
	tree: DocumentTree;
	transport: MemoryTransport;
	callbackStarts: number;
	scripts?: PageScripts;
}

function fixture(runtime: PageRuntimeFactory, label: string): Fixture {
	const tree = parseHtmlDocument(
		'<p id="event"></p>',
		`https://fixture.invalid/${label}.html`,
		{
			limits: {
				maxNodes: 32,
				maxDepth: 8,
				maxTextCodeUnits: 4096,
				maxChanges: 256,
			},
		},
	);
	const owner: Fixture = {
		label,
		tree,
		transport: new MemoryTransport(),
		callbackStarts: 0,
	};
	owners.push(owner);
	bindDocumentWebSockets(tree, owner.transport, {
		limits: { maxConcurrent: 4, maxConnections: 8, handshakeTimeoutMs: 5000 },
	});
	owner.scripts = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		{
			createPageRuntime(options) {
				const instance = runtime.createPageRuntime(options);
				return {
					get budget() {
						return instance.budget;
					},
					get closed() {
						return instance.closed;
					},
					initialize: () => instance.initialize(),
					evaluate: (source, evaluationOptions) =>
						instance.evaluate(source, evaluationOptions),
					copyResult: (value) => instance.copyResult(value),
					errorDetails: (error) => instance.errorDetails(error),
					close: () => instance.close(),
					startCallback(callback, args, callbackOptions) {
						owner.callbackStarts++;
						return instance.startCallback(callback, args, callbackOptions);
					},
				};
			},
		},
		{
			limits: {
				maxSteps: 1_600_000,
				maxRuns: 64,
				maxSourceCodeUnits: 16_384,
				timeoutMs: 1000,
			},
		},
	);
	return owner;
}

async function settle(owner: Fixture, condition: () => boolean = () => true) {
	for (let attempt = 0; attempt < 200; attempt++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 2));
		const metrics = owner.scripts?.metrics();
		if (
			condition() &&
			(!owner.scripts || (metrics?.pendingCallbacks === 0 && !metrics.active))
		)
			return;
	}
	throw new Error("Fixture callback settlement deadline exceeded");
}

function eventText(owner: Fixture) {
	const entry = [...owner.tree.walk()].find(
		({ node }) => node.attributes.id === "event",
	);
	requireValue(!!entry, "Fixture event marker is missing");
	return owner.tree.textContent(entry.node.id);
}

async function evaluate(owner: Fixture, source: string) {
	requireValue(!!owner.scripts, "Fixture scripts unavailable");
	const result = await owner.scripts.evaluate(source);
	requireValue(result.ok, `Guest evaluation failed: ${result.error?.code}`);
	return result.value;
}

async function expectGuest(owner: Fixture, source: string) {
	requireValue(
		(await evaluate(owner, source)) === true,
		"Guest assertion failed",
	);
}

function sentBytes(
	connection: MemoryConnection,
	index: number,
	bytes: number[],
) {
	const actual = connection.sent[index];
	return (
		actual instanceof Uint8Array &&
		actual.length === bytes.length &&
		bytes.every((value, offset) => actual[offset] === value)
	);
}

try {
	const loaded = await bounded("selection", () =>
		loadReleasedCore(
			process.env.AGENT_BROWSER_SAFEJS_RELEASE_ROOT,
			process.env.AGENT_BROWSER_SAFEJS_RELEASE_VERSION,
		),
	);
	selected = { packageName: loaded.packageName, version: loaded.version };
	const runtime = extensionPageRuntime(loaded.core);
	const owner = fixture(runtime, "websocket-main");
	let connection: MemoryConnection | undefined;
	await check("constructor-identity", async () => {
		await expectGuest(
			owner,
			`
			var names = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
			var identities = typeof WebSocket === "function" && WebSocket === window.WebSocket && WebSocket === self.WebSocket && WebSocket === globalThis.WebSocket;
			var constants = names.every(function(name, index) {
				return [WebSocket, WebSocket.prototype].every(function(target) {
					var descriptor = Object.getOwnPropertyDescriptor(target, name);
					return descriptor.value === index && descriptor.writable === false && descriptor.configurable === false;
				});
			});
			var denied = 0;
			try { WebSocket("wss://fixture.invalid/no-new"); } catch (error) { if (error instanceof TypeError) denied++; }
			try { WebSocket.prototype.send.call({}, "bad"); } catch (error) { if (error instanceof TypeError) denied++; }
			try { Object.getOwnPropertyDescriptor(WebSocket.prototype, "url").get.call({}); } catch (error) { if (error instanceof TypeError) denied++; }
			return identities && constants && denied === 3;
		`,
		);
		requireValue(
			owner.transport.requests.length === 0,
			"Constructor inspection connected",
		);
	});
	await check("synchronous-admission", async () => {
		await expectGuest(
			owner,
			`
			var rejected = 0;
			var invalid = [
				["wss://fixture.invalid/socket#fragment"],
				["ftp://fixture.invalid/socket"],
				["wss://fixture.invalid/socket", ["chat", "chat"]],
				["wss://fixture.invalid/socket", "not a token"],
				["wss://fixture.invalid/socket", ["chat", 7]]
			];
			invalid.forEach(function(args) {
				try { new WebSocket(args[0], args[1]); } catch (error) { rejected++; }
			});
			return rejected === invalid.length;
		`,
		);
		await settle(owner);
		requireValue(
			owner.transport.requests.length === 0,
			"Invalid constructor caused transport effects",
		);
	});
	await check("connecting", async () => {
		await expectGuest(
			owner,
			`
			var socket = new WebSocket("wss://fixture.invalid/socket", ["chat"]);
			var received = [];
			var openReceiver = false;
			var closeReceiver = false;
			var closeRecord = null;
			socket.onopen = function(event) {
				openReceiver = this === socket && event.target === socket && event.currentTarget === socket && event.type === "open" && socket.readyState === WebSocket.OPEN;
				document.getElementById("event").textContent = "open";
			};
			socket.onmessage = function(event) {
				received.push({ data: event.data, origin: event.origin, lastEventId: event.lastEventId, receiver: this === socket && event.target === socket && event.currentTarget === socket, type: event.type });
				document.getElementById("event").textContent = "message:" + received.length;
			};
			socket.onclose = function(event) {
				closeReceiver = this === socket && event.target === socket && event.currentTarget === socket && event.type === "close";
				closeRecord = { code: event.code, reason: event.reason, wasClean: event.wasClean };
				document.getElementById("event").textContent = "closed";
			};
			var earlySendRejected = false;
			try { socket.send("too early"); } catch (error) { earlySendRejected = true; }
			return socket instanceof WebSocket && socket.url === "wss://fixture.invalid/socket" && socket.readyState === WebSocket.CONNECTING && socket.protocol === "" && socket.extensions === "" && socket.bufferedAmount === 0 && socket.binaryType === "blob" && earlySendRejected;
		`,
		);
		await settle(owner, () => owner.transport.requests.length === 1);
		const request = owner.transport.requests[0];
		requireValue(
			request.url === "wss://fixture.invalid/socket" &&
				request.origin === "https://fixture.invalid" &&
				request.protocols.length === 1 &&
				request.protocols[0] === "chat" &&
				request.pending &&
				!request.aborted,
			"Unexpected connection admission",
		);
	});
	await check("open", async () => {
		connection = owner.transport.open(0, "chat");
		await settle(owner, () => eventText(owner) === "open");
		await expectGuest(
			owner,
			'return openReceiver && socket.readyState === WebSocket.OPEN && socket.protocol === "chat" && socket.extensions === "";',
		);
	});
	await check("text-send", async () => {
		await evaluate(owner, 'socket.send("hello");');
		await settle(owner, () => connection?.sent.length === 1);
		requireValue(connection?.sent[0] === "hello", "Text send mismatch");
		await expectGuest(owner, "return socket.bufferedAmount === 0;");
	});
	await check("text-receive", async () => {
		requireValue(!!connection, "No open connection");
		connection.push("reply");
		await settle(owner, () => eventText(owner) === "message:1");
		await expectGuest(
			owner,
			'return received.length === 1 && received[0].data === "reply" && received[0].type === "message" && received[0].receiver && received[0].origin === "wss://fixture.invalid" && received[0].lastEventId === "";',
		);
	});
	await check("binary-send", async () => {
		await evaluate(
			owner,
			`
			var backing = new Uint8Array([99, 4, 5, 88]);
			socket.send(new Uint8Array(backing.buffer, 1, 2));
			backing.fill(0);
			var whole = new Uint8Array([6, 7]);
			socket.send(whole.buffer);
			whole.fill(0);
		`,
		);
		await settle(owner, () => connection?.sent.length === 3);
		requireValue(
			!!connection &&
				sentBytes(connection, 1, [4, 5]) &&
				sentBytes(connection, 2, [6, 7]),
			"Binary send failed copy or view bounds",
		);
	});
	await check("binary-receive", async () => {
		await expectGuest(
			owner,
			'socket.binaryType = "arraybuffer"; return socket.binaryType === "arraybuffer";',
		);
		const payload = new Uint8Array([10, 11, 12]);
		requireValue(!!connection, "No open connection");
		connection.push(payload);
		await settle(owner, () => eventText(owner) === "message:2");
		payload.fill(0);
		await expectGuest(
			owner,
			`
			var binary = received[1].data;
			var bytes = new Uint8Array(binary);
			return binary instanceof ArrayBuffer && bytes.length === 3 && bytes[0] === 10 && bytes[1] === 11 && bytes[2] === 12 && received[1].receiver;
		`,
		);
	});
	await check("listeners", async () => {
		await evaluate(
			owner,
			`
			var order = [];
			var batches = 0;
			socket.onmessage = function() { order.push("property"); };
			function onceListener() { order.push("once"); }
			function removedListener() { order.push("removed"); }
			function normalListener() { order.push("normal"); }
			socket.addEventListener("message", onceListener, { once: true });
			socket.addEventListener("message", removedListener);
			socket.removeEventListener("message", removedListener);
			socket.addEventListener("message", normalListener);
			socket.addEventListener("message", normalListener);
			socket.addEventListener("message", function() {
				batches++;
				document.getElementById("event").textContent = "batch:" + batches;
			});
		`,
		);
		requireValue(!!connection, "No open connection");
		connection.push("first");
		await settle(owner, () => eventText(owner) === "batch:1");
		connection.push("second");
		await settle(owner, () => eventText(owner) === "batch:2");
		await expectGuest(
			owner,
			'return order.join(",") === "property,once,normal,property,normal";',
		);
	});
	await check("close-open", async () => {
		await expectGuest(
			owner,
			`
			var invalidCloses = 0;
			try { socket.close(1001); } catch (error) { invalidCloses++; }
			try { socket.close(1000, "x".repeat(124)); } catch (error) { invalidCloses++; }
			return invalidCloses === 2 && socket.readyState === WebSocket.OPEN;
		`,
		);
		requireValue(
			Number(connection?.closeCalls.length) === 0,
			"Invalid close reached transport",
		);
		await expectGuest(
			owner,
			'socket.close(3001, "done"); return socket.readyState === WebSocket.CLOSING;',
		);
		await settle(owner, () => eventText(owner) === "closed");
		await expectGuest(
			owner,
			'return socket.readyState === WebSocket.CLOSED && closeReceiver && closeRecord.code === 3001 && closeRecord.reason === "done" && closeRecord.wasClean;',
		);
		requireValue(
			connection?.closeCalls.length === 1 &&
				connection.closeCalls[0].code === 3001 &&
				connection.closeCalls[0].reason === "done",
			"Close was not forwarded exactly once",
		);
	});
	await check("close-connecting", async () => {
		await evaluate(
			owner,
			`
			var connectingSocket = new WebSocket("wss://fixture.invalid/connecting");
			var connectingOpens = 0;
			var connectingCloses = 0;
			connectingSocket.onopen = function() { connectingOpens++; };
			connectingSocket.onclose = function() { connectingCloses++; document.getElementById("event").textContent = "connecting-closed"; };
		`,
		);
		await settle(owner, () => owner.transport.requests.length === 2);
		await evaluate(owner, "connectingSocket.close();");
		await settle(owner, () => owner.transport.requests[1].aborted);
		const late = owner.transport.open(1);
		await settle(
			owner,
			() => late.finished && eventText(owner) === "connecting-closed",
		);
		await expectGuest(
			owner,
			"return connectingSocket.readyState === WebSocket.CLOSED && connectingOpens === 0 && connectingCloses === 1;",
		);
		requireValue(
			late.abortCalls === 1,
			"Late connection was not aborted exactly once",
		);
	});
	await check("bootstrap-authority", async () => {
		await expectGuest(
			owner,
			`
			var bootstrapDenied = 0;
			try { __agentBrowserWebSocketBootstrap(); } catch (error) { bootstrapDenied++; }
			try { __agentBrowserWebSocketBootstrap(); } catch (error) { bootstrapDenied++; }
			return bootstrapDenied === 2 && Object.getOwnPropertyNames(socket).length === 0 && socket instanceof WebSocket && window.WebSocket === WebSocket;
		`,
		);
	});
	await check("document-cleanup", async () => {
		await evaluate(
			owner,
			`
			var cleanupSocket = new WebSocket("wss://fixture.invalid/document-cleanup");
			cleanupSocket.onopen = function() { document.getElementById("event").textContent = "cleanup-open"; };
			cleanupSocket.onmessage = cleanupSocket.onerror = cleanupSocket.onclose = function() { console.log("unexpected post-close callback"); };
		`,
		);
		await settle(owner, () => owner.transport.requests.length === 3);
		const cleanupConnection = owner.transport.open(2);
		await settle(
			owner,
			() =>
				eventText(owner) === "cleanup-open" && cleanupConnection.readCalls > 0,
		);
		const before = owner.callbackStarts;
		cleanupConnection.push("queued-before-document-close");
		owner.tree.close();
		await owner.scripts?.close();
		await settle(owner, () => cleanupConnection.finished);
		const metrics = owner.scripts?.metrics();
		requireValue(
			metrics?.closed === true &&
				metrics.pendingCallbacks === 0 &&
				!metrics.active &&
				owner.callbackStarts === before &&
				cleanupConnection.abortCalls > 0,
			"Document cleanup left work or delivered a callback",
		);
	});
	await check("realm-cleanup", async () => {
		const realmOwner = fixture(runtime, "websocket-realm");
		await evaluate(
			realmOwner,
			`
			var realmSocket = new WebSocket("wss://fixture.invalid/realm-cleanup");
			realmSocket.onopen = function() { document.getElementById("event").textContent = "realm-open"; };
			realmSocket.onmessage = realmSocket.onerror = realmSocket.onclose = function() { console.log("unexpected post-close callback"); };
		`,
		);
		await settle(realmOwner, () => realmOwner.transport.requests.length === 1);
		const realmConnection = realmOwner.transport.open(0);
		await settle(
			realmOwner,
			() =>
				eventText(realmOwner) === "realm-open" && realmConnection.readCalls > 0,
		);
		const before = realmOwner.callbackStarts;
		realmConnection.push("queued-before-realm-close");
		await realmOwner.scripts?.close();
		await settle(realmOwner, () => realmConnection.finished);
		const metrics = realmOwner.scripts?.metrics();
		requireValue(
			metrics?.closed === true &&
				metrics.pendingCallbacks === 0 &&
				!metrics.active &&
				realmOwner.callbackStarts === before &&
				realmConnection.abortCalls > 0,
			"Realm cleanup left work or delivered a callback",
		);
	});
	completed = true;
} catch (error) {
	failure = { stage, message: message(error) };
} finally {
	for (const owner of owners) {
		const cleanup: [string, () => void | Promise<void>][] = [
			["document", () => owner.tree.close()],
			["transport", () => owner.transport.dispose()],
			["scripts", () => owner.scripts?.close()],
			["settlement", () => settle(owner)],
		];
		for (const [kind, operation] of cleanup) {
			const cleanupStage = `${owner.label}:${kind}`;
			try {
				await bounded(cleanupStage, operation);
			} catch (error) {
				const problem = { stage: cleanupStage, message: message(error) };
				cleanupFailures.push(problem);
				failure ??= problem;
			}
		}
	}
	if (!failure) {
		try {
			await check("all-owners-closed", () => {
				requireValue(
					owners.length === 2 &&
						owners.every((owner) => {
							const metrics = owner.scripts?.metrics();
							return (
								metrics?.closed === true &&
								!metrics.active &&
								metrics.pendingCallbacks === 0 &&
								owner.transport.requests.every(
									(request) =>
										!request.pending &&
										(!request.connection || request.connection.finished),
								)
							);
						}),
					"Fixture owners or resources remain open",
				);
			});
		} catch (error) {
			failure = { stage, message: message(error) };
			cleanupFailures.push(failure);
		}
	}
	if (failure) {
		completed = false;
		process.exitCode = 1;
	}
	const plannedCheckIds = Object.keys(checkLabels) as CheckId[];
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				selected: selected ?? null,
				scope: "explicit-local-release-websocket-bridge-in-memory",
				realNetwork: false,
				realSockets: false,
				realPty: false,
				credentials: false,
				devices: false,
				publicationProvenanceVerified: false,
				completed,
				...(failure ? { failure } : {}),
				plannedCheckIds,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
				failed: checks.filter((entry) => !entry.passed).length,
				notReached: plannedCheckIds.filter(
					(id) => !checks.some((entry) => entry.id === id),
				),
				cleanupFailures,
				evidence: owners.map((owner) => ({
					label: owner.label,
					callbackStarts: owner.callbackStarts,
					metrics: owner.scripts?.metrics() ?? null,
					requests: owner.transport.requests.map((request) => ({
						url: request.url,
						origin: request.origin,
						protocols: request.protocols,
						aborted: request.aborted,
						pending: request.pending,
						connection: request.connection
							? {
									finished: request.connection.finished,
									abortCalls: request.connection.abortCalls,
									closeCalls: request.connection.closeCalls,
									readCalls: request.connection.readCalls,
									sent: request.connection.sent.map((data) =>
										typeof data === "string" ? data : [...data],
									),
								}
							: null,
					})),
				})),
				limitations: [
					"Prepared fixture requires separate exact execution authorization; source alone is not a pass.",
					"Only synchronous guest handlers; core19 reentry expectations are unchanged and not retried here.",
					"No real transport, website, Zoom, WebRTC, audio, device or credential acceptance.",
					"Binary receive is exercised only in explicit arraybuffer mode, not Blob mode.",
					"Cleanup metrics cover fixture-owned resources, not independent proof of SDK reference reclamation.",
					"In-process deadlines are cooperative; external guarded process and memory bounds remain required.",
				],
			},
			null,
			2,
		),
	);
}
