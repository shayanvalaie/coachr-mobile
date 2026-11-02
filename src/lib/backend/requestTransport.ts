export const API_REQUEST_TIMEOUT_MS = 15_000;
export const SUBSCRIPTION_VERIFY_TIMEOUT_MS = 30_000;

export type RequestTransportErrorCode =
  | "REQUEST_TIMEOUT"
  | "REQUEST_CANCELLED"
  | "NETWORK_ERROR";

const ERROR_MESSAGES: Record<RequestTransportErrorCode, string> = {
  REQUEST_TIMEOUT: "The request timed out. Check its status before trying again.",
  REQUEST_CANCELLED: "The request was cancelled.",
  NETWORK_ERROR: "Unable to reach the server. Check your connection and try again.",
};

export class RequestTransportError extends Error {
  readonly code: RequestTransportErrorCode;

  constructor(code: RequestTransportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RequestTransportError";
    this.code = code;
  }
}

type RequestState = {
  deadline: number;
  active: boolean;
  error: RequestTransportError | null;
  abort: (error: RequestTransportError) => void;
};

// Native AbortSignal.reason is not needed to preserve timeout errors when a
// child operation receives its parent's signal.
const requestStates = new WeakMap<AbortSignal, RequestState>();

export const throwIfRequestAborted = (signal: AbortSignal): void => {
  const state = requestStates.get(signal);
  if (state?.active && performance.now() >= state.deadline) {
    state.abort(new RequestTransportError("REQUEST_TIMEOUT"));
  }
  if (signal.aborted) {
    throw state?.error ?? new RequestTransportError("REQUEST_CANCELLED");
  }
};

/** Bound one whole operation, including response bodies, refresh waits and retries.
 * Pass the signal to fetch and check it after noncancelable work before effects.
 * This function never retries work or changes authentication state.
 */
export const runWithRequestDeadline = async <T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError("Request timeout must be positive and within the timer range.");
  }
  if (callerSignal) throwIfRequestAborted(callerSignal);

  const controller = new AbortController();
  let rejectAborted: (error: RequestTransportError) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject;
  });
  const state: RequestState = {
    deadline: performance.now() + timeoutMs,
    active: true,
    error: null,
    abort: (error) => {
      if (controller.signal.aborted) return;
      state.error = error;
      // Settle the deadline promise before fetch's abort listener can reject it
      // with a platform-specific AbortError.
      rejectAborted(error);
      controller.abort();
    },
  };
  requestStates.set(controller.signal, state);

  const onCallerAbort = () => {
    const error = callerSignal && requestStates.get(callerSignal)?.error;
    state.abort(error ?? new RequestTransportError("REQUEST_CANCELLED"));
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => state.abort(new RequestTransportError("REQUEST_TIMEOUT")), timeoutMs);

  try {
    const work = Promise.resolve().then(async () => {
      throwIfRequestAborted(controller.signal);
      const result = await operation(controller.signal);
      throwIfRequestAborted(controller.signal);
      return result;
    });
    return await Promise.race([work, aborted]);
  } finally {
    state.active = false;
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
};
