import { AgentBrowserError } from "./errors.js";
import type { SnapshotSearch } from "./snapshot-search.js";
import type { SemanticSnapshot, SnapshotEntry } from "./snapshot.js";
import { TerminalTabMenu } from "./terminal-tabs.js";

export interface TerminalKey {
	name?: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
}

export type TerminalRequest =
	| string[]
	| { kind: "inspect"; ref: string; document: string }
	| { kind: "tabs" }
	| "root";
export type TerminalAction = TerminalRequest | "refresh" | "quit" | undefined;

interface Prompt {
	kind:
		| "open"
		| "tab-new"
		| "fill"
		| "select"
		| "press"
		| "find"
		| "search"
		| "regex";
	value: string;
	ref?: string;
	protected?: boolean;
}

interface ProjectedEntry {
	ref: string;
	text: string;
	row: number;
	rows: number;
}

function entryText(entry: SnapshotEntry) {
	const states = [
		entry.disabled ? "disabled" : "",
		entry.expanded === undefined
			? ""
			: entry.expanded
				? "expanded"
				: "collapsed",
		entry.focused ? "focused" : "",
		entry.checked !== undefined
			? entry.checked
				? "checked"
				: "unchecked"
			: "",
		entry.readonly ? "readonly" : "",
		entry.value !== undefined && !entry.protected ? `value=${entry.value}` : "",
		entry.href !== undefined ? `href=${entry.href}` : "",
	]
		.filter(Boolean)
		.join(" ");
	return terminalText(
		`[${entry.ref}] ${" ".repeat(Math.min(12, entry.depth))}${entry.role}: ${entry.name}${states ? ` [${states}]` : ""}`,
	);
}

export function terminalText(value: string) {
	return value.replace(
		/[^\x20-\x7e]/gu,
		(character) => `\\u{${character.codePointAt(0)?.toString(16)}}`,
	);
}

function actionable(entry: SnapshotEntry) {
	return (
		!entry.disabled &&
		((entry.role === "link" && entry.href !== undefined) ||
			[
				"button",
				"textbox",
				"searchbox",
				"spinbutton",
				"checkbox",
				"radio",
				"combobox",
				"listbox",
			].includes(entry.role))
	);
}

export class TerminalView {
	status = "g: open URL; q: detach (session stays open)";
	private snapshot?: SemanticSnapshot;
	private url = "No document";
	private selected = 0;
	private selectedOffset = 0;
	private offset = 0;
	private pageSize = 15;
	private contentWidth = 78;
	private projection: ProjectedEntry[] = [];
	private totalRows = 0;
	private search = "";
	private match?: { ref: string; offset: number };
	private prompt?: Prompt;
	private pasting = false;
	private results?: SnapshotSearch;
	private resultIndex = 0;
	private resultQuery = "";
	private resultRegex = false;
	private tabs?: TerminalTabMenu;

	constructor(private readonly session: string) {}

	get editing() {
		return this.prompt !== undefined;
	}

	get searching() {
		return this.results !== undefined;
	}

	get browsingTabs() {
		return this.tabs !== undefined;
	}

	showTabs(value: unknown) {
		const menu = this.tabs ?? new TerminalTabMenu();
		menu.update(value);
		this.tabs = menu;
		this.prompt = undefined;
		this.dismissSearch();
		this.status =
			"Tab indices can change; actions validate the displayed tab key";
	}

	dismissTabs() {
		this.tabs = undefined;
	}

	clearDocument(url = "No document") {
		this.snapshot = undefined;
		this.url = url;
		this.projection = [];
		this.selected = 0;
		this.selectedOffset = 0;
		this.offset = 0;
		this.totalRows = 0;
		this.match = undefined;
		this.search = "";
		this.prompt = undefined;
		this.dismissSearch();
	}

