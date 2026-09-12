import { AgentBrowserError } from "./errors.js";
import { layoutNumber } from "./layout-values.js";

export interface BlockContentAlignment {
	readonly position: "start" | "center" | "end";
	readonly overflow: "safe" | "unsafe";
}

export function resolveBlockContentAlignment(
	value: string,
): Readonly<BlockContentAlignment> | undefined | null {
	if (value === "normal") return;
	if (value === "stretch" || value === "space-between")
		return Object.freeze({ position: "start", overflow: "safe" });
	if (value === "space-around" || value === "space-evenly")
		return Object.freeze({ position: "center", overflow: "safe" });
	const position = value.replace(/^(safe|unsafe) /, "");
	const physical =
		position === "start" || position === "flex-start"
			? "start"
			: position === "end" || position === "flex-end"
				? "end"
				: position === "center"
					? "center"
					: undefined;
	if (!physical) return null;
	return Object.freeze({
		position: physical,
		overflow: value.startsWith("unsafe ") ? "unsafe" : "safe",
	});
}

export function blockContentAlignmentOffset(
	alignment: Readonly<BlockContentAlignment>,
	usedHeight: number,
	naturalHeight: number,
): number {
	if (
		!alignment ||
		!["start", "center", "end"].includes(alignment.position) ||
		!["safe", "unsafe"].includes(alignment.overflow)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid block content alignment",
		);
	const free = layoutNumber(
		layoutNumber(usedHeight) - layoutNumber(naturalHeight),
		true,
	);
	if (alignment.overflow === "safe" && free < 0) return 0;
	return layoutNumber(
		alignment.position === "end"
			? free
			: alignment.position === "center"
				? free / 2
				: 0,
		true,
	);
}
