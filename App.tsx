import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { ToastProvider } from "./src/components/ui";
import { SubscriptionProvider, useSubscription } from "./src/lib/iap";
import { devProOverride } from "./src/lib/proAccess";
import { ProGateProvider } from "./src/lib/proGate";
import { navigationRef } from "./src/navigation/navigationRef";
import RootNavigator from "./src/navigation/RootNavigator";
import { theme } from "./src/theme/colors";

let mobileAds: null | (() => { initialize: () => Promise<unknown> }) = null;
try {
  const adsModule = require("react-native-google-mobile-ads");
  mobileAds = adsModule.default ?? null;
} catch (_err) {
  mobileAds = null;
}

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

const AdsInitializer = () => {
  const { isPro: iapIsPro } = useSubscription();
  const isPro = iapIsPro || devProOverride;

  const adsEnabled =
    process.env.EXPO_PUBLIC_ENABLE_ADS === "true" && !!mobileAds && !isPro;

  useEffect(() => {
    if (adsEnabled && mobileAds) {
      mobileAds()
        .initialize()
        .catch((err) => {
          if (__DEV__) console.log("[ads init error]", err);
        });
    }
  }, [adsEnabled]);

  return null;
};

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <SubscriptionProvider>
            <ToastProvider>
              <ProGateProvider>
                <SafeAreaView style={styles.safeArea}>
                  <StatusBar style="light" />
                  <AdsInitializer />
                  <NavigationContainer
                    ref={navigationRef}
                    theme={navigationTheme}
                  >
                    <RootNavigator />
                  </NavigationContainer>
                </SafeAreaView>
              </ProGateProvider>
            </ToastProvider>
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
