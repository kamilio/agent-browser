export interface OptionDefinition {
	kind: "boolean" | "string" | "number";
	minimum?: number;
	maximum?: number;
	integer?: boolean;
	repeated?: boolean;
}

export interface CommandDefinition {
	name: string;
	minimumArguments: number;
	maximumArguments: number;
	options: Readonly<Record<string, OptionDefinition>>;
	category: "baseline" | "extension";
}

const booleanOption: OptionDefinition = { kind: "boolean" };
const stringOption: OptionDefinition = { kind: "string" };
const positiveInteger: OptionDefinition = {
	kind: "number",
	minimum: 1,
	maximum: 1_000_000,
	integer: true,
};

export const globalOptions: Readonly<Record<string, OptionDefinition>> = {
	json: booleanOption,
	raw: booleanOption,
	help: booleanOption,
	version: booleanOption,
	config: stringOption,
	timeout: { kind: "number", minimum: 0, maximum: 3_600_000 },
};

function command(
	name: string,
	minimumArguments = 0,
	maximumArguments = minimumArguments,
	options: Readonly<Record<string, OptionDefinition>> = {},
	category: CommandDefinition["category"] = "baseline",
): CommandDefinition {
	return { name, minimumArguments, maximumArguments, options, category };
}

const definitions: CommandDefinition[] = [
	command("open", 0, 1, {
		browser: stringOption,
		headed: booleanOption,
		persistent: booleanOption,
		profile: stringOption,
		mobile: booleanOption,
		device: stringOption,
	}),
	command("goto", 1),
	command("type", 1),
	command("click", 1, 2),
	command("dblclick", 1, 2),
	command("fill", 2, 2, { submit: booleanOption }),
	command("drag", 2),
	command("drop", 1, 1, {
		path: { kind: "string", repeated: true },
		data: { kind: "string", repeated: true },
	}),
	command("hover", 1),
	command("select", 2),
	command("upload", 1, 64),
	command("check", 1),
	command("uncheck", 1),
	command("snapshot", 0, 1, {
		filename: stringOption,
		depth: positiveInteger,
		boxes: booleanOption,
		diff: booleanOption,
		"max-bytes": positiveInteger,
		observe: booleanOption,
	}),
	command("find", 1, 1, {
		regex: booleanOption,
		"max-results": { kind: "number", minimum: 1, maximum: 500, integer: true },
		context: { kind: "number", minimum: 0, maximum: 10, integer: true },
		"max-bytes": {
			kind: "number",
			minimum: 1024,
			maximum: 262_144,
			integer: true,
		},
	}),
	command("eval", 1, 2),
	command("dialog-accept", 0, 1),
	command("dialog-dismiss"),
	command("resize", 2, 2, {
		"expected-tab": stringOption,
		"expected-viewport": stringOption,
	}),
	command("press", 1),
	command("keydown", 1),
	command("keyup", 1),
	command("mousemove", 2),
	command("mousedown", 0, 1),
	command("mouseup", 0, 1),
	command("mousewheel", 2),
	command("screenshot", 0, 1, {
		filename: stringOption,
		hires: booleanOption,
	}),
	command("pdf", 0, 0, { filename: stringOption }),
	command("artifact-list", 0, 0, {}, "extension"),
	command(
		"artifact-read",
		1,
		1,
		{
			offset: {
				kind: "number",
				minimum: 0,
				maximum: 33_554_432,
				integer: true,
			},
			length: { kind: "number", minimum: 1, maximum: 65_536, integer: true },
		},
		"extension",
	),
	command("artifact-delete", 1, 1, {}, "extension"),
	command("tab-new", 0, 1),
	command("tab-close", 0, 1),
	command("tab-select", 1),
	command("state-save", 0, 1, { overwrite: booleanOption }),
	command("state-load", 1),
	command("state-export", 0, 0, {}, "extension"),
	command("state-import-begin", 1, 1, {}, "extension"),
	command("state-import-append", 3, 3, {}, "extension"),
	command("state-import-commit", 1, 1, {}, "extension"),
	command("state-transfer-read", 2, 2, {}, "extension"),
	command("state-transfer-delete", 1, 1, {}, "extension"),
	command("cookie-list", 0, 0, { domain: stringOption }),
	command("cookie-get", 1),
	command("cookie-set", 2, 2, {
		domain: stringOption,
		path: stringOption,
		expires: { kind: "number" },
		httpOnly: booleanOption,
		secure: booleanOption,
		sameSite: stringOption,
	}),
	command("cookie-delete", 1),
	command("route", 1, 1, {
		status: { kind: "number", minimum: 100, maximum: 599, integer: true },
		body: stringOption,
		"content-type": stringOption,
		header: { kind: "string", repeated: true },
		"remove-header": stringOption,
		headers: stringOption,
		removeHeader: { kind: "string", repeated: true },
	}),
	command("unroute", 0, 1),
	command("console", 0, 1),
	command("request", 1),
	command("run-code", 0, 1, { filename: stringOption }),
	command("video-start", 0, 1),
	command("video-chapter", 1),
	command("show", 0, 0, { annotate: booleanOption }),
	command("generate-locator", 1),
	command("highlight", 0, 1, {
		style: stringOption,
		hide: booleanOption,
	}),
	command("attach", 0, 0, {
		extension: stringOption,
		cdp: stringOption,
	}),
	command("list", 0, 0, { all: booleanOption }),
	command("install", 0, 0, { skills: booleanOption }),
	...[
		"close",
		"go-back",
		"go-forward",
		"reload",
		"tab-list",
		"cookie-clear",
		"route-list",
		"requests",
		"tracing-start",
		"tracing-stop",
		"video-show-actions",
		"video-hide-actions",
		"video-stop",
		"detach",
		"close-all",
		"kill-all",
		"delete-data",
	].map((name) => command(name)),
	...["localstorage", "sessionstorage"].flatMap((prefix) => [
		command(`${prefix}-list`),
		command(`${prefix}-get`, 1),
		command(`${prefix}-set`, 2),
		command(`${prefix}-delete`, 1),
		command(`${prefix}-clear`),
	]),
	command("help", 0, 1, {}, "extension"),
	command("capabilities", 0, 0, {}, "extension"),
	command("metrics", 0, 0, {}, "extension"),
	command("viewport", 0, 0, {}, "extension"),
	command("images", 0, 0, {}, "extension"),
	command("styles", 0, 1, {}, "extension"),
	command("geometry", 1, 1, {}, "extension"),
	command(
		"extract",
		0,
		1,
		{
			format: stringOption,
			"max-bytes": { ...positiveInteger, minimum: 256, maximum: 1_048_576 },
			"max-nodes": { ...positiveInteger, maximum: 50_000 },
			depth: { ...positiveInteger, minimum: 0, maximum: 1024 },
		},
		"extension",
	),
	command("batch", 0, 1, { filename: stringOption }, "extension"),
	command("subscribe", 0, 0, { "max-bytes": positiveInteger }, "extension"),
	command("text", 0, 0, { columns: positiveInteger }, "extension"),
	command("html", 0, 1, { "max-code-units": positiveInteger }, "extension"),
	command(
		"dom",
		0,
		1,
		{
			depth: { ...positiveInteger, minimum: 0, maximum: 64 },
			"max-nodes": { ...positiveInteger, maximum: 2048 },
			"max-code-units": { ...positiveInteger, minimum: 1024, maximum: 262_144 },
		},
		"extension",
	),
	command("playground", 0, 0, { pair: stringOption }, "extension"),
	command("terminal", 0, 1, {}, "extension"),
	command("serve", 0, 0, {}, "extension"),
	command("stop-server", 0, 0, {}, "extension"),
];

export const commands: ReadonlyMap<string, CommandDefinition> = new Map(
	definitions.map((definition) => [definition.name, definition]),
);
