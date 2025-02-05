export class CancelError extends Error {
	constructor(reason?: string) {
		super(reason || 'Promise was canceled');
		this.name = 'CancelError';
	}
	get isCanceled(): boolean { return true; }
}

enum PromiseState {
	pending = 'pending',
	canceled = 'canceled',
	resolved = 'resolved',
	rejected = 'rejected',
}

/**
 * A Promise that supports cancellation.
 *
 * Extends the native Promise to include cancellation capabilities by allowing the registration of cancellation handlers.
 * When the promise is cancelled while still pending, all registered cancellation handlers are executed.
 * If the cancel flag is set to reject on cancel (the default behavior), the promise will be rejected with a CancelError.
 *
 * @template T - The type of the value that the promise resolves with.
 *
 * @example
 * const cancelablePromise = new CancelablePromise<number>((resolve, reject, onCancel) => {
 *   const id = setTimeout(() => resolve(42), 1000);
 *   onCancel(() => clearTimeout(id));
 * });
 *
 * // Cancel the promise, which triggers the registered cancellation handlers.
 * cancelablePromise.cancel("Operation cancelled");
 *
 * @remarks
 * - The cancellation logic is only executed if the promise is pending.
 * - Once cancelled, the promise’s state changes to 'canceled' and subsequent resolve or reject actions are ignored
 *   (unless rejectOnCancel is false, in which case the promise may resolve/reject normally).
 *
 * @see CancelError
 */
export class CancelablePromise<T = unknown> extends Promise<T> {
	private cancelHandlers: Array<() => void> = [];
	private rejectOnCancel: boolean;
	private state = PromiseState.pending;
	private reject!: (reason?: any) => void;

	constructor(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: any) => void,
			onCancel: (handler: () => void) => void
		) => void,
		rejectOnCancel: boolean = true
	) {
		let resolveRef!: (value: T | PromiseLike<T>) => void;
		let rejectRef!: (reason?: any) => void;
		super((resolve, reject) => { resolveRef = resolve; rejectRef = reject; });
		this.rejectOnCancel = rejectOnCancel;
		this.reject = rejectRef;

		const complete = (callback: (v: any) => void, value: any, finalState: PromiseState) => {
			if (this.state !== PromiseState.canceled || !this.rejectOnCancel) {
				callback(value);
				this.state = finalState;
			}
		};
		const onResolve = (value: T | PromiseLike<T>) => complete(resolveRef, value, PromiseState.resolved);
		const onReject = (error: any) => complete(rejectRef, error, PromiseState.rejected);
		const onCancel = (handler: () => void) => {
			if (this.state === PromiseState.pending) {
				this.cancelHandlers.push(handler);
			}
		};

		try {
			executor(onResolve, onReject, onCancel);
		} catch (error) {
			onReject(error);
		}
	}

	cancel(reason?: string): void {
		if (this.state !== PromiseState.pending) { return; }
		this.state = PromiseState.canceled;
		this.cancelHandlers.forEach(handler => {
			try {
				handler();
			} catch { }
		});
		if (this.rejectOnCancel) {
			this.reject(new CancelError(reason));
		}
	}
}