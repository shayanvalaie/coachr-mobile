/**
 * Production IAP service using react-native-iap v14.
 *
 * This module wraps the imperative react-native-iap API and exposes a
 * thin interface consumed by SubscriptionProvider. It handles:
 *
 *  - Store connection lifecycle (init / end)
 *  - Purchase & error event listeners
 *  - Transaction finishing after backend verification
 *  - Active-subscription queries
 *  - Product fetching with normalisation into our SubscriptionProduct type
 *
 * If the native module is not linked (e.g. Expo Go, web) every export
 * becomes a no-op / returns empty data so the app never crashes.
 */

import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  syncIOS,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type ProductOrSubscription,
  type Purchase,
  type PurchaseError,
  type EventSubscription,
  ErrorCode,
} from "react-native-iap";
import { API_REQUEST_TIMEOUT_MS, runWithRequestDeadline } from "../backend/requestTransport";
import {
  ALL_SKUS,
  IAP_SKUS,
  type IapSku,
  type SubscriptionProduct,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const isKnownSku = (id: string): id is IapSku =>
  (ALL_SKUS as string[]).includes(id);

const periodForSku = (sku: IapSku): "month" | "year" =>
  sku === IAP_SKUS.ANNUAL ? "year" : "month";

/**
 * Normalise a raw store Product into our UI-friendly SubscriptionProduct.
 * Handles both iOS (ProductIOS) and Android (ProductAndroid) shapes.
 */
const normaliseProduct = (p: ProductOrSubscription): SubscriptionProduct | null => {
  const sku = p.id;
  if (!isKnownSku(sku)) return null;
  return {
    sku,
    title: p.displayName ?? p.title ?? sku,
    description: p.description ?? "",
    localizedPrice: p.displayPrice ?? `$${p.price ?? "?"}`,
    price: p.price ?? null,
    currencyCode: p.currency ?? "USD",
    period: periodForSku(sku),
  };
};

// ─── Connection ─────────────────────────────────────────────────────────────

export const connectToStore = async (): Promise<boolean> => {
  try {
    await runWithRequestDeadline(API_REQUEST_TIMEOUT_MS, () => initConnection());
    return true;
  } catch (err) {
    if (__DEV__) console.warn("[iap] initConnection failed", err);
    return false;
  }
};

export const disconnectFromStore = async (): Promise<void> => {
  try {
    await endConnection();
  } catch {
    // swallow — endConnection can throw if never connected
  }
};

// ─── Products ───────────────────────────────────────────────────────────────

export const fetchSubscriptionProducts = async (): Promise<
  SubscriptionProduct[]
> => {
  try {
    const raw = await runWithRequestDeadline(API_REQUEST_TIMEOUT_MS, () => fetchProducts({ skus: ALL_SKUS, type: "subs" }));
    if (!raw) return [];
    const products: SubscriptionProduct[] = [];
    for (const p of raw) {
      const normalised = normaliseProduct(p);
      if (normalised) products.push(normalised);
    }
    if (__DEV__ && products.length === 0) {
      console.warn(
        `[iap] fetchProducts returned 0 subscription products for SKUs: ${ALL_SKUS.join(", ")}. ` +
          "On the iOS simulator, attach a StoreKit configuration file to the scheme or test on a real sandbox/TestFlight build.",
      );
    }
    return products;
  } catch (err) {
    if (__DEV__) console.warn("[iap] fetchProducts failed", err);
    return [];
  }
};

// ─── Active subscription check ──────────────────────────────────────────────

/** Return store purchases for backend verification; this grants no entitlement. */
export const getRestorablePurchases = async (): Promise<Purchase[]> => {
  const purchases = await runWithRequestDeadline(API_REQUEST_TIMEOUT_MS, () => getAvailablePurchases({
    onlyIncludeActiveItemsIOS: true,
    alsoPublishToEventListenerIOS: false,
  }));
  return purchases.filter(
    (purchase) => isKnownSku(purchase.productId) && purchase.purchaseState === "purchased",
  );
};

// Explicit Restore only: StoreKit synchronization may present an Apple prompt.
export const synchronizeStorePurchases = async (): Promise<void> => {
  if (!await syncIOS()) throw new Error("Could not synchronize App Store purchases.");
};

// ─── Purchase ───────────────────────────────────────────────────────────────

/**
 * Request a subscription purchase. This triggers the native purchase sheet.
 * The actual result arrives via the purchaseUpdatedListener / purchaseErrorListener.
 */
export const requestSubscriptionPurchase = async (
  sku: string,
  appAccountToken: string,
): Promise<void> => {
  if (Platform.OS !== "ios") {
    // iOS-only for now — Android IAP is intentionally unsupported.
    throw new Error("In-app purchases are only available on iOS.");
  }
  await requestPurchase({
    request: { apple: { sku, appAccountToken, andDangerouslyFinishTransactionAutomatically: false } },
    type: "subs",
  });
};

// ─── Transaction finishing ──────────────────────────────────────────────────

/** Finish only after the backend has verified and recorded the purchase. */
export const finishPurchase = async (purchase: Purchase): Promise<void> => {
  await runWithRequestDeadline(API_REQUEST_TIMEOUT_MS, () => finishTransaction({ purchase, isConsumable: false }));
};

// ─── Listeners ──────────────────────────────────────────────────────────────

export type PurchaseSuccessHandler = (purchase: Purchase) => void;
export type PurchaseErrorHandler = (error: PurchaseError) => void;

export const subscribeToPurchaseUpdates = (
  onSuccess: PurchaseSuccessHandler,
  onError: PurchaseErrorHandler,
): (() => void) => {
  const subs: EventSubscription[] = [];

  subs.push(purchaseUpdatedListener(onSuccess));
  subs.push(purchaseErrorListener(onError));

  return () => {
    for (const s of subs) s.remove();
  };
};

// ─── Error helpers ──────────────────────────────────────────────────────────

/** Returns true if the error is a user-initiated cancellation (not a real error). */
export const isUserCancellation = (error: PurchaseError): boolean =>
  error.code === ErrorCode.UserCancelled;

/** Returns true if the purchase is pending (e.g. "Ask to Buy" / deferred). */
export const isDeferredPayment = (error: PurchaseError): boolean =>
  error.code === ErrorCode.DeferredPayment ||
  error.code === ErrorCode.Pending;
