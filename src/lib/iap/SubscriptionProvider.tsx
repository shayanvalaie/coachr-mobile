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
import { createPurchaseVerifier, purchaseFailure } from "./purchaseVerification";
import {
  connectToStore,
  disconnectFromStore,
  fetchSubscriptionProducts,
  getRestorablePurchases,
  synchronizeStorePurchases,
  requestSubscriptionPurchase,
  subscribeToPurchaseUpdates,
  isUserCancellation,
  isDeferredPayment,
} from "./storeService";
import type { IapSku, SubscriptionProduct } from "./types";
import { ALL_SKUS } from "./types";

// In dev (simulator/Expo) StoreKit/Billing isn't available, so we don't
// simulate the store at all — Pro comes from the server `has_pro_access`
// override. Real store flows only run in release builds,
// unless EXPO_PUBLIC_IAP_IN_DEV=true opts a dev build in (requires launching
// from Xcode so the scheme's StoreKit configuration file is applied).
const IAP_TEST_IN_DEV = process.env.EXPO_PUBLIC_IAP_IN_DEV === "true";
const IAP_ENABLED = !__DEV__ || IAP_TEST_IN_DEV;

// ─── Context type ──────────────────────────────────────────────────────────

type PurchaseState = "idle" | "waiting" | "verifying" | "retryable_error" | "conflict" | "canceled" | "deferred" | "expired" | "restored";

