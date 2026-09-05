import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { NetworkRequest } from "./network.js";
import { SecretBroker } from "./secret-providers.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
const origin = "https://login.fixture.invalid";
const syntheticPassword = "SYNTHETIC_FORM_PASSWORD_42";

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

function fixture() {
	const requests: NetworkRequest[] = [];
	const resolvedKeys: string[] = [];
	const host = new BrowserCommandHost({
		secrets: new SecretBroker({
			providers: {
				fixture: {
					async resolve(key) {
						resolvedKeys.push(key);
						return syntheticPassword;
					},
				},
			},
			bindings: {
				LOGIN: { provider: "fixture", key: "private-entry", origins: [origin] },
			},
		}),
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input);
						const html =
							input.method === "POST"
								? `<title>${syntheticPassword}</title><p>${syntheticPassword}</p>`
								: '<form action="/login" method="post"><input name="username" id="username"><input name="password" id="password" type="password"><button type="submit" id="submit">Login</button></form>';
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
	return { host, requests, resolvedKeys };
}

it.each(["click", "press"])(
	"submits a reference-resolved password through native %s without returning echoed secrets",
	async (activation) => {
		const { host, requests, resolvedKeys } = fixture();
		await host.execute(["open", `${origin}/`]);
		await host.execute(["fill", "#username", "synthetic-user"]);
		const fill = await host.execute([
			"fill-secret",
			"#password",
			"secret:LOGIN",
		]);
		expect(fill.data).toEqual({ completed: true, confidential: true });
		const submit = await host.execute(
			activation === "click" ? ["click", "#submit"] : ["press", "Enter"],
		);
		expect(submit.data).toEqual({ completed: true, confidential: true });
		expect(resolvedKeys).toEqual(["private-entry"]);
		const posted = requests.filter((request) => request.method === "POST");
		expect(posted).toHaveLength(1);
		expect(posted[0].url).toBe(`${origin}/login`);
		const encoded =
			typeof posted[0].body === "string"
				? posted[0].body
				: new TextDecoder().decode(posted[0].body);
		expect(new URLSearchParams(encoded).get("password")).toBe(
			syntheticPassword,
		);
		expect(new URLSearchParams(encoded).get("username")).toBe("synthetic-user");
		expect(
			JSON.stringify([fill, submit, await host.execute(["list"])]),
		).not.toContain(syntheticPassword);
		await expect(host.execute(["snapshot"])).rejects.toMatchObject({
			code: "policy-denied",
			message: "Confidential command did not complete; details withheld",
		});
	},
);
