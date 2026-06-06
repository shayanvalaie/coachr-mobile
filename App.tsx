import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Animated,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";
import BottomTabBar, { MainTabKey } from "./src/components/BottomTabBar";
import ProGateModal from "./src/components/ProGateModal";
import AuthScreen from "./src/screens/AuthScreen";
import AllLineupsScreen from "./src/screens/AllLineupsScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LineupScreen from "./src/screens/LineupScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import RulesScreen from "./src/screens/RulesScreen";
import RosterScreen from "./src/screens/RosterScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import { SubscriptionProvider, useSubscription } from "./src/lib/iap";
import { devProOverride } from "./src/lib/proAccess";
import { palette } from "./src/theme/colors";
import { useSupabaseAuth } from "./src/hooks/useSupabaseAuth";
import { LineupLaunchRequest, LineupLaunchRequestInput } from "./src/types/lineupLaunch";

let mobileAds: null | (() => { initialize: () => Promise<unknown> }) = null;
try {
  const adsModule = require("react-native-google-mobile-ads");
  mobileAds = adsModule.default ?? null;
} catch (_err) {
  mobileAds = null;
}

type ScreenKey =
  | "home"
  | "profile"
  | "subscribe"
  | "rules"
  | "roster"
  | "lineup"
  | "calendar"
  | "lineups";

const MAIN_TABS: MainTabKey[] = ["home", "roster", "lineup", "calendar", "profile"];

const toMainTab = (screen: ScreenKey): MainTabKey => {
  if (MAIN_TABS.includes(screen as MainTabKey)) {
    return screen as MainTabKey;
  }
  return "home";
};

export default function App() {
  return (
    <SubscriptionProvider>
      <AppContent />
    </SubscriptionProvider>
  );
}

function AppContent() {
  const { session, initializing } = useSupabaseAuth();
  const { isPro: iapIsPro } = useSubscription();

  // Pro is true if either the IAP subscription is active OR the dev override is set
  const isPro = iapIsPro || devProOverride;

  const [activeScreen, setActiveScreen] = useState<ScreenKey>("home");
  const [hideTabBar, setHideTabBar] = useState(false);
  const [lineupLaunchRequest, setLineupLaunchRequest] =
    useState<LineupLaunchRequest | null>(null);
  const [subscriptionReturnScreen, setSubscriptionReturnScreen] =
    useState<Exclude<ScreenKey, "subscribe">>("profile");
  const [proGateState, setProGateState] = useState<{
    visible: boolean;
    featureLabel: string;
  }>({
    visible: false,
    featureLabel: "This feature",
  });
  const lineupLaunchCounterRef = useRef(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchScreen = (next: ScreenKey) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setActiveScreen(next);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const openLineupPage = (request?: LineupLaunchRequestInput) => {
    if (request) {
      setLineupLaunchRequest({
        ...request,
        id: lineupLaunchCounterRef.current++,
      });
    } else {
      setLineupLaunchRequest(null);
    }
    switchScreen("lineup");
  };

  const openSubscribeScreen = (
    returnScreen: Exclude<ScreenKey, "subscribe"> = "profile",
  ) => {
    setSubscriptionReturnScreen(returnScreen);
    switchScreen("subscribe");
  };

  const openProGate = (featureLabel: string) => {
    if (isPro) return;
    setProGateState({
      visible: true,
      featureLabel,
    });
  };

  const closeProGate = () => {
    setProGateState((prev) => ({ ...prev, visible: false }));
  };

  const openCalendarPage = () => {
    if (!isPro) {
      openProGate("Calendar");
      return;
    }
    switchScreen("calendar");
  };

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

  useEffect(() => {
    if (!session && activeScreen !== "home") {
      setActiveScreen("home");
    }
  }, [session, activeScreen]);

  if (initializing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.loader}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {!session ? (
        <AuthScreen />
      ) : (
        <View style={styles.appShell}>
          <Animated.View style={[styles.screenContent, { opacity: fadeAnim }]}>
            {activeScreen === "profile" ? (
              <ProfileScreen
                session={session}
                onClose={() => switchScreen("home")}
                onOpenSubscribe={() => openSubscribeScreen("profile")}
              />
            ) : activeScreen === "subscribe" ? (
              <SubscriptionScreen onBack={() => switchScreen(subscriptionReturnScreen)} />
            ) : activeScreen === "rules" ? (
              <RulesScreen
                session={session}
                onBack={() => switchScreen("home")}
                onOpenProfile={() => switchScreen("profile")}
              />
            ) : activeScreen === "roster" ? (
              <RosterScreen
                session={session}
                onBack={() => switchScreen("home")}
                onOpenProfile={() => switchScreen("profile")}
                onOpenLineupPage={() => openLineupPage()}
                hasProSubscription={isPro}
                onRequirePro={openProGate}
              />
            ) : activeScreen === "lineup" ? (
              <LineupScreen
                session={session}
                onBack={() => switchScreen("home")}
                onOpenProfile={() => switchScreen("profile")}
                launchRequest={lineupLaunchRequest}
                hasProSubscription={isPro}
                onRequirePro={openProGate}
                onLaunchRequestHandled={(requestId) => {
                  setLineupLaunchRequest((prev) =>
                    prev && prev.id === requestId ? null : prev,
                  );
                }}
                onEditModeChange={setHideTabBar}
              />
            ) : activeScreen === "calendar" ? (
              <CalendarScreen
                session={session}
                onBack={() => switchScreen("home")}
                onOpenProfile={() => switchScreen("profile")}
                onOpenLineupPage={openLineupPage}
                hasProSubscription={isPro}
                onRequirePro={openProGate}
              />
            ) : activeScreen === "lineups" ? (
              <AllLineupsScreen
                session={session}
                onBack={() => switchScreen("home")}
                onOpenProfile={() => switchScreen("profile")}
                hasProSubscription={isPro}
                onRequirePro={openProGate}
              />
            ) : (
              <HomeScreen
                session={session}
                onOpenProfile={() => switchScreen("profile")}
                onOpenRulesPage={() => switchScreen("rules")}
                onOpenRosterPage={() => switchScreen("roster")}
                onOpenLineupPage={() => openLineupPage()}
                onOpenCalendarPage={openCalendarPage}
                onOpenLineupsPage={() => switchScreen("lineups")}
              />
            )}
          </Animated.View>
          {activeScreen !== "subscribe" && !hideTabBar ? (
            <BottomTabBar
              activeTab={toMainTab(activeScreen)}
              onSelectTab={(tab) => {
                if (tab === "calendar") {
                  openCalendarPage();
                  return;
                }
                switchScreen(tab);
              }}
            />
          ) : null}
        </View>
      )}
      <ProGateModal
        visible={proGateState.visible}
        featureLabel={proGateState.featureLabel}
        onClose={closeProGate}
        onUpgrade={() => {
          closeProGate();
          openSubscribeScreen(activeScreen === "subscribe" ? "profile" : activeScreen);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
  appShell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screenContent: {
    flex: 1,
  },
});
