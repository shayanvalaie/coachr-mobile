/**
 * Product identifiers — update these to match your App Store Connect / Google Play Console
 * subscription product IDs once they're created.
 */
export const IAP_SKUS = {
  MONTHLY: "coachr_pro_monthly",
  ANNUAL: "coachr_pro_annual",
} as const;

export const ALL_SKUS: string[] = Object.values(IAP_SKUS);

export type IapSku = (typeof IAP_SKUS)[keyof typeof IAP_SKUS];

export type SubscriptionPeriod = "month" | "year";

/** Normalised product representation used in UI. */
export type SubscriptionProduct = {
  sku: IapSku;
  title: string;
  description: string;
  localizedPrice: string;
  /** Price as a number (e.g. 4.99) — may be null if the store didn't return it. */
  price: number | null;
  currencyCode: string;
  period: SubscriptionPeriod;
};

/** Persisted subscription state (AsyncStorage). */
export type PersistedSubscription = {
  isPro: boolean;
  activeSku: IapSku | null;
  /** Transaction ID from the last successful purchase. */
  transactionId: string | null;
  /** ISO-8601 timestamp of last known state change. */
  updatedAt: string;
};
