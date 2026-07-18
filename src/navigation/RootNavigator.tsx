import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useBackendAuth } from "../hooks/useBackendAuth";
import { useReducedMotion } from "../hooks/useReducedMotion";
import AuthScreen from "../screens/AuthScreen";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import { theme } from "../theme/colors";
import MainTabs from "./MainTabs";
import { stackTransitionOptions } from "./transitions";
import { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const { session, initializing } = useBackendAuth();
  const reducedMotion = useReducedMotion();

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.accent.base} />
      </View>
    );
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        ...stackTransitionOptions(reducedMotion),
      }}
    >
      {!session ? (
        <RootStack.Screen name="Auth" component={AuthScreen} />
      ) : (
        <>
          <RootStack.Screen name="Main">
            {() => <MainTabs session={session} />}
          </RootStack.Screen>
          <RootStack.Screen
            name="Subscribe"
            options={{
              presentation: "fullScreenModal",
              // Fade the modal in and out to match the rest of the app.
              animation: "fade",
              animationDuration: reducedMotion ? 120 : 200,
            }}
          >
            {({ navigation }) => (
              <SubscriptionScreen onBack={() => navigation.goBack()} />
            )}
          </RootStack.Screen>
        </>
      )}
    </RootStack.Navigator>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg.base,
  },
});

export default RootNavigator;
