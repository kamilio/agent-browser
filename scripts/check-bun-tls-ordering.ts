import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { checkServerIdentity } from "node:tls";

if (typeof Bun === "undefined") throw new Error("This diagnostic requires Bun");
const cert = readFileSync(
	new URL("../fixtures/tls/cert.pem", import.meta.url),
	"utf8",
);
const key = readFileSync(
	new URL("../fixtures/tls/key.pem", import.meta.url),
	"utf8",
);
let receivedRequests = 0;
const server = createServer({ cert, key }, (_request, response) => {
	receivedRequests++;
	response.end("local fixture");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
	throw new Error("Missing local fixture address");
let rejected = false;
let errorCode: string | undefined;
let identityChecks = 0;
try {
	const response = await Bun.fetch(`https://127.0.0.1:${address.port}/`, {
		method: "GET",
		headers: { host: `wrong.fixture.test:${address.port}` },
		proxy: "",
		keepalive: false,
		redirect: "manual",
		signal: AbortSignal.timeout(2000),
		tls: {
			ca: cert,
			serverName: "wrong.fixture.test",
			rejectUnauthorized: true,
			checkServerIdentity: (
				_hostname: string,
				certificate: Parameters<typeof checkServerIdentity>[1],
			) => {
				identityChecks++;
				return checkServerIdentity("wrong.fixture.test", certificate);
			},
		},
	});
	await response.body?.cancel();
} catch (error) {
	rejected = true;
	if (
		error &&
		typeof error === "object" &&
		"code" in error &&
		typeof error.code === "string"
	)
		errorCode = error.code;
} finally {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
const safe = rejected && identityChecks > 0 && receivedRequests === 0;
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "local-bun-tls-ordering-diagnostic",
			checkedAt: new Date().toISOString(),
			bun: Bun.version,
			hostnameMismatchRejected: rejected,
			identityChecks,
			receivedRequests,
			errorCode,
			passed: safe,
			requirement:
				"Reject the mismatched certificate before sending any HTTP request.",
			fixture:
				"Only the package's deliberately public local test certificate and loopback server are used.",
		},
		null,
		2,
	),
);
if (!safe) process.exitCode = 1;
