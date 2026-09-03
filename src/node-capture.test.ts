import {
	lstat,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { CaptureArtifacts, type CaptureDetails } from "./capture-artifacts.js";
import {
	type CaptureExecutor,
	capturePng,
	readCapture,
} from "./capture-client.js";
import { parseInvocation } from "./cli-parser.js";
import { saveCapture } from "./node-capture.js";
import { scriptFrame, scriptFrameLimit } from "./node-script-protocol.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";

const directories: string[] = [];
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "agent-browser-capture-"));
	directories.push(path);
	return path;
}
afterEach(async () => {
	for (const path of directories.splice(0))
		await rm(path, { recursive: true, force: true });
});
function fixture() {
	const store = new CaptureArtifacts();
	const bytes = encodePng(createRaster(160, 120, [10, 20, 30, 255]), {
		compression: "stored",
	});
	const details: CaptureDetails = {
		mediaType: "image/png",
		partial: true,
		profile: "normal-flow-solid-colors",
		document: "document",
		revision: 1,
		target: null,
		width: 160,
		height: 120,
		deviceScaleFactor: 1,
		hires: false,
		clip: { x: 0, y: 0, width: 160, height: 120 },
		paint: {
			work: 0,
			paintedGlyphs: 0,
			clippedGlyphs: 0,
			hiddenGlyphs: 0,
			blankGlyphs: 0,
			transparentGlyphs: 0,
			paintedBackgrounds: 0,
			inlineFragments: 0,
		},
	};
	const calls: readonly string[][] = [];
	const execute: CaptureExecutor = async (argv) => {
		(calls as string[][]).push([...argv]);
		let data: unknown;
		if (argv[0] === "screenshot") data = store.add("session", bytes, details);
		else if (argv[0] === "artifact-read")
			data = store.read("session", argv[1], Number(argv[2].split("=")[1]));
		else if (argv[0] === "artifact-delete") {
			store.delete("session", argv[1]);
			data = { deleted: true };
		} else throw new Error("Unexpected command");
		return JSON.parse(
			JSON.stringify({
				schemaVersion: 1,
				command: argv[0],
				session: "session",
				data,
			}),
		);
	};
	return { store, bytes, details, execute, calls };
}

it("atomically saves a private PNG, strips local filename options and releases the server artifact", async () => {
	const root = await directory();
	const { execute, bytes, calls, store } = fixture();
	const result = await saveCapture(
		parseInvocation([
			"screenshot",
			"#target",
			"--filename=result.png",
			"--hires",
			"--json",
		]),
		execute,
		root,
	);
	expect(result.filename).toBe(join(root, "result.png"));
	expect((await readFile(result.filename)).equals(bytes)).toBe(true);
	expect((await lstat(result.filename)).mode & 0o777).toBe(0o600);
	expect(calls[0]).toEqual(["screenshot", "--hires=true", "--", "#target"]);
	expect(result.remoteCleanupConfirmed).toBe(true);
	expect(store.metrics().bytes).toBe(0);
	expect(await readdir(root)).toEqual(["result.png"]);
});

