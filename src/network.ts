import type { CookieRequestContext } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import type { ResponseAccountingLease } from "./response-byte-accounting.js";

export interface NetworkLimits {
	timeoutMs: number;
	maxResponseBytes: number;
	maxRequestBytes: number;
	maxHeaderBytes: number;
	maxRedirects: number;
	maxConcurrent: number;
	maxRequests: number;
	maxTotalBytes: number;
}

export interface NetworkRequest {
	url: string;
	method?: string;
	headers?: Readonly<Record<string, string>>;
	body?: string | Uint8Array;
	maxResponseBytes?: number;
	responseAccounting?: ResponseAccountingLease;
	redirect?: "follow" | "manual" | "error";
	signal?: AbortSignal;
	cookieContext?: CookieRequestContext;
}

export interface NetworkResponse {
	routeId?: number;
	url: string;
	status: number;
	headers: Readonly<Record<string, readonly string[]>>;
	body: Uint8Array;
	redirects: readonly { url: string; status: number; location: string }[];
	encodedBytes: number;
	elapsedMs: number;
}

export interface NetworkMetrics {
	mockedRequests?: number;
	mockedDecodedBytes?: number;
	requests: number;
	redirects: number;
	encodedBytes: number;
	decodedBytes: number;
	active: number;
	closed: boolean;
}

export interface NetworkTransport {
	request(request: NetworkRequest): Promise<NetworkResponse>;
	requestWithRoutes?(
		request: NetworkRequest,
		resolveRoute: NetworkRouteResolver,
	): Promise<NetworkResponse>;
	metrics(): Readonly<NetworkMetrics>;
	close(): void;
}

export type NetworkRouteResolver = (
	request: Readonly<Pick<NetworkRequest, "url" | "method" | "signal">>,
) => NetworkResponse | undefined;

export interface NetworkPolicyOptions {
	allowPrivateOrigins?: readonly string[];
	allowedOrigins?: readonly string[];
}

function ipv4Value(address: string): bigint | undefined {
	if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(address))
		return undefined;
	const octets = address.split(".").map(Number);
	if (octets.some((octet) => octet > 255)) return undefined;
	return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function ipv6Value(address: string): bigint | undefined {
	if (!address.includes(":") || !/^[a-f0-9:.]+$/i.test(address))
		return undefined;
	let normalized: string;
	try {
		normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
	} catch {
		return undefined;
	}
	const sides = normalized.split("::");
	const left = sides[0] ? sides[0].split(":") : [];
	const right = sides[1] ? sides[1].split(":") : [];
	const groups =
		sides.length === 2
			? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
			: left;
	if (groups.length !== 8) return undefined;
	return groups.reduce(
		(value, group) => (value << 16n) | BigInt(`0x${group}`),
		0n,
	);
}

function matches(value: bigint, prefix: bigint, width: number, bits: number) {
	const shift = BigInt(width - bits);
	return value >> shift === prefix >> shift;
}

const blockedIPv4: readonly [bigint, number][] = [
	[0x00000000n, 8],
	[0x0a000000n, 8],
	[0x64400000n, 10],
	[0x7f000000n, 8],
	[0xa9fe0000n, 16],
	[0xac100000n, 12],
	[0xc0000000n, 24],
	[0xc0000200n, 24],
	[0xc0586300n, 24],
	[0xc0a80000n, 16],
	[0xc6120000n, 15],
	[0xc6336400n, 24],
	[0xcb007100n, 24],
	[0xe0000000n, 3],
];
const blockedIPv6: readonly [bigint, number][] = [
	[0x20010000000000000000000000000000n, 23],
	[0x20010db8000000000000000000000000n, 32],
	[0x20020000000000000000000000000000n, 16],
	[0x3fff0000000000000000000000000000n, 20],
];

const blockedPorts = new Set([
	0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
	79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
	137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
	532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720,
	1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
	6669, 6679, 6697, 10080,
]);

export function addressFamily(address: string): 0 | 4 | 6 {
	if (typeof address !== "string") return 0;
	if (ipv4Value(address) !== undefined) return 4;
	return ipv6Value(address) === undefined ? 0 : 6;
}

export function isPublicAddress(address: string) {
	if (typeof address !== "string") return false;
	const ipv4 = ipv4Value(address);
	if (ipv4 !== undefined)
		return !blockedIPv4.some(([prefix, bits]) =>
			matches(ipv4, prefix, 32, bits),
		);
	const ipv6 = ipv6Value(address);
	return (
		ipv6 !== undefined &&
		matches(ipv6, 0x20000000000000000000000000000000n, 128, 3) &&
		!blockedIPv6.some(([prefix, bits]) => matches(ipv6, prefix, 128, bits))
	);
}

