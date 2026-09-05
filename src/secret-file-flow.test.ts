import * as fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { NetworkRequest } from "./network.js";
import { loadSecretConfig } from "./node-secret-config.js";
import type { SecretBroker } from "./secret-providers.js";
import { BrowserSession } from "./session.js";

const directories: string[] = [];
const hosts: BrowserCommandHost[] = [];
const origin = "https://private-file.fixture.invalid";
const password = "SYNTHETIC_FILE_PASSWORD_57";
const fixed = { completed: true, confidential: true };

afterEach(async () => {
	for (const host of hosts.splice(0)) host.close();
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
	const directory = await fs.mkdtemp("/tmp/agent-browser-secret-file-flow-");
	directories.push(directory);
	expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
	const config = join(directory, "config.json");
	const credentials = join(directory, "credentials.env");
	await fs.writeFile(credentials, `LOGIN_PASSWORD=${password}\n`, {
		mode: 0o600,
	});
	await fs.writeFile(
		config,
		JSON.stringify({
			providers: { local: { type: "env", path: credentials } },
			bindings: {
				LOGIN: { provider: "local", key: "LOGIN_PASSWORD", origins: [origin] },
			},
		}),
		{ mode: 0o600 },
	);
	return { directory, config, credentials };
}

async function broker(filename: string) {
	const result = await loadSecretConfig(filename);
	if (!result) throw new Error("Missing synthetic configured broker");
	return result;
}

async function resolved(secrets: SecretBroker) {
	let value: string | undefined;
	await secrets.use(
		"secret:LOGIN",
		origin,
		new AbortController().signal,
		(secret) => {
			value = secret;
		},
	);
	return value;
}

function commandHost(secrets: SecretBroker) {
	const requests: NetworkRequest[] = [];
	const host = new BrowserCommandHost({
		secrets,
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input);
						const html =
							input.method === "POST"
								? `<title>${password}</title><p>${password}</p>`
								: '<form action="/login" method="post"><input name="password" id="password" type="password"><button id="submit" type="submit">Login</button></form>';
						const body = new TextEncoder().encode(html);
						return {
							url: input.url,
							status: 200,
							headers: { "content-type": ["text/html; charset=utf-8"] },
							body,
							redirects: [],
							encodedBytes: body.byteLength,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: requests.length,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						active: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: loadBrowserDocument,
			}),
	});
	hosts.push(host);
	return { host, requests };
}

it.each(["click", "press"])(
	"uses protected synthetic config/env files for native %s submission without agent disclosure",
	async (activation) => {
		const { config, credentials } = await fixture();
		const { host, requests } = commandHost(await broker(config));
		await host.execute(["open", `${origin}/`]);
		const fill = await host.execute([
			"fill-secret",
			"#password",
			"secret:LOGIN",
		]);
		const submit = await host.execute(
			activation === "click" ? ["click", "#submit"] : ["press", "Enter"],
		);
		expect(fill.data).toEqual(fixed);
		expect(submit.data).toEqual(fixed);
		const posted = requests.filter((request) => request.method === "POST");
		expect(posted).toHaveLength(1);
		const body = posted[0].body;
		const encoded =
			typeof body === "string" ? body : new TextDecoder().decode(body);
		expect(new URLSearchParams(encoded).get("password")).toBe(password);
		const output = JSON.stringify([fill, submit, await host.execute(["list"])]);
		for (const privateValue of [password, config, credentials])
			expect(output).not.toContain(privateValue);
		await expect(host.execute(["snapshot"])).rejects.toMatchObject({
			code: "policy-denied",
			message: "Confidential command did not complete; details withheld",
		});
	},
);

it.each([0o600, 0o400])(
	"accepts genuine protected file mode %s",
	async (mode) => {
		const { config, credentials } = await fixture();
		await fs.chmod(config, mode);
		await fs.chmod(credentials, mode);
		expect(await resolved(await broker(config))).toBe(password);
	},
);

it.each([0o640, 0o604, 0o666])(
	"rejects config disclosure permissions %s with a fixed error",
	async (mode) => {
		const { config } = await fixture();
		await fs.chmod(config, mode);
		await expect(loadSecretConfig(config)).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid secret configuration",
		});
	},
);

it.each([0o640, 0o604, 0o666])(
	"rejects env disclosure permissions %s after configuration loads",
	async (mode) => {
		const { config, credentials } = await fixture();
		const secrets = await broker(config);
		await fs.chmod(credentials, mode);
		await expect(resolved(secrets)).rejects.toMatchObject({
			message: "Secret operation failed",
		});
	},
);

it.each(["config", "credentials"] as const)(
	"rejects an actual %s symlink",
	async (target) => {
		const files = await fixture();
		const saved = `${files[target]}.original`;
		await fs.rename(files[target], saved);
		await fs.symlink(saved, files[target]);
		if (target === "config") {
			await expect(broker(files.config)).rejects.toMatchObject({
				message: "Invalid secret configuration",
			});
		} else {
			await expect(resolved(await broker(files.config))).rejects.toMatchObject({
				message: "Secret operation failed",
			});
		}
	},
);

it.each(["config", "credentials"] as const)(
	"rejects an actual multiply linked %s file",
	async (target) => {
		const files = await fixture();
		await fs.link(files[target], `${files[target]}.extra-link`);
		if (target === "config") {
			await expect(broker(files.config)).rejects.toMatchObject({
				message: "Invalid secret configuration",
			});
		} else {
			await expect(resolved(await broker(files.config))).rejects.toMatchObject({
				message: "Secret operation failed",
			});
		}
	},
);

it("does not resolve a configured env file until the reference is used", async () => {
	const { config, credentials } = await fixture();
	await fs.unlink(credentials);
	const secrets = await broker(config);
	await expect(resolved(secrets)).rejects.toMatchObject({
		message: "Secret operation failed",
	});
	await fs.writeFile(credentials, `LOGIN_PASSWORD=${password}\n`, {
		mode: 0o600,
	});
	expect(await resolved(secrets)).toBe(password);
});

it("reads an explicitly rotated env file afresh without retaining the old value", async () => {
	const { config, credentials } = await fixture();
	const secrets = await broker(config);
	expect(await resolved(secrets)).toBe(password);
	const replacement = `${credentials}.replacement`;
	await fs.writeFile(
		replacement,
		"LOGIN_PASSWORD=SYNTHETIC_ROTATED_PASSWORD_84\n",
		{ mode: 0o600 },
	);
	await fs.rename(replacement, credentials);
	expect(await resolved(secrets)).toBe("SYNTHETIC_ROTATED_PASSWORD_84");
});

it("retains command confidentiality when protected env access is revoked", async () => {
	const { config, credentials } = await fixture();
	const { host } = commandHost(await broker(config));
	await host.execute(["open", `${origin}/`]);
	await fs.chmod(credentials, 0o644);
	await expect(
		host.execute(["fill-secret", "#password", "secret:LOGIN"]),
	).rejects.toMatchObject({
		message: "Confidential command did not complete; details withheld",
	});
	await fs.chmod(credentials, 0o600);
	await expect(host.execute(["snapshot"])).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(
		(await host.execute(["fill-secret", "#password", "secret:LOGIN"])).data,
	).toEqual(fixed);
});

it("rejects an actually writable direct parent without modeling filesystem metadata", async () => {
	const { config, directory } = await fixture();
	await fs.chmod(directory, 0o777);
	await expect(broker(config)).rejects.toMatchObject({
		message: "Invalid secret configuration",
	});
});
