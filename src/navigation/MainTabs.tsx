import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BottomTabBar, { MainTabKey } from "../components/BottomTabBar";
import { useProGate } from "../lib/proGate";
import { BackendSession } from "../lib/backend/types";
import AllLineupsScreen from "../screens/AllLineupsScreen";
import CalendarScreen from "../screens/calendar/CalendarScreen";
import HomeScreen from "../screens/HomeScreen";
import LineupScreen from "../screens/lineup/LineupScreen";
import ProfileScreen from "../screens/ProfileScreen";
import RosterScreen from "../screens/RosterScreen";
import RulesScreen from "../screens/RulesScreen";
import { LineupLaunchRequestInput } from "../types/lineupLaunch";
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

  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home">
        {({ navigation }) => (
          <HomeScreen
            session={session}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
            onOpenRulesPage={() => navigation.navigate("Rules")}
            onOpenRosterPage={() => navigation.navigate("RosterTab")}
            onOpenLineupPage={() => navigation.navigate("LineupTab")}
            onOpenCalendarPage={() => {
              if (!proGate.isPro) {
                proGate.open("Calendar");
                return;
              }
              navigation.navigate("CalendarTab");
            }}
            onOpenLineupsPage={() => navigation.navigate("AllLineups")}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="Rules">
        {({ navigation }) => (
          <RulesScreen
            session={session}
            onBack={() => navigation.goBack()}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
          />
        )}
      </HomeStack.Screen>
      <HomeStack.Screen name="AllLineups">
        {({ navigation }) => (
          <AllLineupsScreen
            session={session}
            onBack={() => navigation.goBack()}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
            hasProSubscription={proGate.isPro}
            onRequirePro={proGate.open}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
};

const MainTabs = ({ session }: SessionProps) => {
  const proGate = useProGate();

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBarAdapter {...props} />}
    >
      <Tab.Screen name="HomeTab">
        {() => <HomeStackNavigator session={session} />}
      </Tab.Screen>
      <Tab.Screen name="RosterTab">
        {({ navigation }) => (
          <RosterScreen
            session={session}
            onBack={() => navigation.navigate("HomeTab")}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
            onOpenLineupPage={() => navigation.navigate("LineupTab")}
            hasProSubscription={proGate.isPro}
            onRequirePro={proGate.open}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="LineupTab">
        {({ navigation, route }) => (
          <LineupScreen
            session={session}
            onBack={() => navigation.navigate("HomeTab")}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
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
            onBack={() => navigation.navigate("HomeTab")}
            onOpenProfile={() => navigation.navigate("ProfileTab")}
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
            onClose={() => navigation.navigate("HomeTab")}
            onOpenSubscribe={() => navigation.navigate("Subscribe")}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export default MainTabs;
