export class CancelError extends Error {
	constructor(reason?: string) {
		super(reason || 'Promise was canceled');
		this.name = 'CancelError';
	}
	get isCanceled(): boolean { return true; }
}

const enum PromiseState {
	Pending,
	Canceled,
	Resolved,
	Rejected,
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
 * - Once cancelled, the promise's state changes to 'canceled' and subsequent resolve or reject actions are ignored
 *   (unless rejectOnCancel is false, in which case the promise may resolve/reject normally).
 *
 * @see CancelError
 */
export class CancelablePromise<T = unknown> extends Promise<T> {
	private cancelHandlers: (() => void)[] = [];
	private state = PromiseState.Pending;
	private rejectFn!: (reason?: unknown) => void;
	private readonly rejectOnCancel: boolean;

	constructor(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: unknown) => void,
			onCancel: (handler: () => void) => void
		) => void,
		rejectOnCancel: boolean = true
	) {
		let resolveFn!: (value: T | PromiseLike<T>) => void;
		let rejectFn!: (reason?: unknown) => void;

		super((resolve, reject) => {
			resolveFn = resolve;
			rejectFn = reject;
		});

		this.rejectOnCancel = rejectOnCancel;
		this.rejectFn = rejectFn;

		const onCancel = (handler: () => void): void => {
			if (this.state === PromiseState.Pending) {
				this.cancelHandlers.push(handler);
			}
		};

		const wrappedResolve = (value: T | PromiseLike<T>): void => {
			if (this.state === PromiseState.Pending || !this.rejectOnCancel) {
				resolveFn(value);
				this.state = PromiseState.Resolved;
			}
		};

		const wrappedReject = (reason?: unknown): void => {
			if (this.state === PromiseState.Pending || !this.rejectOnCancel) {
				rejectFn(reason);
				this.state = PromiseState.Rejected;
			}
		};

		try {
			executor(wrappedResolve, wrappedReject, onCancel);
		} catch (error) {
			wrappedReject(error);
		}
	}

	cancel(reason?: string): void {
		if (this.state !== PromiseState.Pending) {
			return;
		}

		this.state = PromiseState.Canceled;

		// Execute all cancellation handlers
		for (const handler of this.cancelHandlers) {
			try {
				handler();
			} catch {
				// Ignore errors in cancellation handlers
			}
		}

		// Clear handlers to prevent memory leaks
		this.cancelHandlers = [];

		if (this.rejectOnCancel) {
			this.rejectFn(new CancelError(reason));
		}
	}
}