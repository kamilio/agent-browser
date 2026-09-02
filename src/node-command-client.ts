import { request } from "node:http";
import type { CommandResult } from "./command-host.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";

export interface CommandConnection {
	schemaVersion: 1;
	origin: string;
	token: string;
}

export function validateCommandConnection(input: unknown): CommandConnection {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid local API connection",
		);
	const value = input as CommandConnection;
	if (
		value.schemaVersion !== 1 ||
		typeof value.origin !== "string" ||
		!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value.origin) ||
		Number(value.origin.split(":").at(-1)) > 65_535 ||
		typeof value.token !== "string" ||
		!/^[a-zA-Z0-9_-]{43}$/.test(value.token)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid local API connection",
		);
	return { schemaVersion: 1, origin: value.origin, token: value.token };
}

export async function requestCommand(
	connection: CommandConnection,
	body: { argv: readonly string[]; session?: string } | null,
	timeoutMs = 35_000,
	signal?: AbortSignal,
): Promise<CommandResult | { closed: true }> {
	const result = await requestEnvelope(
		connection,
		body === null ? "/api/shutdown" : "/api/command",
		body ?? {},
		timeoutMs,
		signal,
	);
	if (body === null && result.closed === true) return { closed: true };
	if (result.result?.schemaVersion === 1) return result.result;
	throw new AgentBrowserError("network-error", "Invalid local API result");
}

export async function approvePlayground(
	connection: CommandConnection,
	code: string,
) {
	if (!/^[a-f0-9]{8}$/i.test(code))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid playground pairing code",
		);
	const result = await requestEnvelope(
		connection,
		"/api/pair/approve",
		{ code },
		35_000,
	);
	if (result.approved !== true)
		throw new AgentBrowserError(
			"network-error",
			"Invalid playground approval result",
		);
	return { approved: true, url: connection.origin };
}

interface ApiEnvelope {
	ok?: boolean;
	error?: { code?: string; message?: string };
	result?: CommandResult;
	closed?: boolean;
	approved?: boolean;
}

async function requestEnvelope(
	connection: CommandConnection,
	path: string,
	body: unknown,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<ApiEnvelope> {
	if (signal?.aborted)
		throw new AgentBrowserError("aborted", "Local API request cancelled");
	const valid = validateCommandConnection(connection);
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 310_000)
		throw new AgentBrowserError("invalid-input", "Invalid API client timeout");
	const data = JSON.stringify(body ?? {});
	if (Buffer.byteLength(data) > 65_536)
		throw new AgentBrowserError(
			"resource-limit",
			"API command body limit exceeded",
		);
	return new Promise((resolve, reject) => {
		const controller = new AbortController();
		const abort = () => controller.abort();
		signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const operation = request(
			`${valid.origin}${path}`,
			{
				method: "POST",
				agent: false,
				signal: controller.signal,
				headers: {
					authorization: `Bearer ${valid.token}`,
					"content-type": "application/json",
					"content-length": Buffer.byteLength(data),
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				let bytes = 0;
				response.on("data", (chunk: Buffer) => {
					bytes += chunk.byteLength;
					if (bytes > 2_097_152) {
						operation.destroy();
						reject(
							new AgentBrowserError(
								"resource-limit",
								"API response body limit exceeded",
							),
						);
						return;
					}
					chunks.push(chunk);
				});
				response.once("error", () =>
					reject(
						new AgentBrowserError(
							"network-error",
							"Local API response interrupted",
						),
					),
				);
				response.once("end", () => {
					try {
						const result = JSON.parse(
							new TextDecoder("utf-8", { fatal: true }).decode(
								Buffer.concat(chunks),
							),
						) as {
							ok?: boolean;
							error?: { code?: string; message?: string };
							result?: CommandResult;
							closed?: boolean;
						};
						if (response.statusCode !== 200 || result.ok !== true) {
							const code = result.error?.code;
							const allowed: ErrorCode[] = [
								"invalid-input",
								"stale-reference",
								"not-found",
								"not-actionable",
								"policy-denied",
								"resource-limit",
								"unsupported",
								"network-error",
								"timeout",
								"aborted",
								"closed",
							];
							reject(
								new AgentBrowserError(
									allowed.includes(code as ErrorCode)
										? (code as ErrorCode)
										: "network-error",
									typeof result.error?.message === "string"
										? result.error.message.slice(0, 4096)
										: "Local API request failed",
								),
							);
						} else resolve(result);
					} catch {
						reject(
							new AgentBrowserError(
								"network-error",
								"Invalid local API response",
							),
						);
					}
				});
			},
		);
		operation.once("close", () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		});
		operation.once("error", () =>
			reject(
				new AgentBrowserError(
					signal?.aborted
						? "aborted"
						: controller.signal.aborted
							? "timeout"
							: "network-error",
					signal?.aborted
						? "Local API request cancelled"
						: controller.signal.aborted
							? "Local API client deadline exceeded"
							: "Cannot connect to local API; start agent-browser serve",
				),
			),
		);
		operation.end(data);
	});
}
