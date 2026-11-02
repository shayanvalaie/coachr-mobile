import { AGE_POLICY_VERSION, AgeBand } from "../privacy/contracts";

type AdsModule = typeof import("react-native-google-mobile-ads");
export type AdPolicyContext = {
  accountId: string | null; sessionEpoch: number; ageBand: AgeBand;
  policyVersion: string | null; entitlement: "unknown" | "free" | "pro";
};
type AdPrivacyStatus = { privacyOptionsRequired: boolean; ready: boolean; error: string | null };
let context: AdPolicyContext = { accountId: null, sessionEpoch: 0, ageBand: "unknown", policyVersion: null, entitlement: "unknown" };
let generation = 0;
let status: AdPrivacyStatus = { privacyOptionsRequired: false, ready: false, error: null };
let native: AdsModule | null = null;
let initialized: Promise<unknown> | null = null;
let preparation: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const enabled = process.env.EXPO_PUBLIC_ENABLE_ADS === "true";
const resolved = () => enabled && context.accountId !== null &&
  context.policyVersion === AGE_POLICY_VERSION && (context.ageBand === "teen13to17" || context.ageBand === "adult18plus");
const eligible = () => resolved() && context.entitlement === "free";
const notify = () => listeners.forEach(listener => listener());
export const subscribeAdPolicy = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAdPrivacyStatus = () => status;
function publish(next: Partial<AdPrivacyStatus>) { status = { ...status, ...next }; notify(); }
function loadNative(): AdsModule | null {
  if (native) return native;
  try { native = require("react-native-google-mobile-ads") as AdsModule; }
  catch { return null; }
  return native;
}
async function prepare(ticket: number): Promise<void> {
  if (ticket !== generation || !resolved() || context.entitlement === "unknown") return;
  const sdk = loadNative();
  if (!sdk) return;
  try {
    if (context.entitlement !== "free") {
      const info = await sdk.AdsConsent.getConsentInfo();
      if (ticket === generation && resolved()) publish({ privacyOptionsRequired: info.privacyOptionsRequirementStatus === "REQUIRED" });
      return;
    }
    let info;
    try {
      await sdk.AdsConsent.requestInfoUpdate({ tagForUnderAgeOfConsent: false });
      if (ticket !== generation || !eligible()) return;
      info = await sdk.AdsConsent.loadAndShowConsentFormIfRequired();
    } catch {
      if (ticket !== generation || !eligible()) return;
      // Only the SDK may authorize reuse of its previous consent after failure.
      info = await sdk.AdsConsent.getConsentInfo();
    }
    if (ticket !== generation || !eligible()) return;
    publish({ privacyOptionsRequired: info.privacyOptionsRequirementStatus === "REQUIRED" });
    if (!info.canRequestAds) { publish({ ready: false }); return; }
    // US 13+ accounts are not labelled child-directed. TFUA is an EEA
    // under-age-of-consent signal, not a teen flag. The installed RN16 SDK
    // does not expose Google's newer teen treatment API. NPA + G are retained
    // for every eligible age band; AdMob category review is a release gate.
    await sdk.default().setRequestConfiguration({
      maxAdContentRating: sdk.MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    if (ticket !== generation || !eligible()) return;
    if (!initialized) initialized = sdk.default().initialize().catch(error => { initialized = null; throw error; });
    await initialized;
    if (ticket === generation && eligible()) publish({ ready: true, error: null });
  } catch {
    if (ticket === generation) publish({ ready: false, error: "Ad privacy choices are unavailable. You can keep using Coachr." });
  }
}
export function setAdPolicyContext(next: AdPolicyContext): void {
  if (JSON.stringify(context) === JSON.stringify(next)) return;
  context = next;
  const ticket = ++generation;
  publish({ ready: false, privacyOptionsRequired: false, error: null });
  // Serial work prevents a previous account's native configuration from
  // overwriting the current configuration after an asynchronous SDK call.
  preparation = preparation.then(() => prepare(ticket));
}
export function refreshAdConsent(): Promise<void> {
  const ticket = ++generation;
  publish({ ready: false, error: null });
  preparation = preparation.then(() => prepare(ticket));
  return preparation;
}
export async function showAdPrivacyOptions(): Promise<void> {
  if (!enabled || !native || !status.privacyOptionsRequired) return;
  const ticket = ++generation;
  publish({ ready: false });
  try {
    const info = await native.AdsConsent.showPrivacyOptionsForm();
    if (ticket !== generation) return;
    publish({ privacyOptionsRequired: info.privacyOptionsRequirementStatus === "REQUIRED" });
    await refreshAdConsent();
  } catch {
    if (ticket === generation) publish({ ready: false, error: "Couldn't open ad privacy options. Please try again." });
  }
}
export type AdAuthorization = { generation: number; sdk: AdsModule };
export function getAdAuthorization(): AdAuthorization | null {
  if (!eligible() || !status.ready || !native) return null;
  return { generation, sdk: native };
}
export function isAdAuthorizationCurrent(authorization: AdAuthorization): boolean {
  return authorization.generation === generation && eligible() && status.ready;
}
