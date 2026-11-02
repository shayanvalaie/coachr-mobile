import { createContext, ReactNode, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { PrivacyAccount, PrivacyApi, PrivacyState } from "../../lib/privacy/contracts";
import { PrivacyController } from "../../lib/privacy/controller";
import { setAdPolicyContext } from "../../lib/ads/policy";
import { AiDisclosure } from "./AiDisclosure";

type Value = ReturnType<PrivacyController["getSnapshot"]> & {
  requireAiConsent: (account: PrivacyAccount) => Promise<boolean>;
  controller: PrivacyController;
};
const Context = createContext<Value | null>(null);
export function usePrivacy(): Value {
  const value = useContext(Context);
  if (!value) throw new Error("PrivacyProvider is required.");
  return value;
}
type Props = {
  accountId: string | null; sessionEpoch: number; entitlement: "unknown" | "free" | "pro";
  api: PrivacyApi; children: ReactNode; onStateChange?: (state: PrivacyState | null) => void;
};
export function PrivacyProvider({ accountId, sessionEpoch, entitlement, api, children, onStateChange }: Props) {
  const controller = useMemo(() => new PrivacyController(api), [api]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useLayoutEffect(() => {
    controller.setAccount(accountId ? { accountId, sessionEpoch } : null);
    return () => controller.setAccount(null);
  }, [accountId, sessionEpoch, controller]);
  const matches = snapshot.account?.accountId === accountId && snapshot.account.sessionEpoch === sessionEpoch;
  const state = matches && !snapshot.busy ? snapshot.state : null;
  useLayoutEffect(() => {
    setAdPolicyContext({ accountId, sessionEpoch, entitlement, ageBand: state?.ageBand ?? "unknown", policyVersion: state?.policyVersion ?? null });
    onStateChange?.(state);
  }, [accountId, sessionEpoch, entitlement, state, onStateChange]);
  useLayoutEffect(() => () => {
    setAdPolicyContext({ accountId: null, sessionEpoch, entitlement: "unknown", ageBand: "unknown", policyVersion: null });
  }, [sessionEpoch]);
  return <Context.Provider value={{ ...snapshot, controller, requireAiConsent: controller.requireAiConsent }}>
    {children}
    <AiDisclosure />
  </Context.Provider>;
}