export function parseNetworkUrl(value: string): URL {
	if (
		typeof value !== "string" ||
		value.length > 16_384 ||
		/\p{Cc}/u.test(value)
	)
		throw new AgentBrowserError("invalid-input", "Invalid network URL");
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid network URL");
	}
	if (!["http:", "https:"].includes(url.protocol))
		throw new AgentBrowserError(
			"policy-denied",
			"Only HTTP and HTTPS network URLs are allowed",
		);
	if (url.username || url.password)
		throw new AgentBrowserError(
			"policy-denied",
			"Credentials in URLs are not allowed",
		);
	return url;
}

export function networkHostname(url: URL) {
	return url.hostname.startsWith("[")
		? url.hostname.slice(1, -1)
		: url.hostname;
}

function originSet(
	values: readonly string[] | undefined,
): Set<string> | undefined {
	if (values === undefined) return undefined;
	if (!Array.isArray(values) || values.length > 1000)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid network origin policy",
		);
	return new Set(
		values.map((value) => {
			const url = parseNetworkUrl(value);
			if (url.pathname !== "/" || url.search || url.hash)
				throw new AgentBrowserError(
					"invalid-input",
					"Network policies require origins, not paths",
				);
			return url.origin;
		}),
	);
}

export class NetworkPolicy {
	private readonly privateOrigins: ReadonlySet<string>;
	private readonly origins?: ReadonlySet<string>;

	constructor(options: NetworkPolicyOptions = {}) {
		this.privateOrigins = originSet(options.allowPrivateOrigins) ?? new Set();
		this.origins = originSet(options.allowedOrigins);
	}

	checkUrl(value: string): URL {
		const url = parseNetworkUrl(value);
		if (url.port && blockedPorts.has(Number(url.port)))
			throw new AgentBrowserError(
				"policy-denied",
				"Network port is not allowed",
			);
		if (this.origins && !this.origins.has(url.origin))
			throw new AgentBrowserError(
				"policy-denied",
				"Network origin is not allowed",
			);
		if (!this.privateOrigins.has(url.origin)) {
			const hostname = networkHostname(url).replace(/\.$/, "");
			if (/^(localhost|.*\.(localhost|local|internal))$/i.test(hostname))
				throw new AgentBrowserError(
					"policy-denied",
					"Local network names are not allowed",
				);
			if (addressFamily(hostname) && !isPublicAddress(hostname))
				throw new AgentBrowserError(
					"policy-denied",
					"Private or reserved network addresses are not allowed",
				);
		}
		return url;
	}

	checkAddresses(value: string, addresses: readonly string[]) {
		const url = this.checkUrl(value);
		if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64)
			throw new AgentBrowserError(
				"network-error",
				"Invalid DNS address result",
			);
		const privateAllowed = this.privateOrigins.has(url.origin);
		if (
			addresses.some(
				(address) =>
					!addressFamily(address) ||
					(!privateAllowed && !isPublicAddress(address)),
			)
		)
			throw new AgentBrowserError(
				"policy-denied",
				"DNS returned a private, reserved or invalid address",
			);
	}
}

export function responseHeader(
	response: Pick<NetworkResponse, "headers">,
	name: string,
) {
	return response.headers[name.toLowerCase()]?.join(", ");
}

export function decodeResponseText(
	response: Pick<NetworkResponse, "headers" | "body">,
	fallbackEncoding = "utf-8",
) {
	const contentType = responseHeader(response, "content-type") ?? "";
	const charset = /;\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/i.exec(
		contentType,
	);
	let encoding = charset
		? (charset[1] ?? charset[2] ?? charset[3])
		: fallbackEncoding;
	const bytes = response.body;
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
		encoding = "utf-8";
	else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
	else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
	let decoder: TextDecoder;
	try {
		decoder = new TextDecoder(encoding);
	} catch {
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported response text encoding",
		);
	}
	if (decoder.encoding === "windows-1252") {
		const replacements = [
			0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6,
			0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019,
			0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a,
			0x153, 0x9d, 0x17e, 0x178,
		];
		const parts: string[] = [];
		for (let offset = 0; offset < bytes.length; offset += 4096) {
			const points = Array.from(
				bytes.subarray(offset, offset + 4096),
				(byte) =>
					byte >= 0x80 && byte <= 0x9f ? replacements[byte - 0x80] : byte,
			);
			parts.push(String.fromCharCode(...points));
		}
		return { text: parts.join(""), encoding: decoder.encoding };
	}
	return { text: decoder.decode(bytes), encoding: decoder.encoding };
}
