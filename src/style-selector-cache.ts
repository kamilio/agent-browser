import type { DocumentQueries } from "./selectors.js";

type StyleSelectorMatches = ReturnType<
	DocumentQueries["matchingStyleSpecificities"]
>;

export const styleSelectorCacheLimits = Object.freeze({
	maxEntries: 1024,
	maxRetainedUnits: 32_768,
	maxSelectorCodeUnits: 65_536,
});

export class StyleSelectorCache {
	private readonly entries = new Map<string, StyleSelectorMatches>();
	private retainedUnits = 0;
	private selectorCodeUnits = 0;

	constructor(private readonly charge: (work: number) => void) {}

	get(selector: string): StyleSelectorMatches | undefined {
		this.charge(selector.length + 1);
		return this.entries.get(selector);
	}

	set(selector: string, matches: StyleSelectorMatches): void {
		this.charge(1);
		if (this.entries.has(selector)) return;
		const units =
			1 + matches.elements.size + matches.before.size + matches.after.size;
		if (
			this.entries.size >= styleSelectorCacheLimits.maxEntries ||
			this.retainedUnits + units > styleSelectorCacheLimits.maxRetainedUnits ||
			this.selectorCodeUnits + selector.length >
				styleSelectorCacheLimits.maxSelectorCodeUnits
		)
			return;
		this.entries.set(selector, matches);
		this.retainedUnits += units;
		this.selectorCodeUnits += selector.length;
	}
}
