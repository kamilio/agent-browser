import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
	local: true,
	remote: true,
}));
vi.mock("./node-capture.js", () => ({
	saveCapture: async () => ({
		filename: "/private/page.png",
		artifact: { id: "capture-fixture" },
		temporaryCleanupConfirmed: fixture.local,
		remoteCleanupConfirmed: fixture.remote,
	}),
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => ({
		schemaVersion: 1,
		origin: "http://127.0.0.1:34567",
		token: "a".repeat(43),
	}),
	writeCommandConnection: vi.fn(),
}));

it.each([
	[true, true, false],
	[true, false, false],
	[false, true, false],
	[false, false, false],
	[false, true, true],
])(
	"reports local=%s remote=%s cleanup through actual CLI (json=%s)",
	async (local, remote, json) => {
		fixture.local = local;
		fixture.remote = remote;
		const previousArgs = process.argv;
		const previousCode = process.exitCode;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			process.argv = [
				"node",
				"agent-browser",
				"screenshot",
				...(json ? ["--json"] : []),
			];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(() => expect(log).toHaveBeenCalled());
			expect(error).not.toHaveBeenCalled();
			const message = String(log.mock.calls[0][0]);
			if (json)
				expect(JSON.parse(message).data).toMatchObject({
					temporaryCleanupConfirmed: local,
					remoteCleanupConfirmed: remote,
				});
			else {
				expect(message).toContain(
					"Saved partial native PNG: /private/page.png",
				);
				expect(message.includes("temporary file cleanup unconfirmed")).toBe(
					!local,
				);
				expect(message.includes("remote cleanup unconfirmed")).toBe(!remote);
			}
		} finally {
			process.argv = previousArgs;
			process.exitCode = previousCode;
			log.mockRestore();
			error.mockRestore();
		}
	},
);