	showSearch(results: SnapshotSearch, query: string, regex = false) {
		if (
			!results ||
			typeof results.document !== "string" ||
			results.document.length > 128 ||
			!Array.isArray(results.matches) ||
			results.matches.length > 500 ||
			!Number.isSafeInteger(results.matched) ||
			results.matched < results.matches.length ||
			!Number.isSafeInteger(results.scannedEntries) ||
			results.scannedEntries < results.matched ||
			results.scannedEntries > 10_000 ||
			typeof query !== "string" ||
			query.length > 1024
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid terminal search result",
			);
		let size = 0;
		for (const match of results.matches) {
			if (
				!match ||
				typeof match.ref !== "string" ||
				match.ref.length > 128 ||
				!Number.isSafeInteger(match.line) ||
				match.line < 1 ||
				!Array.isArray(match.context) ||
				match.context.length > 21
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid terminal search match",
				);
			for (const line of match.context) {
				if (
					!line ||
					typeof line.text !== "string" ||
					line.text.length > 32_768 ||
					!Number.isSafeInteger(line.line)
				)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid terminal search context",
					);
				size += line.text.length;
				if (size > 262_144)
					throw new AgentBrowserError(
						"resource-limit",
						"Terminal search result too large",
					);
			}
		}
		this.results = results;
		this.resultIndex = 0;
		this.resultQuery = query;
		this.resultRegex = regex;
		this.status =
			"Search is a partial projection; Enter inspects, not activates";
	}

	dismissSearch() {
		this.results = undefined;
	}

	update(snapshot: SemanticSnapshot, url: string) {
		const previousRow = this.cursorRow();
		const sameDocument = snapshot.document === this.snapshot?.document;
		if (this.results && this.results.document !== snapshot.document)
			this.dismissSearch();
		const reference = sameDocument
			? this.snapshot?.entries[this.selected]?.ref
			: undefined;
		const selected = snapshot.entries.findIndex(
			(entry) => entry.ref === reference,
		);
		this.selected = Math.max(0, selected);
		if (!sameDocument || selected < 0) {
			this.offset = 0;
			this.selectedOffset = 0;
			this.match = undefined;
		}
		if (
			this.prompt?.ref &&
			(!sameDocument ||
				!snapshot.entries.some((entry) => entry.ref === this.prompt?.ref))
		) {
			this.prompt = undefined;
			this.status = "Document changed; edit cancelled";
		}
		this.snapshot = snapshot;
		this.url = url;
		this.projection = snapshot.entries.map((entry) => ({
			ref: entry.ref,
			text: entryText(entry),
			row: 0,
			rows: 0,
		}));
		this.reflow(this.contentWidth);
		if (sameDocument && selected >= 0)
			this.offset += this.cursorRow() - previousRow;
		if (this.match) {
			const entry = this.projection[this.selected];
			if (
				entry?.ref !== this.match.ref ||
				entry.text
					.slice(this.match.offset, this.match.offset + this.search.length)
					.toLowerCase() !== this.search
			)
				this.match = undefined;
		}
	}

	key(text = "", key: TerminalKey = {}, busy = false): TerminalAction {
		if (key.name === "paste-start") {
			this.pasting = true;
			return;
		}
		if (key.name === "paste-end") {
			this.pasting = false;
			return;
		}
		if (this.pasting) {
			if (!busy && this.prompt)
				this.append(text.replace(/[\p{Cc}\p{Cf}]/gu, ""));
			return;
		}
		if (key.ctrl && key.name === "c") return "quit";
		if (!this.prompt && text === "q" && !key.ctrl && !key.meta) return "quit";
		if (busy) return;
		if (this.prompt) {
			if (key.name === "escape") this.prompt = undefined;
			else if (key.ctrl && key.name === "u") this.prompt.value = "";
			else if (key.name === "backspace")
				this.prompt.value = Array.from(this.prompt.value).slice(0, -1).join("");
			else if (key.name === "return" || key.name === "enter")
				return this.submit();
			else if (!key.ctrl && !key.meta && !/[\p{Cc}\p{Cf}]/u.test(text))
				this.append(text);
			return;
		}
		if (key.ctrl || key.meta) return;
		if (this.tabs?.confirming) {
			if (text === "y") return this.tabs.confirmClose();
			if (text === "n" || key.name === "escape") this.tabs.cancelClose();
			return;
		}
		if (text === "t") {
			this.prompt = { kind: "tab-new", value: "" };
			return;
		}
		if (text === "T") return { kind: "tabs" };
		if (this.tabs) {
			if (key.name === "escape") {
				this.dismissTabs();
				return "refresh";
			}
			if (text === "u") return { kind: "tabs" };
			if (text === "x") this.tabs.beginClose();
			else if (key.name === "return" || key.name === "enter")
				return this.tabs.select();
			else if (text === "j" || key.name === "down") this.tabs.move(1);
			else if (text === "k" || key.name === "up") this.tabs.move(-1);
			else if (text === " " || key.name === "pagedown")
				this.tabs.move(this.pageSize);
			else if (key.name === "pageup") this.tabs.move(-this.pageSize);
			else if (key.name === "home") this.tabs.move(-this.tabs.items.length);
			else if (key.name === "end") this.tabs.move(this.tabs.items.length);
			return;
		}
		if (text === "g") {
			this.prompt = { kind: "open", value: "" };
			return;
		}
		if (text === "s" || text === "S") {
			this.prompt = { kind: text === "S" ? "regex" : "search", value: "" };
			return;
		}
		if (text === "U") return "root";
		if (this.results) {
			if (key.name === "escape") {
				this.dismissSearch();
				return "refresh";
			}
			if (text === "u")
				return this.searchRequest(this.resultQuery, this.resultRegex);
			if (key.name === "return" || key.name === "enter") {
				const match = this.results.matches[this.resultIndex];
				if (match)
					return {
						kind: "inspect",
						ref: match.ref,
						document: this.results.document,
					};
			} else if (text === "j" || key.name === "down") this.resultIndex++;
			else if (text === "k" || key.name === "up") this.resultIndex--;
			else if (text === " " || key.name === "pagedown")
				this.resultIndex += this.pageSize;
			else if (key.name === "pageup") this.resultIndex -= this.pageSize;
			else if (key.name === "home") this.resultIndex = 0;
			else if (key.name === "end")
				this.resultIndex = this.results.matches.length - 1;
			this.resultIndex = Math.max(
				0,
				Math.min(this.resultIndex, this.results.matches.length - 1),
			);
			return;
		}
		if (text === "/") {
			this.prompt = { kind: "find", value: "" };
			return;
		}
		if (text === "n" || text === "N") {
			this.find(text === "N" ? -1 : 1, false);
			return;
		}
		if (text === "b") return ["go-back"];
		if (text === "f") return ["go-forward"];
		if (text === "r") return ["reload"];
		if (text === "u") return "refresh";
		const entries = this.snapshot?.entries ?? [];
		if (text === "p") {
			const entry = entries[this.selected];
			if (!entry || !actionable(entry)) {
				this.status = "Select an enabled control or link for key input";
				return;
			}
			this.prompt = {
				kind: "press",
				value: "",
				ref: entry.ref,
				protected: entry.protected,
			};
			this.status = "Enter a key or chord, e.g. ArrowDown, Enter or Control+A";
			return;
		}
		if (key.name === "tab") {
			const direction = key.shift ? -1 : 1;
			for (let distance = 1; distance <= entries.length; distance++) {
				const index =
					(this.selected + direction * distance + entries.length) %
					entries.length;
				if (actionable(entries[index])) {
					this.selected = index;
					this.selectedOffset = 0;
					this.match = undefined;
					break;
				}
			}
		} else if (key.name === "down" || text === "j") this.move(1);
		else if (key.name === "up" || text === "k") this.move(-1);
		else if (key.name === "pagedown" || text === " ")
			this.move(this.pageSize, true);
		else if (key.name === "pageup") this.move(-this.pageSize, true);
		else if (key.name === "home") this.move(-this.totalRows, true);
		else if (key.name === "end") this.move(this.totalRows, true);
		else if (text === "e" || key.name === "return" || key.name === "enter")
			return this.activate(text === "e");
		this.selected = Math.max(0, Math.min(entries.length - 1, this.selected));
	}

	render(columns: number, rows: number): string[] {
		const width = Math.max(1, Math.min(240, Math.floor(columns) || 80));
		const height = Math.max(1, Math.min(80, Math.floor(rows) || 24));
		if (height < 6)
			return Array.from({ length: height }, (_, index) =>
				index ? "" : "Resize terminal to at least 6 rows".slice(0, width),
			);
		this.pageSize = height - 5;
		if (this.tabs) return this.renderTabs(width, height);
		if (this.results) return this.renderSearch(width, height);
		const prefix = width > 2 ? 2 : 0;
		if (this.contentWidth !== width - prefix) {
			const previousRow = this.cursorRow();
			this.reflow(width - prefix);
			this.offset += this.cursorRow() - previousRow;
		}
		const cursor = this.cursorRow();
		if (cursor < this.offset) this.offset = cursor;
		if (cursor >= this.offset + this.pageSize)
			this.offset = cursor - this.pageSize + 1;
		this.offset = Math.max(
			0,
			Math.min(this.offset, this.totalRows - this.pageSize),
		);
		const page = this.snapshot;
		const entries = page?.entries ?? [];
		const content: string[] = [];
		for (
			let row = this.offset;
			row < Math.min(this.totalRows, this.offset + this.pageSize);
			row++
		) {
			const entry = this.projection[this.entryAt(row)];
			const start = (row - entry.row) * this.contentWidth;
			content.push(
				`${prefix ? (row === cursor ? "> " : "  ") : ""}${entry.text.slice(start, start + this.contentWidth)}`,
			);
		}
		while (content.length < this.pageSize) content.push("");
		const mode = page?.html
			? `HTML partial; ${page.html.scripting ? "partial JS" : "JS off"}`
			: "Semantic view";
		const prompt = this.prompt;
		return [
			`Agent browser | session ${this.session} | ${mode}${page?.truncated ? " | truncated" : ""}${page && page.scope !== "root" && page.scope !== page.document ? ` | scope ${page.scope}` : ""}`,
			this.url,
			`j/k scroll | Tab control | Enter act | e edit | p key | / find | n/N next/prev (${entries.length ? this.selected + 1 : 0}/${entries.length})`,
			...content,
			this.status,
			prompt
				? `${prompt.kind}${prompt.ref ? ` ${prompt.ref}` : ""}> ${prompt.protected ? "*".repeat(Math.min(80, prompt.value.length)) : prompt.value}`
				: "g URL | t new tab | T tabs | s/S search | U root | b/f history | u refresh | q detach",
		].map((line) => terminalText(line).slice(0, width));
	}

	private renderSearch(width: number, height: number) {
		const results = this.results as SnapshotSearch;
		const start = Math.max(0, this.resultIndex - this.pageSize + 1);
		const content = results.matches
			.slice(start, start + this.pageSize)
			.map(
				(match, index) =>
					`${start + index === this.resultIndex ? ">" : " "} [${match.ref}] ${match.context.find((line) => line.line === match.line)?.text ?? `line ${match.line}`}`,
			);
		while (content.length < this.pageSize) content.push("");
		return [
			`Agent browser | session ${this.session} | partial backend search${results.truncated ? " | truncated" : ""}`,
			`${this.resultRegex ? "Regex" : "Literal"}: ${this.resultQuery}`,
			`${results.matched} matches in ${results.scannedEntries} scanned entries; ${results.matches.length} returned`,
			...content,
			this.status,
			this.prompt
				? `${this.prompt.kind}> ${this.prompt.value}`
				: "j/k choose | Enter inspect | u rerun | s/S query | Esc back | U root | q detach",
		]
			.slice(0, height)
			.map((line) => terminalText(line).slice(0, width));
	}

	private renderTabs(width: number, height: number) {
		const tabs = this.tabs as TerminalTabMenu;
		const content = tabs.lines(this.pageSize);
		while (content.length < this.pageSize) content.push("");
		return [
			`Agent browser | session ${this.session} | Tabs`,
			`${tabs.items.length} tabs | * active | selection ${tabs.items.length ? tabs.selection + 1 : 0}`,
			"j/k choose | Enter select | x close | t new | u refresh | Esc back",
			...content,
			this.status,
			this.prompt
				? `tab-new> ${this.prompt.value}`
				: tabs.confirming
					? `y confirms; n/Esc cancels | close tab ${tabs.current?.index} ${tabs.current?.url ?? "[blank tab]"}`
					: "Closing a tab is permanent; q detaches without closing tabs",
		]
			.slice(0, height)
			.map((line) => terminalText(line).slice(0, width));
	}

	private searchRequest(query: string, regex: boolean) {
		return [
			"find",
			"--max-results=100",
			"--context=1",
			"--max-bytes=32768",
			...(regex ? ["--regex"] : []),
			"--",
			query,
		];
	}

	private cursorRow() {
		const entry = this.projection[this.selected];
		return entry
			? entry.row + Math.floor(this.selectedOffset / this.contentWidth)
			: 0;
	}

	private reflow(width: number) {
		this.contentWidth = width;
		this.totalRows = 0;
		for (const entry of this.projection) {
			entry.row = this.totalRows;
			entry.rows = Math.max(1, Math.ceil(entry.text.length / width));
			this.totalRows += entry.rows;
		}
		this.selectedOffset = Math.max(
			0,
			Math.min(
				this.selectedOffset,
				(this.projection[this.selected]?.text.length ?? 1) - 1,
			),
		);
	}

	private entryAt(row: number) {
		let lower = 0;
		let upper = this.projection.length - 1;
		while (lower < upper) {
			const middle = Math.ceil((lower + upper) / 2);
			if (this.projection[middle].row <= row) lower = middle;
			else upper = middle - 1;
		}
		return lower;
	}

	private move(distance: number, page = false) {
		if (!this.projection.length) return;
		const row = Math.max(
			0,
			Math.min(this.totalRows - 1, this.cursorRow() + distance),
		);
		this.selected = this.entryAt(row);
		this.selectedOffset =
			(row - this.projection[this.selected].row) * this.contentWidth;
		this.match = undefined;
		if (page)
			this.offset = Math.max(
				0,
				Math.min(this.totalRows - this.pageSize, this.offset + distance),
			);
	}

	private find(direction: number, includeCurrent: boolean) {
		if (!this.search) {
			this.status = "Use / to enter a literal search";
			return;
		}
		const start = this.selected;
		const from = includeCurrent
			? this.selectedOffset
			: (this.match?.offset ?? this.selectedOffset) + direction;
		for (let distance = 0; distance <= this.projection.length; distance++) {
			if (!this.projection.length) break;
			const index =
				(start + direction * distance + this.projection.length) %
				this.projection.length;
			const entry = this.projection[index];
			const text = entry.text.toLowerCase();
			const offset = distance === 0 ? from : direction > 0 ? 0 : text.length;
			const found =
				direction > 0
					? text.indexOf(this.search, offset)
					: offset < 0
						? -1
						: text.lastIndexOf(this.search, offset);
			if (found < 0) continue;
			if (
				distance === this.projection.length &&
				(direction > 0 ? found >= from : found <= from)
			)
				break;
			this.selected = index;
			this.selectedOffset = found;
			this.match = { ref: entry.ref, offset: found };
			this.offset = this.cursorRow();
			const wrapped =
				direction > 0
					? index < start || (index === start && distance > 0)
					: index > start || (index === start && distance > 0);
			this.status = `Found ${JSON.stringify(this.search)}${wrapped ? " (wrapped)" : ""}`;
			return;
		}
		this.status = "No match in the retained snapshot";
	}

	private append(text: string) {
		if (!this.prompt) return;
		const maximum =
			this.prompt.kind === "press"
				? 128
				: ["search", "regex"].includes(this.prompt.kind)
					? 1024
					: 16_384;
		if (this.prompt.value.length + text.length > maximum) {
			this.status = `Input too long (maximum ${maximum} code units)`;
			return;
		}
		this.prompt.value += text;
	}

	private submit(): TerminalAction {
		const prompt = this.prompt;
		if (!prompt) return;
		if (prompt.kind === "press") {
			if (!prompt.value) {
				this.status = "Enter a key or chord; Escape cancels";
				return;
			}
			this.prompt = undefined;
			return ["press", `--target=${prompt.ref}`, "--", prompt.value];
		}
		if (prompt.kind === "search" || prompt.kind === "regex") {
			if (!prompt.value) {
				this.status = "Enter a nonempty backend search query";
				return;
			}
			this.prompt = undefined;
			return this.searchRequest(prompt.value, prompt.kind === "regex");
		}
		if (prompt.kind === "find") {
			this.prompt = undefined;
			if (prompt.value) {
				this.search = terminalText(prompt.value).toLowerCase();
				this.match = undefined;
			}
			this.find(1, true);
			return;
		}
		if (prompt.kind === "open" || prompt.kind === "tab-new") {
			try {
				const value = prompt.value.trim();
				if (!value && prompt.kind === "tab-new") {
					this.prompt = undefined;
					return ["tab-new"];
				}
				if (!value) throw new Error();
				const url = new URL(
					/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`,
				);
				if (
					!["http:", "https:"].includes(url.protocol) ||
					url.username ||
					url.password
				)
					throw new Error();
				this.prompt = undefined;
				return [prompt.kind, url.href];
			} catch {
				this.status = "Enter an HTTP(S) URL without credentials";
				return;
			}
		}
		this.prompt = undefined;
		return [prompt.kind, prompt.ref as string, prompt.value];
	}

	private activate(editOnly: boolean): TerminalAction {
		const entry = this.snapshot?.entries[this.selected];
		if (!entry) return;
		if (entry.disabled) {
			this.status = "Selected control is disabled";
			return;
		}
		if (
			["textbox", "searchbox", "spinbutton", "combobox", "listbox"].includes(
				entry.role,
			)
		) {
			if (entry.readonly) {
				this.status = "Selected control is readonly";
				return;
			}
			this.prompt = {
				kind: ["combobox", "listbox"].includes(entry.role) ? "select" : "fill",
				ref: entry.ref,
				value: entry.protected ? "" : (entry.value ?? ""),
				protected: entry.protected,
			};
			return;
		}
		if (editOnly) {
			this.status = "Select an editable control first";
			return;
		}
		if (entry.role === "checkbox")
			return [entry.checked ? "uncheck" : "check", entry.ref];
		if (entry.role === "radio") return ["check", entry.ref];
		if (entry.role === "button" || (entry.role === "link" && entry.href))
			return ["click", entry.ref];
	}
}
