const maxSourceCodeUnits = 4096;
const casingKeywords = new Set(["capitalize", "uppercase", "lowercase"]);

export function parseTextTransform(value: string): string | undefined {
	if (
		typeof value !== "string" ||
		value.length > maxSourceCodeUnits ||
		/[^a-zA-Z\t\n\f\r -]/.test(value)
	)
		return;
	const parts = value.toLowerCase().match(/[^\t\n\f\r ]+/g) ?? [];
	if (parts.length === 1 && parts[0] === "none") return "none";
	if (parts.length === 0 || parts.length > 3) return;
	let casing: string | undefined;
	let fullWidth = false;
	let fullSizeKana = false;
	for (const part of parts) {
		if (casingKeywords.has(part)) {
			if (casing !== undefined) return;
			casing = part;
		} else if (part === "full-width") {
			if (fullWidth) return;
			fullWidth = true;
		} else if (part === "full-size-kana") {
			if (fullSizeKana) return;
			fullSizeKana = true;
		} else return;
	}
	return [casing, fullWidth && "full-width", fullSizeKana && "full-size-kana"]
		.filter(Boolean)
		.join(" ");
}
