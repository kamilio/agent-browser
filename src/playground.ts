import { capturePng, capturePdf } from "./capture-client.js";
import type { CommandResult } from "./command-host.js";
import type { DomInspection } from "./dom-inspection.js";
import type { PageConsoleSnapshot } from "./page-console.js";
import type { SessionRequests } from "./session.js";
import type { SemanticSnapshot } from "./snapshot.js";

export function parsePlaygroundCommand(input: string): string[] {
	if (input.length > 16_384) throw new Error("Command is too long");
	const words: string[] = [];
	let word = "";
	let quote: string | null = null;
	let escaped = false;
	let started = false;
	for (const character of input) {
		if (escaped) {
			word += character;
			escaped = false;
			started = true;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			started = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = null;
			else word += character;
			started = true;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			started = true;
			continue;
		}
		if (/\s/.test(character)) {
			if (started) {
				words.push(word);
				word = "";
				started = false;
			}
		} else {
			word += character;
			started = true;
		}
	}
	if (escaped || quote) throw new Error("Finish the command’s quote or escape");
	if (started) words.push(word);
	if (!words.length || words.length > 256)
		throw new Error("Enter a bounded CLI command");
	return words;
}

export function playgroundUrl(value: string) {
	if (!value.trim() || value.length > 16_384 || /\p{Cc}/u.test(value))
		throw new Error("Enter a valid HTTP(S) document URL");
	const normalized = value.trim();
	const url = new URL(
		/^[a-z][a-z0-9+.-]*:/i.test(normalized)
			? normalized
			: `https://${normalized}`,
	);
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password
	)
		throw new Error(
			"Only HTTP(S) URLs without embedded credentials are supported",
		);
	return url.href;
}

export function playgroundViewport(width: string, height: string) {
	const values = [width, height].map((value) => {
		const normalized = value.trim();
		if (!/^\d{1,5}$/.test(normalized))
			throw new Error(
				"Viewport dimensions must be whole CSS pixels from 1 to 16384",
			);
		const number = Number(normalized);
		if (number < 1 || number > 16384)
			throw new Error(
				"Viewport dimensions must be whole CSS pixels from 1 to 16384",
			);
		return number;
	});
	return { width: values[0], height: values[1] };
}

export function playgroundViewportResponse(data: unknown, tabId: string) {
	if (!data || typeof data !== "object")
		throw new Error("Invalid viewport response");
	const value = data as Record<string, unknown>;
	if (value.tabId !== tabId)
		throw new Error("Selected tab changed during viewport inspection");
	if (
		typeof value.key !== "string" ||
		!/^[A-Za-z0-9:-]{1,128}$/.test(value.key)
	)
		throw new Error("Invalid viewport response");
	if (
		![value.width, value.height].every(
			(size) =>
				typeof size === "number" &&
				Number.isSafeInteger(size) &&
				size >= 1 &&
				size <= 16384,
		) ||
		value.deviceScaleFactor !== 1 ||
		value.profile !== "logical-css-viewport"
	)
		throw new Error("Invalid viewport response");
	return {
		tabId,
		key: value.key,
		width: value.width as number,
		height: value.height as number,
	};
}

export function playgroundText(snapshot: SemanticSnapshot) {
	return (
		(snapshot.html
			? `# HTML partial; automatic JS ${snapshot.html.scripting ? "enabled (partial)" : "off"}\n`
			: "") +
		snapshot.entries
			.map((entry) => {
				const state = Object.entries(entry)
					.filter(([key]) => !["ref", "role", "name", "depth"].includes(key))
					.map(([key, value]) => ` [${key}=${JSON.stringify(value)}]`)
					.join("");
				return `${"  ".repeat(Math.min(entry.depth, 24))}- ${entry.role} ${JSON.stringify(entry.name)} [ref=${entry.ref}]${state}`;
			})
			.join("\n") +
		(snapshot.truncated ? "\n… snapshot truncated" : "")
	);
}

