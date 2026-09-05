import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { type FileHandle, lstat, open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
	assertPrivateFile,
	privateFileLocation,
	samePrivateFile,
} from "./node-private-files.js";
import {
	type SecretProvider,
	secretProviderLimits,
} from "./secret-providers.js";

export const nodeSecretProviderLimits = Object.freeze({
	maxFileBytes: 65_536,
	maxStdoutBytes: 65_536,
	maxStderrBytes: 4096,
	maxTimeoutMs: 30_000,
	defaultTimeoutMs: 10_000,
});

export interface EnvFileSecretProviderOptions {
	readonly path: string;
}

export interface PassRunnerOptions {
	readonly signal: AbortSignal;
	readonly stdout: (chunk: Uint8Array) => void;
	readonly stderr: (chunk: Uint8Array) => void;
}

export type PassRunner = (
	executable: string,
	args: readonly string[],
	options: PassRunnerOptions,
) => Promise<number>;

export interface PassSecretProviderOptions {
	readonly executable?: string;
	readonly timeoutMs?: number;
	readonly runner?: PassRunner;
}

function failure() {
	return new Error("Secret operation failed");
}

function checkAbort(signal: AbortSignal) {
	if (signal.aborted) throw failure();
}

function absolutePath(path: string) {
	if (
		typeof path !== "string" ||
		!path.length ||
		path.length > 4096 ||
		!isAbsolute(path) ||
		resolve(path) !== path ||
		/[\p{Cc}\p{Cf}]/u.test(path)
	)
		throw failure();
	return path;
}

function checkedSecret(secret: string) {
	if (
		!secret.length ||
		secret.includes("\0") ||
		Buffer.byteLength(secret, "utf8") > secretProviderLimits.maxSecretBytes
	)
		throw failure();
	return secret;
}

