import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import type { Purchase, PurchaseError } from "react-native-iap";
import { backendClient } from "../backend/client";
import { ADMIN_EMAILS } from "../proAccess";
import {
  readPersistedSubscription,
  persistSubscription,
  clearPersistedSubscription,
} from "./persistence";
import {
  connectToStore,
  disconnectFromStore,
  fetchSubscriptionProducts,
  checkActiveSubscriptions,
  requestSubscriptionPurchase,
  finishPurchase,
  subscribeToPurchaseUpdates,
  isUserCancellation,
  isDeferredPayment,
} from "./storeService";
import type { IapSku, SubscriptionProduct } from "./types";
import { ALL_SKUS } from "./types";

// In dev (simulator/Expo) StoreKit/Billing isn't available, so we don't
// simulate the store at all — Pro comes from the server `has_pro_access`
// override or the dev unlock. Real store flows only run in release builds.
const IAP_ENABLED = !__DEV__;

// ─── Context type ──────────────────────────────────────────────────────────

type SubscriptionContextValue = {
  /** Whether the user currently has Pro access (any source). */
  isPro: boolean;
  /** The currently-active subscription SKU, if any. */
  activeSku: IapSku | null;
  /** Products available for purchase. */
  products: SubscriptionProduct[];
  /** True while a purchase, restore, or initial load is in flight. */
  loading: boolean;
  /** True while we're doing the initial hydration (don't block UI). */
  initializing: boolean;
  /** Purchase a subscription by SKU. */
  purchase: (sku: IapSku) => Promise<void>;
  /** Restore previous purchases. */
  restore: () => Promise<void>;
  /** Clear subscription state (dev/testing only). */
  clearSubscription: () => Promise<void>;
  /** Whether the signed-in user is an admin (ADMIN_EMAILS allowlist). */
  isAdmin: boolean;
  /** Whether the admin Pro override is currently on (server flag === true). */
  adminProEnabled: boolean;
  /** Set the admin Pro override on/off. Persisted server-side; admin only. */
  setAdminProEnabled: (enabled: boolean) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

export const useSubscription = (): SubscriptionContextValue => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx)
    throw new Error(
      "useSubscription must be used within <SubscriptionProvider>",
    );
  return ctx;
};

// ─── Provider ──────────────────────────────────────────────────────────────