type SubscriptionContextValue = {
  /** Unknown until a valid server snapshot; outages are never verified Free. */
  entitlement: "unknown" | "free" | "pro";
  purchaseState: PurchaseState;
  verificationRetryAt: number | null;
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
  onAccessChange,
}: {
  children: React.ReactNode;
  accountId: string | null;
  onAccessChange?: (state: { accountId: string | null; isPro: boolean }) => void;
}) => {
  const [statusKnown, setStatusKnown] = useState(false);
  const [verificationRetryAt, setVerificationRetryAt] = useState<number | null>(null);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [isAdmin, setIsAdmin] = useState(false);
  // Server-side admin override: true = force Pro on, false = force off,
  // null = no override (use the verified store subscription).
  const [proAccessFlag, setProAccessFlag] = useState<boolean | null>(null);
  // Entitlement confirmed by the backend; store queries never grant Pro.
  const [storePro, setStorePro] = useState(false);
  const [activeSku, setActiveSku] = useState<IapSku | null>(null);
  const [accessUntil, setAccessUntil] = useState<string | null>(null);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(accountId !== null);
  const purchaseInFlight = useRef(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setLoading(false);
      setPurchaseState("waiting");
    }, 60_000);
    return () => clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    // Restore on setup, not just clear on cleanup: React re-runs effects
    // (dev double-invoke, Fast Refresh, remount) on the same fiber without
    // re-initialising the ref. Without this the ref stays false after the
    // first cleanup and every `mountedRef.current` guard silently no-ops.
    mountedRef.current = accountId !== null;
    onAccessChange?.({ accountId, isPro: false });
    return () => {
      mountedRef.current = false;
      onAccessChange?.({ accountId: null, isPro: false });
    };
  }, []);

  useEffect(() => {
    const { data } = backendClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== accountId) {
        mountedRef.current = false;
        onAccessChange?.({ accountId: session?.user.id ?? null, isPro: false });
        setStatusKnown(false);
        setStorePro(false);
        setActiveSku(null);
        setAccessUntil(null);
        setProAccessFlag(null);
        setIsAdmin(false);
        setLoading(false);
        setPurchaseState("idle");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [accountId, onAccessChange]);

  const applyStatus = useCallback((status: BackendSubscriptionStatus) => {
    if (!mountedRef.current) return;
    const active = status.isPro && (
      status.proAccess === true || (status.accessUntil !== null && Date.parse(status.accessUntil) > Date.now())
    );
    onAccessChange?.({ accountId, isPro: active });
    if (!active && ["expired", "revoked", "billing_retry"].includes(status.status ?? "")) setPurchaseState("expired");
    setStatusKnown(true);
    setProAccessFlag(status.proAccess);
    setIsAdmin(status.isAdmin);
    setStorePro(active);
    setAccessUntil(status.accessUntil);
    setActiveSku(active && status.productId && ALL_SKUS.includes(status.productId)
      ? status.productId as IapSku : null);
  }, [accountId, onAccessChange]);

  const verifier = useMemo(() => accountId
    ? createPurchaseVerifier(accountId, () => mountedRef.current, applyStatus)
    : null, [accountId, applyStatus]);

  useEffect(() => {
    if (!accessUntil) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      if (!mountedRef.current) return;
      const remaining = Date.parse(accessUntil) - Date.now();
      if (remaining <= 0) {
        onAccessChange?.({ accountId, isPro: proAccessFlag === true });
        setStatusKnown(true);
        setStorePro(false);
        setActiveSku(null);
        setPurchaseState("expired");
        return;
      }
      // Annual subscriptions exceed the JS timer limit; recheck at the cap.
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [accessUntil, accountId, onAccessChange, proAccessFlag]);

  // ── Effective Pro state ────────────────────────────────────────────────
  // The server override wins in both directions so admins can preview the
  // free experience (flag=false) even in a dev build.
  const isPro = useMemo(() => {
    if (proAccessFlag === true) return true;
    if (proAccessFlag === false) return false;
    return storePro;
  }, [proAccessFlag, storePro]);

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
      const refresh = backendClient.getSubscriptionStatus().then(applyStatus).catch((error) => {
        console.warn("[iap] subscription refresh failed", purchaseFailure(error).code);
      });
      const recover = async () => {
        if (!IAP_ENABLED || !verifier || !mountedRef.current) return;
        if (!storeConnected.current) {
          const connected = await connectToStore();
          if (!mountedRef.current) return;
          storeConnected.current = connected;
          if (connected) {
            const nextProducts = await fetchSubscriptionProducts();
            if (!mountedRef.current) return;
            setProducts(nextProducts);
          }
        }
        if (!storeConnected.current || !mountedRef.current) return;
        await verifier.retryPending();
        if (!recoverStore || !mountedRef.current) return;
        const purchases = await getRestorablePurchases();
        for (const purchase of purchases) {
          if (!mountedRef.current) return;
          if ("appAccountToken" in purchase && purchase.appAccountToken && purchase.appAccountToken.toLowerCase() !== accountId.toLowerCase()) {
            console.warn("[iap-debug] recovery SKIPPED: token mismatch", JSON.stringify({ token: purchase.appAccountToken, accountId, transactionId: purchase.transactionId }));
            continue;
          }
          try {
            await verifier.verify(purchase, "recovery", true);
          } catch (error) {
            console.warn("[iap] store purchase retained", purchaseFailure(error).code);
          }
        }
      };
      await Promise.all([refresh, recover()]);
    })().finally(() => {
      syncing.current = null;
    });
    syncing.current = work;
    return work;
  }, [accountId, applyStatus, verifier]);

  // ── Purchase ───────────────────────────────────────────────────────────

  const purchase = useCallback(async (sku: IapSku) => {
    if (verificationRetryAt !== null && Date.now() < verificationRetryAt) return;
    if (!IAP_ENABLED) {
      Alert.alert(
        "Not available",
        "In-app purchases aren't available in this build. Use the admin Pro toggle for testing.",
      );
      return;
    }
    if (purchaseInFlight.current) {
      console.warn("[iap-debug] purchase() ignored: purchaseInFlight still true");
      return;
    }
    purchaseInFlight.current = true;
    setLoading(true);
    try {
      const { appAccountToken } = await backendClient.getSubscriptionAccountToken();
      if (!mountedRef.current) return;
      setPurchaseState("verifying");
      await requestSubscriptionPurchase(sku, appAccountToken);
      // Result arrives via purchaseUpdatedListener — loading stays true
      // until the listener fires.
    } catch (err) {
      purchaseInFlight.current = false;
      if (mountedRef.current) setLoading(false);
      if (!mountedRef.current) return;
      Alert.alert(
        "Purchase failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  }, [verificationRetryAt]);

  // ── Restore ────────────────────────────────────────────────────────────

  const restore = useCallback(async () => {
    if (verificationRetryAt !== null && Date.now() < verificationRetryAt) return;
    if (!IAP_ENABLED || !verifier) {
      Alert.alert("Not available", "Restoring purchases isn't available in this build.");
      return;
    }
    setLoading(true);
    try {
      if (!storeConnected.current) {
        const connected = await connectToStore();
        if (!mountedRef.current) return;
        storeConnected.current = connected;
      }
      if (!storeConnected.current) throw new Error("Could not connect to the App Store.");
      if (!mountedRef.current) return;
      await synchronizeStorePurchases();
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
      for (const purchase of purchases) {
        if (!mountedRef.current) return;
        await verifier.verify(purchase, "restore");
      }
      if (!mountedRef.current) return;
      const latest = await backendClient.getSubscriptionStatus();
      if (!mountedRef.current) return;
      applyStatus(latest);
      if (latest.isPro) {
        setPurchaseState("restored");
        Alert.alert("Restored", "Your Pro subscription has been restored.");
      }
      else Alert.alert("Pro unavailable", "Your account does not currently have Pro access.");
    } catch (error) {
      if (!mountedRef.current) return;
      const waitSeconds = purchaseFailure(error).retryAfterSeconds;
      setVerificationRetryAt(waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : null);
      Alert.alert("Restore failed", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyStatus, verifier, verificationRetryAt]);

  // ── Purchase event listeners ───────────────────────────────────────────

  const handlePurchaseSuccess = useCallback(async (purchase: Purchase) => {
    console.warn("[iap-debug] purchaseUpdated", JSON.stringify({ accountId, appAccountToken: "appAccountToken" in purchase ? purchase.appAccountToken : "<none>", purchaseState: purchase.purchaseState, productId: purchase.productId, transactionId: purchase.transactionId, hasVerifier: !!verifier, mounted: mountedRef.current, inFlight: purchaseInFlight.current }));
    if (!accountId || !verifier || !mountedRef.current) return;
    if (purchase.purchaseState !== "purchased") {
      setLoading(false);
      return;
    }
    if ("appAccountToken" in purchase && purchase.appAccountToken && purchase.appAccountToken.toLowerCase() !== accountId.toLowerCase()) {
      console.warn("[iap-debug] purchase DROPPED: token mismatch", JSON.stringify({ token: purchase.appAccountToken, accountId }));
      purchaseInFlight.current = false;
      setLoading(false);
      return;
    }
    try {
      setPurchaseState("verifying");
      const status = await verifier.verify(purchase, "purchase", true);
      if (mountedRef.current && status) setPurchaseState(status.isPro ? "idle" : "expired");
    } catch (error) {
      if (!mountedRef.current) return;
      const failure = purchaseFailure(error);
      setVerificationRetryAt(failure.retryAfterSeconds > 0 ? Date.now() + failure.retryAfterSeconds * 1000 : null);
      setPurchaseState(failure.retryable ? "retryable_error" : "conflict");
      Alert.alert(
        failure.retryable ? "Purchase pending" : "Purchase needs attention",
        (error instanceof Error ? error.message : "Purchase verification failed.") +
          (failure.retryable ? " We'll retry automatically." : " Use Restore with the account that owns this purchase, or contact support."),
      );
    } finally {
      purchaseInFlight.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [accountId, verifier]);

  const handlePurchaseError = useCallback((error: PurchaseError) => {
    if (!mountedRef.current) return;
    purchaseInFlight.current = false;
    setLoading(false);

    if (isUserCancellation(error)) {
      setPurchaseState("canceled");
      return;
    }

    if (isDeferredPayment(error)) {
      setPurchaseState("deferred");
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
        console.warn("[iap] subscription recovery failed", purchaseFailure(error).code);
      });
    };
    const unsubscribe = IAP_ENABLED && accountId
      ? subscribeToPurchaseUpdates(handlePurchaseSuccess, handlePurchaseError)
      : null;
    void synchronize(true).catch((error) => {
      console.warn("[iap] subscription initialization failed", purchaseFailure(error).code);
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
      onAccessChange?.({ accountId, isPro: false });
      setStatusKnown(false);
      setProAccessFlag(null);
      setIsAdmin(false);
      setStorePro(false);
      setActiveSku(null);
      setAccessUntil(null);
    }
  }, [accountId, onAccessChange]);

  // ── Context value ──────────────────────────────────────────────────────

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      entitlement: statusKnown ? (isPro ? "pro" : "free") : "unknown",
      isPro,
      purchaseState,
      verificationRetryAt,
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
      statusKnown,
      isPro,
      purchaseState,
      verificationRetryAt,
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