export function playgroundDom(snapshot: DomInspection) {
	const lines = [
		`${snapshot.document} · revision ${snapshot.revision} · subtree ${snapshot.root}`,
		"Native DOM, including hidden nodes; not a rendered or accessibility tree.",
	];
	for (const node of snapshot.nodes) {
		const indent = "  ".repeat(node.depth);
		lines.push(
			`${indent}[${node.ref}] ${node.kind === "element" ? `<${node.name}>` : node.name}${node.nameTruncated ? " …" : ""}`,
		);
		for (const attribute of node.attributes)
			lines.push(
				`${indent}  @${JSON.stringify(attribute.name)} = ${JSON.stringify(attribute.value)}${attribute.truncated ? " …" : ""}`,
			);
		if (node.attributesTruncated) lines.push(`${indent}  … attributes omitted`);
		if (node.text !== undefined)
			lines.push(
				`${indent}  ${JSON.stringify(node.text)}${node.textTruncated ? " …" : ""}`,
			);
		if (node.control)
			lines.push(`${indent}  current control: ${JSON.stringify(node.control)}`);
		if (node.protected) lines.push(`${indent}  password/file value redacted`);
		if (node.childrenTruncated)
			lines.push(
				`${indent}  … ${node.returnedChildren}/${node.childCount} children shown; inspect ${node.ref} to narrow the subtree`,
			);
	}
	if (snapshot.truncated)
		lines.push("Partial output: depth, node or content limits reached.");
	const output = lines.join("\n");
	return output.length > 65_536
		? `${output.slice(0, 65_536)}\n… display limit reached`
		: output;
}

export function playgroundConsole(snapshot: PageConsoleSnapshot) {
	if (!snapshot.started)
		return "No page runtime has started; no console messages have been captured.";
	const messages =
		snapshot.entries
			.map(
				(entry) =>
					`${entry.sequence} ${new Date(entry.timeMs).toISOString()} [${entry.level}/${entry.source}] ${entry.text}${entry.truncated ? " [truncated]" : ""}`,
			)
			.join("\n") || "No messages at this level.";
	return `Retained ${snapshot.entries.length} matching messages · dropped ${snapshot.dropped} · clears ${snapshot.cleared}\n\n${messages}`;
}

export function playgroundNetwork(snapshot: SessionRequests) {
	const lines = snapshot.entries.map(
		(entry) =>
			`request ${entry.index} · ${entry.kind} · ${entry.method} ${JSON.stringify(entry.url)}\n  [${entry.state}${entry.error ? `/${entry.error}` : ""}]${entry.status === undefined ? "" : ` HTTP ${entry.status}`}${entry.cors ? ` · CORS ${entry.cors}` : ""}${entry.routeId === undefined ? "" : ` · mock route ${entry.routeId}`} · ${entry.elapsedMs} ms${entry.decodedBytes === undefined ? "" : ` · ${entry.encodedBytes} encoded / ${entry.decodedBytes} decoded bytes`}\n`,
	);
	return `Partial document/script/stylesheet/fetch diagnostics · navigation ${snapshot.navigation}\n${snapshot.document ? `Committed ${snapshot.document}` : "No document committed by this attempt"} · displayed ${snapshot.displayedDocument ?? "none"}\nRetained ${snapshot.entries.length} · dropped ${snapshot.dropped} · entry payload ${snapshot.retainedBytes}/${snapshot.maxBytes} bytes\nQueries, fragments and credentials omitted; paths may still contain sensitive data.\nUse request <index> in the command field for retained details.\n\n${lines.join("\n") || "No captured requests."}`;
}

