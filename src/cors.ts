import { AgentBrowserError } from "./errors.js";

export type FetchCredentials = "omit" | "same-origin" | "include";
type Headers = Readonly<Record<string, string>>;
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const safeMethods = new Set(["GET", "HEAD", "POST"]);
const safeResponseHeaders = new Set([
	"cache-control",
	"content-language",
	"content-length",
	"content-type",
	"expires",
	"last-modified",
	"pragma",
]);
const trim = (value: string) => value.replace(/^[\t ]+|[\t ]+$/g, "");
const header = (headers: Headers, name: string): string | undefined =>
	Object.hasOwn(headers, name) ? headers[name] : undefined;

function failure(): never {
	throw new AgentBrowserError(
		"policy-denied",
		"CORS response permission denied",
	);
}

function safeHeader(name: string, value: string): boolean {
	if (value.length > 128) return false;
	if (["accept-language", "content-language"].includes(name))
		return /^[0-9A-Za-z *,.;=-]*$/.test(value);
	if (["accept", "content-type"].includes(name)) {
		for (const character of value) {
			const code = character.charCodeAt(0);
			if (
				(code < 32 && code !== 9) ||
				code === 127 ||
				'"():<>?@[\\]{}'.includes(character)
			)
				return false;
		}
		return (
			name === "accept" ||
			[
				"application/x-www-form-urlencoded",
				"multipart/form-data",
				"text/plain",
			].includes(trim(value.split(";", 1)[0]).toLowerCase())
		);
	}
	if (name === "range") {
		const match = /^bytes=(\d+)-(\d*)$/.exec(value);
		return !!match && (!match[2] || BigInt(match[2]) >= BigInt(match[1]));
	}
	return false;
}

export function unsafeCorsHeaders(headers: Headers): string[] {
	const unsafe = new Set<string>();
	const potential: string[] = [];
	let safeBytes = 0;
	for (const [name, value] of Object.entries(headers)) {
		const lower = name.toLowerCase();
		if (!safeHeader(lower, value)) unsafe.add(lower);
		else {
			potential.push(lower);
			safeBytes += value.length;
		}
	}
	if (safeBytes > 1024) for (const name of potential) unsafe.add(name);
	return [...unsafe].sort();
}

function list(value: string | undefined): string[] {
	if (value === undefined) return [];
	const entries = value.split(",").map(trim).filter(Boolean);
	if (entries.some((entry) => !token.test(entry))) failure();
	return entries;
}

export function checkCors(
	headers: Headers,
	origin: string,
	credentials: FetchCredentials,
): void {
	const allowed = header(headers, "access-control-allow-origin");
	if (allowed === undefined) failure();
	const normalized = trim(allowed);
	if (normalized === "*" && credentials !== "include") return;
	if (normalized !== origin) failure();
	if (
		credentials === "include" &&
		trim(header(headers, "access-control-allow-credentials") ?? "") !== "true"
	)
		failure();
}

export function needsPreflight(
	method: string,
	names: readonly string[],
): boolean {
	return !safeMethods.has(method) || names.length > 0;
}

export function checkPreflight(
	status: number,
	headers: Headers,
	origin: string,
	credentials: FetchCredentials,
	method: string,
	names: readonly string[],
) {
	if (status < 200 || status >= 300) failure();
	checkCors(headers, origin, credentials);
	const methods = list(header(headers, "access-control-allow-methods"));
	const allowed = list(header(headers, "access-control-allow-headers")).map(
		(name) => name.toLowerCase(),
	);
	const wildcard = credentials !== "include";
	if (
		!safeMethods.has(method) &&
		!methods.includes(method) &&
		!(wildcard && methods.includes("*"))
	)
		failure();
	for (const name of names)
		if (
			!allowed.includes(name) &&
			!(name !== "authorization" && wildcard && allowed.includes("*"))
		)
			failure();
	return { methods, headers: allowed };
}

export function corsResponseHeaders(
	headers: Headers,
	credentials: FetchCredentials,
): Readonly<Record<string, string>> {
	let exposed: string[];
	try {
		exposed = list(header(headers, "access-control-expose-headers")).map(
			(name) => name.toLowerCase(),
		);
	} catch {
		exposed = [];
	}
	const wildcard = credentials !== "include" && exposed.includes("*");
	const result: Record<string, string> = Object.create(null);
	for (const [name, value] of Object.entries(headers)) {
		if (["set-cookie", "set-cookie2"].includes(name)) continue;
		if (wildcard || safeResponseHeaders.has(name) || exposed.includes(name))
			result[name] = value;
	}
	return Object.freeze(result);
}
