import { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProGate } from "../lib/proGate";
import { navigateFromRef } from "../navigation/navigationRef";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";
import AppText from "./ui/AppText";
import Button from "./ui/Button";

type Props = { featureLabel: string; children: ReactNode };

// Wrap the component that owns protected hooks, so access loss unmounts its data.
const ProScreenGate = ({ featureLabel, children }: Props) => {
  const { isPro } = useProGate();
  const insets = useSafeAreaInsets();
  if (isPro) return <>{children}</>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
    >
      <View style={styles.copy} accessibilityLiveRegion="polite">
        <AppText variant="caption" family="heading" color="accent">COACHR PRO</AppText>
        <AppText variant="title" family="display" accessibilityRole="header">
          Unlock {featureLabel}
        </AppText>
        <AppText color="secondary">
          Renew or restore Coachr Pro to use {featureLabel.toLowerCase()}. Your saved games and lineups stay in your account.
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button label="Renew or restore" onPress={() => navigateFromRef("Subscribe")} fullWidth />
        <Button label="Go to Profile" variant="secondary" onPress={() => navigateFromRef("Main", { screen: "ProfileTab" })} fullWidth />
        <Button label="Back to Home" variant="ghost" onPress={() => navigateFromRef("Main", { screen: "HomeTab" })} fullWidth />
      </View>
      <AppText variant="caption" color="muted">
        Profile, privacy, support, and account deletion remain available.
      </AppText>
    </ScrollView>
  );
};

export default ProScreenGate;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg.base },
  content: { flexGrow: 1, padding: space.lg, gap: space.lg, justifyContent: "center" },
  copy: { gap: space.sm },
  actions: { gap: space.sm },
});
