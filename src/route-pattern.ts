import { AgentBrowserError } from "./errors.js";

type Token =
	| { kind: "literal"; value: string }
	| {
			kind: "star" | "deep" | "directory" | "directory-loop";
	  };

function invalid(): never {
	throw new AgentBrowserError("invalid-input", "Invalid route glob pattern");
}

function expand(pattern: string): string[] {
	let variants = [pattern];
	for (;;) {
		let changed = false;
		const next: string[] = [];
		for (const variant of variants) {
			let opening = -1;
			for (let index = 0; index < variant.length; index++) {
				if (variant[index] === "\\") {
					index++;
					continue;
				}
				if (variant[index] === "}") invalid();
				if (variant[index] === "{") {
					opening = index;
					break;
				}
			}
			if (opening < 0) {
				next.push(variant);
				continue;
			}
			let depth = 1;
			let start = opening + 1;
			let closing = -1;
			const choices: string[] = [];
			for (let index = start; index < variant.length; index++) {
				if (variant[index] === "\\") {
					index++;
					continue;
				}
				if (variant[index] === "{") depth++;
				if (variant[index] === "}") depth--;
				if (depth === 0 || (depth === 1 && variant[index] === ",")) {
					if (index === start) invalid();
					choices.push(variant.slice(start, index));
					start = index + 1;
				}
				if (depth === 0) {
					closing = index;
					break;
				}
			}
			if (closing < 0 || choices.length < 2) invalid();
			for (const choice of choices)
				next.push(
					variant.slice(0, opening) + choice + variant.slice(closing + 1),
				);
			if (next.length > 32)
				throw new AgentBrowserError(
					"resource-limit",
					"Route glob expansion limit exceeded",
				);
			changed = true;
		}
		if (next.length > 32)
			throw new AgentBrowserError(
				"resource-limit",
				"Route glob expansion limit exceeded",
			);
		variants = next;
		if (!changed) return variants;
	}
}

export class RoutePattern {
	private readonly alternatives: Token[][];
	constructor(pattern: string) {
		if (
			typeof pattern !== "string" ||
			!pattern ||
			pattern.length > 512 ||
			/\p{Cc}/u.test(pattern)
		)
			invalid();
		let normalized = pattern;
		if (!/[\\*{}]/.test(pattern)) {
			try {
				normalized = new URL(pattern).href;
			} catch {}
		}
		this.alternatives = expand(normalized).map((variant) => {
			const tokens: Token[] = [];
			for (let index = 0; index < variant.length; index++) {
				const value = variant[index];
				if (value === "\\") {
					if (++index === variant.length) invalid();
					tokens.push({ kind: "literal", value: variant[index] });
				} else if (value === "*") {
					if (variant[index + 1] !== "*") tokens.push({ kind: "star" });
					else {
						while (variant[index + 1] === "*") index++;
						if (variant[index + 1] === "/") {
							index++;
							tokens.push({ kind: "directory" }, { kind: "directory-loop" });
						} else tokens.push({ kind: "deep" });
					}
				} else tokens.push({ kind: "literal", value });
			}
			return tokens;
		});
		if (
			this.alternatives.reduce((total, tokens) => total + tokens.length, 0) >
			4096
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Route glob state limit exceeded",
			);
	}

	matches(value: string, charge: (steps: number) => void): boolean {
		for (const tokens of this.alternatives) {
			let current = new Uint8Array(tokens.length + 1);
			let next = new Uint8Array(tokens.length + 1);
			const closure = (states: Uint8Array) => {
				charge(tokens.length);
				for (let index = 0; index < tokens.length; index++) {
					if (!states[index]) continue;
					const kind = tokens[index].kind;
					if (kind === "star" || kind === "deep" || kind === "directory")
						states[index + 1] = 1;
					if (kind === "directory") states[index + 2] = 1;
				}
			};
			current[0] = 1;
			closure(current);
			for (let offset = 0; offset < value.length; offset++) {
				charge(tokens.length + 1);
				next.fill(0);
				for (let index = 0; index < tokens.length; index++) {
					if (!current[index]) continue;
					const token = tokens[index];
					if (token.kind === "literal") {
						if (token.value === value[offset]) next[index + 1] = 1;
					} else if (
						token.kind === "deep" ||
						token.kind === "directory-loop" ||
						(token.kind === "star" && value[offset] !== "/")
					) {
						next[index] = 1;
						if (token.kind === "directory-loop" && value[offset] === "/")
							next[index + 1] = 1;
					}
				}
				closure(next);
				const previous = current;
				current = next;
				next = previous;
			}
			if (current[tokens.length]) return true;
		}
		return false;
	}
}
