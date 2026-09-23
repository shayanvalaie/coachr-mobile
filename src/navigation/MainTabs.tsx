import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import BottomTabBar, { MainTabKey } from "../components/BottomTabBar";
import RulesetBakingBar from "../components/rules/RulesetBakingBar";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useProGate } from "../lib/proGate";
import { useRulesetStatus } from "../lib/rulesetStatus/RulesetStatusProvider";
import { BackendSession } from "../lib/backend/types";
import CalendarScreen from "../screens/calendar/CalendarScreen";
import HomeScreen from "../screens/HomeScreen";
import LeagueDetailScreen from "../screens/leagues/LeagueDetailScreen";
import LeaguesScreen from "../screens/leagues/LeaguesScreen";
import LineupScreen from "../screens/lineup/LineupScreen";
import ProfileScreen from "../screens/ProfileScreen";
import RosterScreen from "../screens/RosterScreen";
import RulesScreen from "../screens/RulesScreen";
import { LineupLaunchRequestInput } from "../types/lineupLaunch";
import { stackTransitionOptions, tabTransitionOptions } from "./transitions";
import { HomeStackParamList, MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

type SessionProps = { session: BackendSession };

const routeToTabKey: Record<keyof MainTabParamList, MainTabKey> = {
  HomeTab: "home",
  RosterTab: "roster",
  LineupTab: "lineup",
  CalendarTab: "calendar",
  ProfileTab: "profile",
};

let launchRequestCounter = 1;
const buildLaunchRequest = (request: LineupLaunchRequestInput) => ({
  ...request,
  id: launchRequestCounter++,
});

// Adapts the existing custom tab bar to react-navigation's tabBar contract,
// including per-screen hiding via tabBarStyle: { display: "none" }.
const TabBarAdapter = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key].options;
  const tabBarStyle = focusedOptions.tabBarStyle;
  if (
    tabBarStyle &&
    typeof tabBarStyle === "object" &&
    "display" in tabBarStyle &&
    tabBarStyle.display === "none"
  ) {
    return null;
  }

  const activeTab = routeToTabKey[focusedRoute.name as keyof MainTabParamList];

  const onSelectTab = (tab: MainTabKey) => {
    const route = state.routes.find(
      (r) => routeToTabKey[r.name as keyof MainTabParamList] === tab,
    );
    if (!route) return;

    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return <BottomTabBar activeTab={activeTab} onSelectTab={onSelectTab} />;
};

const HomeStackNavigator = ({ session }: SessionProps) => {
  const proGate = useProGate();
  const reducedMotion = useReducedMotion();

  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        ...stackTransitionOptions(reducedMotion),
      }}
    >
      <HomeStack.Screen name="Home">
        {({ navigation, route }) => (
          <HomeScreen
            session={session}
            onOpenRulesPage={() => navigation.navigate("Rules")}
            onOpenRosterPage={() => navigation.navigate("RosterTab")}
            onOpenLineupPage={() =>
              navigation.navigate("LineupTab", {
                launch: buildLaunchRequest({
                  gameId: null,
                  autoGenerate: true,
                }),
              })
            }
            onOpenCalendarPage={() => {
              if (!proGate.isPro) {
                proGate.open("Calendar");
                return;
              }
              navigation.navigate("CalendarTab");
            }}
            onOpenSavedLineups={() => navigation.navigate("LineupTab")}
            onOpenLineup={(version) =>
              navigation.navigate("LineupTab", {
                launch: buildLaunchRequest({
                  gameId: version.gameId,
                  lineupVersionId: version.id,
                }),
              })
            }
            replayTourRequested={!!route.params?.replayTour}
            onTourHandled={() => navigation.setParams({ replayTour: undefined })}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="Rules">
        {({ navigation }) => (
          <RulesScreen
            session={session}
            onBack={() => navigation.goBack()}
            onOpenLeagues={() => navigation.navigate("Leagues")}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="Leagues">
        {({ navigation }) => (
          <LeaguesScreen
            session={session}
            onBack={() => navigation.goBack()}
            onOpenLeague={(leagueId) =>
              navigation.navigate("LeagueDetail", { leagueId })
            }
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="LeagueDetail">
        {({ navigation, route }) => (
          <LeagueDetailScreen
            session={session}
            leagueId={route.params.leagueId}
            onBack={() => navigation.goBack()}
            onJoined={() => navigation.navigate("Rules")}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
};

const MainTabs = ({ session }: SessionProps) => {
  const proGate = useProGate();
  const reducedMotion = useReducedMotion();
  const rulesetStatus = useRulesetStatus();

  return (
    <View style={styles.flex}>
      {rulesetStatus.status === "baking" ? <RulesetBakingBar /> : null}
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        ...tabTransitionOptions(reducedMotion),
      }}
      tabBar={(props) => <TabBarAdapter {...props} />}
    >
      <Tab.Screen name="HomeTab">
        {() => <HomeStackNavigator session={session} />}
      </Tab.Screen>
      <Tab.Screen name="RosterTab">
        {({ navigation }) => (
          <RosterScreen
            session={session}
            hasProSubscription={proGate.isPro}
            onRequirePro={proGate.open}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="LineupTab">
        {({ navigation, route }) => (
          <LineupScreen
            session={session}
            onOpenRoster={() => navigation.navigate("RosterTab")}
            launchRequest={route.params?.launch ?? null}
            hasProSubscription={proGate.isPro}
            onRequirePro={proGate.open}
            onLaunchRequestHandled={() => {
              navigation.setParams({ launch: undefined });
            }}
            onEditModeChange={(editing: boolean) => {
              navigation.setOptions({
                tabBarStyle: editing ? { display: "none" } : undefined,
              });
            }}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="CalendarTab"
        listeners={{
          tabPress: (e) => {
            if (!proGate.isPro) {
              e.preventDefault();
              proGate.open("Calendar");
            }
          },
        }}
      >
        {({ navigation }) => (
          <CalendarScreen
            session={session}
            onOpenLineupPage={(request?: LineupLaunchRequestInput) => {
              navigation.navigate("LineupTab", {
                launch: request ? buildLaunchRequest(request) : undefined,
              });
            }}
            hasProSubscription={proGate.isPro}
            onRequirePro={proGate.open}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="ProfileTab">
        {({ navigation }) => (
          <ProfileScreen
            session={session}
            onOpenSubscribe={() => navigation.navigate("Subscribe")}
            onOpenRules={() => navigation.navigate("HomeTab", { screen: "Rules" })}
            onReplayTour={() =>
              navigation.navigate("HomeTab", {
                screen: "Home",
                params: { replayTour: true },
              })
            }
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

export default MainTabs;
