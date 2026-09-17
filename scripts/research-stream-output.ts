import type { Writable } from "node:stream";

export const researchOutputFailureGraceMs = 100;

export interface ResearchOutputErrors {
	readonly closed: () => Error;
	readonly aborted: (signal: AbortSignal) => Error;
}

export function writeResearchOutput(
	output: Writable,
	text: string | Uint8Array,
	signal: AbortSignal | undefined,
	errors: ResearchOutputErrors,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let returned = false;
		let acknowledged = false;
		let drained = false;
		let needsDrain = false;
		let callbackPending = false;
		let writeFailure: ReturnType<typeof setImmediate> | undefined;
		let lateRelease: ReturnType<typeof setImmediate> | undefined;
		let releaseGuard: (() => void) | undefined;
		const protectPendingWrite = () => {
			const release = () => {
				if (lateRelease) clearImmediate(lateRelease);
				output.off("error", onLateError);
				output.off("close", release);
				releaseGuard = undefined;
			};
			const onLateError = () => {
				if (!callbackPending) release();
			};
			releaseGuard = release;
			output.on("error", onLateError);
			output.once("close", release);
		};
		const releaseAfterErrorDelivery = () => {
			lateRelease = setImmediate(() => {
				if (!output.destroyed || output.closed) releaseGuard?.();
			});
		};
		const finish = (error?: Error) => {
			if (settled) return;
			if (!error && (!returned || !acknowledged || (needsDrain && !drained)))
				return;
			settled = true;
			if (error && (callbackPending || writeFailure) && !output.closed) {
				protectPendingWrite();
				if (!callbackPending) releaseAfterErrorDelivery();
			}
			if (writeFailure) clearImmediate(writeFailure);
			output.off("error", onError);
			output.off("close", onError);
			output.off("finish", onError);
			output.off("drain", onDrain);
			signal?.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const onError = () => finish(errors.closed());
		const onAbort = () => {
			if (signal) finish(errors.aborted(signal));
		};
		const onDrain = () => {
			drained = true;
			finish();
		};
		output.on("error", onError);
		output.on("close", onError);
		output.on("finish", onError);
		output.on("drain", onDrain);
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) onAbort();
		else if (
			output.destroyed ||
			output.closed ||
			output.writableEnded ||
			output.writableFinished ||
			!output.writable ||
			output.errored
		)
			onError();
		else {
			try {
				callbackPending = true;
				needsDrain = !output.write(text, (error) => {
					callbackPending = false;
					if (settled) {
						if (releaseGuard && (error || output.destroyed))
							releaseAfterErrorDelivery();
						else releaseGuard?.();
						return;
					}
					if (error) {
						writeFailure = setImmediate(onError);
						return;
					}
					acknowledged = true;
					finish();
				});
				returned = true;
				finish();
			} catch {
				callbackPending = false;
				onError();
			}
		}
	});
}

export function exitResearchCliFailure(code: number, message: string): void {
	const exit = () => process.exit(code);
	const fallback = setTimeout(exit, researchOutputFailureGraceMs);
	process.stderr.once("error", exit);
	process.stdin.destroy();
	process.stdout.destroy();
	try {
		process.stderr.write(message, () => {
			clearTimeout(fallback);
			exit();
		});
	} catch {
		exit();
	}
}
