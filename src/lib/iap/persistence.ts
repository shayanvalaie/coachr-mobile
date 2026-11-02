import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Purchase } from "react-native-iap";
import { ALL_SKUS } from "./types";

export type VerificationPurpose = "purchase" | "recovery" | "restore";
export type PendingPurchase = {
  version: 1;
  purchase: Purchase;
  purpose: VerificationPurpose;
  acknowledged: boolean;
  attempts: number;
  nextRetryAt: number;
  terminal: boolean;
  errorCode: string | null;
};

let pendingWrite: Promise<void> = Promise.resolve();
const deletedAccounts = new Set<string>();
const STORAGE_KEY = "@coachr/subscription";
const pendingKey = (accountId: string) => `@coachr/pending-purchases/${accountId}`;
const newRecord = (purchase: Purchase, purpose: VerificationPurpose): PendingPurchase => ({
  version: 1, purchase, purpose, acknowledged: false, attempts: 0,
  nextRetryAt: 0, terminal: false, errorCode: null,
});

const loadRecords = async (accountId: string): Promise<PendingPurchase[]> => {
  const raw = await AsyncStorage.getItem(pendingKey(accountId));
  if (!raw) return [];
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values)) throw new Error("Invalid pending purchase data");
  return values.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid pending purchase data");
    const record: PendingPurchase = value.version === 1 ? value : newRecord(value, "recovery");
    const purchase = record.purchase;
    if (!purchase || typeof purchase.transactionId !== "string" || !purchase.transactionId ||
      !ALL_SKUS.includes(purchase.productId) || purchase.purchaseState !== "purchased" ||
      !["purchase", "recovery", "restore"].includes(record.purpose) ||
      typeof record.acknowledged !== "boolean" || typeof record.terminal !== "boolean" ||
      !Number.isSafeInteger(record.attempts) || record.attempts < 0 ||
      !Number.isFinite(record.nextRetryAt) || record.nextRetryAt < 0 ||
      (record.errorCode !== null && typeof record.errorCode !== "string")) {
      throw new Error("Invalid pending purchase data");
    }
    return record;
  });
};

export const readPendingRecords = async (accountId: string): Promise<PendingPurchase[]> => {
  await pendingWrite.catch(() => {});
  return loadRecords(accountId);
};
export const readPendingPurchases = async (accountId: string): Promise<Purchase[]> =>
  (await readPendingRecords(accountId)).map((record) => record.purchase);

export const enqueuePendingPurchase = async (accountId: string, purchase: Purchase, purpose: VerificationPurpose = "recovery"): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    if (deletedAccounts.has(accountId)) throw new Error("Account was deleted");
    const records = await loadRecords(accountId);
    if (records.some((record) => record.purchase.transactionId === purchase.transactionId)) return;
    records.push(newRecord(purchase, purpose));
    await AsyncStorage.setItem(pendingKey(accountId), JSON.stringify(records));
  });
  await pendingWrite;
};
export const updatePendingPurchase = async (accountId: string, record: PendingPurchase): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    if (deletedAccounts.has(accountId)) throw new Error("Account was deleted");
    const records = await loadRecords(accountId);
    const index = records.findIndex((item) => item.purchase.transactionId === record.purchase.transactionId);
    if (index < 0) throw new Error("Pending purchase no longer exists");
    records[index] = record;
    await AsyncStorage.setItem(pendingKey(accountId), JSON.stringify(records));
  });
  await pendingWrite;
};
export const removePendingPurchase = async (accountId: string, transactionId: string): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const records = (await loadRecords(accountId)).filter((record) => record.purchase.transactionId !== transactionId);
    if (records.length === 0) {
      await AsyncStorage.removeItem(pendingKey(accountId));
      return;
    }
    await AsyncStorage.setItem(pendingKey(accountId), JSON.stringify(records));
  });
  await pendingWrite;
};
export const clearPendingPurchasesForAccount = async (accountId: string): Promise<void> => {
  deletedAccounts.add(accountId);
  pendingWrite = pendingWrite.catch(() => {}).then(() => AsyncStorage.removeItem(pendingKey(accountId)));
  await pendingWrite;
};
// Sign-out retains pending work; this removes only the obsolete Pro cache.
export const clearPersistedSubscription = async (): Promise<void> => {
  pendingWrite = pendingWrite.catch(() => {}).then(() => AsyncStorage.removeItem(STORAGE_KEY));
  await pendingWrite;
};
