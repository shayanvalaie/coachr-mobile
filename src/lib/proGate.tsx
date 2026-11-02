import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useSyncExternalStore,
} from "react";
import ProGateModal from "../components/ProGateModal";
import { navigateFromRef } from "../navigation/navigationRef";
import { useSubscription } from "./iap";
import { capturePaidAccess, subscribePaidAccess } from "./access/paidAccess";

type ProGateContextValue = {
  // Shows the Pro upsell for a feature label ("Calendar", "Exports").
  // No-op for Pro users.
  open: (featureLabel: string) => void;
  isPro: boolean;
};

const ProGateContext = createContext<ProGateContextValue | null>(null);

export const useProGate = (): ProGateContextValue => {
  const context = useContext(ProGateContext);
  if (!context) {
    throw new Error("useProGate must be used inside ProGateProvider");
  }
  return context;
};

export const ProGateProvider = ({ children }: { children: ReactNode }) => {
  const subscription = useSubscription();
  const access = useSyncExternalStore(subscribePaidAccess, capturePaidAccess, capturePaidAccess);
  const isPro = subscription.isPro && access.isPro;

  const [state, setState] = useState({
    visible: false,
    featureLabel: "This feature",
  });

  const open = useCallback(
    (featureLabel: string) => {
      if (isPro) return;
      setState({ visible: true, featureLabel });
    },
    [isPro],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(close, [access.epoch, close]);

  const upgrade = useCallback(() => {
    close();
    navigateFromRef("Subscribe");
  }, [close]);

  const value = useMemo(() => ({ open, isPro }), [open, isPro]);

  return (
    <ProGateContext.Provider value={value}>
      {children}
      <ProGateModal
        visible={state.visible}
        featureLabel={state.featureLabel}
        onClose={close}
        onUpgrade={upgrade}
      />
    </ProGateContext.Provider>
  );
};
