import type { StyleViewport } from "./css-parser.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export function createPageScreen(
	factory: ScriptHostObjectFactory,
	readViewport: () => Readonly<StyleViewport>,
	ensureOpen: () => void,
): object {
	ensureOpen();
	const screen = factory.createHostObject({
		properties: Object.fromEntries(
			[
				"width",
				"height",
				"availWidth",
				"availHeight",
				"colorDepth",
				"pixelDepth",
			].map((name) => [
				name,
				{
					get: () => {
						ensureOpen();
						if (name === "colorDepth" || name === "pixelDepth") return 24;
						const viewport = readViewport();
						return name === "width" || name === "availWidth"
							? viewport.width
							: viewport.height;
					},
				},
			]),
		),
	});
	ensureOpen();
	return screen;
}
