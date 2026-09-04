import { AgentBrowserError } from "./errors.js";

export interface TerminalTab {
	readonly index: number;
	readonly id: string;
	readonly key: string;
	readonly selected: boolean;
	readonly loading: boolean;
	readonly url: string | null;
	readonly documentRef: string | null;
}

export function terminalTabs(value: unknown): readonly TerminalTab[] {
	if (!Array.isArray(value) || value.length > 128)
		throw new AgentBrowserError("invalid-input", "Invalid terminal tab list");
	const ids = new Set<string>();
	const keys = new Set<string>();
	let size = 0;
	let selected = 0;
	const tabs = Array.from(value, (entry: unknown, index) => {
		if (!entry || typeof entry !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid terminal tab");
		const tab = entry as Record<string, unknown>;
		const text = (input: unknown, maximum: number): input is string =>
			typeof input === "string" && input.length > 0 && input.length <= maximum;
		if (
			tab.index !== index ||
			!text(tab.id, 128) ||
			!text(tab.key, 256) ||
			typeof tab.selected !== "boolean" ||
			typeof tab.loading !== "boolean" ||
			!(tab.url === null || text(tab.url, 16_384)) ||
			!(tab.documentRef === null || text(tab.documentRef, 128)) ||
			(tab.url === null) !== (tab.documentRef === null) ||
			ids.has(tab.id) ||
			keys.has(tab.key)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid terminal tab metadata",
			);
		ids.add(tab.id);
		keys.add(tab.key);
		if (tab.selected) selected++;
		size +=
			tab.id.length +
			tab.key.length +
			(tab.url?.length ?? 0) +
			(tab.documentRef?.length ?? 0);
		if (size > 262_144)
			throw new AgentBrowserError(
				"resource-limit",
				"Terminal tab metadata exceeds its limit",
			);
		return Object.freeze({
			index,
			id: tab.id,
			key: tab.key,
			selected: tab.selected,
			loading: tab.loading,
			url: tab.url,
			documentRef: tab.documentRef,
		});
	});
	if (selected !== (tabs.length ? 1 : 0))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid selected terminal tab",
		);
	return Object.freeze(tabs);
}

export class TerminalTabMenu {
	items: readonly TerminalTab[] = [];
	selection = 0;
	private closingKey?: string;

	update(value: unknown) {
		const previous = this.items[this.selection]?.key;
		const items = terminalTabs(value);
		const retained = items.findIndex((tab) => tab.key === previous);
		this.items = items;
		this.selection =
			retained < 0
				? Math.max(
						0,
						items.findIndex((tab) => tab.selected),
					)
				: retained;
		this.closingKey = undefined;
	}

	move(distance: number) {
		this.selection = Math.max(
			0,
			Math.min(this.items.length - 1, this.selection + distance),
		);
		this.closingKey = undefined;
	}

	get confirming() {
		return this.closingKey !== undefined;
	}
	get current() {
		return this.items[this.selection];
	}
	beginClose() {
		this.closingKey = this.current?.key;
	}
	cancelClose() {
		this.closingKey = undefined;
	}

	select(): string[] | undefined {
		const tab = this.current;
		return tab
			? ["tab-select", String(tab.index), `--expected-key=${tab.key}`]
			: undefined;
	}

	confirmClose(): string[] | undefined {
		const tab = this.current;
		const key = this.closingKey;
		this.closingKey = undefined;
		return tab && tab.key === key
			? ["tab-close", String(tab.index), `--expected-key=${key}`]
			: undefined;
	}

	lines(pageSize: number): string[] {
		const start = Math.max(0, this.selection - pageSize + 1);
		return this.items
			.slice(start, start + pageSize)
			.map(
				(tab) =>
					`${tab.index === this.selection ? ">" : " "} ${tab.selected ? "*" : " "} ${tab.index} ${tab.id}${tab.loading ? " [loading]" : ""} ${tab.url ?? "[blank tab]"}`,
			);
	}
}
