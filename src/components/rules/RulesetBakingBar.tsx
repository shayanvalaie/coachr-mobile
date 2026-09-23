import { StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import { navigateFromRef } from "../../navigation/navigationRef";
import { theme, withAlpha } from "../../theme/colors";
import { space } from "../../theme/tokens";
import { AppPressable, AppText, Reveal } from "../ui";

const FADE_MS = 200;

const openRules = () => {
  navigateFromRef("Main", { screen: "HomeTab", params: { screen: "Rules" } });
};

// Slim global notice docked under the status bar while a ruleset is baking.
// Rendered by MainTabs only while the provider reports "baking".
const RulesetBakingBar = () => (
  <Reveal rise={0} duration={FADE_MS}>
    <AppPressable
      onPress={openRules}
      pressScale={1}
      style={styles.bar}
      accessibilityRole="button"
      accessibilityLabel="Building your lineup engine. Open rules."
    >
      <Feather name="clock" size={16} color={theme.accent.base} />
      <View style={styles.text}>
        <AppText variant="caption" family="heading">
          Building your lineup engine…
        </AppText>
        <AppText variant="caption" color="secondary">
          Usually a couple of minutes
        </AppText>
      </View>
      <Feather name="chevron-right" size={16} color={theme.text.muted} />
    </AppPressable>
  </Reveal>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: withAlpha(theme.accent.base, 0.14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(theme.accent.base, 0.35),
  },
  text: {
    flex: 1,
  },
});

export default RulesetBakingBar;