function startPlayground() {
	const element = (id: string) => {
		const found = document.getElementById(id);
		if (!found) throw new Error(`Missing playground element: ${id}`);
		return found;
	};
	const input = (id: string) => element(id) as HTMLInputElement;
	const button = (id: string) => element(id) as HTMLButtonElement;
	const text = (id: string, value: string) => {
		element(id).textContent = value;
	};
	let token = "";
	let pairing = false;
	let working = false;
	let refreshing = false;
	let exists = false;
	let hasDocument = false;
	let selectedSession = "default";
	let generation = 0;
	let activeView = "text";
	let domTarget = "";
	let consoleEnabled = false;
	let inspectedDocument: string | null = null;
	let captureUrl: string | null = null;
	let captureController: AbortController | null = null;
	let viewport: {
		tabId: string;
		key: string;
		width: number;
		height: number;
	} | null = null;
	let viewportSelection = "";
	let viewportDraft = false;
	const requests = new Set<AbortController>();
	const activity: string[] = [];
	const actionButtons = [
		"navigate",
		"new-tab",
		"session-apply",
		"run-command",
		"refresh",
	];
	const documentButtons = [
		"reload",
		"back",
		"forward",
		"click",
		"fill",
		"download-html",
		"download-png",
		"download-pdf",
		"capture-render",
		"dom-inspect",
		"dom-root",
	];

	function updateControls() {
		for (const id of actionButtons) button(id).disabled = !token || working;
		for (const id of documentButtons)
			button(id).disabled = !token || working || !hasDocument;
		input("capture-target").disabled = !token || working || !hasDocument;
		for (const id of [
			"viewport-width",
			"viewport-height",
			"viewport-preset",
			"viewport-apply",
			"viewport-swap",
			"viewport-restore",
		])
			(element(id) as HTMLInputElement).disabled =
				!token ||
				working ||
				!exists ||
				!viewport ||
				viewportSelection !== `${selectedSession}:${viewport.tabId}`;
		button("close-tab").disabled = !token || working || !exists;
		(element("tabs") as HTMLSelectElement).disabled =
			!token || working || !exists;
		for (const example of document.querySelectorAll<HTMLButtonElement>(
			"[data-url]",
		))
			example.disabled = !token || working;
		button("connect").disabled = pairing || !!token;
		element("disconnect").hidden = !token && !pairing;
		button("disconnect").textContent = pairing ? "Cancel" : "Disconnect";
		text(
			"connection-state",
			token
				? "Connected locally"
				: pairing
					? "Awaiting approval"
					: "Not connected",
		);
		element("connection-dot").classList.toggle("connected", !!token);
	}

	function failure(error: unknown) {
		text(
			"error",
			error instanceof Error ? error.message : "Playground request failed",
		);
		element("error").hidden = false;
	}

	function record(command: string, ok: boolean, duration: number) {
		activity.unshift(
			`${new Date().toLocaleTimeString()}  ${ok ? "OK" : "ERROR"}  ${command}  ${Math.round(duration)} ms`,
		);
		activity.splice(32);
		const items = activity.map((value) => {
			const item = document.createElement("li");
			item.textContent = value;
			return item;
		});
		element("activity-output").replaceChildren(...items);
	}

	function invalidateReads() {
		generation++;
		clearCapture();
		for (const controller of requests) controller.abort();
		refreshing = false;
		text("console-output", "Waiting for the selected document…");
		text("html-output", "Waiting for the selected document…");
		text("network-output", "Waiting for the selected tab…");
		text("dom-output", "Waiting for the selected document…");
	}
	function clearCapture() {
		captureController?.abort();
		captureController = null;
		if (captureUrl) URL.revokeObjectURL(captureUrl);
		captureUrl = null;
		element("render-image").removeAttribute("src");
		element("render-image").hidden = true;
		text(
			"render-state",
			"No capture. Render explicitly; unsupported CSS fails closed.",
		);
	}

	function resetViewport() {
		viewport = null;
		viewportSelection = "";
		viewportDraft = false;
		input("viewport-width").value = "";
		input("viewport-height").value = "";
		(element("viewport-preset") as HTMLSelectElement).value = "";
		text("viewport-state", "No confirmed viewport.");
	}
	function showViewportDraft() {
		if (!viewport) return;
		input("viewport-width").value = String(viewport.width);
		input("viewport-height").value = String(viewport.height);
		(element("viewport-preset") as HTMLSelectElement).value = "";
		viewportDraft = false;
	}

	function disconnect() {
		invalidateReads();
		resetViewport();
		token = "";
		pairing = false;
		working = false;
		refreshing = false;
		exists = false;
		hasDocument = false;
		consoleEnabled = false;
		inspectedDocument = null;
		domTarget = "";
		input("dom-target").value = "";
		input("capture-target").value = "";
		element("pairing").hidden = true;
		text(
			"text-output",
			"Disconnected. CLI sessions are still running. Connect again to inspect them.",
		);
		text("snapshot-output", "No snapshot.");
		text("metrics-output", "Not connected.");
		text("capabilities-output", "Not connected.");
		text("console-output", "Not connected.");
		text("html-output", "No HTML yet.");
		text("network-output", "Not connected.");
		text("dom-output", "Not connected.");
		text("script-mode", "Connect to inspect page-script availability.");
		text("document-state", "No document");
		text("command-output", "");
		element("command-output").hidden = true;
		(element("tabs") as HTMLSelectElement).replaceChildren(
			new Option("No open tabs", ""),
		);
		element("session-names").replaceChildren();
		input("url").value = "";
		input("value").value = "";
		input("target").value = "";
		input("command").value = "snapshot";
		activity.length = 0;
		element("activity-output").replaceChildren();
		text("status", "Read-only until connected");
		text("pair-status", "Approve this window with the local CLI.");
		updateControls();
	}

	async function api(
		path: string,
		body: unknown,
		authenticated = true,
	): Promise<Record<string, unknown>> {
		const controller = new AbortController();
		requests.add(controller);
		const timer = setTimeout(() => controller.abort(), 35_000);
		try {
			const response = await fetch(path, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(authenticated ? { authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(body),
				credentials: "omit",
				cache: "no-store",
				redirect: "error",
				signal: controller.signal,
			});
			const result = (await response.json()) as {
				ok?: boolean;
				error?: { code?: string; message?: string };
			} & Record<string, unknown>;
			if (!response.ok || !result.ok) {
				if (response.status === 401 && authenticated) disconnect();
				throw new Error(
					`[${result.error?.code ?? response.status}] ${result.error?.message ?? "Local service rejected the request"}`,
				);
			}
			return result;
		} finally {
			clearTimeout(timer);
			requests.delete(controller);
		}
	}

	async function command(argv: string[]) {
		const result = await api("/api/command", {
			argv,
			session: selectedSession,
		});
		return result.result as CommandResult;
	}

	function displayJson(id: string, data: unknown) {
		const value = JSON.stringify(data, null, 2);
		text(
			id,
			value.length > 65_536
				? `${value.slice(0, 65_536)}\n… display limit reached`
				: value,
		);
	}

	async function refresh() {
		if (!token || refreshing || working) return;
		refreshing = true;
		const ownGeneration = generation;
		try {
			const listed = (await command(["list"])).data as {
				name: string;
				tabs: {
					index: number;
					id: string;
					url: string | null;
					documentRef: string | null;
					selected: boolean;
				}[];
				metrics: unknown;
			}[];
			if (generation !== ownGeneration) return;
			element("session-names").replaceChildren(
				...listed.map((entry) => new Option(entry.name, entry.name)),
			);
			const current = listed.find((entry) => entry.name === selectedSession);
			exists = !!current?.tabs.length;
			const selected = current?.tabs.find((tab) => tab.selected);
			hasDocument = !!selected?.documentRef;
			const selection = selected ? `${selectedSession}:${selected.id}` : "";
			if (selection !== viewportSelection) {
				resetViewport();
				viewportSelection = selection;
			}
			if (selected) {
				try {
					const response = await command(["viewport"]);
					if (generation !== ownGeneration) return;
					const confirmed = playgroundViewportResponse(
						response.data,
						selected.id,
					);
					if (
						viewport &&
						(viewport.width !== confirmed.width ||
							viewport.height !== confirmed.height ||
							viewport.key !== confirmed.key)
					)
						clearCapture();
					if (viewport && viewport.key !== confirmed.key) viewportDraft = false;
					viewport = confirmed;
					if (!viewportDraft) showViewportDraft();
					text(
						"viewport-state",
						`Confirmed: ${confirmed.width} × ${confirmed.height} CSS px · scale 1 · not device emulation`,
					);
				} catch (error) {
					if (generation !== ownGeneration) return;
					viewport = null;
					text(
						"viewport-state",
						error instanceof Error
							? error.message
							: "Viewport inspection failed",
					);
				}
			}
			if (inspectedDocument !== (selected?.documentRef ?? null)) {
				clearCapture();
				inspectedDocument = selected?.documentRef ?? null;
				domTarget = "";
				input("dom-target").value = "";
				input("capture-target").value = "";
				text("dom-output", "Waiting for this document’s DOM…");
				text("console-output", "Waiting for this document’s console…");
				text("html-output", "Waiting for this document’s HTML…");
				text("network-output", "Waiting for this tab’s requests…");
			}
			const tabs = element("tabs") as HTMLSelectElement;
			tabs.replaceChildren(
				...(current?.tabs.length
					? current.tabs.map(
							(tab) =>
								new Option(
									`${tab.index} · ${tab.url ?? "Empty tab"}`,
									String(tab.index),
									false,
									tab.selected,
								),
						)
					: [new Option("No open tabs", "")]),
			);
			if (document.activeElement !== input("url"))
				input("url").value = selected?.url ?? "";
			displayJson(
				"metrics-output",
				current?.metrics ?? { session: selectedSession, state: "not opened" },
			);
			if (hasDocument) {
				const snapshot = (await command(["snapshot", "--observe"]))
					.data as SemanticSnapshot;
				if (generation !== ownGeneration) return;
				text("text-output", playgroundText(snapshot));
				displayJson("snapshot-output", snapshot);
				text(
					"document-state",
					`${snapshot.document} · ${snapshot.entries.length} entries${snapshot.truncated ? " · truncated" : ""}`,
				);
				if (activeView === "dom") {
					try {
						const result = (
							await command([
								"dom",
								...(domTarget ? [domTarget] : []),
								"--depth=4",
								"--max-nodes=128",
								"--max-code-units=32768",
							])
						).data as DomInspection;
						if (generation !== ownGeneration) return;
						text(
							"dom-output",
							result.document === selected?.documentRef
								? playgroundDom(result)
								: "Document changed during inspection; waiting for refresh…",
						);
					} catch (error) {
						if (generation === ownGeneration)
							text(
								"dom-output",
								error instanceof Error
									? error.message
									: "DOM inspection failed",
							);
					}
				}
				if (activeView === "console" || activeView === "html") {
					const output = `${activeView}-output`;
					try {
						if (activeView === "console" && !consoleEnabled)
							text(
								output,
								"Page console capture is unavailable in this service. Select an explicit SafeJS process service to enable it.",
							);
						else {
							const result = await command(
								activeView === "console"
									? ["console", input("console-level").value]
									: ["html", "--max-code-units=65536"],
							);
							if (generation !== ownGeneration) return;
							text(
								output,
								result.command === "console"
									? playgroundConsole(result.data as PageConsoleSnapshot)
									: (result.data as { html: string }).html,
							);
						}
					} catch (error) {
						if (generation === ownGeneration)
							text(
								output,
								error instanceof Error
									? error.message
									: "Inspector read failed",
							);
					}
				}
			} else {
				text(
					"text-output",
					"No committed document in this tab. Enter a URL to open one.",
				);
				text("snapshot-output", "No snapshot yet.");
				text("document-state", "No document");
				text("console-output", "No committed document in this tab.");
				text("html-output", "No committed document in this tab.");
				text("dom-output", "No committed document in this tab.");
			}
			if (activeView === "network") {
				if (!exists) text("network-output", "No open tab.");
				else {
					try {
						const result = (await command(["requests"]))
							.data as SessionRequests;
						if (generation !== ownGeneration) return;
						text(
							"network-output",
							result.tabId === selected?.id &&
								result.displayedDocument === selected?.documentRef
								? playgroundNetwork(result)
								: "Tab changed during inspection; waiting for refresh…",
						);
					} catch (error) {
						if (generation === ownGeneration)
							text(
								"network-output",
								error instanceof Error
									? error.message
									: "Network inspector read failed",
							);
					}
				}
			}
			text(
				"status",
				`Following ${selectedSession} · ${hasDocument ? "document ready" : "no document"}`,
			);
		} catch (error) {
			if (generation === ownGeneration) failure(error);
		} finally {
			if (generation === ownGeneration) {
				refreshing = false;
				updateControls();
			}
		}
	}

	async function run(argv: string[], onSuccess?: () => void) {
		if (!token || working) return;
		invalidateReads();
		working = true;
		updateControls();
		element("error").hidden = true;
		text("status", `Running ${argv[0] ?? "command"}…`);
		const started = performance.now();
		const ownGeneration = generation;
		try {
			const result = await command(argv);
			if (generation !== ownGeneration) return;
			if (selectedSession !== result.session) resetViewport();
			selectedSession = result.session;
			onSuccess?.();
			input("session-name").value = selectedSession;
			displayJson("command-output", result);
			element("command-output").hidden = false;
			record(result.command, true, performance.now() - started);
		} catch (error) {
			if (generation === ownGeneration) {
				failure(error);
				record(argv[0] ?? "command", false, performance.now() - started);
			}
		} finally {
			if (generation === ownGeneration) {
				working = false;
				updateControls();
				await refresh();
			}
		}
	}

	async function renderCapture(download: boolean) {
		if (!token || working || !hasDocument) return;
		const target = input("capture-target").value.trim() || undefined;
		invalidateReads();
		working = true;
		updateControls();
		element("error").hidden = true;
		const ownGeneration = generation;
		const session = selectedSession;
		const controller = new AbortController();
		captureController = controller;
		text(
			"render-state",
			"Rendering the native document and downloading bounded PNG chunks…",
		);
		try {
			const result = await capturePng(
				async (argv) => {
					const response = await api("/api/command", { argv, session });
					return response.result as CommandResult;
				},
				target,
				controller.signal,
			);
			if (generation !== ownGeneration || controller.signal.aborted) return;
			const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
				type: "image/png",
			});
			captureUrl = URL.createObjectURL(blob);
			const image = element("render-image") as HTMLImageElement;
			image.src = captureUrl;
			image.hidden = false;
			text(
				"render-state",
				`${result.artifact.width} × ${result.artifact.height} · ${result.artifact.target ? `element ${result.artifact.target}` : "viewport"} · partial normal-flow PNG · revision ${result.artifact.revision} · ${result.artifact.bytes} bytes. Captured once, not a live view.${result.released ? "" : ` Remote cleanup is unconfirmed for ${result.artifact.id}.`}`,
			);
			if (download) {
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = "agent-browser.png";
				document.body.append(anchor);
				try {
					anchor.click();
				} finally {
					anchor.remove();
					setTimeout(() => URL.revokeObjectURL(url), 1000);
				}
			}
		} catch (error) {
			if (generation === ownGeneration) {
				failure(error);
				text(
					"render-state",
					"Capture failed; no placeholder image was substituted.",
				);
			}
		} finally {
			if (generation === ownGeneration) {
				captureController = null;
				working = false;
				updateControls();
			}
		}
	}
	button("capture-render").addEventListener("click", () => {
		void renderCapture(false);
	});
	input("capture-target").addEventListener("input", () => {
		if (!working) clearCapture();
	});
	input("capture-target").addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void renderCapture(false);
		}
	});
	button("download-png").addEventListener("click", () => {
		void renderCapture(true);
	});
	button("download-pdf").addEventListener("click", () => {
		void (async () => {
			if (!token || working || !hasDocument) return;
			invalidateReads();
			working = true;
			updateControls();
			element("error").hidden = true;
			const ownGeneration = generation;
			const session = selectedSession;
			const controller = new AbortController();
			captureController = controller;
			text(
				"render-state",
				"Paginating the native document and downloading bounded PDF chunks…",
			);
			try {
				const result = await capturePdf(async (argv) => {
					const response = await api("/api/command", { argv, session });
					return response.result as CommandResult;
				}, controller.signal);
				if (generation !== ownGeneration || controller.signal.aborted) return;
				const url = URL.createObjectURL(
					new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
						type: "application/pdf",
					}),
				);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = "agent-browser.pdf";
				document.body.append(anchor);
				try {
					anchor.click();
				} finally {
					anchor.remove();
					setTimeout(() => URL.revokeObjectURL(url), 1000);
				}
				text(
					"render-state",
					`PDF downloaded · ${result.artifact.pages} page(s) · native pixels with searchable text · ${result.artifact.bytes} bytes · partial screen layout, not print media.${result.released ? "" : ` Remote cleanup is unconfirmed for ${result.artifact.id}.`}`,
				);
			} catch (error) {
				if (generation === ownGeneration) {
					failure(error);
					text(
						"render-state",
						"PDF export failed; no substitute document was downloaded.",
					);
				}
			} finally {
				if (generation === ownGeneration) {
					captureController = null;
					working = false;
					updateControls();
				}
			}
		})();
	});
	button("connect").addEventListener("click", () => {
		void (async () => {
			pairing = true;
			updateControls();
			element("error").hidden = true;
			const ownGeneration = generation;
			try {
				const result = await api("/api/pair/start", {}, false);
				const pair = result.pair as {
					id: string;
					code: string;
					expiresAt: number;
				};
				if (generation !== ownGeneration) return;
				if (
					!/^[A-F0-9]{8}$/.test(pair.code) ||
					!/^[a-zA-Z0-9_-]{32}$/.test(pair.id)
				)
					throw new Error("Invalid pairing response");
				text(
					"pair-command",
					`node packages/browser-agent/dist/src/cli.js playground --pair ${pair.code}`,
				);
				element("pairing").hidden = false;
				text("pair-status", "Waiting for local CLI approval…");
				while (generation === ownGeneration && Date.now() < pair.expiresAt) {
					text(
						"pair-expiry",
						`This request expires in ${Math.max(0, Math.ceil((pair.expiresAt - Date.now()) / 1000))} seconds.`,
					);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					if (generation !== ownGeneration) return;
					const polled = await api("/api/pair/poll", { id: pair.id }, false);
					if (generation !== ownGeneration) return;
					if (polled.approved) {
						if (
							typeof polled.token !== "string" ||
							!/^[a-zA-Z0-9_-]{43}$/.test(polled.token)
						)
							throw new Error("Invalid playground authorization");
						token = polled.token;
						pairing = false;
						element("pairing").hidden = true;
						text(
							"pair-status",
							"Approved for this window. Reloading the UI requires a new approval.",
						);
						updateControls();
						const capabilities = (await command(["capabilities"])).data as {
							websiteJavaScript?: boolean;
							pageEvaluation?: boolean;
							pageConsole?: { enabled?: boolean };
						};
						if (generation !== ownGeneration) return;
						consoleEnabled = capabilities.pageConsole?.enabled === true;
						displayJson("capabilities-output", capabilities);
						text(
							"script-mode",
							capabilities.websiteJavaScript
								? "Automatic classic JavaScript is enabled (partial)."
								: `Website JavaScript is disabled.${capabilities.pageEvaluation ? " Manual sandbox evaluation is available." : ""}`,
						);
						await refresh();
						return;
					}
				}
				if (generation === ownGeneration)
					throw new Error("Pairing expired. Request a new connection.");
			} catch (error) {
				if (generation === ownGeneration) {
					pairing = false;
					failure(error);
					updateControls();
				}
			}
		})();
	});
	button("disconnect").addEventListener("click", () => {
		void (async () => {
			try {
				if (token) await api("/api/pair/revoke", {});
			} catch {
			} finally {
				disconnect();
			}
		})();
	});
	element("session-form").addEventListener("submit", (event) => {
		event.preventDefault();
		if (!token || working) return;
		const name = input("session-name").value;
		if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name)) {
			failure(new Error("Use a valid session name, such as research"));
			return;
		}
		invalidateReads();
		selectedSession = name;
		resetViewport();
		updateControls();
		void refresh();
	});
	element("navigate-form").addEventListener("submit", (event) => {
		event.preventDefault();
		try {
			void run([exists ? "goto" : "open", playgroundUrl(input("url").value)]);
		} catch (error) {
			failure(error);
		}
	});
	button("reload").addEventListener("click", () => {
		void run(["reload"]);
	});
	button("back").addEventListener("click", () => {
		void run(["go-back"]);
	});
	button("forward").addEventListener("click", () => {
		void run(["go-forward"]);
	});
	button("new-tab").addEventListener("click", () => {
		void run([exists ? "tab-new" : "open"]);
	});
	button("close-tab").addEventListener("click", () => {
		void run(["tab-close"]);
	});
	button("refresh").addEventListener("click", () => {
		void refresh();
	});
	for (const id of ["viewport-width", "viewport-height"])
		input(id).addEventListener("input", () => {
			viewportDraft = true;
			(element("viewport-preset") as HTMLSelectElement).value = "";
		});
	element("viewport-preset").addEventListener("change", () => {
		if (!token || working || !viewport) return;
		const value = (element("viewport-preset") as HTMLSelectElement).value;
		if (!["1280x720", "768x1024", "390x844"].includes(value)) return;
		const [width, height] = value.split("x");
		input("viewport-width").value = width;
		input("viewport-height").value = height;
		viewportDraft = true;
	});
	button("viewport-swap").addEventListener("click", () => {
		if (!token || working || !viewport) return;
		const width = input("viewport-width").value;
		input("viewport-width").value = input("viewport-height").value;
		input("viewport-height").value = width;
		viewportDraft = true;
		(element("viewport-preset") as HTMLSelectElement).value = "";
	});
	button("viewport-restore").addEventListener("click", () => {
		if (token && !working && viewport) showViewportDraft();
	});
	element("viewport-form").addEventListener("submit", (event) => {
		event.preventDefault();
		if (
			!token ||
			working ||
			!viewport ||
			viewportSelection !== `${selectedSession}:${viewport.tabId}`
		)
			return;
		try {
			const size = playgroundViewport(
				input("viewport-width").value,
				input("viewport-height").value,
			);
			void run(
				[
					"resize",
					String(size.width),
					String(size.height),
					`--expected-viewport=${viewport.key}`,
				],
				() => {
					viewportDraft = false;
				},
			);
		} catch (error) {
			failure(error);
		}
	});
	element("console-level").addEventListener("change", () => {
		void refresh();
	});
	button("download-html").addEventListener("click", () => {
		void (async () => {
			if (!token || working || !hasDocument) return;
			invalidateReads();
			working = true;
			updateControls();
			const ownGeneration = generation;
			try {
				const result = (await command(["html"])).data as { html: string };
				if (generation !== ownGeneration) return;
				const url = URL.createObjectURL(
					new Blob([result.html], { type: "text/html;charset=utf-8" }),
				);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = "agent-browser.html";
				document.body.append(anchor);
				try {
					anchor.click();
				} finally {
					anchor.remove();
					setTimeout(() => URL.revokeObjectURL(url), 1000);
				}
			} catch (error) {
				if (generation === ownGeneration) failure(error);
			} finally {
				if (generation === ownGeneration) {
					working = false;
					updateControls();
				}
			}
		})();
	});
	element("tabs").addEventListener("change", () => {
		void run(["tab-select", (element("tabs") as HTMLSelectElement).value]);
	});
	element("action-form").addEventListener("submit", (event) => {
		event.preventDefault();
		void run(["click", input("target").value]);
	});
	button("fill").addEventListener("click", () => {
		void run(["fill", input("target").value, input("value").value]);
	});
	element("command-form").addEventListener("submit", (event) => {
		event.preventDefault();
		try {
			void run(parsePlaygroundCommand(input("command").value));
		} catch (error) {
			failure(error);
		}
	});
	element("dom-form").addEventListener("submit", (event) => {
		event.preventDefault();
		if (!token || working || !hasDocument) return;
		domTarget = input("dom-target").value.trim();
		invalidateReads();
		void refresh();
	});
	button("dom-root").addEventListener("click", () => {
		if (!token || working || !hasDocument) return;
		domTarget = "";
		input("dom-target").value = "";
		invalidateReads();
		void refresh();
	});
	for (const example of document.querySelectorAll<HTMLButtonElement>(
		"[data-url]",
	))
		example.addEventListener("click", () => {
			input("url").value = example.dataset.url ?? "";
			void run([exists ? "goto" : "open", input("url").value]);
		});
	for (const view of document.querySelectorAll<HTMLButtonElement>(
		"[data-view]",
	))
		view.addEventListener("click", () => {
			activeView = view.dataset.view ?? "text";
			for (const candidate of document.querySelectorAll<HTMLButtonElement>(
				"[data-view]",
			))
				candidate.setAttribute("aria-pressed", String(candidate === view));
			for (const pane of document.querySelectorAll<HTMLElement>(".view"))
				pane.hidden = pane.id !== `view-${view.dataset.view}`;
			void refresh();
		});
	const interval = setInterval(() => {
		if (!document.hidden && input("auto-refresh").checked) void refresh();
	}, 3000);
	window.addEventListener(
		"pagehide",
		() => {
			clearInterval(interval);
			disconnect();
		},
		{ once: true },
	);
	updateControls();
}

if (typeof document !== "undefined") startPlayground();
