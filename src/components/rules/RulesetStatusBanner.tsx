import { StyleSheet, View } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme, withAlpha } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { RulesetStatus } from "../../types/rules";
import { AppText, Button } from "../ui";

type Props = {
  status: Exclude<RulesetStatus, "active">;
  // Shown on the right; used for a manual status re-check while baking.
  onCheckStatus?: () => void;
  checking?: boolean;
};

const copyByStatus: Record<
  Exclude<RulesetStatus, "active">,
  { icon: IconName; title: string; body: string; tone: "accent" | "danger" }
> = {
  baking: {
    icon: "clock",
    title: "Building your lineup engine",
    body: "These rules need a custom generator. It usually takes a couple of minutes — we'll email you when it's ready.",
    tone: "accent",
  },
  review: {
    icon: "eye",
    title: "Rules are in review",
    body: "A person is checking these rules before lineups can be generated. We'll email you when they're approved.",
    tone: "accent",
  },
  rejected: {
    icon: "alert-circle",
    title: "These rules couldn't be supported",
    body: "We weren't able to build a reliable generator for them. Adjust the rules or request a change.",
    tone: "danger",
  },
};

// Pending/blocked ruleset state. Tinted wash of the tone colour over the card
// surface so it reads as a notice, not an error toast.
const RulesetStatusBanner = ({ status, onCheckStatus, checking = false }: Props) => {
  const copy = copyByStatus[status];
  const color = copy.tone === "danger" ? theme.danger.base : theme.accent.base;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.4) },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(color, 0.18) }]}>
        <Feather name={copy.icon} size={16} color={color} />
      </View>
      <View style={styles.textColumn}>
        <AppText variant="bodyLg" family="heading">
          {copy.title}
        </AppText>
        <AppText variant="body" color="secondary">
          {copy.body}
        </AppText>
        {status === "baking" && onCheckStatus ? (
          <View style={styles.action}>
            <Button
              label="Check status"
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              loading={checking}
              onPress={onCheckStatus}
              accessibilityLabel="Check whether the rules are ready"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  textColumn: {
    flex: 1,
    gap: space.xxs,
  },
  action: {
    alignSelf: "flex-start",
    marginTop: space.xs,
  },
});

export default RulesetStatusBanner;
