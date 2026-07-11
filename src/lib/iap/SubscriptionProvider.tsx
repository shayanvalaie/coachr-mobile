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

// ─── Context type ──────────────────────────────────────────────────────────

type SubscriptionContextValue = {
  /** Whether the user currently has an active Pro subscription. */
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
  const [adminOverride, setAdminOverride] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [activeSku, setActiveSku] = useState<IapSku | null>(null);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const isAdminEmail = (email: string | null | undefined) =>
      !!email && ADMIN_EMAILS.has(email.toLowerCase());

    backendClient.auth.getSession().then(({ data }) => {
      if (mountedRef.current) {
        setAdminOverride(isAdminEmail(data.session?.user.email));
      }
    });

    const { data } = backendClient.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) {
        setAdminOverride(isAdminEmail(session?.user.email));
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const normalizeSubState = useCallback(
    (pro: boolean, sku: IapSku | null) => {
      if (proUnlockedInDev || adminOverride) {
        return { isPro: true, activeSku: sku };
      }
      if (!pro) {
        return { isPro: false, activeSku: null as IapSku | null };
      }
      return { isPro: true, activeSku: sku };
    },
    [proUnlockedInDev, adminOverride],
  );

  const applySubState = useCallback(
    (pro: boolean, sku: IapSku | null) => {
      if (!mountedRef.current) return;
      const next = normalizeSubState(pro, sku);
      setIsPro(next.isPro);
      setActiveSku(next.activeSku);
    },
    [normalizeSubState],
  );

  // ── Initialisation ─────────────────────────────────────────────────────

  const init = useCallback(async () => {
    // Show persisted state immediately (fast cold-start)
    const persisted = await readPersistedSubscription();
    applySubState(persisted.isPro, persisted.activeSku);
    if (proUnlockedInDev && !persisted.isPro) {
      await persistSubscription(true, persisted.activeSku, persisted.transactionId);
    }

    // Connect to the store
    const connected = await connectToStore();
    if (!connected) {
      if (__DEV__) console.warn("[iap] store connection failed — using cached state");
      setInitializing(false);
      return;
    }

    // Fetch products, check store subs, and fetch server status in parallel
    const [prods, activeSub, serverStatus] = await Promise.all([
      fetchSubscriptionProducts(),
      checkActiveSubscriptions(),
      backendClient.getSubscriptionStatus().catch(() => null),
    ]);

    if (!mountedRef.current) return;
    setProducts(prods);

    // Store is the primary gate. Server can only revoke (not grant) Pro,
    // preventing stale backend test data from bypassing the store.
    const next = normalizeSubState(
      activeSub.isPro && serverStatus?.isPro !== false,
      activeSub.activeSku,
    );
    applySubState(next.isPro, next.activeSku);

    if (!next.isPro && persisted.isPro) {
      await persistSubscription(false, null, null);
    }

    setInitializing(false);
  }, [applySubState, normalizeSubState, proUnlockedInDev]);

  // ── Purchase ───────────────────────────────────────────────────────────

  const purchase = useCallback(async (sku: IapSku) => {
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
    setLoading(true);
    try {
      const result = await checkActiveSubscriptions();
      if (!mountedRef.current) return;
      const next = normalizeSubState(result.isPro, result.activeSku);
      applySubState(next.isPro, next.activeSku);
      if (proUnlockedInDev) {
        Alert.alert(
          "Pro unlocked in development",
          "Development builds always have Pro access enabled.",
        );
      } else if (!next.isPro) {
        await persistSubscription(false, null, null);
        Alert.alert(
          "No purchases found",
          "We couldn't find any active Pro subscriptions for this account.",
        );
      } else {
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
  }, [applySubState, normalizeSubState, proUnlockedInDev]);

  // ── Purchase event listeners ───────────────────────────────────────────

  const handlePurchaseSuccess = useCallback(
    async (purchase: Purchase) => {
      const sku = purchase.productId;
      const knownSku = (ALL_SKUS as string[]).includes(sku)
        ? (sku as IapSku)
        : null;

      // CRITICAL: Always finish the transaction. Unfinished transactions
      // cause the store to refund after 3 days (iOS) or block future
      // purchases (Android).
      await finishPurchase(purchase);

      const next = normalizeSubState(true, knownSku);
      await persistSubscription(
        next.isPro,
        next.activeSku,
        next.isPro ? purchase.transactionId ?? null : null,
      );

      if (mountedRef.current) {
        applySubState(next.isPro, next.activeSku);
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
    },
    [applySubState, normalizeSubState],
  );

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

  // ── Re-check subscription when app returns to foreground ───────────────

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        Promise.all([
          checkActiveSubscriptions(),
          backendClient.getSubscriptionStatus().catch(() => null),
        ]).then(([storeSub, serverStatus]) => {
          if (!mountedRef.current) return;
          const next = normalizeSubState(
            storeSub.isPro && serverStatus?.isPro !== false,
            storeSub.activeSku,
          );
          applySubState(next.isPro, next.activeSku);
        });
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [applySubState, normalizeSubState]);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    init();

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
    applySubState(false, null);
  }, [applySubState]);

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
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
