import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useBackendAuth } from "../hooks/useBackendAuth";
import AuthScreen from "../screens/AuthScreen";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import { theme } from "../theme/colors";
import MainTabs from "./MainTabs";
import { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const { session, initializing } = useBackendAuth();

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.accent.base} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <RootStack.Screen name="Auth" component={AuthScreen} />
      ) : (
        <>
          <RootStack.Screen name="Main">
            {() => <MainTabs session={session} />}
          </RootStack.Screen>
          <RootStack.Screen
            name="Subscribe"
            options={{ presentation: "fullScreenModal" }}
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
