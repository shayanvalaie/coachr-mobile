export const AGE_POLICY_VERSION = "2026-10-04";
export const AI_CONSENT_SCOPE = "rules_processing";
export const AI_CONSENT_VERSION = "rules-processing-2026-10-04";
export const PRIVACY_URL = "https://coachrapp.io/privacy";
export const TERMS_URL = "https://coachrapp.io/terms";
export type AgeBand = "unknown" | "under13" | "teen13to17" | "adult18plus";
export type DeclaredAgeBand = Exclude<AgeBand, "unknown">;
export type PrivacyAccount = { accountId: string; sessionEpoch: number };
export type PrivacyState = {
  ageBand: AgeBand;
  policyVersion: string | null;
  declaredAt: string | null;
  aiConsent: {
    required?: boolean;
    scope: string; version: string; granted: boolean; revision: number;
    acceptedAt: string | null; revokedAt: string | null;
  };
};
export type PrivacyApi = {
  getPrivacyState: () => Promise<PrivacyState>;
  setAgeEligibility: (input: { ageBand: DeclaredAgeBand; policyVersion: string }) => Promise<PrivacyState>;
  setAiConsent: (input: { scope: string; version: string; granted: boolean }) => Promise<PrivacyState>;
};
// The App Store 13+ rating gates downloads; only an explicit under-13
// declaration makes an account ineligible.
export function isEligible(state: PrivacyState | null): boolean {
  return state !== null && state.ageBand !== "under13";
}
export function hasAiConsent(state: PrivacyState | null): boolean {
  return isEligible(state) && state !== null && state.aiConsent.scope === AI_CONSENT_SCOPE &&
    state.aiConsent.version === AI_CONSENT_VERSION && state.aiConsent.granted &&
    state.aiConsent.acceptedAt !== null && state.aiConsent.revokedAt === null;
}
export function canProcessRules(state: PrivacyState | null): boolean {
  return isEligible(state) && state !== null &&
    (state.aiConsent.required === false || hasAiConsent(state));
}
export function parsePrivacyState(value: unknown): PrivacyState {
  if (!value || typeof value !== "object") throw new Error("Invalid privacy response.");
  const raw = value as Record<string, unknown>;
  const consent = raw.aiConsent as Record<string, unknown> | null;
  const dateOrNull = (date: unknown) => date === null || (typeof date === "string" && Number.isFinite(Date.parse(date)));
  if (!["unknown", "under13", "teen13to17", "adult18plus"].includes(raw.ageBand as string) ||
      !(raw.policyVersion === null || typeof raw.policyVersion === "string") || !dateOrNull(raw.declaredAt) ||
      !consent || typeof consent !== "object" || consent.scope !== AI_CONSENT_SCOPE ||
      typeof consent.version !== "string" || typeof consent.granted !== "boolean" ||
      !(consent.required === undefined || typeof consent.required === "boolean") ||
      !Number.isSafeInteger(consent.revision) || (consent.revision as number) < 0 ||
      !dateOrNull(consent.acceptedAt) || !dateOrNull(consent.revokedAt)) {
    throw new Error("Invalid privacy response.");
  }
  return value as PrivacyState;
}
