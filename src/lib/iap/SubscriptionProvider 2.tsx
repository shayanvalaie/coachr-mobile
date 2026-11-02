import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import type { Purchase, PurchaseError } from "react-native-iap";
import { backendClient } from "../backend/client";
import type { BackendSubscriptionStatus } from "../backend/types";
import { clearPersistedSubscription } from "./persistence";
import { createPurchaseVerifier } from "./purchaseVerification";
import {
  connectToStore,
  disconnectFromStore,
  fetchSubscriptionProducts,
  getRestorablePurchases,
  requestSubscriptionPurchase,
  subscribeToPurchaseUpdates,
  isUserCancellation,
  isDeferredPayment,
} from "./storeService";
import type { IapSku, SubscriptionProduct } from "./types";
import { ALL_SKUS } from "./types";

// In dev (simulator/Expo) StoreKit/Billing isn't available, so we don't
// simulate the store at all — Pro comes from the server `has_pro_access`
// override or the dev unlock. Real store flows only run in release builds,
// unless EXPO_PUBLIC_IAP_IN_DEV=true opts a dev build in (requires launching
// from Xcode so the scheme's StoreKit configuration file is applied).
const IAP_TEST_IN_DEV = process.env.EXPO_PUBLIC_IAP_IN_DEV === "true";
const IAP_ENABLED = !__DEV__ || IAP_TEST_IN_DEV;

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
  /** Whether the signed-in user is an admin (server-authoritative). */
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
  accountId,
}: {
  children: React.ReactNode;
  accountId: string | null;
}) => {
  // Disabled when store testing is opted in, so the free/paywall path is
  // actually exercisable in dev.
  const proUnlockedInDev = __DEV__ && !IAP_TEST_IN_DEV;
  const [isAdmin, setIsAdmin] = useState(false);
  // Server-side admin override: true = force Pro on, false = force off,
  // null = no override (fall back to store subscription / dev unlock).
  const [proAccessFlag, setProAccessFlag] = useState<boolean | null>(null);
  // Entitlement confirmed by the backend; store queries never grant Pro.
  const [storePro, setStorePro] = useState(false);
  const [activeSku, setActiveSku] = useState<IapSku | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(accountId !== null);
  useEffect(() => {
    // Restore on setup, not just clear on cleanup: React re-runs effects
    // (dev double-invoke, Fast Refresh, remount) on the same fiber without
    // re-initialising the ref. Without this the ref stays false after the
    // first cleanup and every `mountedRef.current` guard silently no-ops.
    mountedRef.current = accountId !== null;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const { data } = backendClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== accountId) mountedRef.current = false;
    });
    return () => data.subscription.unsubscribe();
  }, [accountId]);

  const applyStatus = useCallback((status: BackendSubscriptionStatus) => {
    if (!mountedRef.current) return;
    const active = status.isPro && (
      status.proAccess === true || !status.expiresAt || Date.parse(status.expiresAt) > Date.now()
    );
    setProAccessFlag(status.proAccess);
    setIsAdmin(status.isAdmin);
    setStorePro(active);
    setExpiresAt(status.expiresAt);
    setActiveSku(active && status.productId && ALL_SKUS.includes(status.productId)
      ? status.productId as IapSku : null);
  }, []);

  const verifier = useMemo(() => accountId
    ? createPurchaseVerifier(accountId, () => mountedRef.current, applyStatus)
    : null, [accountId, applyStatus]);

  useEffect(() => {
    if (!expiresAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) {
        setStorePro(false);
        setActiveSku(null);
        return;
      }
      // Annual subscriptions exceed the JS timer limit; recheck at the cap.
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [expiresAt]);

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
    applyStatus(await backendClient.setProAccess(enabled));
  }, [applyStatus]);

  // ── Server status and durable purchase recovery ────────────────────────

  const storeConnected = useRef(false);
  const syncing = useRef<Promise<void> | null>(null);
  const synchronize = useCallback((recoverStore: boolean): Promise<void> => {
    if (syncing.current) return syncing.current;
    const work = (async () => {
      if (!accountId || !mountedRef.current) return;
      try {
        applyStatus(await backendClient.getSubscriptionStatus());
      } catch (error) {
        console.warn("[iap] subscription status refresh failed", error);
      }
      if (!IAP_ENABLED || !verifier || !mountedRef.current) return;
      if (!storeConnected.current) {
        storeConnected.current = await connectToStore();
        if (storeConnected.current && mountedRef.current) {
          setProducts(await fetchSubscriptionProducts());
        }
      }
      if (!storeConnected.current || !mountedRef.current) return;
      await verifier.retryPending();
      if (!recoverStore || !mountedRef.current) return;
      const purchases = await getRestorablePurchases();
      for (const purchase of purchases) {
        if (!mountedRef.current) return;
        try {
          await verifier.verify(purchase);
        } catch (error) {
          console.warn("[iap] store purchase retained for verification", error);
        }
      }
    })().finally(() => {
      syncing.current = null;
    });
    syncing.current = work;
    return work;
  }, [accountId, applyStatus, verifier]);

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
    if (!IAP_ENABLED || !verifier) {
      Alert.alert("Not available", "Restoring purchases isn't available in this build.");
      return;
    }
    setLoading(true);
    try {
      if (!storeConnected.current) storeConnected.current = await connectToStore();
      if (!storeConnected.current) throw new Error("Could not connect to the App Store.");
      if (!mountedRef.current) return;
      const purchases = await getRestorablePurchases();
      if (!mountedRef.current) return;
      if (purchases.length === 0) {
        applyStatus(await backendClient.getSubscriptionStatus());
        if (mountedRef.current) {
          Alert.alert("No purchases found", "We couldn't find any active Pro subscriptions for this Apple account.");
        }
        return;
      }
      let restored = false;
      for (const purchase of purchases) {
        const status = await verifier.verify(purchase);
        restored = restored || status.isPro;
      }
      if (!mountedRef.current) return;
      if (restored) Alert.alert("Restored", "Your Pro subscription has been restored.");
      else Alert.alert("Pro unavailable", "Your account does not currently have Pro access.");
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert("Restore failed", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyStatus, verifier]);

  // ── Purchase event listeners ───────────────────────────────────────────

  const handlePurchaseSuccess = useCallback(async (purchase: Purchase) => {
    if (!verifier || !mountedRef.current) return;
    if (purchase.purchaseState !== "purchased") {
      setLoading(false);
      return;
    }
    try {
      await verifier.verify(purchase);
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert(
        "Purchase pending",
        (error instanceof Error ? error.message : "Purchase verification failed.") +
          " We'll retry automatically. Pro unlocks after the server confirms your purchase.",
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [verifier]);

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

  // ── Lifecycle and retries ─────────────────────────────────────────────

  useEffect(() => {
    const runSync = (recoverStore: boolean) => {
      void synchronize(recoverStore).catch((error) => {
        console.warn("[iap] subscription recovery failed", error);
      });
    };
    const unsubscribe = IAP_ENABLED && accountId
      ? subscribeToPurchaseUpdates(handlePurchaseSuccess, handlePurchaseError)
      : null;
    void synchronize(true).catch((error) => {
      console.warn("[iap] subscription initialization failed", error);
    }).finally(() => {
      if (mountedRef.current || !accountId) setInitializing(false);
    });

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active" && mountedRef.current) runSync(true);
    };
    const sub = AppState.addEventListener("change", handleAppState);
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && mountedRef.current) runSync(false);
    }, 60_000);
    return () => {
      clearInterval(timer);
      sub.remove();
      if (unsubscribe) {
        unsubscribe();
        void disconnectFromStore();
      }
    };
  }, [accountId, synchronize, handlePurchaseSuccess, handlePurchaseError]);

  // ── Clear (dev only) ───────────────────────────────────────────────────

  const clearSubscription = useCallback(async () => {
    await clearPersistedSubscription();
    if (mountedRef.current) {
      setStorePro(false);
      setActiveSku(null);
      setExpiresAt(null);
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