function envValue(input: string) {
	const value = input.trim();
	const quote = value[0];
	if (quote !== "'" && quote !== '"') {
		const plain = value.replace(/[ \t]+#.*$/, "").trim();
		if (plain.startsWith("#")) return "";
		if (/[\s'"\\]/u.test(plain)) throw failure();
		return plain;
	}
	let result = "";
	for (let offset = 1; offset < value.length; offset++) {
		const character = value[offset];
		if (character === quote) {
			if (!/^[ \t]*(?:#.*)?$/.test(value.slice(offset + 1))) throw failure();
			return result;
		}
		if (quote === '"' && character === "\\") {
			const escaped = value[++offset];
			const escapes: Record<string, string> = {
				n: "\n",
				r: "\r",
				t: "\t",
				'"': '"',
				"\\": "\\",
			};
			if (!Object.hasOwn(escapes, escaped)) throw failure();
			result += escapes[escaped];
		} else result += character;
	}
	throw failure();
}

function selectEnv(text: string, selectedKey: string) {
	if (text.includes("\0")) throw failure();
	const seen = new Set<string>();
	let selected: string | undefined;
	for (const line of text.split(/\r?\n/)) {
		if (/^[ \t]*(?:#.*)?$/.test(line)) continue;
		const match =
			/^[ \t]*([A-Za-z_][A-Za-z0-9_]{0,127})[ \t]*=[ \t]*(.*)$/.exec(line);
		if (!match || seen.has(match[1]) || line.includes("\r")) throw failure();
		seen.add(match[1]);
		const value = envValue(match[2]);
		if (match[1] === selectedKey) selected = value;
	}
	if (selected === undefined) throw failure();
	return checkedSecret(selected);
}

export class EnvFileSecretProvider implements SecretProvider {
	readonly #path: string;

	constructor(options: EnvFileSecretProviderOptions) {
		this.#path = absolutePath(options.path);
		Object.freeze(this);
	}

	async resolve(key: string, signal: AbortSignal): Promise<string> {
		let handle: FileHandle | undefined;
		let bytes: Uint8Array | undefined;
		try {
			checkAbort(signal);
			if (
				typeof key !== "string" ||
				!/^[A-Za-z_][A-Za-z0-9_]{0,127}(?![\s\S])/.test(key)
			)
				throw failure();
			const location = await privateFileLocation(this.#path, "Secret");
			const original = await lstat(this.#path, { bigint: true });
			assertPrivateFile(original, location.uid, "Secret");
			checkAbort(signal);
			handle = await open(
				this.#path,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			const before = await handle.stat({ bigint: true });
			assertPrivateFile(before, location.uid, "Secret");
			if (
				!samePrivateFile(original, before) ||
				before.size < 0n ||
				before.size > BigInt(nodeSecretProviderLimits.maxFileBytes)
			)
				throw failure();
			bytes = new Uint8Array(Number(before.size) + 1);
			let offset = 0;
			while (offset < bytes.length) {
				checkAbort(signal);
				const { bytesRead } = await handle.read(
					bytes,
					offset,
					bytes.length - offset,
					offset,
				);
				if (!bytesRead) break;
				offset += bytesRead;
			}
			checkAbort(signal);
			const after = await handle.stat({ bigint: true });
			const current = await lstat(this.#path, { bigint: true });
			assertPrivateFile(after, location.uid, "Secret");
			assertPrivateFile(current, location.uid, "Secret");
			if (
				offset !== Number(before.size) ||
				!samePrivateFile(before, after) ||
				!samePrivateFile(before, current) ||
				before.size !== after.size ||
				before.size !== current.size ||
				before.mtimeNs !== after.mtimeNs ||
				before.ctimeNs !== after.ctimeNs ||
				after.mtimeNs !== current.mtimeNs ||
				after.ctimeNs !== current.ctimeNs
			)
				throw failure();
			await location.assertCurrent();
			await handle.close();
			handle = undefined;
			checkAbort(signal);
			return selectEnv(
				new TextDecoder("utf-8", { fatal: true }).decode(
					bytes.subarray(0, offset),
				),
				key,
			);
		} catch {
			throw failure();
		} finally {
			bytes?.fill(0);
			await handle?.close().catch(() => {});
		}
	}
}

const runPass: PassRunner = (executable, args, options) =>
	new Promise((resolveExit, reject) => {
		checkAbort(options.signal);
		if (process.platform === "win32") throw failure();
		const child = spawn(executable, [...args], {
			shell: false,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, PASSWORD_STORE_ENABLE_EXTENSIONS: "false" },
		});
		const pid = child.pid;
		let closed = false;
		let stopped = false;
		const killChild = () => {
			if (closed) return;
			try {
				child.kill("SIGKILL");
			} catch {}
		};
		const abort = () => {
			if (closed || stopped) return;
			stopped = true;
			if (
				typeof pid === "number" &&
				Number.isSafeInteger(pid) &&
				pid > 1 &&
				pid <= 0x7fff_ffff &&
				pid !== process.pid
			) {
				try {
					process.kill(-pid, "SIGKILL");
				} catch {
					killChild();
				}
			} else killChild();
			for (const stream of [child.stdout, child.stderr]) {
				try {
					stream.destroy();
				} catch {}
			}
			reject(failure());
		};
		child.stdout.on("error", abort);
		child.stderr.on("error", abort);
		child.stdout.on("data", (chunk: Buffer) => {
			try {
				if (!closed && !stopped) options.stdout(chunk);
			} catch {
				abort();
			} finally {
				chunk.fill(0);
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			try {
				if (!closed && !stopped) options.stderr(chunk);
			} catch {
				abort();
			} finally {
				chunk.fill(0);
			}
		});
		child.on("error", () => {
			abort();
			options.signal.removeEventListener("abort", abort);
			reject(failure());
		});
		child.on("close", (code) => {
			closed = true;
			options.signal.removeEventListener("abort", abort);
			if (stopped) reject(failure());
			else resolveExit(code ?? -1);
		});
		options.signal.addEventListener("abort", abort, { once: true });
		if (options.signal.aborted) abort();
	});

export class PassSecretProvider implements SecretProvider {
	readonly #executable: string;
	readonly #timeoutMs: number;
	readonly #runner: PassRunner;

	constructor(options: PassSecretProviderOptions = {}) {
		this.#executable = absolutePath(options.executable ?? "/usr/bin/pass");
		this.#timeoutMs =
			options.timeoutMs ?? nodeSecretProviderLimits.defaultTimeoutMs;
		this.#runner = options.runner ?? runPass;
		if (
			!Number.isInteger(this.#timeoutMs) ||
			this.#timeoutMs < 1 ||
			this.#timeoutMs > nodeSecretProviderLimits.maxTimeoutMs ||
			typeof this.#runner !== "function"
		)
			throw failure();
		Object.freeze(this);
	}

	async resolve(key: string, signal: AbortSignal): Promise<string> {
		const controller = new AbortController();
		const abort = () => controller.abort();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let bytes: Uint8Array | undefined;
		let active = true;
		try {
			checkAbort(signal);
			if (
				typeof key !== "string" ||
				!key.length ||
				key.length > secretProviderLimits.maxKeyLength ||
				key.startsWith("-") ||
				/[^A-Za-z0-9_@./+-]/.test(key) ||
				key.split("/").some((part) => !part || part === "." || part === "..")
			)
				throw failure();
			bytes = new Uint8Array(nodeSecretProviderLimits.maxStdoutBytes);
			const output = bytes;
			let stdoutBytes = 0;
			let stderrBytes = 0;
			signal.addEventListener("abort", abort, { once: true });
			const cancelled = new Promise<never>((_resolve, reject) => {
				controller.signal.addEventListener("abort", () => reject(failure()), {
					once: true,
				});
			});
			timer = setTimeout(abort, this.#timeoutMs);
			const result = await Promise.race([
				Promise.resolve().then(() => {
					checkAbort(controller.signal);
					return this.#runner(this.#executable, Object.freeze(["show", key]), {
						signal: controller.signal,
						stdout: (chunk) => {
							if (!active || controller.signal.aborted) return;
							if (
								!(chunk instanceof Uint8Array) ||
								chunk.byteLength > output.length - stdoutBytes
							) {
								abort();
								return;
							}
							output.set(chunk, stdoutBytes);
							stdoutBytes += chunk.byteLength;
						},
						stderr: (chunk) => {
							if (!active || controller.signal.aborted) return;
							if (!(chunk instanceof Uint8Array)) {
								abort();
								return;
							}
							stderrBytes += chunk.byteLength;
							if (stderrBytes > nodeSecretProviderLimits.maxStderrBytes)
								abort();
						},
					});
				}),
				cancelled,
			]);
			checkAbort(controller.signal);
			checkAbort(signal);
			if (result !== 0) throw failure();
			const newline = output.subarray(0, stdoutBytes).indexOf(10);
			let end = newline < 0 ? stdoutBytes : newline;
			if (newline >= 0 && end > 0 && output[end - 1] === 13) end--;
			return checkedSecret(
				new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
					output.subarray(0, end),
				),
			);
		} catch {
			throw failure();
		} finally {
			active = false;
			if (timer !== undefined) clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			abort();
			bytes?.fill(0);
		}
	}
}
