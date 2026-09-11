import { AgentBrowserError } from "./errors.js";

const number = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?$/i;
const keywords = new Set(["normal", "bold", "bolder", "lighter"]);

function validWeight(weight: number): boolean {
	return (
		typeof weight === "number" &&
		Number.isFinite(weight) &&
		weight >= 1 &&
		weight <= 1000
	);
}

function numericWeight(value: string): number | undefined {
	if (typeof value !== "string" || !number.test(value)) return;
	const weight = Number(value);
	return validWeight(weight) ? weight : undefined;
}

export function parseFontWeight(value: string): string | undefined {
	if (typeof value !== "string") return;
	const normalized = value.trim().toLowerCase();
	if (keywords.has(normalized)) return normalized;
	const weight = numericWeight(normalized);
	return weight === undefined ? undefined : String(weight);
}

export function computeFontWeight(value: string, parent: string): string {
	const specified = parseFontWeight(value);
	if (specified === undefined)
		throw new AgentBrowserError("invalid-input", "Invalid font weight");
	if (specified === "normal") return "400";
	if (specified === "bold") return "700";
	if (specified !== "bolder" && specified !== "lighter") return specified;
	const inherited = numericWeight(parent);
	if (inherited === undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid inherited font weight",
		);
	if (specified === "bolder") {
		if (inherited < 350) return "400";
		if (inherited < 550) return "700";
		if (inherited < 900) return "900";
		return String(inherited);
	}
	if (inherited < 100) return String(inherited);
	if (inherited < 550) return "100";
	if (inherited < 750) return "400";
	return "700";
}

export function matchFontWeight(weight: number): 400 | 700 {
	if (!validWeight(weight))
		throw new AgentBrowserError("invalid-input", "Invalid font weight");
	return weight <= 500 ? 400 : 700;
}
