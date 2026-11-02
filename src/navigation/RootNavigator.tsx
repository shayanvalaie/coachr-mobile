import { ModerationReviewScreen } from "../components/moderation/ModerationReviewScreen";
import { backendClient } from "../lib/backend/client";
import { useSubscription } from "../lib/iap";
import { AppText, ScreenContainer } from "../components/ui";
import { usePrivacy } from "../components/privacy/PrivacyProvider";
import RestrictedAccount from "./RestrictedAccount";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useBackendAuth } from "../hooks/useBackendAuth";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { RulesetStatusProvider } from "../lib/rulesetStatus/RulesetStatusProvider";
import AuthScreen from "../screens/AuthScreen";
import SetupWizard from "../screens/onboarding/SetupWizard";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import { theme } from "../theme/colors";
import MainTabs from "./MainTabs";
import { stackTransitionOptions } from "./transitions";
import { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const { session, initializing } = useBackendAuth();
  const reducedMotion = useReducedMotion();
  const { isAdmin } = useSubscription();
  const { state, account } = usePrivacy();
  const restricted = session !== null && account?.accountId === session.user.id && state?.ageBand === "under13";

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.accent.base} />
      </View>
    );
  }

  const content = (
    <>
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
            {() => restricted ? <RestrictedAccount /> : <MainTabs session={session} />}
          </RootStack.Screen>
          <RootStack.Screen name="Moderation">
            {({ navigation }) => isAdmin && !restricted ?
              <ModerationReviewScreen api={backendClient} accountId={session.user.id} onBack={() => navigation.goBack()} /> :
              <ScreenContainer><AppText>Admin review access is required.</AppText></ScreenContainer>}
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
              <SubscriptionScreen onClose={() => navigation.goBack()} />
            )}
          </RootStack.Screen>
        </>
      )}
    </RootStack.Navigator>
    {/* First-run setup overlay: decides for itself whether this account still
        needs it, so it costs nothing for existing users. */}
    {session && !restricted ? <SetupWizard key={session.user.id} session={session} /> : null}
    </>
  );

  if (!session || restricted) return content;
  return <RulesetStatusProvider session={session}>{content}</RulesetStatusProvider>;
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
