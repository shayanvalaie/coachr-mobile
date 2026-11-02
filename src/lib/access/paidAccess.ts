export type PaidAccessState = Readonly<{
  accountId: string | null;
  isPro: boolean;
  epoch: number;
}>;

let state: PaidAccessState = Object.freeze({ accountId: null, isPro: false, epoch: 0 });
const invalidators = new Set<() => void>();
const listeners = new Set<() => void>();

// Called only by SubscriptionProvider's authoritative status/expiry/account event.
export const setPaidAccess = (next: { accountId: string | null; isPro: boolean }): void => {
  if (state.accountId === next.accountId && state.isPro === next.isPro) return;
  if (next.accountId === null && next.isPro) throw new Error("Pro access requires an account.");
  state = Object.freeze({ ...next, epoch: state.epoch + 1 });
  for (const invalidate of invalidators) invalidate();
  for (const listener of listeners) listener();
};

export const capturePaidAccess = (): PaidAccessState => state;

export const subscribePaidAccess = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const registerPaidAccessInvalidation = (invalidate: () => void): (() => void) => {
  invalidators.add(invalidate);
  return () => { invalidators.delete(invalidate); };
};

export class PaidAccessChangedError extends Error {
  readonly code = "PAID_ACCESS_CHANGED";
  constructor() {
    super("Your access changed. Refresh and try again.");
    this.name = "PaidAccessChangedError";
  }
}

// Call after every protected await, including cache hits and mixed history reads.
export const assertPaidAccess = (captured: PaidAccessState): void => {
  if (captured.epoch !== state.epoch || captured.accountId !== state.accountId) {
    throw new PaidAccessChangedError();
  }
};

export const requirePaidAccess = (): PaidAccessState => {
  const captured = capturePaidAccess();
  if (!captured.isPro) {
    const error = new Error("Coachr Pro is required. Renew or restore to continue.");
    Object.assign(error, { code: "PRO_REQUIRED", context: { status: 403, body: { detail: {
      code: "PRO_REQUIRED", message: error.message, retryable: false,
    } } } });
    throw error;
  }
  return captured;
};
