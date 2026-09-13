import type { BoxStyle } from "./css-box.js";
import { borderSides } from "./css-border.js";
import { resolveLayoutLength } from "./layout-values.js";
import { AgentBrowserError } from "./errors.js";

export const borderCapabilities = Object.freeze({
	partial: true,
	profile: "normal-flow-solid-dashed-borders",
	styles: Object.freeze(["none", "hidden", "solid", "dashed"]),
	dashes: "rectangular-three-width-dash-gap",
	inline: "ltr-sliced-fragments",
	clone: false,
	radius: false,
	image: false,
});
export function resolveBorders(style: BoxStyle) {
	const values = borderSides.map((side) => {
		const kind = style[`border-${side}-style`];
		if (!borderCapabilities.styles.includes(kind))
			throw new AgentBrowserError("unsupported", "Unsupported border style");
		if (kind === "none" || kind === "hidden") return 0;
		const width = style[`border-${side}-width`];
		if (!width.endsWith("px"))
			throw new AgentBrowserError(
				"unsupported",
				"Border requires computed pixel widths",
			);
		return resolveLayoutLength(width, 0);
	});
	return {
		borderTop: values[0],
		borderRight: values[1],
		borderBottom: values[2],
		borderLeft: values[3],
	};
}