it.each([false, true])(
	"never replaces an existing destination or follows its symlink (symlink=%s)",
	async (linked) => {
		const root = await directory();
		await writeFile(join(root, "original.png"), "preserve");
		if (linked)
			await symlink(join(root, "original.png"), join(root, "result.png"));
		else await writeFile(join(root, "result.png"), "preserve");
		const { execute, store } = fixture();
		await expect(
			saveCapture(
				parseInvocation(["screenshot", "--filename=result.png"]),
				execute,
				root,
			),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(await readFile(join(root, "result.png"), "utf8")).toBe("preserve");
		expect((await readdir(root)).sort()).toEqual([
			"original.png",
			"result.png",
		]);
		expect(store.metrics().bytes).toBe(0);
	},
);

it("rejects wrong extensions and unsupported output options before capture", async () => {
	const { execute, calls } = fixture();
	for (const argv of [
		["screenshot", "--filename=bad.html"],
		["screenshot", "--raw"],
	])
		await expect(saveCapture(parseInvocation(argv), execute)).rejects.toThrow();
	expect(calls).toEqual([]);
});

it("removes partial temporary output and releases the artifact on interrupted reads", async () => {
	const root = await directory();
	const { execute, store } = fixture();
	const interrupted: CaptureExecutor = (argv) => {
		if (argv[0] === "artifact-read" && argv[2] !== "--offset=0")
			throw new Error("interrupted");
		return execute(argv);
	};
	await expect(
		saveCapture(
			parseInvocation(["screenshot", "--filename=result.png"]),
			interrupted,
			root,
		),
	).rejects.toThrow();
	expect(await readdir(root)).toEqual([]);
	expect(store.metrics().bytes).toBe(0);
});

it("reports failed remote deletion without losing an already committed local file", async () => {
	const root = await directory();
	const { execute, store } = fixture();
	const failing: CaptureExecutor = (argv) => {
		if (argv[0] === "artifact-delete") throw new Error("closed");
		return execute(argv);
	};
	const result = await saveCapture(
		parseInvocation(["screenshot"]),
		failing,
		root,
	);
	expect(result.remoteCleanupConfirmed).toBe(false);
	expect((await readFile(result.filename)).length).toBe(result.artifact.bytes);
	expect(store.metrics().artifacts).toBe(1);
});

it("rejects corrupt PNG headers before committing a file", async () => {
	const root = await directory();
	const { execute, store } = fixture();
	const corrupt: CaptureExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] === "artifact-read" && argv[2] === "--offset=0") {
			const chunk = result.data as { data: string };
			const decoded = Buffer.from(chunk.data, "base64");
			decoded[0] = 0;
			chunk.data = decoded.toString("base64");
		}
		return result;
	};
	await expect(
		saveCapture(parseInvocation(["screenshot"]), corrupt, root),
	).rejects.toThrow("PNG header");
	expect(await readdir(root)).toEqual([]);
	expect(store.metrics().artifacts).toBe(0);
});

it("cancels in-memory capture downloads and still releases their artifact", async () => {
	const { execute, store } = fixture();
	const controller = new AbortController();
	const cancelled: CaptureExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] === "artifact-read") controller.abort();
		return result;
	};
	await expect(
		capturePng(cancelled, undefined, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(store.metrics().bytes).toBe(0);
});

it("rejects dimension mismatches and does not consume unverified initial bytes", async () => {
	const { store, bytes, details, execute } = fixture();
	const artifact = store.add("session", bytes, { ...details, width: 161 });
	let consumed = false;
	await expect(
		readCapture(execute, artifact, () => {
			consumed = true;
		}),
	).rejects.toThrow("PNG header");
	expect(consumed).toBe(false);
});

it("preserves option-looking locator text as a literal in both capture clients", async () => {
	const root = await directory();
	for (const [index, target] of [
		"-s=other",
		"--hires",
		"--filename=other.png",
		"--",
	].entries()) {
		const { execute, calls } = fixture();
		await capturePng(execute, target);
		expect(calls[0]).toEqual(["screenshot", "--", target]);
		const next = calls.length;
		await saveCapture(
			parseInvocation(["screenshot", `--filename=${index}.png`, "--", target]),
			execute,
			root,
		);
		expect(calls[next]).toEqual(["screenshot", "--", target]);
	}
});

it("still transfers a valid multi-frame PNG larger than the protocol limit", async () => {
	const { store, details, execute } = fixture();
	const bytes = encodePng(createRaster(1024, 768, [10, 20, 30, 255]), {
		compression: "stored",
	});
	const artifact = store.add("session", bytes, {
		...details,
		width: 1024,
		height: 768,
	});
	expect(bytes.length).toBeGreaterThan(scriptFrameLimit);
	const output = new Uint8Array(bytes.length);
	let offset = 0;
	let frames = 0;
	await readCapture(
		async (argv) => {
			const frame = scriptFrame({ result: await execute(argv) });
			expect(Buffer.byteLength(frame)).toBeLessThan(100_000);
			frames++;
			return JSON.parse(frame).result;
		},
		artifact,
		(chunk) => {
			output.set(chunk, offset);
			offset += chunk.length;
		},
	);
	expect(Buffer.from(output).equals(bytes)).toBe(true);
	expect(frames).toBe(Math.ceil(bytes.length / 65536));
	store.clear("session");
});