export const SubscriptionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const proUnlockedInDev = __DEV__;
  const [isAdmin, setIsAdmin] = useState(false);
  // Server-side admin override: true = force Pro on, false = force off,
  // null = no override (fall back to store subscription / dev unlock).
  const [proAccessFlag, setProAccessFlag] = useState<boolean | null>(null);
  // Real store subscription state (release builds only).
  const [storePro, setStorePro] = useState(false);
  const [activeSku, setActiveSku] = useState<IapSku | null>(null);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    // Restore on setup, not just clear on cleanup: React re-runs effects
    // (dev double-invoke, Fast Refresh, remount) on the same fiber without
    // re-initialising the ref. Without this the ref stays false after the
    // first cleanup and every `mountedRef.current` guard silently no-ops.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Admin identity (email allowlist — instant, offline) ────────────────

  useEffect(() => {
    const isAdminEmail = (email: string | null | undefined) =>
      !!email && ADMIN_EMAILS.has(email.toLowerCase());

    backendClient.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email;
      if (__DEV__) console.log("[iap] admin check (getSession):", email, isAdminEmail(email));
      setIsAdmin(isAdminEmail(email));
    });

    const { data } = backendClient.auth.onAuthStateChange((event, session) => {
      const email = session?.user.email;
      if (__DEV__) console.log(`[iap] admin check (${event}):`, email, isAdminEmail(email));
      setIsAdmin(isAdminEmail(email));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // ── Effective Pro state ────────────────────────────────────────────────
  // The server override wins in both directions so admins can preview the
  // free experience (flag=false) even in a dev build.
  const isPro = useMemo(() => {
    if (proAccessFlag === true) return true;
    if (proAccessFlag === false) return false;
    return proUnlockedInDev || storePro;
  }, [proAccessFlag, storePro, proUnlockedInDev]);

  const adminProEnabled = proAccessFlag === true;

  // ── Admin Pro override toggle (server-backed) ──────────────────────────

  const setAdminProEnabled = useCallback(async (enabled: boolean) => {
    const status = await backendClient.setProAccess(enabled);
    if (mountedRef.current) setProAccessFlag(status.proAccess);
  }, []);

  // ── Initialisation ─────────────────────────────────────────────────────

  const init = useCallback(async () => {
    // 1. Server override flag — authoritative for admin/testing.
    const status = await backendClient.getSubscriptionStatus().catch(() => null);
    if (mountedRef.current && status) {
      setProAccessFlag(status.proAccess);
      // Server-confirmed admin beats the client email listener, which can
      // miss events; only ever upgrades to true (sign-out clears it).
      if (status.isAdmin) setIsAdmin(true);
    }

    // 2. Real store subscription (release builds only).
    if (IAP_ENABLED) {
      const persisted = await readPersistedSubscription();
      if (mountedRef.current) {
        setStorePro(persisted.isPro);
        setActiveSku(persisted.activeSku);
      }

      const connected = await connectToStore();
      if (connected) {
        const [prods, activeSub] = await Promise.all([
          fetchSubscriptionProducts(),
          checkActiveSubscriptions(),
        ]);
        if (mountedRef.current) {
          setProducts(prods);
          setStorePro(activeSub.isPro);
          setActiveSku(activeSub.activeSku);
        }
        if (!activeSub.isPro && persisted.isPro) {
          await persistSubscription(false, null, null);
        }
      } else if (__DEV__) {
        console.warn("[iap] store connection failed — using cached state");
      }
    }

    if (mountedRef.current) setInitializing(false);
  }, []);

  // ── Purchase ───────────────────────────────────────────────────────────

  const purchase = useCallback(async (sku: IapSku) => {
    if (!IAP_ENABLED) {
      Alert.alert(
        "Not available",
        "In-app purchases aren't available in this build. Use the admin Pro toggle for testing.",
      );
      return;
    }
    setLoading(true);
    try {
      await requestSubscriptionPurchase(sku);
      // Result arrives via purchaseUpdatedListener — loading stays true
      // until the listener fires.
    } catch (err) {
      if (mountedRef.current) setLoading(false);
      Alert.alert(
        "Purchase failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  }, []);

  // ── Restore ────────────────────────────────────────────────────────────

  const restore = useCallback(async () => {
    if (!IAP_ENABLED) {
      Alert.alert(
        "Not available",
        "Restoring purchases isn't available in this build.",
      );
      return;
    }
    setLoading(true);
    try {
      const result = await checkActiveSubscriptions();
      if (!mountedRef.current) return;
      setStorePro(result.isPro);
      setActiveSku(result.activeSku);
      if (!result.isPro) {
        await persistSubscription(false, null, null);
        Alert.alert(
          "No purchases found",
          "We couldn't find any active Pro subscriptions for this account.",
        );
      } else {
        // Re-sync the backend so its subscription row (and the webhook link
        // via originalTransactionId) is (re)created on a new device/reinstall.
        if (result.productId && result.transactionId) {
          try {
            await backendClient.verifySubscription({
              productId: result.productId,
              transactionId: result.transactionId,
              originalTransactionId: result.originalTransactionId,
              purchaseToken: result.purchaseToken ?? "",
              platform: Platform.OS === "ios" ? "ios" : "android",
            });
          } catch (err) {
            if (__DEV__) console.warn("[iap] restore backend verify failed:", err);
          }
        }
        Alert.alert("Restored", "Your Pro subscription has been restored.");
      }
    } catch (err) {
      Alert.alert(
        "Restore failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ── Purchase event listeners ───────────────────────────────────────────

  const handlePurchaseSuccess = useCallback(async (purchase: Purchase) => {
    const sku = purchase.productId;
    const knownSku = (ALL_SKUS as string[]).includes(sku)
      ? (sku as IapSku)
      : null;

    // CRITICAL: Always finish the transaction. Unfinished transactions
    // cause the store to refund after 3 days (iOS) or block future
    // purchases (Android).
    await finishPurchase(purchase);

    await persistSubscription(true, knownSku, purchase.transactionId ?? null);

    if (mountedRef.current) {
      setStorePro(true);
      setActiveSku(knownSku);
      setLoading(false);
    }

    // Verify with backend (fire-and-forget — don't block UI on this)
    try {
      await backendClient.verifySubscription({
        productId: sku,
        transactionId: purchase.transactionId ?? "",
        originalTransactionId:
          "originalTransactionIdentifierIOS" in purchase
            ? purchase.originalTransactionIdentifierIOS ?? null
            : null,
        purchaseToken: purchase.purchaseToken ?? "",
        platform: Platform.OS === "ios" ? "ios" : "android",
      });
    } catch (err) {
      if (__DEV__) console.warn("[iap] backend verify failed:", err);
    }
  }, []);

  const handlePurchaseError = useCallback((error: PurchaseError) => {
    if (!mountedRef.current) return;
    setLoading(false);

    if (isUserCancellation(error)) {
      return;
    }

    if (isDeferredPayment(error)) {
      Alert.alert(
        "Purchase pending",
        "Your purchase is awaiting approval (e.g. Ask to Buy). " +
          "Pro features will unlock once the purchase is confirmed.",
      );
      return;
    }

    Alert.alert(
      "Purchase error",
      error.message || "Something went wrong with your purchase.",
    );
  }, []);

  // ── Re-check state when app returns to foreground ──────────────────────

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState !== "active") return;

      backendClient
        .getSubscriptionStatus()
        .then((status) => {
          if (mountedRef.current) setProAccessFlag(status.proAccess);
        })
        .catch(() => {});

      if (IAP_ENABLED) {
        checkActiveSubscriptions().then((storeSub) => {
          if (!mountedRef.current) return;
          setStorePro(storeSub.isPro);
          setActiveSku(storeSub.activeSku);
        });
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    init();

    if (!IAP_ENABLED) return;

    const unsubscribe = subscribeToPurchaseUpdates(
      handlePurchaseSuccess,
      handlePurchaseError,
    );

    return () => {
      unsubscribe();
      disconnectFromStore();
    };
  }, [init, handlePurchaseSuccess, handlePurchaseError]);

  // ── Clear (dev only) ───────────────────────────────────────────────────

  const clearSubscription = useCallback(async () => {
    await clearPersistedSubscription();
    if (mountedRef.current) {
      setStorePro(false);
      setActiveSku(null);
    }
  }, []);

  // ── Context value ──────────────────────────────────────────────────────

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isPro,
      activeSku,
      products,
      loading,
      initializing,
      purchase,
      restore,
      clearSubscription,
      isAdmin,
      adminProEnabled,
      setAdminProEnabled,
    }),
    [
      isPro,
      activeSku,
      products,
      loading,
      initializing,
      purchase,
      restore,
      clearSubscription,
      isAdmin,
      adminProEnabled,
      setAdminProEnabled,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
