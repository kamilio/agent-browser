import { type OptionDefinition, commands, globalOptions } from "./commands.js";
import { AgentBrowserError } from "./errors.js";

export type OptionValue = string | number | boolean | string[];

export interface Invocation {
	command: string;
	session: string;
	arguments: string[];
	options: Record<string, OptionValue>;
}

export function parseInvocation(
	argv: readonly string[],
	environment: {
		AGENT_BROWSER_SESSION?: string;
		PLAYWRIGHT_CLI_SESSION?: string;
	} = {},
): Invocation {
	if (
		argv.length > 256 ||
		argv.reduce((length, argument) => length + argument.length, 0) > 262_144
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Command arguments too large",
		);
	let name: string | undefined;
	let explicitSession: string | undefined;
	let literal = false;
	const positional: string[] = [];
	const options: Record<string, OptionValue> = Object.create(null);

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (!literal && argument === "--") {
			literal = true;
			continue;
		}
		const optionLike =
			!literal &&
			argument.startsWith("-") &&
			argument !== "-" &&
			!/^-[0-9]+(?:\.[0-9]+)?$/.test(argument);
		if (!optionLike) {
			if (!name) {
				if (!commands.has(argument))
					throw new AgentBrowserError(
						"invalid-input",
						`Unknown command: ${argument}`,
					);
				name = argument;
			} else positional.push(argument);
			continue;
		}
		const equals = argument.indexOf("=");
		const spelling = equals < 0 ? argument : argument.slice(0, equals);
		let value = equals < 0 ? undefined : argument.slice(equals + 1);
		const key =
			spelling === "-s" || spelling === "--session"
				? "session"
				: spelling === "-h"
					? "help"
					: spelling.startsWith("--")
						? spelling.slice(2)
						: "";
		const definition: OptionDefinition | undefined =
			key === "session"
				? { kind: "string" }
				: Object.hasOwn(globalOptions, key)
					? globalOptions[key]
					: name && Object.hasOwn(commands.get(name)?.options ?? {}, key)
						? commands.get(name)?.options[key]
						: undefined;
		if (!definition)
			throw new AgentBrowserError(
				"invalid-input",
				`Unknown option: ${spelling}`,
			);
		if (definition.kind !== "boolean" && value === undefined) {
			const next = argv[index + 1];
			if (next === undefined || next === "--" || /^--?[a-z]/i.test(next))
				throw new AgentBrowserError(
					"invalid-input",
					`Missing value for ${spelling}`,
				);
			value = next;
			index++;
		}
		const parsed = parseOption(key, definition, value);
		if (key === "session") {
			if (explicitSession !== undefined)
				throw new AgentBrowserError("invalid-input", "Session specified twice");
			explicitSession = String(parsed);
		} else if (definition.repeated) {
			const previous = options[key];
			options[key] = [
				...(Array.isArray(previous) ? previous : []),
				String(parsed),
			];
		} else {
			if (Object.hasOwn(options, key))
				throw new AgentBrowserError(
					"invalid-input",
					`Option specified twice: --${key}`,
				);
			options[key] = parsed;
		}
	}

	const session =
		explicitSession ??
		environment.AGENT_BROWSER_SESSION ??
		environment.PLAYWRIGHT_CLI_SESSION ??
		"default";
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(session))
		throw new AgentBrowserError("invalid-input", "Invalid session name");
	name ??= "help";
	const definition = commands.get(name);
	if (!definition)
		throw new AgentBrowserError("invalid-input", `Unknown command: ${name}`);
	if (!options.help && !options.version) {
		if (
			positional.length < definition.minimumArguments ||
			positional.length > definition.maximumArguments
		)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid argument count for ${name}: expected ${definition.minimumArguments}–${definition.maximumArguments}`,
			);
		if (
			["run-code", "batch"].includes(name) &&
			Number(positional.length > 0) + Number(Boolean(options.filename)) !== 1
		)
			throw new AgentBrowserError(
				"invalid-input",
				`${name} needs either an argument or --filename, not both`,
			);
		if (name === "highlight" && !positional.length && !options.hide)
			throw new AgentBrowserError("invalid-input", "highlight needs a target");
		if (name === "drop" && !options.path && !options.data)
			throw new AgentBrowserError(
				"invalid-input",
				"drop needs --path or --data",
			);
	}
	return { command: name, session, arguments: positional, options };
}

function parseOption(
	key: string,
	definition: OptionDefinition,
	value: string | undefined,
): string | number | boolean {
	if (definition.kind === "boolean") {
		if (value === undefined || value === "true") return true;
		if (value === "false") return false;
		throw new AgentBrowserError("invalid-input", `--${key} must be boolean`);
	}
	if (value === undefined || value === "")
		throw new AgentBrowserError("invalid-input", `--${key} needs a value`);
	if (definition.kind === "string") return value;
	const number = Number(value);
	if (
		!value.trim() ||
		!Number.isFinite(number) ||
		(definition.integer && !Number.isSafeInteger(number)) ||
		(definition.minimum !== undefined && number < definition.minimum) ||
		(definition.maximum !== undefined && number > definition.maximum)
	)
		throw new AgentBrowserError("invalid-input", `Invalid number for --${key}`);
	return number;
}
