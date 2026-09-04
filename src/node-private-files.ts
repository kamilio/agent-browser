import { constants, type BigIntStats } from "node:fs";
import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { AgentBrowserError } from "./errors.js";

export const privateFilePathLimit = 4096;

export function samePrivateFile(first: BigIntStats, second: BigIntStats) {
	return first.dev === second.dev && first.ino === second.ino;
}

export function assertPrivateFile(
	info: BigIntStats,
	uid: bigint,
	kind = "State",
) {
	if (
		!info.isFile() ||
		info.uid !== uid ||
		info.nlink !== 1n ||
		(info.mode & 0o077n) !== 0n
	)
		throw new AgentBrowserError(
			"policy-denied",
			`${kind} file must be a private owned regular file with one link`,
		);
}

export async function privateFileLocation(filename: string, kind = "State") {
	if (
		typeof process.getuid !== "function" ||
		typeof process.geteuid !== "function" ||
		process.getuid() !== process.geteuid() ||
		!constants.O_NOFOLLOW ||
		!constants.O_NONBLOCK
	)
		throw new AgentBrowserError(
			"unsupported",
			`Private ${kind.toLowerCase()} files require Unix ownership and no-follow checks`,
		);
	if (
		typeof filename !== "string" ||
		!filename ||
		filename.length > privateFilePathLimit ||
		!isAbsolute(filename) ||
		resolve(filename) !== filename ||
		/[\p{Cc}\p{Cf}]/u.test(filename) ||
		dirname(filename) === filename
	)
		throw new AgentBrowserError(
			"invalid-input",
			`${kind} filename must be a bounded canonical absolute path`,
		);
	const uid = BigInt(process.getuid());
	const parent = dirname(filename);
	const ancestors: { path: string; info: BigIntStats }[] = [];
	let path = parent;
	while (true) {
		const info = await lstat(path, { bigint: true });
		const writable = (info.mode & 0o022n) !== 0n;
		const trustedSticky = path !== parent && (info.mode & 0o1000n) !== 0n;
		if (
			!info.isDirectory() ||
			info.isSymbolicLink() ||
			(info.uid !== 0n && info.uid !== uid) ||
			(writable && !trustedSticky) ||
			(path === parent && info.uid !== uid)
		)
			throw new AgentBrowserError(
				"policy-denied",
				`${kind} file directory chain is not safely owned and protected`,
			);
		ancestors.push({ path, info });
		const next = dirname(path);
		if (next === path) break;
		path = next;
	}
	return {
		uid,
		parent,
		assertCurrent: async () => {
			for (const ancestor of ancestors) {
				const current = await lstat(ancestor.path, { bigint: true });
				if (
					!samePrivateFile(ancestor.info, current) ||
					ancestor.info.mode !== current.mode ||
					ancestor.info.uid !== current.uid ||
					!current.isDirectory()
				)
					throw new AgentBrowserError(
						"policy-denied",
						`${kind} file directory changed during access`,
					);
			}
		},
	};
}
