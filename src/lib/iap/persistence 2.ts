import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Purchase } from "react-native-iap";
import { ALL_SKUS } from "./types";

let pendingWrite: Promise<void> = Promise.resolve();
const STORAGE_KEY = "@coachr/subscription";
const pendingKey = (accountId: string) => `@coachr/pending-purchases/${accountId}`;

export const readPendingPurchases = async (accountId: string): Promise<Purchase[]> => {
  await pendingWrite.catch(() => {});
  return loadPendingPurchases(accountId);
};

const loadPendingPurchases = async (accountId: string): Promise<Purchase[]> => {
  const raw = await AsyncStorage.getItem(pendingKey(accountId));
  if (!raw) return [];
  const purchases: unknown = JSON.parse(raw);
  if (!Array.isArray(purchases) || purchases.some((purchase) =>
    !purchase || typeof purchase.transactionId !== "string" || !purchase.transactionId ||
    !ALL_SKUS.includes(purchase.productId) || purchase.purchaseState !== "purchased"
  )) {
    throw new Error("Invalid pending purchase data");
  }
  return purchases as Purchase[];
};

export const enqueuePendingPurchase = async (accountId: string, purchase: Purchase): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const purchases = await loadPendingPurchases(accountId);
    if (purchases.some((item) => item.transactionId === purchase.transactionId)) return;
    purchases.push(purchase);
    await AsyncStorage.setItem(pendingKey(accountId), JSON.stringify(purchases));
  });
  await pendingWrite;
};

export const removePendingPurchase = async (accountId: string, transactionId: string): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const purchases = await loadPendingPurchases(accountId);
    const remaining = purchases.filter((purchase) => purchase.transactionId !== transactionId);
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(pendingKey(accountId));
      return;
    }
    await AsyncStorage.setItem(pendingKey(accountId), JSON.stringify(remaining));
  });
  await pendingWrite;
};

// Remove the legacy entitlement cache. Pending purchases survive sign-out and
// are replayed only for the account that originally received the transaction.
export const clearPersistedSubscription = async (): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(() => AsyncStorage.removeItem(STORAGE_KEY));
  await pendingWrite;
};
