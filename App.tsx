import { useBackendAuth } from "./src/hooks/useBackendAuth";
import { useEffect, useSyncExternalStore } from "react";
import { backendClient } from "./src/lib/backend/client";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { ToastProvider } from "./src/components/ui";
import { SubscriptionProvider, useSubscription } from "./src/lib/iap";
import { setPaidAccess } from "./src/lib/access/paidAccess";
import { PrivacyProvider } from "./src/components/privacy/PrivacyProvider";
import { ProGateProvider } from "./src/lib/proGate";
import { navigationRef } from "./src/navigation/navigationRef";
import RootNavigator from "./src/navigation/RootNavigator";
import {
  lockOrientation,
  ORIENTATION_LOCK_PORTRAIT_UP,
} from "./src/screens/lineup/orientation";
import { theme } from "./src/theme/colors";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.accent.base,
    background: theme.bg.base,
    card: theme.bg.raised,
    text: theme.text.primary,
    border: theme.border.base,
    notification: theme.accent.base,
  },
};

const PrivacyBoundary = ({ accountId, sessionEpoch, children }: {
  accountId: string | null; sessionEpoch: number; children: React.ReactNode;
}) => {
  const { entitlement } = useSubscription();
  return <PrivacyProvider accountId={accountId} sessionEpoch={sessionEpoch}
    entitlement={entitlement} api={backendClient}>{children}</PrivacyProvider>;
};

const subscribeSessionEpoch = (notify: () => void) => {
  const { data } = backendClient.auth.onAuthStateChange(notify);
  return () => data.subscription.unsubscribe();
};

export default function App() {
  const { session } = useBackendAuth();
  const sessionEpoch = useSyncExternalStore(subscribeSessionEpoch, backendClient.auth.getSessionEpoch, backendClient.auth.getSessionEpoch);
  // The app is portrait-first; only the lineup editor goes landscape (and
  // restores portrait on exit). Lock portrait at launch so a stale landscape
  // lock from a previous session doesn't leave the whole app sideways.
  useEffect(() => {
    void lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <SubscriptionProvider key={`${sessionEpoch}:${session?.user.id ?? "signed-out"}`} accountId={session?.user.id ?? null} onAccessChange={setPaidAccess}>
            <PrivacyBoundary accountId={session?.user.id ?? null} sessionEpoch={sessionEpoch}>
            <ToastProvider>
              <ProGateProvider>
                <SafeAreaView style={styles.safeArea}>
                  <StatusBar style="light" />
                  <NavigationContainer
                    ref={navigationRef}
                    theme={navigationTheme}
                  >
                    <RootNavigator />
                  </NavigationContainer>
                </SafeAreaView>
              </ProGateProvider>
            </ToastProvider>
            </PrivacyBoundary>
          </SubscriptionProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
});
