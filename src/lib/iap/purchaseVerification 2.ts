import type { Purchase } from "react-native-iap";
import { backendClient } from "../backend/client";
import type { BackendSubscriptionStatus } from "../backend/types";
import { enqueuePendingPurchase, readPendingPurchases, removePendingPurchase } from "./persistence";
import { finishPurchase } from "./storeService";
import { ALL_SKUS } from "./types";

export const createPurchaseVerifier = (
  accountId: string,
  isCurrentAccount: () => boolean,
  onVerified: (status: BackendSubscriptionStatus) => void,
) => {
  const inFlight = new Map<string, Promise<BackendSubscriptionStatus>>();
  let processing: Promise<unknown> = Promise.resolve();

  const verify = (purchase: Purchase): Promise<BackendSubscriptionStatus> => {
    const transactionId = purchase.transactionId;
    if (!transactionId || !ALL_SKUS.includes(purchase.productId) || purchase.purchaseState !== "purchased") {
      return Promise.reject(new Error("Purchase is not a completed Pro transaction"));
    }
    const existing = inFlight.get(transactionId);
    if (existing) return existing;

    const work = processing.catch(() => {}).then(async () => {
      if (!isCurrentAccount()) throw new Error("Account changed before purchase verification");
      // Save before contacting the server or acknowledging StoreKit. A failed
      // verification or finish remains replayable after a process restart.
      await enqueuePendingPurchase(accountId, purchase);
      if (!isCurrentAccount()) throw new Error("Account changed before purchase verification");
      const status = await backendClient.verifySubscription({
        productId: purchase.productId,
        transactionId,
        purchaseToken: purchase.purchaseToken ?? "",
        platform: "ios",
      });
      if (!isCurrentAccount()) throw new Error("Account changed during purchase verification");
      onVerified(status);
      await finishPurchase(purchase);
      await removePendingPurchase(accountId, transactionId);
      return status;
    }).finally(() => {
      inFlight.delete(transactionId);
    });
    inFlight.set(transactionId, work);
    processing = work;
    return work;
  };

  const retryPending = async (): Promise<void> => {
    const purchases = await readPendingPurchases(accountId);
    for (const purchase of purchases) {
      if (!isCurrentAccount()) return;
      try {
        await verify(purchase);
      } catch (error) {
        console.warn("[iap] pending purchase retained for retry", error);
      }
    }
  };

  return { verify, retryPending };
};
