import { emitKeypressEvents } from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";
import type { CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import type { SnapshotSearch } from "./snapshot-search.js";
import type { SemanticSnapshot } from "./snapshot.js";
import {
	type TerminalKey,
	type TerminalRequest,
	TerminalView,
} from "./terminal-view.js";

export interface TerminalOptions {
	session: string;
	url?: string;
	input?: ReadStream;
	output?: WriteStream;
	pollMs?: number;
	execute: (
		argv: readonly string[],
		signal: AbortSignal,
	) => Promise<CommandResult>;
}

export async function runTerminal(options: TerminalOptions): Promise<void> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function")
		throw new AgentBrowserError(
			"unsupported",
			"Terminal mode requires interactive stdin and stdout; use snapshot or text for pipes",
		);
	const pollMs = options.pollMs ?? 1500;
	if (!Number.isSafeInteger(pollMs) || pollMs < 20 || pollMs > 60_000)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid terminal refresh interval",
		);
	const view = new TerminalView(options.session);
	const controller = new AbortController();
	const wasRaw = input.isRaw;
	const wasPaused = input.isPaused();
	let closed = false;
	let busy = false;
	let blockedOutput = false;
	let dirty = false;
	let redraw: ReturnType<typeof setImmediate> | undefined;
	let interval: ReturnType<typeof setInterval> | undefined;
	let scope: { ref: string; document: string } | undefined;
	let resolveDone = () => {};
	let rejectDone = (_error: unknown) => {};
	const done = new Promise<void>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});

	function draw() {
		dirty = true;
		if (closed || redraw || blockedOutput) return;
		redraw = setImmediate(() => {
			redraw = undefined;
			if (closed) return;
			dirty = false;
			const lines = view.render(output.columns, output.rows);
			const frame = lines
				.map((line, index) => `\x1b[${index + 1};1H\x1b[2K${line}`)
				.join("");
			try {
				blockedOutput = !output.write(frame);
			} catch (error) {
				stop(error);
			}
		});
	}

	function drain() {
		blockedOutput = false;
		if (dirty) draw();
	}

	async function selectedTab() {
		const tabs = await options.execute(["tab-list"], controller.signal);
		return (
			tabs.data as {
				selected: boolean;
				url: string | null;
				documentRef: string | null;
			}[]
		).find((tab) => tab.selected);
	}

	async function refresh() {
		let snapshot: CommandResult;
		try {
			snapshot = await options.execute(
				scope
					? ["snapshot", scope.ref, "--observe"]
					: ["snapshot", "--observe"],
				controller.signal,
			);
		} catch (error) {
			if (closed) return;
			if (
				!scope ||
				!(error instanceof AgentBrowserError) ||
				!["stale-reference", "not-found"].includes(error.code)
			)
				throw error;
			scope = undefined;
			view.status = "Inspected node disappeared; returned to document root";
			snapshot = await options.execute(
				["snapshot", "--observe"],
				controller.signal,
			);
		}
		if (closed) return;
		const selected = await selectedTab();
		if (closed) return;
		const page = snapshot.data as SemanticSnapshot;
		if (selected?.documentRef !== page.document)
			throw new AgentBrowserError(
				"stale-reference",
				"Document changed during terminal refresh",
			);
		view.update(page, selected.url ?? "No document");
	}

	async function perform(request?: TerminalRequest) {
		if (closed || busy) return;
		busy = true;
		const command = Array.isArray(request)
			? request[0]
			: request === "root"
				? "root"
				: request?.kind;
		if (command)
			view.status = `Running ${command}... (Ctrl-C detaches and cancels this request)`;
		draw();
		try {
			if (request === "root") {
				scope = undefined;
				view.dismissSearch();
				view.status = "Document root";
			} else if (request && !Array.isArray(request)) {
				const before = await selectedTab();
				if (closed) return;
				if (before?.documentRef !== request.document)
					throw new AgentBrowserError(
						"stale-reference",
						"Search document changed",
					);
				const result = await options.execute(
					["snapshot", request.ref, "--observe"],
					controller.signal,
				);
				if (closed) return;
				const after = await selectedTab();
				if (closed) return;
				const page = result.data as SemanticSnapshot;
				if (
					after?.documentRef !== request.document ||
					page.document !== request.document ||
					page.scope !== request.ref
				)
					throw new AgentBrowserError(
						"stale-reference",
						"Search document changed during inspection",
					);
				scope = request;
				view.dismissSearch();
				view.update(page, after.url ?? "No document");
				view.status =
					"Scoped inspection; Enter acts on fresh selection, U returns to root";
				return;
			} else if (request) {
				const result = await options.execute(request, controller.signal);
				if (closed) return;
				if (request[0] === "find") {
					const selected = await selectedTab();
					if (closed) return;
					const search = result.data as SnapshotSearch;
					if (selected?.documentRef !== search?.document)
						throw new AgentBrowserError(
							"stale-reference",
							"Search document changed",
						);
					view.showSearch(
						search,
						request[request.length - 1],
						request.slice(1, -2).includes("--regex"),
					);
					return;
				}
				view.dismissSearch();
				view.status = `${request[0]} completed`;
			}
			await refresh();
		} catch (error) {
			if (!closed)
				view.status = `${error instanceof AgentBrowserError ? error.code : "network-error"}: operation failed; u refreshes, g opens a URL`;
		} finally {
			busy = false;
			draw();
		}
	}

	function keypress(text: string | undefined, key: TerminalKey = {}) {
		if (closed) return;
		const action = view.key(text, key, busy);
		if (action === "quit") stop();
		else if (action === "refresh") void perform();
		else if (action) void perform(action);
		else draw();
	}

	function stop(error?: unknown) {
		if (closed) return;
		let failure = error;
		closed = true;
		controller.abort();
		clearInterval(interval);
		clearImmediate(redraw);
		input.off("keypress", keypress);
		input.off("end", detach);
		input.off("error", stop);
		output.off("error", stop);
		output.off("resize", draw);
		output.off("drain", drain);
		process.off("SIGINT", detach);
		process.off("SIGTERM", detach);
		try {
			input.setRawMode(wasRaw);
			if (wasPaused) input.pause();
		} catch (restoreError) {
			failure ??= restoreError;
		}
		try {
			if (!output.destroyed && output.writable)
				output.write("\x1b[?2004l\x1b[?25h\x1b[?1049l");
		} catch (restoreError) {
			failure ??= restoreError;
		}
		if (failure) rejectDone(failure);
		else resolveDone();
	}

	function detach() {
		stop();
	}

	try {
		emitKeypressEvents(input);
		input.on("keypress", keypress);
		input.once("end", detach);
		input.once("error", stop);
		output.once("error", stop);
		output.on("resize", draw);
		output.on("drain", drain);
		process.once("SIGINT", detach);
		process.once("SIGTERM", detach);
		input.setRawMode(true);
		input.resume();
		output.write("\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[2J");
		interval = setInterval(() => {
			if (!view.editing && !view.searching) void perform();
		}, pollMs);
		void perform(options.url ? ["open", options.url] : undefined);
	} catch (error) {
		stop(error);
	}
	await done;
}
