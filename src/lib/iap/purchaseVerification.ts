import type { Purchase } from "react-native-iap";
import { backendClient } from "../backend/client";
import type { BackendSubscriptionStatus } from "../backend/types";
import { enqueuePendingPurchase, readPendingRecords, updatePendingPurchase, removePendingPurchase, type VerificationPurpose } from "./persistence";
import { finishPurchase } from "./storeService";
import { ALL_SKUS } from "./types";

export const purchaseFailure = (error: unknown) => {
  const failure = error as { code?: string; context?: { status?: number; retryAfterSeconds?: number; body?: { detail?: { code?: string; retryable?: boolean } } } };
  const detail = failure.context?.body?.detail;
  const status = failure.context?.status;
  const retryable = detail?.retryable ?? (status === undefined || status === 429 || status >= 500);
  return { code: detail?.code ?? failure.code ?? "IAP_RETRY_REQUIRED", retryable, retryAfterSeconds: failure.context?.retryAfterSeconds ?? 0 };
};

export const createPurchaseVerifier = (
  accountId: string,
  isCurrentAccount: () => boolean,
  onVerified: (status: BackendSubscriptionStatus) => void,
) => {
  const inFlight = new Map<string, Promise<BackendSubscriptionStatus | null>>();
  let processing: Promise<unknown> = Promise.resolve();
  const assertCurrent = () => {
    if (!isCurrentAccount()) throw new Error("Account changed during purchase verification");
  };
  const verify = (purchase: Purchase, purpose: VerificationPurpose = "recovery", automatic = false): Promise<BackendSubscriptionStatus | null> => {
    const transactionId = purchase.transactionId;
    if (!transactionId || !ALL_SKUS.includes(purchase.productId) || purchase.purchaseState !== "purchased") {
      return Promise.reject(new Error("Purchase is not a completed Pro transaction"));
    }
    const existing = inFlight.get(transactionId);
    if (existing) return existing;
    const work = processing.catch(() => {}).then(async () => {
      assertCurrent();
      await enqueuePendingPurchase(accountId, purchase, purpose);
      assertCurrent();
      const record = (await readPendingRecords(accountId)).find((item) => item.purchase.transactionId === transactionId)!;
      assertCurrent();
      if (!record) throw new Error("Pending purchase no longer exists");
      if (automatic && (record.terminal || record.nextRetryAt > Date.now())) return null;
      let status: BackendSubscriptionStatus | null = null;
      try {
        if (!record.acknowledged) {
          const result = await backendClient.verifySubscription({
            productId: purchase.productId, transactionId, purchaseToken: purchase.purchaseToken ?? "",
            platform: "ios", purpose: purpose === "restore" ? "restore" : record.purpose,
          });
          assertCurrent();
          if (result.acknowledgement.transactionId !== transactionId || result.acknowledgement.state !== "committed") {
            throw new Error("Missing committed purchase acknowledgement");
          }
          record.acknowledged = true;
          record.terminal = false;
          await updatePendingPurchase(accountId, record);
          assertCurrent();
          status = result;
          onVerified(result);
        }
        assertCurrent();
        await finishPurchase(purchase);
        assertCurrent();
        await removePendingPurchase(accountId, transactionId);
        return status;
      } catch (error) {
        if (!isCurrentAccount()) throw error;
        const failure = purchaseFailure(error);
        record.attempts += 1;
        record.errorCode = failure.code;
        record.terminal = !failure.retryable;
        const backoff = Math.min(300_000, 1000 * 2 ** Math.min(record.attempts, 8));
        record.nextRetryAt = Date.now() + Math.max(failure.retryAfterSeconds * 1000, backoff * (0.75 + Math.random() * 0.5));
        await updatePendingPurchase(accountId, record);
        throw error;
      }
    }).finally(() => inFlight.delete(transactionId));
    inFlight.set(transactionId, work);
    processing = work;
    return work;
  };
  const retryPending = async (): Promise<void> => {
    for (const record of await readPendingRecords(accountId)) {
      if (!isCurrentAccount()) return;
      try {
        await verify(record.purchase, record.purpose, true);
      } catch (error) {
        console.warn("[iap] pending purchase retained", purchaseFailure(error).code);
      }
    }
  };
  return { verify, retryPending };
};
