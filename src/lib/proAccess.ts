/**
 * Development builds run fully unlocked so Pro-gated flows can be exercised
 * without store or backend subscription state.
 */
export const devProOverride = __DEV__;

/**
 * @deprecated — prefer `useSubscription().isPro` from the SubscriptionProvider.
 * Kept for backward-compat in places that can't use hooks (e.g. module-level constants).
 */
export const hasProSubscription = devProOverride;

/**
 * Emails that receive Pro access unconditionally, regardless of subscription state.
 * Checked at sign-in time inside SubscriptionProvider.
 */
export const ADMIN_EMAILS = new Set([
  "valaieshayanse@gmail.com",
  "valaieshayan@gmail.com",
  "zackburkeproductions@gmail.com"
]);
