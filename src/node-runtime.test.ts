import {
	chmod,
	lstat,
	mkdtemp,
	readFile,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { validateCommandConnection } from "./node-command-client.js";
import {
	readCommandConnection,
	writeCommandConnection,
} from "./node-runtime.js";

const directories: string[] = [];
const connection = {
	schemaVersion: 1 as const,
	origin: "http://127.0.0.1:32123",
	token: "a".repeat(43),
};
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "agent-browser-runtime-test-"));
	directories.push(path);
	return path;
}
afterEach(async () => {
	for (const path of directories.splice(0))
		await rm(path, { recursive: true, force: true });
});

it("writes private connection metadata, refuses replacement and removes only its own file", async () => {
	const root = await directory();
	const owned = await writeCommandConnection(connection, root);
	expect((await lstat(owned.path)).mode & 0o077).toBe(0);
	expect(await readCommandConnection(root)).toEqual(connection);
	await expect(writeCommandConnection(connection, root)).rejects.toMatchObject({
		code: "policy-denied",
	});
	await owned.remove();
	await owned.remove();
	await expect(readCommandConnection(root)).rejects.toMatchObject({
		code: "not-found",
	});
});

it("does not unlink a replacement connection file owned by another server instance", async () => {
	const root = await directory();
	const owned = await writeCommandConnection(connection, root);
	await rename(owned.path, `${owned.path}.old`);
	await writeFile(owned.path, "replacement", { mode: 0o600 });
	await owned.remove();
	expect(await readFile(owned.path, "utf8")).toBe("replacement");
});

it("rejects public directories, symlink files and world-readable credential files", async () => {
	const root = await directory();
	await chmod(root, 0o755);
	await expect(writeCommandConnection(connection, root)).rejects.toMatchObject({
		code: "policy-denied",
	});
	await chmod(root, 0o700);
	const target = join(root, "target.json");
	await writeFile(target, JSON.stringify(connection), { mode: 0o600 });
	await symlink(target, join(root, "connection.json"));
	await expect(readCommandConnection(root)).rejects.toThrow();
	await rm(join(root, "connection.json"));
	const owned = await writeCommandConnection(connection, root);
	await chmod(owned.path, 0o644);
	await expect(readCommandConnection(root)).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it.each([
	"https://127.0.0.1:1234",
	"http://localhost:1234",
	"http://127.0.0.1:65536",
	"http://127.0.0.1:1234/path",
	"http://example.com:1234",
])("rejects non-canonical/non-loopback API origins %s", (origin) => {
	expect(() => validateCommandConnection({ ...connection, origin })).toThrow(
		"Invalid local API connection",
	);
});

it("rejects oversized metadata and invalid tokens", async () => {
	const root = await directory();
	await writeFile(join(root, "connection.json"), " ".repeat(4097), {
		mode: 0o600,
	});
	await expect(readCommandConnection(root)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(() =>
		validateCommandConnection({ ...connection, token: "short" }),
	).toThrow();
});
