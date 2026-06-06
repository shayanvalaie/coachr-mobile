/**
 * Production IAP service using react-native-iap v14.
 *
 * This module wraps the imperative react-native-iap API and exposes a
 * thin interface consumed by SubscriptionProvider. It handles:
 *
 *  - Store connection lifecycle (init / end)
 *  - Purchase & error event listeners
 *  - Transaction finishing (CRITICAL — unfinished transactions block the store)
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
  getActiveSubscriptions,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type ProductOrSubscription,
  type Purchase,
  type PurchaseError,
  type EventSubscription,
  ErrorCode,
} from "react-native-iap";
import { persistSubscription } from "./persistence";
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
    await initConnection();
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
    const raw = await fetchProducts({ skus: ALL_SKUS, type: "subs" });
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

export type ActiveSubResult = {
  isPro: boolean;
  activeSku: IapSku | null;
  transactionId: string | null;
};

export const checkActiveSubscriptions = async (): Promise<ActiveSubResult> => {
  try {
    const subs = await getActiveSubscriptions(ALL_SKUS);
    if (subs.length === 0) {
      return { isPro: false, activeSku: null, transactionId: null };
    }
    // Pick the first active subscription (should only be one for this app)
    const active = subs[0];
    const sku = isKnownSku(active.productId)
      ? active.productId
      : null;
    const result: ActiveSubResult = {
      isPro: true,
      activeSku: sku,
      transactionId: active.transactionId ?? null,
    };
    // Persist so the app can show Pro instantly on next cold start
    await persistSubscription(result.isPro, result.activeSku, result.transactionId);
    return result;
  } catch (err) {
    if (__DEV__) console.warn("[iap] checkActiveSubscriptions failed", err);
    return { isPro: false, activeSku: null, transactionId: null };
  }
};

// ─── Purchase ───────────────────────────────────────────────────────────────

/**
 * Request a subscription purchase. This triggers the native purchase sheet.
 * The actual result arrives via the purchaseUpdatedListener / purchaseErrorListener.
 */
export const requestSubscriptionPurchase = async (
  sku: string,
): Promise<void> => {
  if (Platform.OS === "ios") {
    await requestPurchase({
      request: { apple: { sku } },
      type: "subs",
    });
  } else {
    // Android needs skus array and an offerToken. For basic subscriptions
    // without offer tokens we pass the sku in both fields.
    await requestPurchase({
      request: {
        google: {
          skus: [sku],
          subscriptionOffers: [{ sku, offerToken: sku }],
        },
      },
      type: "subs",
    });
  }
};

// ─── Transaction finishing ──────────────────────────────────────────────────

/**
 * Finish (acknowledge) a purchase. MUST be called for every successful purchase,
 * otherwise the store will refund the transaction after a grace period.
 */
export const finishPurchase = async (purchase: Purchase): Promise<void> => {
  try {
    await finishTransaction({ purchase, isConsumable: false });
    if (__DEV__) console.log("[iap] transaction finished", purchase.productId);
  } catch (err) {
    if (__DEV__) console.warn("[iap] finishTransaction failed", err);
  }
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
